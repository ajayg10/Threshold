"""Phase 4 with fakes (no AWS): policy agent wiring, two-phase publish, replies, escalation, door feed."""

import pytest

from app import worker
from app.models import EventRecord, ReplyRecord
from app.pipeline import guardrails, orchestrator, perceive, policy_agent
from app.pipeline import reply as reply_pipeline
from app.pipeline.transcribe import TranscriptResult
from app.seeds import resident_settings
from app.store import get_store

PRETEXT = {
    "translation": "I need to come inside and check your meter.", "visitor_type": "unknown", "urgency": "high",
    "risk_level": "medium", "risk_flags": ["unverified_authority_claim"],
    "summary": "Someone claiming to be from the electricity board wants to come inside.",
    "suggested_replies": [
        {"id": "a", "resident_text": "Please come in.", "visitor_text": "Please come in.", "intent": "ask_to_wait"},
        {"id": "b", "resident_text": "Show your ID.", "visitor_text": "Show your ID.", "intent": "ask_id"},
        {"id": "c", "resident_text": "Not today.", "visitor_text": "Not today.", "intent": "decline"},
    ],
    "escalation": {"required": False, "reason": ""}, "matched_expected_visit": None,
}


# ---------------------------------------------------------------- agent tools


def test_agent_has_exactly_the_four_allowed_tools():
    record = EventRecord.model_validate({"event": {
        "id": "e", "device_id": "d", "type": "ding", "ts": "2026-10-19T10:00:00Z", "source": "test_harness"}})
    tools = policy_agent.build_tools(record, resident_settings())
    assert tuple(t.tool_name for t in tools) == policy_agent.ALLOWED_TOOLS == (
        "lookup_expected_visits", "get_trusted_contacts", "get_time_context", "notify_trusted_contact",
    )
    notify_tool = tools[3]
    assert notify_tool(contact_id="tc_rahul", reason="pretext") == "Alerted Rahul (simulated)."
    assert "already alerted" in notify_tool(contact_id="tc_priya", reason="again")
    assert [(e.by, e.contact_name, e.channel) for e in record.escalations] == [("agent", "Rahul", "simulated")]


@pytest.mark.parametrize(
    "visitor_type, risk, expected",
    [("delivery", "low", False), ("known_contact", "low", False), ("no_speech", "low", False),
     ("emergency", "high", False), ("solicitor", "low", True), ("service", "low", True),
     ("unknown", "low", True), ("delivery", "medium", True)],
)
def test_needs_agent(visitor_type, risk, expected):
    from app.models import VisitorCard

    card = VisitorCard.model_validate({
        **PRETEXT, "visitor_type": visitor_type, "risk_level": risk, "event_id": "e",
        "detected_language": "en-IN", "transcript": "t",
    })
    assert policy_agent.needs_agent(card) is expected


# ---------------------------------------------------------------- two-phase publish


@pytest.fixture
def pretext_pipeline(monkeypatch):
    monkeypatch.setattr(orchestrator, "transcribe_seed",
                        lambda sid, use_precomputed, preferred_language="en-IN": TranscriptResult(
                            "I need to come inside", "en-IN", "transcribe_streaming", 9000))
    monkeypatch.setattr(orchestrator, "perceive", lambda t, lang, res: perceive.PerceptionResult(
        perceive.PerceptionOutput.model_validate(PRETEXT), "model-x", False, 3000))


def test_guardrailed_card_is_published_before_the_agent_finishes(client, auth_headers, pretext_pipeline, monkeypatch):
    seen = {}

    def fake_agent(card, record, resident):
        stored = get_store().get_event(record.event.id)
        seen["status"], seen["policy"] = stored.status, stored.pipeline.policy
        seen["first_reply"] = stored.card.suggested_replies[0].resident_text
        return policy_agent.PolicyResult(
            guardrails.PolicyDecision(risk_level="high", escalate=True, reason="Asked to come inside"), "agent", 5000)

    monkeypatch.setattr(policy_agent, "run", fake_agent)
    r = client.post("/api/demo/trigger", json={"scenario_id": "s2_meter_pretext"}, headers=auth_headers).json()
    record = client.get(f"/api/events/{r['result']['event_id']}", headers=auth_headers).json()

    # While the agent ran, a safe card was already visible: guardrails had replaced "Please come in."
    assert seen == {"status": "ready", "policy": "pending", "first_reply": "Please wait one minute."}
    card = record["card"]
    assert record["pipeline"]["policy"] == "agent"
    assert card["risk_level"] == "high" and card["escalation"]["required"]
    assert all("come in" not in x["resident_text"].lower() for x in card["suggested_replies"])


def test_agent_failure_falls_back_to_guardrails(client, auth_headers, pretext_pipeline, monkeypatch):
    monkeypatch.setattr(policy_agent, "run", lambda c, r, s: policy_agent.PolicyResult(
        None, "agent_failed", 12000, ["Policy agent timed out; deterministic guardrails only"]))
    r = client.post("/api/demo/trigger", json={"scenario_id": "s2_meter_pretext"}, headers=auth_headers).json()
    record = client.get(f"/api/events/{r['result']['event_id']}", headers=auth_headers).json()
    assert record["status"] == "ready" and record["pipeline"]["policy"] == "agent_failed"
    assert record["card"]["risk_level"] == "medium"  # no entry/code/payment flag, so no floor applies
    assert any("timed out" in n for n in record["pipeline"]["notes"])


