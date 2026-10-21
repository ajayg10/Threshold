import { HONESTY_NOTE } from "@/lib/copy";

interface SeamBlockProps {
  transcript: string;
  translation: string;
  detectedLanguage?: string;
  residentLanguage?: string;
  className?: string;
}

export default function SeamBlock({
  transcript,
  translation,
  detectedLanguage = "en",
  residentLanguage = "en",
  className = "",
}: SeamBlockProps) {
  const isHindi = detectedLanguage.toLowerCase().startsWith("hi");
  const langCode = detectedLanguage.split("-")[0] || "en";
  const residentLangCode = residentLanguage.split("-")[0] || "en";

  return (
    <div className={`overflow-hidden rounded-[16px] border border-[var(--frame)]/40 bg-[var(--surface)] ${className}`}>
      {/* Responsive layout: Single column on phone, 2-column on tablet/desktop (>= 820px) */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        {/* OUTSIDE CHAMBER (Visitor speech in detected language) */}
        <section
          aria-label="What the visitor said outside"
          className="p-5 md:p-6"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider uppercase text-[var(--frame-text)]">
              Outside ({detectedLanguage})
            </span>
          </div>

          <p
            lang={langCode}
            className={`text-xl md:text-2xl font-medium leading-relaxed text-[var(--dusk)] ${
              isHindi ? "font-hindi" : "font-sans"
            }`}
          >
            {transcript ? (
              transcript
            ) : (
              <span className="italic text-[var(--frame-text)]">No speech detected at the threshold.</span>
            )}
          </p>
        </section>

        {/* THE SEAM: Horizontal divider on mobile, vertical divider on desktop */}
        <div className="relative flex items-center justify-center">
          {/* Mobile horizontal seam */}
          <div className="block md:hidden w-full">
            <div className="seam-horizontal" />
          </div>

          {/* Desktop vertical seam */}
          <div className="hidden md:block h-full">
            <div className="seam-vertical" />
          </div>
        </div>

        {/* INSIDE CHAMBER (Translation in resident language) */}
        <section
          aria-label="Translation for resident inside"
          className="p-5 md:p-6 bg-[var(--frost)]/50 md:bg-transparent"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider uppercase text-[var(--frame-text)]">
              Inside ({residentLanguage})
            </span>
          </div>

          <p
            lang={residentLangCode}
            className="text-xl md:text-2xl font-medium leading-relaxed text-[var(--dusk)]"
          >
            {translation ? (
              `“${translation}”`
            ) : (
              <span className="italic text-[var(--frame-text)]">Awaiting speech to translate.</span>
            )}
          </p>
        </section>
      </div>

      {/* Honesty note at footer of the seam block */}
      <div className="border-t border-[var(--frame)]/25 px-5 py-2.5 text-xs text-[var(--frame-text)]">
        {HONESTY_NOTE}
      </div>
    </div>
  );
}
