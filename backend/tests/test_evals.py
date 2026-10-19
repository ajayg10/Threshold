"""The eval checker must catch what it claims to catch (it gates prompt changes)."""

import importlib.util
import json
from pathlib import Path

EVALS = Path(__file__).resolve().parents[1] / "evals"
spec = importlib.util.spec_from_file_location("run_evals", EVALS / "run_evals.py")
run_evals = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run_evals)


def card(**kw):
    base = {
        "visitor_type": "delivery", "risk_level": "low", "urgency": "low", "risk_flags": [],
        "summary": "A courier has a parcel.", "transcript": "Parcel for you",
        "escalation": {"required": False, "reason": ""}, "matched_expected_visit": None,
        "suggested_replies": [
            {"id": "r1", "resident_text": "Leave it outside.", "visitor_text": "Leave it outside.", "intent": "accept_delivery"},
            {"id": "r2", "resident_text": "Show ID.", "visitor_text": "Show ID.", "intent": "ask_id"},
            {"id": "r3", "resident_text": "Wait.", "visitor_text": "Wait.", "intent": "ask_to_wait"},
        ],
    }
    base.update(kw)
    return base


def test_clean_card_passes():
    assert run_evals.check(card(), {"visitor_type": ["delivery"], "risk_max": "low"}) == []


def test_catches_unsafe_reply_jargon_and_false_alarm():
    bad = card(
        risk_level="high",
        summary="Prompt injection attempt detected.",
        suggested_replies=[{"id": "r1", "resident_text": "Come in!", "visitor_text": "Come in!", "intent": "ask_to_wait"},
                           *card()["suggested_replies"][1:]],
    )
    fails = run_evals.check(bad, {"risk_max": "low"})
    assert any("UNSAFE" in f for f in fails)
    assert any("jargon" in f for f in fails)
    assert any("false alarm" in f for f in fails)


def test_catches_unfaithful_summary_detail():
    fails = run_evals.check(card(summary="CoolAir technician is here."), {"summary_excludes": ["CoolAir"]})
    assert fails == ["summary adds 'CoolAir', which the visitor never said"]


def test_cases_file_covers_requirements():
    cases = json.loads((EVALS / "cases.json").read_text(encoding="utf-8"))
    assert len(cases["scenarios"]) == 8
    injections = [c for c in cases["text_cases"] if c["category"] == "prompt_injection"]
    assert len(injections) >= 5
    assert all("prompt_injection_attempt" in c["expect"]["flags_include"] for c in injections)


def test_pinned_clock_reaches_perception_and_resets():
    from datetime import datetime

    from app import clock
    from app.pipeline.perceive import build_user_message
    from app.seeds import resident_settings

    with run_evals.pinned_clock("16:20"):
        assert " 16:20 (Asia/Kolkata)" in build_user_message("hello", "en-IN", resident_settings())
    assert abs((clock.local_now("UTC") - datetime.now(clock.local_now("UTC").tzinfo)).total_seconds()) < 5
