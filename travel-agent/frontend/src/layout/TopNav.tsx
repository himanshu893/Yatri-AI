import { Link, NavLink } from "react-router-dom";

const linkClass =
  "font-headline font-medium text-sm tracking-tight px-3 py-1.5 rounded-full transition-all duration-200";
const inactive = "text-slate-600 hover:text-primary hover:bg-blue-50/50";
const active = "text-primary font-bold border-b-2 border-primary rounded-none";

export function TopNav() {
  return (
    <nav className="sticky top-0 z-50 w-full bg-white/70 backdrop-blur-xl shadow-glass">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-6 py-4">
        <div className="flex items-center gap-8">
          <Link
            to="/"
            className="font-headline text-2xl font-bold tracking-tight text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text"
          >
            Yatri AI
          </Link>
          <div className="hidden items-center gap-2 md:flex">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `${linkClass} ${isActive ? active : inactive}`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/plan"
              className={({ isActive }) =>
                `${linkClass} ${isActive ? active : inactive}`
              }
            >
              AI Planner
            </NavLink>
            <NavLink
              to="/trips"
              className={({ isActive }) =>
                `${linkClass} ${isActive ? active : inactive}`
              }
            >
              My Trips
            </NavLink>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/plan"
            className="rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-semibold text-white shadow-primary/20 transition-transform hover:scale-[1.02] md:px-5 md:text-sm"
          >
            Plan
          </Link>
          <span className="material-symbols-outlined cursor-pointer text-slate-600">
            account_circle
          </span>
        </div>
      </div>
      <div className="flex justify-center gap-4 border-t border-slate-200/50 px-6 py-2 md:hidden">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `text-xs font-semibold ${isActive ? "text-primary" : "text-muted"}`
          }
        >
          Home
        </NavLink>
        <NavLink
          to="/plan"
          className={({ isActive }) =>
            `text-xs font-semibold ${isActive ? "text-primary" : "text-muted"}`
          }
        >
          AI Planner
        </NavLink>
        <NavLink
          to="/trips"
          className={({ isActive }) =>
            `text-xs font-semibold ${isActive ? "text-primary" : "text-muted"}`
          }
        >
          My Trips
        </NavLink>
      </div>
    </nav>
  );
}
