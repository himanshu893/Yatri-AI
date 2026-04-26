import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { HotelShowcaseGrid } from "../components/HotelShowcaseGrid";
import { ItineraryTimeline } from "../components/ItineraryTimeline";
import { MapModal } from "../components/MapModal";
import { RouteMap } from "../components/RouteMap";
import { TransportOptionsPanel } from "../components/TransportOptionsPanel";
import { TopNav } from "../layout/TopNav";
import { SiteFooter } from "../layout/SiteFooter";
import { getTrip } from "../lib/tripsStorage";
import { parseItineraryMarkdown } from "../lib/parseItinerary";

const TABS = [
  "Overview",
  "Itinerary",
  "Travel",
  "Hotels",
  "Places",
  "Map",
] as const;

type Tab = (typeof TABS)[number];

const HERO_SIDE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCeV7UYyw9DMO-SdnMctW6sOD7eBbDr9Smt7G-by8wfbpvXrUvkJ7k7YTy78oE93Quhvz_0p3057L3oByxEESJjzI5qndOfv-2tJ1W4Qjr4zd1_Ggj4SvA320W_etT-1Mas0ByXxNzkLKbAEIsCk5gn9ZmbLENf7MalXyPL9OhTDRk4m9Umak69xaUhlrf0MLhVDDLMOjEQQkHxSRfnJXus8ntwdtmrHEFTAV59JhBRwd3SOiLqrcFVPWrnDvAh9GI71ilGCqhB7zjw";

