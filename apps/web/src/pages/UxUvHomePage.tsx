import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { apiUrl } from "@/lib/api";
import { BAR_DEMOGRAPHIC, DOMAIN_COGNITIVE, DOMAIN_STRESS } from "@/lib/chartColors";

type HistBin = { label: string; count: number };

type ModelPolicy = {
  stress: { model: string; bacc: number };
  cognitive: { model: string; bacc: number };
};

type Cohort = {
  samples: { sus_completed: number; with_signals: number; total_slots: number };
  ages: HistBin[];
  gender: HistBin[];
  discipline: HistBin[];
  portal_usage: HistBin[];
};

const DEMO_BLOCKS: { key: keyof Cohort; title: string }[] = [
  { key: "gender", title: "Gender" },
  { key: "ages", title: "Age" },
  { key: "portal_usage", title: "Portal usage" },
  { key: "discipline", title: "Major" },
];

export function UxUvHomePage() {
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [models, setModels] = useState<ModelPolicy | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const load = async (path: string) => {
      const r = await fetch(apiUrl(path));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    };
    Promise.all([load("/api/v1/ux-uv/cohort-summary"), load("/api/v1/ux-uv/research-summary")])
      .then(([cohortRes, researchRes]) => {
        setCohort(cohortRes as Cohort);
        setModels((researchRes as { model_policy: ModelPolicy }).model_policy);
      })
      .catch(() => setErr("Could not load cohort. Is the API running on port 8002?"));
  }, []);

  if (err) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</section>
    );
  }

  if (!cohort) {
    return <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading cohort…</section>;
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900">UX evaluation — institutional portal</h3>
        <p className="mt-2 text-sm text-slate-600">Sample n = {cohort.samples.sus_completed}</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          <li>Self-reported SUS — score from 0 to 100</li>
          <li>Stress and cognitive load — physiological activation percentage over baseline</li>
        </ul>
        {models ? (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-semibold">Operational models</p>
            <p className="mt-1">
              <span style={{ color: DOMAIN_STRESS }}>Stress:</span> {models.stress.model} · BACC{" "}
              {models.stress.bacc}
            </p>
            <p className="mt-1">
              <span style={{ color: DOMAIN_COGNITIVE }}>Cognitive load:</span> {models.cognitive.model} · BACC{" "}
              {models.cognitive.bacc}
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {DEMO_BLOCKS.map((block) => {
          const raw = cohort[block.key];
          const data = Array.isArray(raw) ? raw : [];
          return (
            <div key={block.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="mb-2 text-sm font-semibold text-slate-800">{block.title}</h4>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 9 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Participants" fill={BAR_DEMOGRAPHIC} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
