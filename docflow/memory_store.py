"""SQLite-backed memory + glossary store for DocFlow.

Two-tier memory: 'long_term' (persists) and 'session' (expires via ttl_days or
when the session ends). Plus a translation glossary of approved term pairs.
"""

from __future__ import annotations

import datetime
import sqlite3
import threading
import uuid
from pathlib import Path

from docflow.config import config

_SCHEMA = """
CREATE TABLE IF NOT EXISTS memories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    content     TEXT DEFAULT '',
    memory_type TEXT DEFAULT 'long_term',
    entity      TEXT,
    tags        TEXT DEFAULT '',
    session_id  TEXT,
    created_at  TEXT NOT NULL,
    expires_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_mem_user ON memories(user_id);

CREATE TABLE IF NOT EXISTS glossary (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    source          TEXT NOT NULL,
    target          TEXT NOT NULL,
    source_language TEXT DEFAULT '',
    target_language TEXT DEFAULT '',
    context         TEXT DEFAULT '',
    entity          TEXT,
    created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gloss_user ON glossary(user_id);

CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    session_id  TEXT DEFAULT '',
    thread_id   TEXT DEFAULT '',
    prompt      TEXT NOT NULL,
    status      TEXT DEFAULT 'running',
    outputs     TEXT DEFAULT '[]',
    error       TEXT DEFAULT '',
    started_at  TEXT NOT NULL,
    finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
"""


def _now() -> str:
    return datetime.datetime.now().isoformat(timespec="seconds")


