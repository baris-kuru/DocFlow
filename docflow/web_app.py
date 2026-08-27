"""DocFlow FastAPI app: chat (SSE), uploads, documents, memory, glossary.

Run:
    uvicorn docflow.web_app:app --reload --port 8000
"""

from __future__ import annotations

import json
import re
import urllib.parse
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from docflow.agent_graph import make_graph, stream_agent
from docflow.config import config
from docflow.memory_store import get_store

app = FastAPI(title="DocFlow")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOCS_DIR = Path(config.DOCS_DIR)
DOC_META_PATH = Path(config.DATA_DIR) / "doc_metadata.json"


def _files_url_prefix(request: Request) -> str:
    configured = str(config.FILES_URL_PREFIX or "/files").rstrip("/")
    if configured.startswith(("http://", "https://")):
        return configured
    if not configured.startswith("/"):
        configured = f"/{configured}"
    return f"{str(request.base_url).rstrip('/')}{configured}"


def _sse_event(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    thread_id: str = "default"
    user_id: str = "default"
    session_id: str = "default"


class MemoryRequest(BaseModel):
    user_id: str = "default"
    title: str
    content: str = ""
    memory_type: str = "long_term"
    entity: str = ""
    tags: str = ""


class DocumentGroupRequest(BaseModel):
    name: str


class DocumentUpdateRequest(BaseModel):
    group: str | None = None
    role: str | None = None
    doc_type: str | None = None
    status: str | None = None


def _load_doc_meta() -> dict:
    if not DOC_META_PATH.exists():
        return {"groups": [], "files": {}}
    try:
        data = json.loads(DOC_META_PATH.read_text())
    except Exception:
        return {"groups": [], "files": {}}
    if not isinstance(data, dict):
        return {"groups": [], "files": {}}
    data.setdefault("groups", [])
    data.setdefault("files", {})
    return data


def _save_doc_meta(meta: dict) -> None:
    DOC_META_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOC_META_PATH.write_text(json.dumps(meta, indent=2, sort_keys=True))


def _clean_group(name: str) -> str:
    cleaned = " ".join((name or "").strip().split())
    if not cleaned:
        raise HTTPException(status_code=400, detail="Group name is required")
    return cleaned[:48]


def _resolve_doc(filename: str) -> Path:
    return DOCS_DIR / Path(filename).name


def _default_role(path: Path, file_meta: dict | None = None) -> str:
    if file_meta and file_meta.get("role") in {"input", "output"}:
        return file_meta["role"]
    stem = path.stem.lower()
    ext = path.suffix.lower()
    output_markers = (
        "_en",
        "_tr",
        "_translated",
        "_clean",
        "_cleaned",
        "_updated",
        "_revised",
        "_output",
    )
    if any(stem.endswith(marker) or marker in stem for marker in output_markers):
        return "output"
    if ext in {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".xlsx", ".xls", ".csv", ".txt", ".md"}:
        return "input"
    return "input"


def _default_group(path: Path, file_meta: dict | None = None) -> str:
    if file_meta and file_meta.get("group"):
        return str(file_meta["group"])
    return "Outputs" if _default_role(path, file_meta) == "output" else "Inputs"


_DOC_TYPES = {
    "unknown",
    "letter",
    "report",
    "certificate",
    "invoice",
    "contract",
    "id",
    "insurance",
    "tax",
    "medical",
    "bank",
    "scan",
    "output",
}
_DOC_STATUSES = {"new", "reviewed", "action_needed", "done", "archived"}
_ACTION_MARKERS = {
    "frist",
    "mahnung",
    "urgent",
    "deadline",
    "termin",
    "antwort",
    "reply",
    "action",
}


def _default_doc_type(path: Path, file_meta: dict | None = None) -> str:
    if file_meta and file_meta.get("doc_type") in _DOC_TYPES:
        return str(file_meta["doc_type"])
    stem = path.stem.lower()
    if _default_role(path, file_meta) == "output":
        return "output"
    if "telc" in stem or "certificate" in stem or "zertifikat" in stem:
        return "certificate"
    if "renten" in stem or "versicherung" in stem:
        return "insurance"
    if "rechnung" in stem or "invoice" in stem:
        return "invoice"
    if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
        return "scan"
    return "unknown"


def _default_status(path: Path, file_meta: dict | None = None) -> str:
    if file_meta and file_meta.get("status") in _DOC_STATUSES:
        return str(file_meta["status"])
    return "done" if _default_role(path, file_meta) == "output" else "new"


def _consolidated_doc_meta(path: Path, current: dict | None = None) -> dict:
    item = dict(current or {})
    role = _default_role(path, item)
    group = _default_group(path, item)
    doc_type = _default_doc_type(path, item)
    status = _default_status(path, item)
    stem = path.stem.lower()

    if doc_type == "unknown" or "doc_type" not in item:
        doc_type = _default_doc_type(path)
    if status == "new" and role != "output" and any(marker in stem for marker in _ACTION_MARKERS):
        status = "action_needed"
    if role == "output":
        doc_type = "output"
        status = "done"
        group = "Outputs"

    item.update({"role": role, "group": group, "doc_type": doc_type, "status": status})
    return item


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "model": config.AGENT_MODEL,
        "fireworks_key": bool(config.FIREWORKS_API_KEY),
        "docs_dir": str(DOCS_DIR),
    }


