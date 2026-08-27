"""Central configuration for DocFlow. Reads from environment / .env."""

from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent


class Config:
    # --- Fireworks (OpenAI-compatible) ---
    FIREWORKS_BASE_URL = os.getenv("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1")
    FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY", "")

    AGENT_MODEL = os.getenv("AGENT_MODEL", "accounts/fireworks/models/qwen3p7-plus")
    SUMMARY_MODEL = os.getenv("SUMMARY_MODEL", AGENT_MODEL)
    VISION_MODEL = os.getenv("VISION_MODEL", AGENT_MODEL)

    # --- Storage ---
    DATA_DIR = Path(os.getenv("DOCFLOW_DATA_DIR", str(ROOT / "data")))
    DOCS_DIR = Path(os.getenv("DOCFLOW_DOCS_DIR", str(DATA_DIR / "docs")))
    DB_PATH = Path(os.getenv("DOCFLOW_DB_PATH", str(DATA_DIR / "docflow.db")))

    # --- Web ---
    FILES_URL_PREFIX = os.getenv("FILES_URL_PREFIX", "/files")
    CORS_ORIGINS = os.getenv(
        "DOCFLOW_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")

    def __init__(self) -> None:
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.DOCS_DIR.mkdir(parents=True, exist_ok=True)


config = Config()
