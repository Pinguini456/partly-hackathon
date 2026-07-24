"""Pydantic models for the clean (non-passthrough) endpoints.

The big EPC payloads (assemblies / annotations) and the AI predictions are
returned as raw JSON — a genuine JSON boundary — so they are not modelled here.
"""

from __future__ import annotations

from pydantic import BaseModel


class VehicleSummary(BaseModel):
    slug: str
    make: str | None
    model: str | None
    year: int | None
    oem_vehicle_id: str | None
    diagram_count: int
    part_count: int
    has_prediction: bool = False
