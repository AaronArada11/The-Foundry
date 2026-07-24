from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ToolManifest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    slug: str
    name: str
    description: str
    sort_order: int = Field(alias="sortOrder")
    category: str
    tags: list[str]
    icon: str
    accent: Literal["coral", "mint", "gold", "forest"]
    execution_type: Literal["client", "server-sync", "server-job"] = Field(alias="executionType")
    availability: Literal["available", "maintenance", "coming-soon"]

    @model_validator(mode="after")
    def validate_identity(self) -> ToolManifest:
        if self.id != self.slug:
            raise ValueError("tool id and slug must match")
        if not self.slug or any(
            character not in "abcdefghijklmnopqrstuvwxyz0123456789-" for character in self.slug
        ):
            raise ValueError("tool slug must be lowercase kebab-case")
        return self


@lru_cache
def load_tool_manifests() -> tuple[ToolManifest, ...]:
    manifest_root = files("aaron_toolkit").joinpath("tool_manifests")
    manifests = []
    for path in sorted(manifest_root.iterdir(), key=lambda item: item.name):
        if path.name.endswith(".json"):
            manifests.append(ToolManifest.model_validate(json.loads(path.read_text())))

    ids = [manifest.id for manifest in manifests]
    if len(ids) != len(set(ids)):
        raise RuntimeError("duplicate tool manifest ids")
    return tuple(sorted(manifests, key=lambda manifest: manifest.sort_order))