# ---------------------------------------------------------------------------
# Chat (SSE)
# ---------------------------------------------------------------------------
@app.post("/api/chat")
def chat(req: ChatRequest, request: Request):
    store = get_store()
    job_id = store.start_job(
        req.user_id,
        session_id=req.session_id,
        thread_id=req.thread_id,
        prompt=req.message,
    )
    graph = make_graph(
        str(DOCS_DIR),
        req.user_id,
        req.session_id,
        files_url_prefix=_files_url_prefix(request),
    )
    messages = [{"role": "user", "content": req.message}]

    def event_stream():
        outputs: list[str] = []
        try:
            for event in stream_agent(graph, messages, req.thread_id, docs_dir=str(DOCS_DIR)):
                if event.get("type") in {"token", "tool_end"}:
                    content = str(event.get("content", ""))
                    outputs.extend(re.findall(r"/files/[^)\s]+", content))
                yield _sse_event(event)
            store.finish_job(
                req.user_id,
                job_id,
                status="done",
                outputs=json.dumps(sorted(set(outputs))),
            )
        except Exception as exc:  # pragma: no cover - defensive
            store.finish_job(req.user_id, job_id, status="error", error=str(exc))
            yield _sse_event({"type": "error", "content": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------
@app.get("/api/documents")
def list_documents(request: Request):
    files = []
    files_url_prefix = _files_url_prefix(request)
    meta = _load_doc_meta()
    file_meta = meta.get("files", {})
    for p in sorted(DOCS_DIR.iterdir()):
        if p.is_file() and not p.name.startswith("."):
            item_meta = file_meta.get(p.name, {})
            files.append(
                {
                    "name": p.name,
                    "size": p.stat().st_size,
                    "ext": p.suffix.lower(),
                    "url": f"{files_url_prefix}/{urllib.parse.quote(p.name)}",
                    "role": _default_role(p, item_meta),
                    "group": _default_group(p, item_meta),
                    "doc_type": _default_doc_type(p, item_meta),
                    "status": _default_status(p, item_meta),
                }
            )
    custom_groups = [
        group
        for group in meta.get("groups", [])
        if isinstance(group, str) and group not in {"Inputs", "Outputs"}
    ]
    return {"documents": files, "groups": ["Inputs", "Outputs", *custom_groups]}


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    dest = DOCS_DIR / Path(file.filename).name
    data = await file.read()
    dest.write_bytes(data)
    meta = _load_doc_meta()
    meta.setdefault("files", {})[dest.name] = {
        "role": "input",
        "group": "Inputs",
        "doc_type": _default_doc_type(dest),
        "status": "new",
    }
    _save_doc_meta(meta)
    return {
        "name": dest.name,
        "size": len(data),
        "ext": dest.suffix.lower(),
        "role": "input",
        "group": "Inputs",
        "doc_type": _default_doc_type(dest),
        "status": "new",
    }


@app.post("/api/document-groups")
def create_document_group(req: DocumentGroupRequest):
    name = _clean_group(req.name)
    if name in {"Inputs", "Outputs"}:
        return {"groups": _load_doc_meta().get("groups", [])}
    meta = _load_doc_meta()
    groups = [g for g in meta.get("groups", []) if isinstance(g, str)]
    if name not in groups:
        groups.append(name)
    meta["groups"] = groups
    _save_doc_meta(meta)
    return {"groups": ["Inputs", "Outputs", *groups]}


@app.delete("/api/document-groups/{name}")
def delete_document_group(name: str):
    group = _clean_group(name)
    if group in {"Inputs", "Outputs"}:
        raise HTTPException(status_code=400, detail="Built-in groups cannot be deleted")
    meta = _load_doc_meta()
    meta["groups"] = [g for g in meta.get("groups", []) if g != group]
    for item in meta.setdefault("files", {}).values():
        if item.get("group") == group:
            item["group"] = "Inputs"
            item["role"] = "input"
    _save_doc_meta(meta)
    return {"deleted": group}


@app.patch("/api/documents/{filename}")
def update_document(filename: str, req: DocumentUpdateRequest):
    path = _resolve_doc(filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    meta = _load_doc_meta()
    item = meta.setdefault("files", {}).setdefault(path.name, {})
    if req.role is not None:
        if req.role not in {"input", "output"}:
            raise HTTPException(status_code=400, detail="Role must be input or output")
        item["role"] = req.role
    if req.group is not None:
        group = _clean_group(req.group)
        item["group"] = group
        if group not in {"Inputs", "Outputs"}:
            groups = [g for g in meta.get("groups", []) if isinstance(g, str)]
            if group not in groups:
                groups.append(group)
            meta["groups"] = groups
    if req.doc_type is not None:
        if req.doc_type not in _DOC_TYPES:
            raise HTTPException(status_code=400, detail="Unsupported document type")
        item["doc_type"] = req.doc_type
    if req.status is not None:
        if req.status not in _DOC_STATUSES:
            raise HTTPException(status_code=400, detail="Unsupported document status")
        item["status"] = req.status
    _save_doc_meta(meta)
    return {"name": path.name, **item}


@app.post("/api/documents/consolidate")
def consolidate_documents():
    meta = _load_doc_meta()
    file_meta = meta.setdefault("files", {})
    updated = 0
    for path in DOCS_DIR.iterdir():
        if not path.is_file() or path.name.startswith("."):
            continue
        before = dict(file_meta.get(path.name, {}))
        after = _consolidated_doc_meta(path, before)
        file_meta[path.name] = after
        if before != after:
            updated += 1
    live_names = {p.name for p in DOCS_DIR.iterdir() if p.is_file() and not p.name.startswith(".")}
    for name in list(file_meta.keys()):
        if name not in live_names:
            file_meta.pop(name, None)
            updated += 1
    _save_doc_meta(meta)
    return {"updated": updated}


@app.delete("/api/documents/{filename}")
def delete_document(filename: str):
    path = _resolve_doc(filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    path.unlink()
    meta = _load_doc_meta()
    meta.setdefault("files", {}).pop(path.name, None)
    _save_doc_meta(meta)
    return {"deleted": path.name}


@app.delete("/api/documents")
def clear_documents():
    deleted = []
    for p in DOCS_DIR.iterdir():
        if p.is_file() and not p.name.startswith("."):
            p.unlink()
            deleted.append(p.name)
    meta = _load_doc_meta()
    meta["files"] = {}
    _save_doc_meta(meta)
    return {"deleted": deleted, "count": len(deleted)}


@app.api_route("/files/{filename}", methods=["GET", "HEAD"])
def download(filename: str):
    path = DOCS_DIR / Path(filename).name
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), filename=path.name)


# ---------------------------------------------------------------------------
# Memory & glossary
# ---------------------------------------------------------------------------
@app.get("/api/memory")
def get_memory(user_id: str = "default"):
    return {"memories": get_store().list_memories(user_id, limit=200)}


@app.post("/api/memory")
def add_memory(req: MemoryRequest):
    mid = get_store().add(
        req.user_id,
        title=req.title,
        content=req.content,
        memory_type=req.memory_type,
        entity=req.entity or None,
        tags=req.tags,
    )
    return {"id": mid}


@app.delete("/api/memory")
def clear_memory(user_id: str = "default"):
    return {"cleared": get_store().clear_memories(user_id)}


@app.delete("/api/memory/{memory_id}")
def delete_memory(memory_id: str, user_id: str = "default"):
    return {"deleted": get_store().delete(user_id, memory_id)}


@app.get("/api/jobs")
def get_jobs(user_id: str = "default"):
    return {"jobs": get_store().list_jobs(user_id, limit=80)}


@app.get("/api/glossary")
def get_glossary(user_id: str = "default"):
    return {"glossary": get_store().list_glossary(user_id)}


# ---------------------------------------------------------------------------
# Optionally serve a built frontend (frontend/dist) for single-process prod.
# ---------------------------------------------------------------------------
_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _DIST.exists():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="static")
