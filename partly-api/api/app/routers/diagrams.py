from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..data_loader import DiagramFiles, get_dataset

router = APIRouter(tags=["diagrams"])


def _get_diagram(slug: str, diagram_id: str) -> DiagramFiles:
    vehicle = get_dataset().vehicles.get(slug)
    if vehicle is None:
        raise HTTPException(status_code=404, detail=f"unknown vehicle slug: {slug}")
    diagram = vehicle.diagrams.get(diagram_id)
    if diagram is None:
        raise HTTPException(status_code=404, detail=f"unknown diagram {diagram_id} for {slug}")
    return diagram


@router.get("/vehicles/{slug}/diagrams")
def list_diagrams(slug: str) -> list[dict[str, Any]]:
    vehicle = get_dataset().vehicles.get(slug)
    if vehicle is None:
        raise HTTPException(status_code=404, detail=f"unknown vehicle slug: {slug}")
    diagrams = vehicle.assemblies.get("diagrams", {})
    return list(diagrams.values()) if isinstance(diagrams, dict) else diagrams


@router.get("/vehicles/{slug}/diagrams/{diagram_id}/image")
def get_diagram_image(slug: str, diagram_id: str) -> FileResponse:
    diagram = _get_diagram(slug, diagram_id)
    if not diagram.image_path.exists():
        raise HTTPException(status_code=404, detail="diagram image not found")
    return FileResponse(diagram.image_path, media_type="image/webp")


@router.get("/vehicles/{slug}/diagrams/{diagram_id}/meta")
def get_diagram_meta(slug: str, diagram_id: str) -> dict[str, Any]:
    return _get_diagram(slug, diagram_id).meta


@router.get("/vehicles/{slug}/diagrams/{diagram_id}/annotations")
def get_diagram_annotations(slug: str, diagram_id: str) -> dict[str, Any]:
    return _get_diagram(slug, diagram_id).annotation