class MemoryStore:
    def __init__(self, db_path: Path):
        self._db_path = str(db_path)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    # --- memories ---
    def add(
        self,
        user_id: str,
        *,
        title: str,
        content: str = "",
        memory_type: str = "long_term",
        entity: str | None = None,
        tags: str = "",
        session_id: str | None = None,
        ttl_days: int | None = None,
    ) -> str:
        mid = uuid.uuid4().hex[:12]
        expires = None
        if ttl_days:
            expires = (datetime.date.today() + datetime.timedelta(days=ttl_days)).isoformat()
        with self._lock:
            self._conn.execute(
                "INSERT INTO memories (id,user_id,title,content,memory_type,entity,tags,session_id,created_at,expires_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (mid, user_id, title, content, memory_type, entity, tags, session_id, _now(), expires),
            )
            self._conn.commit()
        return mid

    def _rows(self, cur) -> list[dict]:
        return [dict(r) for r in cur.fetchall()]

    def _prune_expired(self) -> None:
        today = datetime.date.today().isoformat()
        with self._lock:
            self._conn.execute("DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < ?", (today,))
            self._conn.commit()

    def list_memories(self, user_id: str, *, entity: str | None = None, limit: int = 30) -> list[dict]:
        self._prune_expired()
        q = "SELECT * FROM memories WHERE user_id=?"
        args: list = [user_id]
        if entity:
            q += " AND entity=?"
            args.append(entity)
        q += " ORDER BY created_at DESC LIMIT ?"
        args.append(limit)
        with self._lock:
            return self._rows(self._conn.execute(q, args))

    def search(self, user_id: str, query: str, *, entity: str | None = None, limit: int = 30) -> list[dict]:
        self._prune_expired()
        like = f"%{query}%"
        q = "SELECT * FROM memories WHERE user_id=? AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)"
        args: list = [user_id, like, like, like]
        if entity:
            q += " AND entity=?"
            args.append(entity)
        q += " ORDER BY created_at DESC LIMIT ?"
        args.append(limit)
        with self._lock:
            return self._rows(self._conn.execute(q, args))

    def delete(self, user_id: str, memory_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute(
                "DELETE FROM memories WHERE user_id=? AND id=?", (user_id, memory_id)
            )
            self._conn.commit()
            return cur.rowcount > 0

    def clear_memories(self, user_id: str) -> int:
        with self._lock:
            cur = self._conn.execute("DELETE FROM memories WHERE user_id=?", (user_id,))
            self._conn.commit()
            return cur.rowcount

    def format_context(self, user_id: str, session_id: str = "") -> str:
        self._prune_expired()
        with self._lock:
            longterm = self._rows(
                self._conn.execute(
                    "SELECT * FROM memories WHERE user_id=? AND memory_type='long_term' ORDER BY created_at DESC LIMIT 40",
                    (user_id,),
                )
            )
            session = []
            if session_id:
                session = self._rows(
                    self._conn.execute(
                        "SELECT * FROM memories WHERE user_id=? AND session_id=? ORDER BY created_at DESC LIMIT 20",
                        (user_id, session_id),
                    )
                )
        parts: list[str] = []
        if longterm:
            parts.append("Long-term memory:")
            parts += [f"- [{m['id']}] {m['title']}: {m['content']}".rstrip(": ") for m in longterm]
        if session:
            parts.append("\nThis session:")
            parts += [f"- [{m['id']}] {m['title']}: {m['content']}".rstrip(": ") for m in session]
        return "\n".join(parts)

    # --- glossary ---
    def add_term(
        self,
        user_id: str,
        *,
        source: str,
        target: str,
        source_language: str = "",
        target_language: str = "",
        context: str = "",
        entity: str | None = None,
    ) -> str:
        gid = uuid.uuid4().hex[:12]
        with self._lock:
            self._conn.execute(
                "INSERT INTO glossary (id,user_id,source,target,source_language,target_language,context,entity,created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (gid, user_id, source, target, source_language, target_language, context, entity, _now()),
            )
            self._conn.commit()
        return gid

    def lookup_terms(self, user_id: str, text: str, *, entity: str | None = None) -> list[dict]:
        entries = self.list_glossary(user_id, entity=entity)
        low = (text or "").lower()
        return [e for e in entries if e["source"].lower() in low]

    def list_glossary(self, user_id: str, *, entity: str | None = None) -> list[dict]:
        q = "SELECT * FROM glossary WHERE user_id=?"
        args: list = [user_id]
        if entity:
            q += " AND entity=?"
            args.append(entity)
        q += " ORDER BY created_at DESC"
        with self._lock:
            return self._rows(self._conn.execute(q, args))

    def delete_term(self, user_id: str, source: str, *, entity: str | None = None) -> int:
        q = "DELETE FROM glossary WHERE user_id=? AND source=?"
        args: list = [user_id, source]
        if entity:
            q += " AND entity=?"
            args.append(entity)
        with self._lock:
            cur = self._conn.execute(q, args)
            self._conn.commit()
            return cur.rowcount

    # --- jobs ---
    def start_job(self, user_id: str, *, session_id: str, thread_id: str, prompt: str) -> str:
        jid = uuid.uuid4().hex[:12]
        with self._lock:
            self._conn.execute(
                "INSERT INTO jobs (id,user_id,session_id,thread_id,prompt,status,started_at)"
                " VALUES (?,?,?,?,?,?,?)",
                (jid, user_id, session_id, thread_id, prompt, "running", _now()),
            )
            self._conn.commit()
        return jid

    def finish_job(
        self,
        user_id: str,
        job_id: str,
        *,
        status: str,
        outputs: str = "[]",
        error: str = "",
    ) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE jobs SET status=?, outputs=?, error=?, finished_at=? WHERE user_id=? AND id=?",
                (status, outputs, error, _now(), user_id, job_id),
            )
            self._conn.commit()

    def list_jobs(self, user_id: str, *, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = self._rows(
                self._conn.execute(
                    "SELECT * FROM jobs WHERE user_id=? ORDER BY started_at DESC LIMIT ?",
                    (user_id, limit),
                )
            )
        for row in rows:
            try:
                row["outputs"] = __import__("json").loads(row.get("outputs") or "[]")
            except Exception:
                row["outputs"] = []
        return rows


_STORE: MemoryStore | None = None


def get_store() -> MemoryStore:
    global _STORE
    if _STORE is None:
        _STORE = MemoryStore(config.DB_PATH)
    return _STORE
