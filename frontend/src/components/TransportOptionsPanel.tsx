import type { TransportOption } from "../types";

const MODES = [
  { key: "flight", label: "Flights", icon: "flight" },
  { key: "train", label: "Trains", icon: "train" },
  { key: "bus", label: "Buses", icon: "directions_bus" },
  { key: "taxi", label: "Transfers", icon: "local_taxi" },
] as const;

type Props = {
  options: TransportOption[];
  byMode?: Record<string, TransportOption[]>;
};

function groupedOptions(
  options: TransportOption[],
  byMode?: Record<string, TransportOption[]>,
) {
  const grouped: Record<string, TransportOption[]> = {
    flight: [],
    train: [],
    bus: [],
    taxi: [],
  };

  if (byMode) {
    for (const [mode, entries] of Object.entries(byMode)) {
      grouped[mode.toLowerCase()] = entries ?? [];
    }
  }

  for (const option of options) {
    const mode = (option.type || "other").toLowerCase();
    if (!grouped[mode]) grouped[mode] = [];
    if (!grouped[mode].some((existing) => existing === option)) {
      grouped[mode].push(option);
    }
  }

  return grouped;
}

function fareText(option: TransportOption) {
  if (option.fare != null) return `INR ${option.fare.toLocaleString("en-IN")}`;
  const classFare = option.classes?.find((c) => c.fare)?.fare;
  return classFare || "Fare unavailable";
}

function timeText(option: TransportOption) {
  if (option.departure && option.arrival) {
    return `${option.departure} -> ${option.arrival}`;
  }
  return option.duration || "Timing unavailable";
}

function optionTitle(option: TransportOption) {
  if (option.name && option.route && option.name !== option.route) {
    return `${option.name} - ${option.route}`;
  }
  return option.name || option.route || "Travel option";
}

export function TransportOptionsPanel({ options, byMode }: Props) {
  const grouped = groupedOptions(options, byMode);
  const total = Object.values(grouped).reduce((sum, entries) => sum + entries.length, 0);

  if (!total) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-200 bg-surface-low/50 p-8 text-center">
        <h3 className="font-headline text-xl font-bold text-ink">Travel options</h3>
        <p className="mt-2 text-sm text-muted">
          No bus, train, or flight rows were returned for this plan.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-headline text-3xl font-bold text-ink">
          Travel options
        </h2>
        <p className="mt-1 text-sm text-muted">
          Mode-wise choices from the connected travel agent and local scrapers.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {MODES.map((mode) => {
          const entries = grouped[mode.key] ?? [];
          return (
            <article
              key={mode.key}
              className="rounded-2xl border border-slate-200/50 bg-surface-lowest p-5 shadow-lift"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <span className="material-symbols-outlined">{mode.icon}</span>
                  </span>
                  <div>
                    <h3 className="font-headline text-lg font-bold text-ink">
                      {mode.label}
                    </h3>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                      {entries.length} option{entries.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              </div>

              {entries.length === 0 ? (
                <p className="rounded-xl bg-surface-low p-4 text-sm text-muted">
                  No {mode.label.toLowerCase()} found for this route.
                </p>
              ) : (
                <ul className="space-y-3">
                  {entries.slice(0, 5).map((option, index) => (
                    <li
                      key={`${mode.key}-${option.code ?? index}-${option.name ?? index}`}
                      className="rounded-xl bg-surface-low p-4 ring-1 ring-slate-200/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-ink">
                            {optionTitle(option)}
                          </h4>
                          <p className="mt-1 text-xs text-muted">
                            {option.code && option.code !== "N/A" ? `${option.code} | ` : ""}{timeText(option)}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-primary shadow-sm">
                          {fareText(option)}
                        </span>
                      </div>
                      {option.description && (
                        <p className="mt-3 text-xs leading-relaxed text-muted">
                          {option.description}
                        </p>
                      )}
                      {option.classes && option.classes.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {option.classes.slice(0, 4).map((cls, ci) => (
                            <span
                              key={`${cls.classType ?? "class"}-${ci}`}
                              className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-muted"
                            >
                              {cls.classType || "Class"}: {cls.fare || "N/A"}
                              {cls.status ? ` (${cls.status})` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
