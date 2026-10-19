"""Deterministic guardrails: these must hold whatever the models produce."""

import pytest

from app.models import Escalation, SuggestedReply, VisitorCard
from app.pipeline.guardrails import PolicyDecision, apply, grants_entry


def reply(rid, intent, resident, visitor=None):
    return SuggestedReply(id=rid, intent=intent, resident_text=resident, visitor_text=visitor or resident)


SAFE_REPLIES = [
    reply("a", "ask_id", "Please show your ID."),
    reply("b", "ask_to_wait", "Please wait."),
    reply("c", "decline", "Sorry, not today."),
]


def card(**kw) -> VisitorCard:
    base = dict(
        event_id="e1", detected_language="en-IN", transcript="t", translation="t", visitor_type="unknown",
        urgency="low", risk_level="low", risk_flags=[], summary="s", suggested_replies=SAFE_REPLIES,
        escalation=Escalation(),
    )
    base.update(kw)
    return VisitorCard.model_validate(base)


# ---------------------------------------------------------------- entry detector


@pytest.mark.parametrize(
    "text",
    [
        "Please come in.",
        "Come inside and check the meter.",
        "I'll open the door for you.",
        "Let me open it, one second.",
        "The door is open, go ahead.",
        "You can enter through the side gate.",
        "I will unlock the gate.",
        "The OTP is 4821.",
        "आप अंदर आ जाइए।",
        "मैं दरवाज़ा खोल रही हूँ।",
        "andar aa jaiye",
        "Sure. Come in please.",  # second sentence offers entry
    ],
)
def test_detects_entry_offers(text):
    assert grants_entry(text)


@pytest.mark.parametrize(
    "text",
    [
        "I cannot let you in right now.",  # real Haiku 4.5 output for s2 (Phase 3)
        "I won't open the door. Please leave.",
        "I'm not opening the door until you show ID.",
        "Please leave the parcel outside.",
        "Never share an OTP with anyone.",
        "मैं दरवाज़ा नहीं खोल सकती।",
        "कृपया अंदर मत आइए।",
        "Please come back later.",
        "Who is it?",
        "",
    ],
)
def test_allows_safe_text(text):
    assert not grants_entry(text)


# ---------------------------------------------------------------- flag floors


@pytest.mark.parametrize("flag", ["pretext_entry_request", "asks_for_codes_or_otp", "payment_request"])
def test_entry_code_payment_flags_force_high_and_escalation(flag):
    out, notes = apply(card(risk_level="low", risk_flags=[flag]), None, "en-IN")
    assert out.risk_level == "high" and out.escalation.required and out.escalation.reason
    assert notes


def test_prompt_injection_is_at_least_medium():
    out, _ = apply(card(risk_level="low", risk_flags=["prompt_injection_attempt"]), None, "en-IN")
    assert out.risk_level == "medium"
    out, _ = apply(card(risk_level="high", risk_flags=["prompt_injection_attempt"]), None, "en-IN")
    assert out.risk_level == "high"


def test_agent_can_raise_but_never_lower():
    raised, notes = apply(card(risk_level="low"), PolicyDecision(risk_level="high", escalate=True, reason="late night"), "en-IN")
    assert raised.risk_level == "high" and raised.escalation.required and raised.escalation.reason == "late night"

    kept, _ = apply(
        card(risk_level="high", risk_flags=["pretext_entry_request"]),
        PolicyDecision(risk_level="low", escalate=False, add_flags=[]),
        "en-IN",
    )
    assert kept.risk_level == "high" and kept.escalation.required
    assert kept.risk_flags == ["pretext_entry_request"]  # agent cannot remove flags


def test_agent_can_add_only_context_flags():
    out, _ = apply(card(), PolicyDecision(risk_level="medium", escalate=False, add_flags=["unverified_authority_claim"]), "en-IN")
    assert out.risk_flags == ["unverified_authority_claim"] and out.risk_level == "medium"


def test_agent_cannot_add_content_flags_that_force_escalation():
    # Seen on the deployed stack: the agent added pretext_entry_request to an AC visit arriving after
    # its booked slot. The visitor never asked to come in, so the guardrail must not escalate on it.
    decision = PolicyDecision(risk_level="medium", escalate=False, add_flags=["pretext_entry_request", "payment_request"])
    out, notes = apply(card(visitor_type="service"), decision, "en-IN")
    assert out.risk_flags == [] and out.risk_level == "medium" and not out.escalation.required
    assert any("Ignored agent flags" in n for n in notes)


# ---------------------------------------------------------------- replies


def test_unsafe_reply_is_replaced_with_safe_phrase_of_same_intent():
    replies = [
        reply("a", "accept_delivery", "Come in and put it on the table.", "अंदर आकर मेज़ पर रख दीजिए।"),
        SAFE_REPLIES[1],
        SAFE_REPLIES[2],
    ]
    out, notes = apply(card(detected_language="hi-IN", suggested_replies=replies), None, "en-IN")
    first = out.suggested_replies[0]
    assert first.intent == "accept_delivery"
    assert first.resident_text == "Please leave the parcel outside the door."
    assert first.visitor_text == "कृपया पार्सल दरवाज़े के बाहर रख दीजिए।"
    assert any("replaced" in n for n in notes)
    assert [r.id for r in out.suggested_replies] == ["r1", "r2", "r3"]


def test_unsafe_visitor_text_alone_is_caught():
    replies = [reply("a", "ask_to_wait", "Please wait.", "Please wait, I'll open the door."), *SAFE_REPLIES[1:]]
    out, _ = apply(card(suggested_replies=replies), None, "en-IN")
    assert not grants_entry(out.suggested_replies[0].visitor_text)


def test_emergency_always_has_emergency_help_and_high_urgency():
    out, notes = apply(card(visitor_type="emergency", urgency="medium"), None, "en-IN")
    assert out.urgency == "high"
    assert out.suggested_replies[0].intent == "emergency_help" and len(out.suggested_replies) == 3
    assert any("emergency_help" in n for n in notes)


def test_no_speech_cards_pass_unchanged():
    c = card(visitor_type="no_speech", detected_language="und")
    out, notes = apply(c, None, "en-IN")
    assert notes == [] and out.risk_level == "low"
    assert [r.resident_text for r in out.suggested_replies] == [r.resident_text for r in SAFE_REPLIES]
