import { useRef } from "react";
import { motion } from "framer-motion";
import type { DayScheduleSlots } from "../lib/parseScheduleSlots";

type Props = {
  /** Per-day timed activities; each day gets its own horizontal rail. */
  days: DayScheduleSlots[];
};

function DayRail({
  dayTitle,
  slots,
}: {
  dayTitle: string;
  slots: DayScheduleSlots["slots"];
}) {
  const scroller = useRef<HTMLDivElement>(null);

  function scroll(dir: -1 | 1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * 300, behavior: "smooth" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-headline text-2xl font-bold text-ink">{dayTitle}</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => scroll(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-surface-lowest text-ink transition-colors hover:bg-surface-low"
            aria-label="Scroll left"
          >
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-surface-lowest text-ink transition-colors hover:bg-surface-low"
            aria-label="Scroll right"
          >
            <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>
      </div>

      <div
        ref={scroller}
        className="scrollbar-hide -mx-2 flex gap-5 overflow-x-auto px-2 pb-2"
      >
        {slots.map((s, i) => (
          <motion.div
            key={`${s.time}-${i}`}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 28 }}
            className="flex-none w-[min(100vw-2.5rem,18rem)] space-y-4 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-shadow hover:shadow-md"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              {s.time}
            </div>
            <div className="space-y-1">
              <h4 className="line-clamp-2 text-lg font-bold leading-snug text-ink">
                {s.title}
              </h4>
              <p className="line-clamp-4 text-sm leading-relaxed text-muted">
                {s.detail}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function ItineraryHighlightsRail({ days }: Props) {
  const withSlots = days.filter((d) => d.slots.length > 0);
  if (withSlots.length === 0) return null;

  return (
    <div className="space-y-14">
      {withSlots.map((d, di) => (
        <DayRail key={`${d.dayTitle}-${di}`} dayTitle={d.dayTitle} slots={d.slots} />
      ))}
    </div>
  );
}
