import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import type { ItineraryDay } from "../lib/parseItinerary";

const DAY_ICONS = [
  "flight_land",
  "explore",
  "hiking",
  "restaurant",
  "landscape",
  "celebration",
] as const;

const DAY_BANNERS = [
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80",
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=80",
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1200&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200&q=80",
  "https://images.unsplash.com/photo-1526772662000-3f88f10405ff?w=1200&q=80",
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 380, damping: 28 },
  },
};

type Props = {
  days: ItineraryDay[];
};

function TimelineLine({ text }: { text: string }) {
  const m = text.match(
    /^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?::|–|-)?\s*(.*)$/i,
  );
  if (m) {
    const rest = (m[2] ?? "").trim().replace(/^:\s*/, "");
    return (
      <>
        <strong className="text-primary">{m[1]}</strong>
        {rest ? <span>: {rest}</span> : null}
      </>
    );
  }
  return <>{text}</>;
}

export function ItineraryTimeline({ days }: Props) {
  if (days.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-surface-low/50 p-8 text-center text-muted">
        No structured days detected in this itinerary.
      </p>
    );
  }

  return (
    <motion.div
      className="relative space-y-10 pl-2 md:pl-4"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <div
        className="absolute left-[19px] top-3 bottom-3 hidden w-px bg-slate-200/60 md:block"
        aria-hidden
      />

      {days.map((day, di) => (
        <motion.article
          key={`${day.title}-${di}`}
          variants={item}
          className="relative md:pl-16"
        >
          <div className="absolute left-0 top-0 z-10 hidden h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-white shadow-md md:flex">
            <span className="material-symbols-outlined text-2xl text-primary">
              {DAY_ICONS[di % DAY_ICONS.length]}
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/50 bg-surface-lowest shadow-lift">
            <div className="relative h-40 w-full overflow-hidden md:h-48">
              <img
                src={DAY_BANNERS[di % DAY_BANNERS.length]}
                alt=""
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 px-6 pb-4 pt-10">
                <h3 className="font-headline text-xl font-bold text-white drop-shadow md:text-2xl">
                  {day.title}
                </h3>
              </div>
            </div>

            <div className="space-y-6 p-6">
              {day.blocks.length > 0 ? (
                day.blocks.map((b, bi) => (
                  <motion.div
                    key={`${b.label}-${bi}`}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: bi * 0.04 }}
                    className="rounded-xl bg-surface-low/80 p-5 ring-1 ring-slate-200/40"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      <h4 className="text-xs font-bold uppercase tracking-widest text-primary">
                        {b.label}
                      </h4>
                    </div>
                    <ul className="space-y-2.5">
                      {b.lines.map((ln, li) => (
                        <li
                          key={li}
                          className="flex gap-3 text-sm leading-relaxed text-ink"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary/80" />
                          <span>
                            <TimelineLine text={ln} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))
              ) : (
                <div className="rounded-xl bg-surface-low/80 p-5 text-sm text-muted">
                  <ReactMarkdown>{day.title}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </motion.article>
      ))}
    </motion.div>
  );
}
