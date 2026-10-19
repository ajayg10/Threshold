"""Deterministic guardrails (build prompt 4.2). Plain code, run after the policy agent, always.

- pretext_entry_request / asks_for_codes_or_otp / payment_request -> risk high + escalation required
- prompt_injection_attempt -> risk at least medium; a transcript that addresses or imitates the
  system gets the flag even if perception missed it
- a summary that vouches for the visitor, tells the resident to open up, or uses technical jargon is
  replaced with a reviewed plain-language phrase (same for jargon in the escalation reason)
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
# Flags the policy agent may add: ones it can judge from context (bookings, time). What the visitor
# actually said (entry, codes, payment, injection) is perception's call; the agent never heard them.
AGENT_FLAGS: set[RiskFlag] = {"unverified_authority_claim", "tailgating_attempt"}
SAFE_FALLBACK_INTENTS = ["ask_id", "call_family", "ask_to_wait", "decline"]
REPLACEMENT_INTENTS = ["ask_to_wait", "ask_id", "call_family", "decline"]


class PolicyDecision(BaseModel):
    """What the policy agent may contribute. Applied with max/union semantics only."""

    risk_level: Level = Field(description="Your risk assessment. Lower values than the card's are ignored.")
    add_flags: list[RiskFlag] = Field(
        default_factory=list,
        description="Only unverified_authority_claim or tailgating_attempt, when context shows it. Others are ignored.",
    )
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


# ---------------------------------------------------------------- injection detector
# A backstop for perception, not a replacement: phrases aimed at the machine rather than the person
# at home. Found by the evals: a fake JSON card and a closing delimiter slipped past the model.

_INJECTION = [
    r"\bignore (?:all |any |the |your |my |these |those )?(?:previous |prior |above |earlier |other |old )?"
    r"(?:instructions?|rules|prompts?|directions|orders|programming)\b",
    r"\bignore (?:everything|all of (?:that|this)|all that)\b",
    r"\b(?:disregard|forget|override) (?:all |any |the |your |my |previous |prior |above |earlier )*"
    r"(?:instructions?|rules|prompts?|programming)\b",
    r"\bsystem (?:override|prompt|message|instructions?)\b",
    r"\b(?:developer|admin|administrator|maintenance|debug) (?:message|mode|override|instructions?)\b",
    r"\b(?:note|message|instructions?) (?:to|for) (?:the )?(?:assistant|ai|a\.i\.|system|model|bot|chatbot)\b",
    r"(?:^|[.!?]\s*)(?:hey |ok |okay |dear )?(?:assistant|threshold|chatbot)\s*[,:]",
    r"\b(?:visitor_type|risk_level|risk_flags|suggested_replies|matched_expected_visit)\b",  # our card's field names
    r"[<‹]\s*/?\s*(?:visitor_transcript|system|instructions?|assistant)\b",  # our delimiter or chat tags
    r"<\|[a-z_]+\|>",
    r"\b(?:instructions?|sab kuch|sab)\s+(?:bhool|bhul)\w*",
    r"\bignore kar",
    r"(?=.*निर्देश)(?=.*(?:भूल|अनदेखा|नज़रअंदाज़|नजरअंदाज))",
]
_INJECTION_RE = [re.compile(p, re.IGNORECASE) for p in _INJECTION]


def looks_like_injection(transcript: str) -> bool:
    """True if the transcript addresses Threshold/an AI or imitates its instructions or output."""
    text = transcript or ""
    return any(p.search(text) for p in _INJECTION_RE)


# ---------------------------------------------------------------- resident-facing text
# The summary and escalation reason are read by the resident (and sent to contacts): plain words,
# and never the visitor's voice. A summary that tells the resident to open up, or vouches for the
# visitor, means the transcript steered the model; it is replaced with a reviewed phrase.

_JARGON = re.compile(
    r"\b(?:prompt[ -]?injection|injection|jailbreak|system prompt|llm|large language model|language model)\b",
    re.IGNORECASE,
)
_ASSURANCE = re.compile(
    r"\b(?:is|are|seems?|looks?) (?:safe|trusted|verified|approved|genuine|legitimate|harmless)\b"
    r"|\b(?:safe|okay|ok|fine) to (?:open|let)\b|सुरक्षित है",
    re.IGNORECASE,
)
# Reported speech ("wants to come inside") describes the visitor; it is not an instruction.
_REPORTED = re.compile(
    r"\b(?:asks?|asked|asking|wants?|wanted|needs?|needed|request\w*|claim\w*|says?|said|tells?|told|"
    r"tri(?:es|ed)|trying|attempt\w*|demand\w*|pressur\w*|insist\w*|urg(?:es|ed|ing))\b|कह|माँग|मांग|चाह",
    re.IGNORECASE,
)


def plain_reason(reason: str, resident_language: str) -> str:
    """Escalation reasons reach the resident and their contacts: no technical jargon."""
    return phrases.table(resident_language)["injection_reason"] if _JARGON.search(reason or "") else reason


def summary_is_compromised(summary: str) -> bool:
    for sentence in _SENTENCE.split(summary or ""):
        if _ASSURANCE.search(sentence):
            return True
        if grants_entry(sentence) and not _REPORTED.search(sentence):
            return True
    return False


# ---------------------------------------------------------------- apply


def apply(
    card: VisitorCard, decision: PolicyDecision | None, resident_language: str
) -> tuple[VisitorCard, list[str]]:
    notes: list[str] = []
    visitor_language = None if card.detected_language == "und" else card.detected_language
    risk = card.risk_level
    flags = list(dict.fromkeys(card.risk_flags))
    escalation = Escalation(required=card.escalation.required, reason=card.escalation.reason)
    summary = card.summary
    text = phrases.table(resident_language)

    visitor_type = card.visitor_type
    if "prompt_injection_attempt" not in flags and looks_like_injection(card.transcript):
        flags.append("prompt_injection_attempt")
        notes.append("Guardrail: the transcript addresses or imitates the system -> prompt_injection_attempt")
    if "prompt_injection_attempt" in flags and visitor_type in ("no_speech", "known_contact"):
        # Seen in the evals: fake closing tags made the model treat the transcript as empty, and a fake
        # JSON card kept its "known contact" label. Someone trying to steer Threshold is neither.
        notes.append(f"Guardrail: an injection attempt cannot be {visitor_type} -> unknown")
        visitor_type = "unknown"
    if summary_is_compromised(summary) or _JARGON.search(summary):
        summary = text["injection_summary"]
        if "prompt_injection_attempt" not in flags:
            flags.append("prompt_injection_attempt")
        notes.append("Guardrail: replaced a summary that was not plain, neutral language")

    if decision is not None:
        if LEVELS.index(decision.risk_level) > LEVELS.index(risk):
            why = f": {decision.reason}" if decision.reason else ""
            notes.append(f"Policy agent raised risk {risk} -> {decision.risk_level}{why}")
        risk = max_level(risk, decision.risk_level)
        ignored = sorted(set(decision.add_flags) - AGENT_FLAGS - set(flags))
        if ignored:
            notes.append(f"Ignored agent flags it cannot judge from context: {ignored}")
        flags += [f for f in decision.add_flags if f in AGENT_FLAGS and f not in flags]
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
    escalation.reason = plain_reason(escalation.reason, resident_language)

    urgency = card.urgency
    replies = list(card.suggested_replies)

    # An unsafe reply becomes the reviewed safe phrase for the same intent
    # (e.g. "come in and put it on the table" -> "Please leave the parcel outside the door").
    # The parcel phrase only fits deliveries: for anyone else (s4: the model labelled "come in, the AC
    # is in the bedroom" accept_delivery), use a safe intent the card does not already offer.
    for i, r in enumerate(replies):
        if is_unsafe_reply(r):
            intent = r.intent
            if intent == "accept_delivery" and visitor_type != "delivery":
                taken = {o.intent for o in replies if o is not r}
                intent = next((x for x in REPLACEMENT_INTENTS if x not in taken), "ask_to_wait")
            replies[i] = phrases.reply(intent, resident_language, visitor_language)
            notes.append(f"Guardrail: replaced a reply that implied entry or code sharing ({r.intent} -> {intent})")

    if visitor_type == "emergency":
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
        "visitor_type": visitor_type,
        "risk_level": risk,
        "risk_flags": flags,
        "summary": summary,
        "escalation": escalation,
        "urgency": urgency,
        "suggested_replies": replies,
    })
    return VisitorCard.model_validate(updated.model_dump()), notes
