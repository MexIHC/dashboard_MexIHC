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

type ResearchMeta = {
  model_policy: ModelPolicy;
  shared_p95_delta?: number | null;
};

export function UxUvHomePage() {
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [research, setResearch] = useState<ResearchMeta | null>(null);
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
        const rs = researchRes as ResearchMeta;
        setResearch(rs);
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

  const models = research?.model_policy;
  const p95 = research?.shared_p95_delta;

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-slate-900">UX evaluation — institutional portal</h3>
        <p className="mt-2 text-sm text-slate-600">
          Sample <strong>n = {cohort.samples.sus_completed}</strong> · Multimodal contrast: post-session{" "}
          <strong>SUS</strong> (usability) vs inferred <strong>stress</strong> and{" "}
          <strong>cognitive load</strong> during portal tasks (wearable signals).
        </p>

        <div className="mt-4 rounded-md border border-sky-100 bg-sky-50/80 p-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-800">How to read the dashboard</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed sm:text-sm">
            <li>
              <strong>SUS (0–100)</strong> — self-reported usability after the session (higher = better perceived UX).
            </li>
            <li>
              <strong>Delta (Δ)</strong> — activation change vs each participant&apos;s baseline (probability scale);{" "}
              <strong>primary metric</strong> for analysis.
            </li>
            <li>
              <strong>Level (0–100)</strong> — visualization only:{" "}
              <code className="rounded bg-white/80 px-1 py-0.5 text-[11px] sm:text-xs">
                min(100, 100 × Δ / p95_shared)
              </code>
              . Stress and load share one reference so bar height tracks Δ; constructs stay separate.
            </li>
            {p95 != null ? (
              <li className="text-slate-600">
                <strong>p95_shared</strong> = {p95.toFixed(4)} (95th percentile of 60 task-level Δ values: 10 participants ×
                3 tasks × 2 domains).
              </li>
            ) : null}
          </ul>
        </div>

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
