import { RouteMap } from "./RouteMap";
import type { MapWaypoint } from "../types";

type Props = {
  routeWaypoints: MapWaypoint[];
  hotelPins: MapWaypoint[];
  onFullscreen: () => void;
  hasData: boolean;
};

export function InteractiveRouteSection({
  routeWaypoints,
  hotelPins,
  onFullscreen,
  hasData,
}: Props) {
  return (
    <section className="space-y-5 pt-10">
      <div>
        <h2 className="font-headline text-3xl font-bold text-ink">
          Interactive route
        </h2>
        <p className="mt-1 text-sm text-muted">
          Itinerary path and hotel pins (SerpAPI + Google Maps).
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-surface-high/40 shadow-inner">
        {!hasData ? (
          <div className="flex aspect-[21/9] min-h-[220px] items-center justify-center p-8 text-center text-sm text-muted">
            Generate this trip again with SerpAPI enabled to see the route here.
          </div>
        ) : (
          <div className="p-3 sm:p-4">
            <RouteMap
              routeWaypoints={routeWaypoints}
              hotelPins={hotelPins}
              height={320}
            />
          </div>
        )}
        {hasData && (
          <button
            type="button"
            onClick={onFullscreen}
            className="m-4 w-[calc(100%-2rem)] rounded-full border border-slate-200 bg-white/90 py-3 text-sm font-bold text-primary shadow-sm backdrop-blur hover:bg-primary hover:text-white sm:absolute sm:bottom-4 sm:right-4 sm:m-0 sm:w-auto sm:px-6"
          >
            Fullscreen map
          </button>
        )}
      </div>
    </section>
  );
}
