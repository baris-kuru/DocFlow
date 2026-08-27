#!/usr/bin/env bash
# DocFlow launcher.
#
#   ./run.sh          -> single process: build frontend + serve everything at :8000
#   ./run.sh dev      -> dev mode: FastAPI :8000 + Vite hot-reload at :5173
set -e
cd "$(dirname "$0")"
source .venv/bin/activate

if [ "$1" = "dev" ]; then
  ( cd frontend && npm run dev ) &
  uvicorn docflow.web_app:app --reload --host 127.0.0.1 --port 8000
else
  ( cd frontend && npm run build )
  exec uvicorn docflow.web_app:app --host 127.0.0.1 --port 8000
fi
