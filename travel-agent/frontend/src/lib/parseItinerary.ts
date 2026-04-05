/**
 * Turn markdown-style itinerary text into day / time-block structure for UI.
 * Tolerant of ## Day N, **Day N: Title**, and **Morning:** blocks.
 */

export type ItineraryTimeBlock = {
  label: string;
  lines: string[];
};

export type ItineraryDay = {
  title: string;
  blocks: ItineraryTimeBlock[];
};

/** Raw lines grouped under each day heading (for per-day schedule cards). */
export type ItineraryDaySegment = {
  title: string;
  lines: string[];
};

/**
 * Remove list markers, asterisks, and **bold** markdown for plain UI text.
 */
export function stripItineraryLineForDisplay(s: string): string {
  let t = s.trim();
  t = t.replace(/^\s*[-*•]\s+/, "");
  t = t.replace(/^\s*\d+[\.)]\s+/, "");
  let prev = "";
  while (prev !== t) {
    prev = t;
    t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  }
  t = t.replace(/\*\*/g, "");
  t = t.replace(/^\*+\s*/, "");
  t = t.replace(/\s+\*+$/g, "");
  return t.trim();
}

function cleanDayHeadingText(raw: string): string {
  let t = raw.trim().replace(/^#{1,3}\s+/, "");
  t = t.replace(/^\*\*\s*|\s*\*\*$/g, "").trim();
  return stripItineraryLineForDisplay(t) || t.trim();
}

/** Section labels like * **HIGHLIGHTS** — not real itinerary rows. */
function isSkippableMetaLine(trimmed: string): boolean {
  const inner = stripItineraryLineForDisplay(trimmed);
  return /^(highlights|overview|details|itinerary\s*overview)$/i.test(inner);
}

export function parseItineraryMarkdown(md: string): ItineraryDay[] {
  const raw = (md || "").trim();
  if (!raw) {
    return [];
  }

  const lines = raw.split(/\r?\n/);
  const days: ItineraryDay[] = [];
  let day: ItineraryDay | null = null;
  let block: ItineraryTimeBlock | null = null;

  const isDayHeadingHash = (line: string) => {
    const m = line.match(/^#{1,3}\s+(.+)$/);
    return m && /day\s*\d/i.test(m[1]);
  };

  const isDayHeadingBold = (line: string) => {
    const t = line.trim();
    return /^\*\*\s*Day\s*\d/i.test(t) && /\*\*\s*$/.test(t);
  };

  const isPeriodLine = (line: string) => {
    const t = line.trim();
    let m = t.match(/^\*\*(Morning|Afternoon|Evening|Night):\*\*\s*$/i);
    if (m) return m[1];
    m = t.match(
      /^\*\*\s*(Morning|Afternoon|Evening|Night)\s*:?\s*\*\*\s*:?\s*$/i,
    );
    if (m) return m[1];
    m = t.match(/^(Morning|Afternoon|Evening|Night)\s*:\s*$/i);
    return m ? m[1] : null;
  };

  const isBullet = (line: string) => {
    const t = line.trim();
    return (
      /^[-*•]\s/.test(t) ||
      /^\d+[\.)]\s/.test(t) ||
      /^\d{1,2}:\d{2}\s*(AM|PM)?/i.test(t)
    );
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isDayHeadingHash(line)) {
      const m = line.match(/^#{1,3}\s+(.+)$/);
      day = { title: cleanDayHeadingText(m?.[1] || "Day"), blocks: [] };
      days.push(day);
      block = null;
      continue;
    }

    if (isDayHeadingBold(line)) {
      const inner = line.replace(/^\*\*|\*\*$/g, "").trim();
      day = { title: cleanDayHeadingText(inner), blocks: [] };
      days.push(day);
      block = null;
      continue;
    }

    const period = isPeriodLine(line);
    if (period && day) {
      block = { label: period.charAt(0).toUpperCase() + period.slice(1).toLowerCase(), lines: [] };
      day.blocks.push(block);
      continue;
    }

    if (isSkippableMetaLine(trimmed)) {
      continue;
    }

    if (isBullet(line) || (trimmed.length > 0 && day && !trimmed.startsWith("#"))) {
      if (!day) {
        day = { title: "Your itinerary", blocks: [] };
        days.push(day);
      }
      if (!block) {
        block = { label: "Highlights", lines: [] };
        day.blocks.push(block);
      }
      const cleaned = stripItineraryLineForDisplay(trimmed);
      if (cleaned) {
        block.lines.push(cleaned);
      }
    }
  }

  if (days.length === 0) {
    const all = lines
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !isSkippableMetaLine(l))
      .map((l) => stripItineraryLineForDisplay(l))
      .filter(Boolean);
    if (all.length) {
      return [
        {
          title: "Itinerary",
          blocks: [{ label: "Details", lines: all }],
        },
      ];
    }
  }

  return days;
}

