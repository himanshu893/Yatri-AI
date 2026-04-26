import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { RouteMap } from "./RouteMap";
import type { MapWaypoint } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  routeWaypoints: MapWaypoint[];
  hotelPins: MapWaypoint[];
  title?: string;
};

export function MapModal({
  open,
  onClose,
  routeWaypoints,
  hotelPins,
  title = "Route & stays",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="yatri-map-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Map"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-surface-lowest shadow-2xl sm:rounded-3xl"
            initial={{ y: 40, opacity: 0.9 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200/60 px-5 py-4">
              <div>
                <h2 className="font-headline text-lg font-bold text-ink">
                  {title}
                </h2>
                <p className="text-xs text-muted">
                  Blue path: itinerary stops (SerpAPI). Red pins: hotels.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-low text-muted transition-colors hover:bg-slate-200 hover:text-ink"
                aria-label="Close map"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="min-h-[50vh] flex-1 p-4 sm:min-h-[420px] sm:p-5">
              <RouteMap
                routeWaypoints={routeWaypoints}
                hotelPins={hotelPins}
                height={typeof window !== "undefined" && window.innerWidth < 640 ? 360 : 480}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
