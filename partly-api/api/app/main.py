from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .data_loader import load_dataset, set_dataset
from .routers import diagrams, predictions, vehicles

_STATIC = Path(__file__).parent / "static"
_DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    set_dataset(load_dataset())
    yield


app = FastAPI(title="Partly Hackathon 2026 Dataset", version="1.0.0", lifespan=lifespan)

app.include_router(vehicles.router)
app.include_router(diagrams.router)
app.include_router(predictions.router)


# Optional browser viewer — present only for local use, not shipped in the
# student bundle. Enabled only when the viewer file exists; when enabled it also
# serves the raw dataset files (damage-context frames) it needs.
_VIEWER = _STATIC / "viewer.html"
if _VIEWER.is_file():

    @app.get("/", include_in_schema=False)
    def viewer() -> FileResponse:
        return FileResponse(_VIEWER)

    if _DATA_DIR.is_dir():
        app.mount("/data", StaticFiles(directory=_DATA_DIR), name="data")