/**
 * Split markdown into per-day line lists (same day rules as {@link parseItineraryMarkdown}).
 * Used to build time-slot cards per day without mixing days in one rail.
 */
export function segmentItineraryByDay(md: string): ItineraryDaySegment[] {
  const raw = (md || "").trim();
  if (!raw) {
    return [];
  }

  const lines = raw.split(/\r?\n/);
  const segments: ItineraryDaySegment[] = [];
  let current: ItineraryDaySegment | null = null;

  const isDayHeadingHash = (line: string) => {
    const m = line.match(/^#{1,3}\s+(.+)$/);
    return m && /day\s*\d/i.test(m[1]);
  };

  const isDayHeadingBold = (line: string) => {
    const t = line.trim();
    return /^\*\*\s*Day\s*\d/i.test(t) && /\*\*\s*$/.test(t);
  };

  const isPeriodLine = (line: string) => {
    const t = line.trim();
    let m = t.match(/^\*\*(Morning|Afternoon|Evening|Night):\*\*\s*$/i);
    if (m) return m[1];
    m = t.match(
      /^\*\*\s*(Morning|Afternoon|Evening|Night)\s*:?\s*\*\*\s*:?\s*$/i,
    );
    if (m) return m[1];
    m = t.match(/^(Morning|Afternoon|Evening|Night)\s*:\s*$/i);
    return m ? m[1] : null;
  };

  const isBullet = (line: string) => {
    const t = line.trim();
    return (
      /^[-*•]\s/.test(t) ||
      /^\d+[\.)]\s/.test(t) ||
      /^\d{1,2}:\d{2}\s*(AM|PM)?/i.test(t)
    );
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isDayHeadingHash(line)) {
      const m = line.match(/^#{1,3}\s+(.+)$/);
      if (current) {
        segments.push(current);
      }
      current = { title: cleanDayHeadingText(m?.[1] || "Day"), lines: [] };
      continue;
    }

    if (isDayHeadingBold(line)) {
      const inner = line.replace(/^\*\*|\*\*$/g, "").trim();
      if (current) {
        segments.push(current);
      }
      current = { title: cleanDayHeadingText(inner), lines: [] };
      continue;
    }

    if (isPeriodLine(line)) {
      if (!current) {
        current = { title: "Your itinerary", lines: [] };
      }
      continue;
    }

    if (isSkippableMetaLine(trimmed)) {
      continue;
    }

    if (isBullet(line) || (trimmed.length > 0 && current && !trimmed.startsWith("#"))) {
      if (!current) {
        current = { title: "Your itinerary", lines: [] };
      }
      current.lines.push(trimmed);
      continue;
    }

    if (trimmed.length > 0 && !trimmed.startsWith("#") && current) {
      current.lines.push(trimmed);
    }
  }

  if (current) {
    segments.push(current);
  }

  if (segments.length === 0) {
    const all = lines
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !isSkippableMetaLine(l));
    if (all.length) {
      return [{ title: "Itinerary", lines: all }];
    }
  }

  return segments;
}