export function TripResultPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const trip = tripId ? getTrip(tripId) : null;
  const [tab, setTab] = useState<Tab>("Itinerary");
  const [mapOpen, setMapOpen] = useState(false);
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);

  const data = trip?.response;

  const title = useMemo(() => {
    if (!data) return "";
    return data.destination_label || data.destination || "Your curated trip";
  }, [data]);

  const parsedDays = useMemo(
    () => parseItineraryMarkdown(data?.itinerary ?? ""),
    [data?.itinerary],
  );

  const routePins = data?.map_waypoints ?? [];
  const hotelPins = data?.hotel_map_pins ?? [];
  const itineraryPlaceQueries = data?.itinerary_place_queries ?? [];

  if (!trip || !data) {
    return <Navigate to="/trips" replace />;
  }

  const hasMapData = routePins.length > 0 || hotelPins.length > 0;

  return (
    <div className="min-h-screen bg-surface font-body text-ink">
      <TopNav />

      <MapModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        routeWaypoints={routePins}
        hotelPins={hotelPins}
        title={title}
      />

      <main className="mx-auto max-w-7xl space-y-12 px-6 py-8">
        <section className="grid grid-cols-1 items-center gap-8 pt-4 md:grid-cols-12">
          <div className="space-y-6 md:col-span-7">
              <div className="flex items-center gap-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                  <span className="material-symbols-outlined text-sm">auto_awesome</span>
                  AI-curated trip
                </div>
                <button
                  onClick={() => setShowRawMarkdown(!showRawMarkdown)}
                  className="text-xs font-semibold text-muted hover:text-primary"
                >
                  {showRawMarkdown ? "Show Styled" : "Show Raw AI Output"}
                </button>
              </div>
            <h1 className="font-headline text-4xl font-extrabold leading-tight tracking-tight text-ink md:text-5xl">
              {title}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted">
              {data.travel_month ? `${data.travel_month} · ` : ""}₹
              {data.budget?.toLocaleString("en-IN")}
              {data.nights != null && ` · ${data.nights} nights`}
              {data.num_people != null && ` · ${data.num_people} travellers`}
              {data.origin && ` · from ${data.origin}`}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setMapOpen(true)}
                disabled={!hasMapData}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-6 py-3 font-headline text-sm font-bold text-white shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-lg">route</span>
                View route on map
              </button>
              <Link
                to="/plan"
                className="rounded-full border border-slate-200 px-6 py-3 font-headline text-sm font-bold text-ink"
              >
                New plan
              </Link>
              <Link
                to="/trips"
                className="rounded-full border border-slate-200 px-6 py-3 font-headline text-sm font-bold text-ink"
              >
                All trips
              </Link>
            </div>
            {!hasMapData && (
              <p className="text-xs text-amber-800">
                No map pins in this saved file. Generate a new plan with SerpAPI
                configured to geocode stops and hotels.
              </p>
            )}
          </div>
          <div className="relative group md:col-span-5">
            <div className="aspect-[4/5] rotate-2 overflow-hidden rounded-xl shadow-2xl transition-transform duration-500 group-hover:rotate-0">
              <img
                src={HERO_SIDE}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </section>

        <section className="space-y-8">
          <div className="scrollbar-hide flex gap-2 overflow-x-auto border-b border-slate-200/60 pb-4">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`whitespace-nowrap rounded-full px-6 py-3 font-medium transition-all ${
                  tab === t
                    ? "bg-primary font-semibold text-white shadow-lg shadow-primary/20"
                    : "text-muted hover:text-primary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              {tab === "Overview" && (
                <div className="grid gap-8 md:grid-cols-12">
                  <div className="space-y-6 rounded-2xl bg-surface-low p-8 md:col-span-4">
                    <h3 className="font-headline text-xl font-bold">Trip snapshot</h3>
                    <ul className="space-y-4 text-sm">
                      <li className="flex justify-between border-b border-slate-200/50 py-2">
                        <span className="text-muted">Budget</span>
                        <span className="font-semibold">
                          ₹{data.budget?.toLocaleString("en-IN")}
                        </span>
                      </li>
                      <li className="flex justify-between border-b border-slate-200/50 py-2">
                        <span className="text-muted">Hotel allocation</span>
                        <span className="font-semibold">
                          ₹{data.hotel_budget?.toLocaleString("en-IN") ?? "—"}
                        </span>
                      </li>
                      <li className="flex justify-between border-b border-slate-200/50 py-2">
                        <span className="text-muted">Transport</span>
                        <span className="font-semibold">
                          ₹{data.transport_budget?.toLocaleString("en-IN") ?? "—"}
                        </span>
                      </li>
                      <li className="flex justify-between py-2">
                        <span className="text-muted">Food / activities</span>
                        <span className="font-semibold">
                          ₹{(data.food_budget ?? 0).toLocaleString("en-IN")} / ₹
                          {(data.activities_budget ?? 0).toLocaleString("en-IN")}
                        </span>
                      </li>
                    </ul>
                    {data.budget_reasoning && (
                      <p className="text-sm leading-relaxed text-muted">
                        {data.budget_reasoning}
                      </p>
                    )}
                    {data.warnings.length > 0 && (
                      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                        {data.warnings.map((w) => (
                          <p key={w}>{w}</p>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setMapOpen(true)}
                      disabled={!hasMapData}
                      className="flex w-full items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/5 py-3 text-sm font-bold text-primary disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined text-lg">map</span>
                      Map preview
                    </button>
                  </div>
                  <div className="md:col-span-8">
                    <div className="max-w-none rounded-2xl border border-slate-200/40 bg-surface-lowest p-8 text-sm leading-relaxed text-muted [&_h1]:mt-4 [&_h1]:font-headline [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:font-headline [&_h2]:text-base [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-5">
                      <ReactMarkdown>
                        {data.itinerary
                          ? data.itinerary.length > 1200
                            ? `${data.itinerary.slice(0, 1200)}…`
                            : data.itinerary
                          : "_No summary._"}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {tab === "Itinerary" && (
                    <div className="space-y-8">
                      {data.route_map_url && (
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
                            Route Map (SerpAPI)
                          </p>
                          <img
                            src={data.route_map_url}
                            alt="Route Map"
                            className="h-auto w-full rounded-xl"
                          />
                        </div>
                      )}
                      {showRawMarkdown ? (
                    <div className="prose prose-slate max-w-none rounded-2xl border border-slate-200 bg-white p-8">
                      <ReactMarkdown>{data.itinerary ?? ""}</ReactMarkdown>
                    </div>
                  ) : (                    <ItineraryTimeline days={parsedDays} />
                  )}
                </div>
              )}

              {tab === "Hotels" && (
                <div>
                  {data.hotels.length === 0 ? (
                    <p className="text-muted">No hotel rows in this response.</p>
                  ) : (
                    <HotelShowcaseGrid
                      hotels={data.hotels}
                      onViewOnMap={() => setMapOpen(true)}
                    />
                  )}
                </div>
              )}

              {tab === "Travel" && (
                <TransportOptionsPanel
                  options={data.transport_options}
                  byMode={data.transport_by_mode}
                />
              )}

              {tab === "Places" && (
                <div className="rounded-2xl border border-slate-200/40 bg-surface-lowest p-8">
                  <h3 className="mb-4 font-headline text-lg font-bold">
                    Itinerary stops (SerpAPI)
                  </h3>
                  <ol className="list-none space-y-4">
                    {routePins.length === 0 &&
                      itineraryPlaceQueries.length === 0 && (
                        <li className="text-muted">No places in this response.</li>
                      )}
                    {routePins.length === 0 &&
                      itineraryPlaceQueries.map((name, i) => (
                        <motion.li
                          key={`${name}-${i}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex gap-4 rounded-xl bg-surface-low p-4"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                            {i + 1}
                          </span>
                          <div>
                            <span className="font-semibold text-ink">{name}</span>
                            <span className="mt-1 block text-sm text-muted">
                              Listed from the generated itinerary
                            </span>
                          </div>
                        </motion.li>
                      ))}
                    {routePins.map((w, i) => (
                      <motion.li
                        key={`${w.order}-${w.lat}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex gap-4 rounded-xl bg-surface-low p-4"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                          {i + 1}
                        </span>
                        <div>
                          <span className="font-semibold text-ink">{w.name}</span>
                          {w.address && (
                            <span className="mt-1 block text-sm text-muted">
                              {w.address}
                            </span>
                          )}
                        </div>
                      </motion.li>
                    ))}
                  </ol>
                  {hotelPins.length > 0 && (
                    <>
                      <h3 className="mb-4 mt-10 font-headline text-lg font-bold">
                        Hotels on map
                      </h3>
                      <ul className="space-y-3">
                        {hotelPins.map((w) => (
                          <li
                            key={`h-${w.order}-${w.lat}`}
                            className="flex items-center gap-2 text-sm text-ink"
                          >
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            {w.name}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {tab === "Map" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-6 text-sm">
                    <span className="flex items-center gap-2 text-muted">
                      <span className="h-3 w-8 rounded-full bg-primary" />
                      Driving route via itinerary stops
                    </span>
                    <span className="flex items-center gap-2 text-muted">
                      <span className="h-3 w-3 rounded-full bg-red-500" />
                      Hotels (SerpAPI)
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-slate-200/40 bg-surface-lowest p-4">
                    <RouteMap
                      routeWaypoints={routePins}
                      hotelPins={hotelPins}
                      height={480}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setMapOpen(true)}
                    className="w-full rounded-full border border-slate-200 py-3 text-sm font-bold text-primary hover:bg-primary/5"
                  >
                    Fullscreen map
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
      <SiteFooter />

      <Link
        to="/plan"
        className="fixed bottom-8 right-8 z-[100] flex items-center gap-3 rounded-full bg-gradient-to-r from-primary to-secondary py-2 pl-6 pr-2 shadow-2xl transition-transform duration-300 hover:scale-105"
      >
        <span className="text-sm font-bold text-white">Ask Yatri AI</span>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-primary shadow-inner">
          <span
            className="material-symbols-outlined text-2xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            auto_awesome
          </span>
        </span>
      </Link>
    </div>
  );
}