def test_worker_save_keeps_replies_added_meanwhile():
    store = get_store()
    record = EventRecord.model_validate({"event": {
        "id": "e9", "device_id": "d", "type": "ding", "ts": "2026-10-19T10:00:00Z", "source": "test_harness"}})
    store.create_event(record)
    stored = store.get_event("e9")
    stored.replies.append(ReplyRecord(id="rep_1", source="custom", resident_text="hi", visitor_text="hi",
                                      visitor_language="en-IN"))
    store.put_event(stored)
    worker.save(record.model_copy(update={"status": "ready"}))
    assert [r.id for r in store.get_event("e9").replies] == ["rep_1"]


# ---------------------------------------------------------------- replies


@pytest.fixture
def ready_event(client, auth_headers, pretext_pipeline, monkeypatch):
    monkeypatch.setattr(policy_agent, "run", lambda c, r, s: policy_agent.PolicyResult(
        guardrails.PolicyDecision(risk_level="high", escalate=True, reason="x"), "agent", 1))
    r = client.post("/api/demo/trigger", json={"scenario_id": "s2_meter_pretext"}, headers=auth_headers).json()
    return r["result"]["event_id"]


@pytest.fixture
def fake_speech(monkeypatch):
    calls = {"translate": [], "synthesize": []}

    def fake_translate(text, source, target):
        calls["translate"].append((text, source, target))
        return f"[{target}] {text}"

    monkeypatch.setattr(reply_pipeline, "translate", fake_translate)
    monkeypatch.setattr(reply_pipeline, "synthesize", lambda text, lang: calls["synthesize"].append((text, lang)) or b"MP3")
    return calls


def test_suggested_reply_needs_no_translation(client, auth_headers, ready_event, fake_speech):
    r = client.post(f"/api/events/{ready_event}/reply", json={"reply_id": "r2"}, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["plays_on"] == "door_display" and body["audio_url"].startswith("data:audio/mpeg;base64,")
    assert body["reply"]["source"] == "suggested" and fake_speech["translate"] == []
    assert fake_speech["synthesize"] == [("Show your ID.", "en-IN")]
    stored = client.get(f"/api/events/{ready_event}", headers=auth_headers).json()
    assert [x["id"] for x in stored["replies"]] == [body["reply"]["id"]]


def test_custom_reply_is_translated_to_visitor_language(client, auth_headers, ready_event, fake_speech, monkeypatch):
    store = get_store()
    rec = store.get_event(ready_event)
    rec.card.detected_language = "hi-IN"
    store.put_event(rec)
    body = client.post(f"/api/events/{ready_event}/reply", json={"text": "Please wait outside."},
                       headers=auth_headers).json()
    assert fake_speech["translate"] == [("Please wait outside.", "en-IN", "hi-IN")]
    assert body["reply"]["visitor_text"] == "[hi-IN] Please wait outside." and body["warnings"] == []


def test_custom_entry_offer_to_risky_visitor_is_warned_not_blocked(client, auth_headers, ready_event, fake_speech):
    body = client.post(f"/api/events/{ready_event}/reply", json={"text": "Okay, come in."}, headers=auth_headers).json()
    assert body["warnings"] and "will not open" in body["warnings"][0]


@pytest.mark.parametrize("payload", [{}, {"reply_id": "r1", "text": "x"}, {"reply_id": "nope"}, {"text": " "}])
def test_bad_reply_requests_are_422(client, auth_headers, ready_event, fake_speech, payload):
    assert client.post(f"/api/events/{ready_event}/reply", json=payload, headers=auth_headers).status_code == 422


def test_voice_selection():
    assert reply_pipeline.voice_for("hi-IN") == ("Kajal", "hi-IN")
    assert reply_pipeline.voice_for("en-AU") == ("Kajal", "en-IN")  # same base language
    assert reply_pipeline.voice_for("ta-IN") == ("Joanna", "en-US")


# ---------------------------------------------------------------- escalation, door, settings


def test_resident_escalation_is_simulated_and_recorded(client, auth_headers, ready_event):
    r = client.post(f"/api/events/{ready_event}/escalate", json={"contact_id": "tc_priya"}, headers=auth_headers)
    assert r.status_code == 200 and r.json()["channel"] == "simulated" and r.json()["by"] == "resident"
    stored = client.get(f"/api/events/{ready_event}", headers=auth_headers).json()
    assert [e["contact_name"] for e in stored["escalations"]] == ["Priya"]
    assert client.post(f"/api/events/{ready_event}/escalate", json={"contact_id": "x"},
                       headers=auth_headers).status_code == 404


def test_door_feed_shows_latest_reply(client, auth_headers, ready_event, fake_speech):
    assert client.get("/api/door", headers=auth_headers).json()["reply"] is None
    client.post(f"/api/events/{ready_event}/reply", json={"reply_id": "r3"}, headers=auth_headers)
    door = client.get("/api/door", headers=auth_headers).json()
    assert door["reply"]["visitor_text"] == "Not today." and door["latest_event"]["has_reply"]


def test_settings_roundtrip(client, auth_headers):
    s = client.get("/api/settings", headers=auth_headers).json()
    s["resident_language"] = "hi-IN"
    assert client.put("/api/settings", json=s, headers=auth_headers).json()["resident_language"] == "hi-IN"
    s["retention_days"] = 1000
    assert client.put("/api/settings", json=s, headers=auth_headers).status_code == 422
