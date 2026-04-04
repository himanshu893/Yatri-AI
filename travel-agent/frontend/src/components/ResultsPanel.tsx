import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import type { TripPlanResponse } from "../types";
import { RouteMap } from "./RouteMap";

type Props = {
  data: TripPlanResponse;
  onReset: () => void;
};

export function ResultsPanel({ data, onReset }: Props) {
  const bd = data.budget_breakdown;

  return (
    <div className="results-grid">
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 style={{ marginTop: 0 }}>Your itinerary</h2>
        <p className="sub">
          {data.destination_label || data.destination}
          {data.travel_month ? ` · ${data.travel_month}` : ""} · ₹
          {data.budget?.toLocaleString("en-IN")}
        </p>

        {bd && Object.keys(bd).length > 0 && (
          <div className="side-section">
            <h3>Budget split</h3>
            <div className="budget-pills">
              {Object.entries(bd).map(([k, v]) => (
                <span key={k}>
                  {k}: ₹{Number(v).toLocaleString("en-IN")}
                </span>
              ))}
            </div>
            {data.budget_reasoning && (
              <p style={{ fontSize: "0.85rem", color: "var(--td-muted)", margin: "0.5rem 0 0" }}>
                {data.budget_reasoning}
              </p>
            )}
          </div>
        )}

        {data.hotels.length > 0 && (
          <div className="side-section">
            <h3>Stays (SerpAPI)</h3>
            {data.hotels.slice(0, 6).map((h, i) => (
              <div key={i} className="hotel-row">
                <strong>{String(h.name ?? "Hotel")}</strong>
                {h.price != null && (
                  <span style={{ color: "var(--td-muted)" }}>
                    {" "}
                    · ₹{Number(h.price).toLocaleString("en-IN")}/night
                  </span>
                )}
                {h.rating != null && (
                  <span style={{ color: "var(--td-green)" }}>
                    {" "}
                    · ★ {String(h.rating)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {data.transport_options.length > 0 && (
          <div className="side-section">
            <h3>Getting there</h3>
            {data.transport_options.map((t, i) => (
              <div key={i} className="transport-row">
                <strong>{String(t.type ?? "")}</strong>: {String(t.name ?? "")}
                {t.fare != null && (
                  <span style={{ color: "var(--td-muted)" }}>
                    {" "}
                    · ₹{Number(t.fare).toLocaleString("en-IN")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {data.warnings.length > 0 && (
          <div
            className="error-banner"
            style={{
              background: "#fff8e6",
              borderColor: "#ffe0a3",
              color: "#6b4e00",
            }}
          >
            {data.warnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        )}
        <div className="prose-itinerary">
          <ReactMarkdown>{data.itinerary ?? "_No itinerary text._"}</ReactMarkdown>
        </div>
        <button type="button" className="btn-ghost" onClick={onReset}>
          Plan another trip
        </button>
      </motion.div>

      <motion.div
        className="card map-column"
        style={{ padding: "1rem" }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Route map</h2>
        <p className="sub" style={{ marginBottom: "0.75rem" }}>
          Stops from your plan (geocoded via SerpAPI). Path uses Google Directions
          when driving routes exist between pins.
        </p>
        <RouteMap waypoints={data.map_waypoints} />
        {data.map_waypoints.length > 0 && (
          <ol
            style={{
              margin: "1rem 0 0",
              paddingLeft: "1.2rem",
              fontSize: "0.85rem",
              color: "var(--td-muted)",
            }}
          >
            {data.map_waypoints.map((w) => (
              <li key={w.order}>{w.name}</li>
            ))}
          </ol>
        )}
      </motion.div>
    </div>
  );
}
