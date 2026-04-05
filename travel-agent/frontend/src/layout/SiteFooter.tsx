import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="mt-auto w-full border-t border-slate-200/60 bg-slate-50 py-12 px-6">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <div className="font-headline mb-4 text-lg font-bold text-slate-900">
            Yatri AI
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-slate-500">
            Your digital curator for Indian travel — itineraries, stays, and maps
            powered by AI.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 md:justify-end">
          <Link
            to="/plan"
            className="text-sm text-slate-500 transition-colors hover:text-primary hover:underline"
          >
            Start planning
          </Link>
          <Link
            to="/trips"
            className="text-sm text-slate-500 transition-colors hover:text-primary hover:underline"
          >
            My trips
          </Link>
          <span className="text-sm text-slate-400">Privacy · Terms</span>
        </div>
      </div>
    </footer>
  );
}
