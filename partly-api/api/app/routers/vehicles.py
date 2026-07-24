from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from ..data_loader import VehicleData, get_dataset
from ..models import VehicleSummary

router = APIRouter(tags=["vehicles"])


def _get_vehicle(slug: str) -> VehicleData:
    vehicle = get_dataset().vehicles.get(slug)
    if vehicle is None:
        raise HTTPException(status_code=404, detail=f"unknown vehicle slug: {slug}")
    return vehicle


@router.get("/vehicles", response_model=list[VehicleSummary])
def list_vehicles() -> list[VehicleSummary]:
    ds = get_dataset()
    out: list[VehicleSummary] = []
    for v in ds.vehicles.values():
        s = v.summary()
        s.has_prediction = v.slug in ds.predictions
        out.append(s)
    return out


@router.get("/vehicles/{slug}/assemblies")
def get_assemblies(slug: str) -> dict[str, Any]:
    return _get_vehicle(slug).assemblies
