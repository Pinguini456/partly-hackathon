"""AI prediction passthrough endpoints.

Each vehicle has one prediction file (the ml-server pipeline output for that
vehicle's damage inspection). It is returned verbatim — a JSON boundary.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from ..data_loader import get_dataset

router = APIRouter(tags=["predictions"])


@router.get("/predictions")
def list_predictions() -> list[str]:
    """Vehicle slugs that have an AI prediction."""
    return sorted(get_dataset().predictions.keys())


@router.get("/vehicles/{slug}/predictions")
def get_prediction(slug: str) -> dict[str, Any]:
    """The raw AI prediction for a vehicle (context_selection, raw_parts, oem_parts)."""
    ds = get_dataset()
    if slug not in ds.vehicles:
        raise HTTPException(status_code=404, detail=f"unknown vehicle slug: {slug}")
    prediction = ds.predictions.get(slug)
    if prediction is None:
        raise HTTPException(status_code=404, detail=f"no prediction for vehicle: {slug}")
    return prediction
