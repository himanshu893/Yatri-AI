/**
 * Extract clock-based schedule lines like **9:00 AM:** Visit… or - **10:00 AM:** …
 * for horizontal “Trip highlights” cards, optionally grouped per day.
 */

import {
  segmentItineraryByDay,
  stripItineraryLineForDisplay,
} from "./parseItinerary";

export type ScheduleSlot = {
  time: string;
  title: string;
  detail: string;
};

export type DayScheduleSlots = {
  dayTitle: string;
  slots: ScheduleSlot[];
};

function deriveTitle(detail: string): string {
  const text = stripItineraryLineForDisplay(detail);
  if (!text) return "Activity";
  const firstSeg = text.split(/\.(?:\s+|$)/)[0] ?? text;
  const words = firstSeg.split(/\s+/).filter(Boolean);
  if (words.length <= 7)
    return firstSeg.length > 52 ? `${firstSeg.slice(0, 49)}…` : firstSeg;
  return `${words.slice(0, 6).join(" ")}…`;
}

const WITH_BOLD_TIME =
  /^\s*[-*•]?\s*\*\*(\d{1,2}:\d{2}\s*(?:AM|PM))\*\*:?\s*(.+)$/i;
const PLAIN_TIME =
  /^\s*[-*•]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*:\s*(.+)$/i;

function pushSlotFromLine(line: string, slots: ScheduleSlot[]) {
  let m = line.match(WITH_BOLD_TIME);
  if (!m) m = line.match(PLAIN_TIME);
  if (!m) return;
  const time = m[1].replace(/\s+/g, " ").trim();
  const detail = stripItineraryLineForDisplay(m[2]);
  if (!detail) return;
  slots.push({
    time,
    title: deriveTitle(detail),
    detail,
  });
}

/**
 * Parse lines (single day chunk or whole file) for time-prefixed activities.
 */
export function parseScheduleSlotsFromLines(lines: string[]): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];
  for (const line of lines) {
    pushSlotFromLine(line, slots);
  }
  return slots;
}

/**
 * Parse full markdown for time-prefixed activities (flat list).
 */
export function parseScheduleSlots(md: string): ScheduleSlot[] {
  return parseScheduleSlotsFromLines(md.split(/\r?\n/));
}

/**
 * Same as {@link parseScheduleSlots} but scoped to each day section so cards
 * are not merged across Day 1 / Day 2.
 */
export function parseScheduleSlotsByDay(md: string): DayScheduleSlots[] {
  return segmentItineraryByDay(md).map(({ title, lines }) => ({
    dayTitle: title,
    slots: parseScheduleSlotsFromLines(lines),
  }));
}
