"""Invariant: Threshold never unlocks, opens, or grants access to anything.

Fails if any model field, enum value, route, or function name suggests an access-control action.
"""

import inspect
import re
from pathlib import Path

from pydantic import BaseModel

from app import models
from app.main import app

FORBIDDEN = re.compile(
    r"unlock|open_?door|grant_?access|(?<![a-z])let_?in(?![a-z])|buzz_?in|lock_?control|disarm", re.I
)
APP_DIR = Path(__file__).resolve().parents[1] / "app"


def _schema_words(schema: object) -> list[str]:
    words: list[str] = []
    if isinstance(schema, dict):
        for key, value in schema.items():
            if key in ("properties", "$defs"):
                words.extend(value.keys())
            if key in ("enum", "const"):
                words.extend(map(str, value if isinstance(value, list) else [value]))
            words.extend(_schema_words(value))
    elif isinstance(schema, list):
        for item in schema:
            words.extend(_schema_words(item))
    return words


def test_no_unlock_in_data_models():
    model_classes = [
        obj
        for _, obj in inspect.getmembers(models, inspect.isclass)
        if issubclass(obj, BaseModel) and obj.__module__ == models.__name__
    ]
    assert model_classes
    for cls in model_classes:
        bad = [w for w in _schema_words(cls.model_json_schema()) if FORBIDDEN.search(w)]
        assert not bad, f"{cls.__name__} exposes access-control terms: {bad}"


def test_no_unlock_routes():
    bad = [r.path for r in app.routes if FORBIDDEN.search(getattr(r, "path", ""))]
    assert not bad, f"access-control routes found: {bad}"


def test_no_unlock_functions_or_tools_in_source():
    definition = re.compile(r"^\s*(?:async\s+)?def\s+(\w+)|name\s*=\s*[\"'](\w+)[\"']", re.M)
    offenders = []
    for path in APP_DIR.rglob("*.py"):
        for match in definition.finditer(path.read_text(encoding="utf-8")):
            name = match.group(1) or match.group(2)
            if FORBIDDEN.search(name):
                offenders.append(f"{path.name}:{name}")
    assert not offenders, f"access-control functions/tools found: {offenders}"


def test_detector_catches_a_planted_field():
    class Bad(BaseModel):
        unlock_door: bool = False

    assert any(FORBIDDEN.search(w) for w in _schema_words(Bad.model_json_schema()))
