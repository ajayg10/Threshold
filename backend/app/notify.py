"""Escalation to a trusted contact: SNS when ESCALATION_TOPIC_ARN is set, otherwise a simulated notifier.

The simulated notifier sends nothing. It logs and records the escalation, and the UI says "simulated".
Messages carry the card summary and risk only: never the transcript, audio, or device IDs.
"""

import logging
import uuid
from functools import lru_cache

from .config import get_settings
from .models import EscalationRecord, EventRecord, ResidentSettings, TrustedContact

log = logging.getLogger(__name__)

SUBJECT = "Threshold: someone at the door needs attention"


@lru_cache
def _sns():
    import boto3

    return boto3.client("sns", region_name=get_settings().aws_region)


def find_contact(resident: ResidentSettings, contact_id: str | None) -> TrustedContact | None:
    if contact_id is None:
        return resident.trusted_contacts[0] if resident.trusted_contacts else None
    return next((c for c in resident.trusted_contacts if c.id == contact_id), None)


def compose(record: EventRecord, resident: ResidentSettings, contact: TrustedContact, reason: str) -> str:
    card = record.card
    lines = [f"Hi {contact.name}, Threshold alert for {resident.resident_name}."]
    if card is not None:
        lines.append(f"Visitor: {card.summary}")
        lines.append(f"Risk: {card.risk_level}.")
    if reason:
        lines.append(f"Why: {reason}")
    lines.append("Threshold never opens the door. Please check on them.")
    return "\n".join(lines)


def escalate(
    record: EventRecord, resident: ResidentSettings, contact: TrustedContact, by: str, reason: str
) -> EscalationRecord:
    message = compose(record, resident, contact, reason)
    topic = get_settings().escalation_topic_arn
    if topic:
        resp = _sns().publish(
            TopicArn=topic,
            Subject=SUBJECT,
            Message=message,
            MessageAttributes={"contact_id": {"DataType": "String", "StringValue": contact.id}},
        )
        channel, message_id = "sns", resp["MessageId"]
    else:
        channel, message_id = "simulated", f"sim-{uuid.uuid4().hex[:12]}"
        log.info("SIMULATED escalation to %s: %s", contact.name, message.replace("\n", " | "))
    esc = EscalationRecord(
        by=by, contact_id=contact.id, contact_name=contact.name, channel=channel, message_id=message_id, reason=reason
    )
    record.escalations.append(esc)
    return esc
