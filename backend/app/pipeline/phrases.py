"""Fixed, reviewed reply phrases used by deterministic cards and guardrail replacements.

Hindi phrasing avoids gendered first-person verb forms because the resident's gender is unknown.
"""

from ..models import ReplyIntent, SuggestedReply

TEXT: dict[str, dict[str, str]] = {
    "en": {
        "safe_summary": "Someone is at the door. Threshold could not analyse what they said.",
        "no_speech_summary": "Someone is at the door but has not said anything.",
        "who": "Who is it?",
        "repeat": "Please say that again.",
        "wait": "Please wait one minute.",
        "id": "Please show your ID through the window.",
        "family": "A family member is being called.",
        "decline": "Sorry, not today. Please leave.",
        "parcel": "Please leave the parcel outside the door.",
        "emergency": "Emergency services are being called now.",
    },
    "hi": {
        "safe_summary": "दरवाज़े पर कोई है। Threshold उनकी बात समझ नहीं पाया।",
        "no_speech_summary": "दरवाज़े पर कोई है, पर उन्होंने कुछ नहीं कहा।",
        "who": "कौन है?",
        "repeat": "कृपया फिर से बोलिए।",
        "wait": "कृपया एक मिनट रुकिए।",
        "id": "कृपया खिड़की से अपना पहचान पत्र दिखाइए।",
        "family": "परिवार के किसी सदस्य को बुलाया जा रहा है।",
        "decline": "माफ़ कीजिए, आज नहीं। कृपया जाइए।",
        "parcel": "कृपया पार्सल दरवाज़े के बाहर रख दीजिए।",
        "emergency": "आपातकालीन सेवाओं को अभी फ़ोन किया जा रहा है।",
    },
}

# Safe replacement for each intent (phrase key).
INTENT_PHRASE: dict[ReplyIntent, str] = {
    "ask_id": "id",
    "ask_to_wait": "wait",
    "ask_to_repeat": "repeat",
    "call_family": "family",
    "decline": "decline",
    "accept_delivery": "parcel",
    "emergency_help": "emergency",
}


def table(language: str | None) -> dict[str, str]:
    return TEXT["hi"] if (language or "").lower().startswith("hi") else TEXT["en"]


def reply(
    intent: ReplyIntent, resident_language: str, visitor_language: str | None, reply_id: str = "r", key: str | None = None
) -> SuggestedReply:
    key = key or INTENT_PHRASE[intent]
    return SuggestedReply(
        id=reply_id,
        resident_text=table(resident_language)[key],
        visitor_text=table(visitor_language)[key],
        intent=intent,
    )


def replies(resident_language: str, visitor_language: str | None, intents: list[ReplyIntent]) -> list[SuggestedReply]:
    return [reply(i, resident_language, visitor_language, f"r{n}") for n, i in enumerate(intents, 1)]
