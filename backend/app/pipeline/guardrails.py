"""Deterministic guardrails (build prompt 4.2). Plain code, run after the policy agent, always.

- pretext_entry_request / asks_for_codes_or_otp / payment_request -> risk high + escalation required
- prompt_injection_attempt -> risk at least medium
- the policy agent can raise risk or add flags, never lower anything (merge takes the maximum)
- emergencies always carry an emergency_help reply and high urgency
- any suggested reply that implies letting the visitor in (or sharing codes) is replaced with a safe one
- exactly 3 replies
"""

import re

from pydantic import BaseModel, Field

from ..models import Escalation, Level, RiskFlag, SuggestedReply, VisitorCard
from . import phrases

LEVELS: list[Level] = ["low", "medium", "high"]
ESCALATE_FLAGS: set[RiskFlag] = {"pretext_entry_request", "asks_for_codes_or_otp", "payment_request"}
SAFE_FALLBACK_INTENTS = ["ask_id", "call_family", "ask_to_wait", "decline"]


class PolicyDecision(BaseModel):
    """What the policy agent may contribute. Applied with max/union semantics only."""

    risk_level: Level = Field(description="Your risk assessment. Lower values than the card's are ignored.")
    add_flags: list[RiskFlag] = Field(default_factory=list, description="Extra risk flags to add (never removes)")
    escalate: bool = Field(description="True if a trusted contact should be alerted")
    reason: str = Field(default="", description="Under 20 words, in the resident's language")


def max_level(*levels: Level) -> Level:
    return LEVELS[max(LEVELS.index(level) for level in levels)]


# ---------------------------------------------------------------- entry / code-sharing detector

_ENTRY = [
    r"\bcome (?:on )?in(?:side)?\b",
    r"\bstep in(?:side)?\b",
    r"\bwalk in\b",
    r"\blet (?:you|u|them|him|her) (?:in|inside|come in)\b",
    r"\bopen(?:ing)? (?:the |my |our )?(?:door|gate|lock)\b",
    r"\b(?:i'?ll|i will|i am going to|let me) open\b",
    r"\b(?:door|gate) is (?:open|unlocked)\b",
    r"\bunlock",
    r"\bbuzz(?:ing)? (?:you|u) in\b",
    r"\b(?:you can|you may|feel free to|go ahead and) (?:enter|go in|come in)\b",
    r"\b(?:otp|pin|passcode|password)\b",
    r"\bandar aa",
    r"\bdarwaz[a]+ khol",
    "अंदर आ",
    "अन्दर आ",
    "दरवाज़ा खोल",
    "दरवाजा खोल",
    "ताला खोल",
    "ओटीपी",
]
_ENTRY_RE = [re.compile(p, re.IGNORECASE) for p in _ENTRY]
_NEGATION = re.compile(
    r"\b(?:not|never|cannot|can't|cant|won't|wont|don't|dont|unable|no)\b|n't\b|नहीं|मत\b|\bnahi\b|\bnahin\b",
    re.IGNORECASE,
)
_SENTENCE = re.compile(r"[.!?।\n]+")


def grants_entry(text: str) -> bool:
    """True if any sentence offers entry, opening/unlocking, or code sharing without a negation."""
    for sentence in _SENTENCE.split(text or ""):
        if any(p.search(sentence) for p in _ENTRY_RE) and not _NEGATION.search(sentence):
            return True
    return False


def is_unsafe_reply(reply: SuggestedReply) -> bool:
    return grants_entry(reply.resident_text) or grants_entry(reply.visitor_text)


# ---------------------------------------------------------------- apply


def apply(
    card: VisitorCard, decision: PolicyDecision | None, resident_language: str
) -> tuple[VisitorCard, list[str]]:
    notes: list[str] = []
    visitor_language = None if card.detected_language == "und" else card.detected_language
    risk = card.risk_level
    flags = list(dict.fromkeys(card.risk_flags))
    escalation = Escalation(required=card.escalation.required, reason=card.escalation.reason)

    if decision is not None:
        if LEVELS.index(decision.risk_level) > LEVELS.index(risk):
            notes.append(f"Policy agent raised risk {risk} -> {decision.risk_level}")
        risk = max_level(risk, decision.risk_level)
        flags += [f for f in decision.add_flags if f not in flags]
        if decision.escalate and not escalation.required:
            escalation = Escalation(required=True, reason=decision.reason or escalation.reason)
            notes.append("Policy agent required escalation")

    if ESCALATE_FLAGS & set(flags):
        if risk != "high" or not escalation.required:
            notes.append("Guardrail: entry/code/payment request -> high risk + escalation")
        risk = "high"
        if not escalation.required:
            escalation = Escalation(required=True, reason=escalation.reason)
        if not escalation.reason:
            escalation.reason = "Visitor asked to come in, for a code, or for payment."
    if "prompt_injection_attempt" in flags and risk == "low":
        risk = "medium"
        notes.append("Guardrail: prompt injection -> at least medium risk")
    if escalation.required and not escalation.reason:
        escalation.reason = "Flagged as high risk."

    urgency = card.urgency
    replies = list(card.suggested_replies)

    # An unsafe reply becomes the reviewed safe phrase for the same intent
    # (e.g. "come in and put it on the table" -> "Please leave the parcel outside the door").
    for i, r in enumerate(replies):
        if is_unsafe_reply(r):
            replies[i] = phrases.reply(r.intent, resident_language, visitor_language)
            notes.append(f"Guardrail: replaced a reply that implied entry or code sharing ({r.intent})")

    if card.visitor_type == "emergency":
        urgency = "high"
        if not any(r.intent == "emergency_help" for r in replies):
            replies = [phrases.reply("emergency_help", resident_language, visitor_language)] + replies
            notes.append("Guardrail: added an emergency_help reply")

    # Exactly 3, padded with safe defaults if needed.
    for intent in SAFE_FALLBACK_INTENTS:
        if len(replies) >= 3:
            break
        if intent not in {r.intent for r in replies}:
            replies.append(phrases.reply(intent, resident_language, visitor_language))
    replies = [SuggestedReply(**{**r.model_dump(), "id": f"r{n}"}) for n, r in enumerate(replies[:3], 1)]

    updated = card.model_copy(update={
        "risk_level": risk,
        "risk_flags": flags,
        "escalation": escalation,
        "urgency": urgency,
        "suggested_replies": replies,
    })
    return VisitorCard.model_validate(updated.model_dump()), notes
