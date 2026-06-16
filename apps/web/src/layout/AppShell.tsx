import { Link, useLocation } from "react-router-dom";

export function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">MexIHC dashboard</h1>
            <p className="text-xs text-slate-500">Multimodal UX evaluation — SUS and physiological activation</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <Link
              to="/"
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                loc.pathname === "/"
                  ? "bg-gradient-to-r from-slate-900 to-slate-700 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Cohort & results
            </Link>
            <Link
              to="/upload"
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                loc.pathname === "/upload"
                  ? "bg-gradient-to-r from-slate-900 to-slate-700 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              New participant
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 bg-white/90 py-6 text-center text-xs text-slate-500">
        MexIHC pilot — code on GitHub · data on Zenodo
      </footer>
    </div>
  );
}
