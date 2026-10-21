import { RiskFlag, VisitorType, Level } from "./types";

export const RISK_FLAG_MESSAGES: Record<RiskFlag, string> = {
  pretext_entry_request: "Asked to come inside.",
  unverified_authority_claim: "Says they are from an organization, but no visit is booked.",
  urgency_pressure: "Pressing you to act fast.",
  asks_for_codes_or_otp: "Asked for a code or OTP.",
  payment_request: "Asked for money.",
  tailgating_attempt: "Attempting to follow someone inside.",
  prompt_injection_attempt: "Tried to give the system instructions. Ignored.",
};

export function getRiskFlagSentence(flag: RiskFlag): string {
  return RISK_FLAG_MESSAGES[flag] || flag;
}

export const VISITOR_TYPE_LABELS: Record<VisitorType, string> = {
  delivery: "Courier",
  service: "Service technician",
  known_contact: "Known contact",
  solicitor: "Sales / Solicitor",
  unknown: "Unknown visitor",
  emergency: "Emergency report",
  no_speech: "No speech heard",
};

export function getVisitorTypeLabel(type: VisitorType): string {
  return VISITOR_TYPE_LABELS[type] || "Visitor";
}

export function getRiskBandCopy(riskLevel: Level, visitorType: VisitorType, summary?: string): string {
  if (visitorType === "emergency") {
    return summary || "Emergency reported at the door. Check safely and call for help.";
  }
  if (riskLevel === "high") {
    return summary || "Do not open the door. High risk detected.";
  }
  if (riskLevel === "medium") {
    return summary || "Be careful. They are not on your expected visits.";
  }
  return "Nothing unusual.";
}

export const HONESTY_NOTE = "Translated automatically. Check anything important.";
export const DOOR_LOCKED_TEXT = "Door locked";
export const IDLE_VISITOR_SCREEN_TEXT: Record<string, string> = {
  "hi-IN": "निवासी इस स्क्रीन पर जवाब देंगे।",
  "hi": "निवासी इस स्क्रीन पर जवाब देंगे।",
  "es-ES": "El residente responderá en esta pantalla.",
  "es": "El residente responderá en esta pantalla.",
  "fr-FR": "Le résident répondra sur cet écran.",
  "fr": "Le résident répondra sur cet écran.",
  "en": "The resident will reply on this screen.",
  "default": "The resident will reply on this screen.",
};

export function getIdleVisitorText(lang?: string | null): string {
  if (!lang) return IDLE_VISITOR_SCREEN_TEXT.default;
  const prefix = lang.split("-")[0];
  return IDLE_VISITOR_SCREEN_TEXT[lang] || IDLE_VISITOR_SCREEN_TEXT[prefix] || IDLE_VISITOR_SCREEN_TEXT.default;
}
