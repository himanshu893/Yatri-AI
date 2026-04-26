import { Link } from "react-router-dom";
import { TopNav } from "../layout/TopNav";
import { SiteFooter } from "../layout/SiteFooter";
import { listTrips } from "../lib/tripsStorage";

const PLACEHOLDER_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuClv7mBVpYZ6YJDhmxNL4za-dGdd1aBs3YFuXKVMxKZEZCpABp_2ZkdBHxUMUtO_PaMn05kFEKnR7BuYVcy9LEE4-D_jhMZgxZzggX40ue52vVpc3vPe6v6J_TXcIhf5hoNlaHMeiqswceWxK92XiVviv_rR61Csj68TFabh_ZFBlKAO4ggr4oOq9RjIQUOxCS5uI9LbW3FEEWobd93AvIxCGoLQgVtHNZZOxeJE1V0E-UQ2y0xSsBkpOTtv58rOlEiOC3MflwEv8o6";

export function TripsDashboardPage() {
  const trips = listTrips();

  return (
    <div className="flex min-h-screen flex-col bg-surface font-body">
      <TopNav />
      <main className="mx-auto w-full max-w-7xl flex-grow px-6 py-12">
        <header className="mb-12">
          <h1 className="font-headline text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
            Your saved journeys
          </h1>
          <p className="mt-2 text-lg text-muted">
            Reopen any AI-curated plan. New trips are stored in this browser.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <article
              key={trip.id}
              className="group glass-card flex flex-col overflow-hidden rounded-2xl border border-slate-200/40 transition-transform duration-300 hover:scale-[1.02]"
            >
              <div className="relative m-2 h-64 overflow-hidden rounded-xl">
                <img
                  src={trip.imageUrl || PLACEHOLDER_IMG}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-primary backdrop-blur">
                  {trip.status === "completed" ? "COMPLETED" : trip.status.toUpperCase()}
                </div>
              </div>
              <div className="flex flex-grow flex-col p-6">
                <h3 className="font-headline mb-2 text-2xl font-bold text-ink">
                  {trip.title}
                </h3>
                <div className="mb-6 space-y-3 text-sm text-muted">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">
                      calendar_today
                    </span>
                    <span>
                      {new Date(trip.createdAt).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">
                      payments
                    </span>
                    <span>{trip.subtitle}</span>
                  </div>
                </div>
                <Link
                  to={`/trip/${trip.id}`}
                  className="mt-auto w-full rounded-full bg-gradient-to-r from-primary to-secondary py-4 text-center font-bold text-white shadow-lg shadow-primary/10 transition-all hover:shadow-primary/30"
                >
                  View trip
                </Link>
              </div>
            </article>
          ))}

          <Link
            to="/plan"
            className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center transition-colors hover:bg-surface-low"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 transition-transform group-hover:scale-110">
              <span className="material-symbols-outlined text-3xl text-primary">
                add
              </span>
            </div>
            <h4 className="font-headline mb-1 text-lg font-bold text-ink">
              Plan a new adventure
            </h4>
            <p className="text-sm text-muted">Open the AI planner</p>
          </Link>
        </div>

        {trips.length === 0 && (
          <div className="mx-auto mt-8 max-w-md rounded-2xl bg-surface-low p-10 text-center">
            <p className="text-muted">
              No trips yet. Start from the home page or planner — finished plans
              appear here automatically.
            </p>
            <Link
              to="/plan"
              className="mt-6 inline-block rounded-full bg-primary px-8 py-3 font-headline text-sm font-bold text-white"
            >
              Start planning
            </Link>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
