"""In-memory loader for the hackathon-2026 dataset.

Everything under ``DATA_DIR`` is read once at process start into a single
``Dataset`` held as a module singleton. Image binaries stay on disk and are
served straight from their paths; JSON payloads are parsed and kept in memory.

The API exposes three things: vehicles, their assembly/diagram data, and the AI
predictions. Damage-context folders ship in the dataset but are read directly
off disk by consumers, not served by this API.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .models import VehicleSummary

# --- part-name + orderability resolution ------------------------------------
# Assemblies already carry baked `display_name` + `is_orderable`; this only
# recomputes them if a file is missing them (idempotent).
_DEFAULT_PART_NAME = "Hardware Part"
_LANG_PRIORITY = ("en-NZ", "en")


def _title_case(text: str) -> str:
    return re.sub(r"[A-Za-z]+", lambda m: m.group(0).capitalize(), text)


def _pick_localised(names: Any) -> str | None:
    if not isinstance(names, list) or not names:
        return None
    entries = [n for n in names if isinstance(n, dict) and n.get("value")]
    for lang in _LANG_PRIORITY:
        for n in entries:
            if str(n.get("language", "")).lower() == lang:
                return str(n["value"]).strip() or None
    for n in entries:
        if str(n.get("language", "")).lower().startswith("en"):
            return str(n["value"]).strip() or None
    return str(entries[0]["value"]).strip() or None if entries else None


def _enrich_assemblies(assemblies_payload: dict[str, Any]) -> None:
    ghcas = assemblies_payload.get("deprecated_gapc_human_centric_assemblies") or {}
    assemblies = assemblies_payload.get("assemblies")
    if not isinstance(assemblies, dict):
        return
    for a in assemblies.values():
        if not isinstance(a, dict):
            continue
        if a.get("display_name") and "is_orderable" in a:
            continue  # already baked into the shipped data; don't clobber
        ghca = ghcas.get(a.get("hca_world_tree_id")) if a.get("hca_world_tree_id") else None
        hca_name = _pick_localised(ghca.get("names")) if isinstance(ghca, dict) else None
        raw_desc = (a.get("description") or "").strip()
        oem_name = _title_case(raw_desc) if raw_desc else None
        a["display_name"] = hca_name or oem_name or _DEFAULT_PART_NAME
        mpn = (a.get("manufacturer_part_number") or "").strip()
        a["is_orderable"] = bool(a.get("hotspot")) and bool(mpn) and not a.get("is_generic")


def _read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"expected a JSON object at {path}, got {type(data).__name__}")
    return data


def _unwrap_completed(data: dict[str, Any]) -> dict[str, Any]:
    completed = data.get("completed")
    return completed if isinstance(completed, dict) else data


@dataclass
class DiagramFiles:
    diagram_id: str
    directory: Path
    meta: dict[str, Any]
    annotation: dict[str, Any]  # {"diagram_id":.., "objects":[..]}

    @property
    def image_path(self) -> Path:
        return self.directory / "image.webp"


@dataclass
class VehicleData:
    slug: str
    vehicle: dict[str, Any]  # unwrapped vehicle.json
    assemblies: dict[str, Any]  # unwrapped assemblies.json (baked display_name + is_orderable)
    diagrams: dict[str, DiagramFiles] = field(default_factory=dict)

    def summary(self) -> VehicleSummary:
        make, model, year = _extract_make_model_year(self.vehicle)
        return VehicleSummary(
            slug=self.slug,
            make=make,
            model=model,
            year=year,
            oem_vehicle_id=self.assemblies.get("oem_vehicle_id"),
            diagram_count=len(self.assemblies.get("diagrams", {})),
            part_count=len(self.assemblies.get("assemblies", {})),
        )


def _extract_make_model_year(
    vehicle: dict[str, Any],
) -> tuple[str | None, str | None, int | None]:
    variants = vehicle.get("variants") or []
    if not variants:
        return None, None, None
    props: dict[str, Any] = {}
    for entry in variants[0].get("properties", []):
        if isinstance(entry, dict):
            for key, value in entry.items():
                props.setdefault(key, value)
    year_raw = props.get("production_year")
    try:
        year = int(year_raw) if year_raw is not None else None
    except (TypeError, ValueError):
        year = None
    return props.get("make"), props.get("model"), year


@dataclass
class Dataset:
    vehicles: dict[str, VehicleData] = field(default_factory=dict)
    predictions: dict[str, dict[str, Any]] = field(default_factory=dict)  # slug -> raw prediction json


def _load_vehicle(slug: str, vehicle_dir: Path) -> VehicleData:
    vehicle = _unwrap_completed(_read_json(vehicle_dir / "vehicle.json"))
    assemblies = _unwrap_completed(_read_json(vehicle_dir / "assemblies.json"))
    _enrich_assemblies(assemblies)

    data = VehicleData(slug=slug, vehicle=vehicle, assemblies=assemblies)

    diagrams_root = vehicle_dir / "diagrams"
    if diagrams_root.is_dir():
        for diagram_dir in sorted(diagrams_root.iterdir()):
            if not diagram_dir.is_dir():
                continue
            diagram_id = diagram_dir.name
            meta_path = diagram_dir / "meta.json"
            meta = _read_json(meta_path) if meta_path.exists() else {"diagram_id": diagram_id}
            annotation: dict[str, Any] = {"diagram_id": diagram_id, "objects": []}
            ann_path = diagram_dir / "annotations.json"
            if ann_path.exists():
                completed = _read_json(ann_path).get("completed")
                if isinstance(completed, dict) and isinstance(completed.get("annotation"), dict):
                    annotation = completed["annotation"]
                elif isinstance(_read_json(ann_path).get("objects"), list):
                    annotation = _read_json(ann_path)
            data.diagrams[diagram_id] = DiagramFiles(
                diagram_id=diagram_id, directory=diagram_dir, meta=meta, annotation=annotation
            )
    return data


def load_dataset(data_dir: str | os.PathLike[str] | None = None) -> Dataset:
    """Load vehicles + predictions into memory from ``data_dir`` (default ``DATA_DIR``)."""
    root = Path(data_dir if data_dir is not None else os.environ.get("DATA_DIR", "/data"))
    if not root.is_dir():
        raise FileNotFoundError(f"DATA_DIR does not exist or is not a directory: {root}")

    dataset = Dataset()

    vehicles_root = root / "vehicles"
    if vehicles_root.is_dir():
        for vehicle_dir in sorted(vehicles_root.iterdir()):
            if vehicle_dir.is_dir() and (vehicle_dir / "vehicle.json").exists():
                dataset.vehicles[vehicle_dir.name] = _load_vehicle(vehicle_dir.name, vehicle_dir)

    predictions_root = root / "predictions"
    if predictions_root.is_dir():
        for pf in sorted(predictions_root.glob("*.json")):
            dataset.predictions[pf.stem] = _read_json(pf)

    return dataset


# Module singleton, populated by main.py's lifespan handler.
_DATASET: Dataset | None = None


def set_dataset(dataset: Dataset) -> None:
    global _DATASET
    _DATASET = dataset


def get_dataset() -> Dataset:
    if _DATASET is None:
        raise RuntimeError("dataset not loaded; call set_dataset() during app startup")
    return _DATASET
