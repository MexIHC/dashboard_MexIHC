import { Navigate } from "react-router-dom";
import { UxUvHomePage } from "@/pages/UxUvHomePage";
import { UxUvResultsPage } from "@/pages/UxUvResultsPage";

export function ProjectDashboardPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-slate-900">MexIHC — multimodal UX evaluation</h2>
        <div className="mt-2 space-y-2 text-sm text-slate-600">
          <p>
            Contrast between the System Usability Scale (SUS) and physiological stress / cognitive-load activation
            during institutional portal tasks.
          </p>
          <p className="text-xs text-slate-500">
            Study dataset (Zenodo):{" "}
            <a
              className="font-medium text-sky-700 underline decoration-sky-400 underline-offset-2 hover:text-sky-900"
              href="https://doi.org/10.5281/zenodo.XXXXXXX"
              target="_blank"
              rel="noreferrer"
            >
              replace with your DOI after upload
            </a>
          </p>
        </div>
      </section>

      <UxUvHomePage />
      <UxUvResultsPage />
    </div>
  );
}

export function ProjectRedirect() {
  return <Navigate to="/" replace />;
}
