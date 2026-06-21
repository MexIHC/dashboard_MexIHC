import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { UxUvSubjectModal } from "@/components/UxUvSubjectModal";
import { apiUrl } from "@/lib/api";
import {
  BAR_AUTOINFORME,
  DOMAIN_COGNITIVE,
  DOMAIN_STRESS,
} from "@/lib/chartColors";

type TaskSignalRow = { label: string; signal: number | null; mean_delta?: number | null; n?: number };
type GlobalCompare = {
  sus_mean: number | null;
  mean_global_signal: number | null;
  mean_global_delta?: number | null;
  n?: number;
};

type ResearchSummary = {
  cohort?: { n_sus: number; n_signals: number; sus_mean: number | null };
  activation_scale_note?: string;
  shared_p95_delta?: number;
  p95_stress?: number;
  p95_cognitive_load?: number;
  stress_domain: {
    n_subjects: number;
    p95_delta?: number;
    activation_note?: string;
    n_subjects: number;
    signal_distribution_by_task: TaskSignalRow[];
    compare_sus_vs_signal_global: GlobalCompare;
  } | null;
  cognitive_domain: {
    n_subjects: number;
    p95_delta?: number;
    activation_note?: string;
    n_subjects: number;
    signal_distribution_by_task: TaskSignalRow[];
    compare_sus_vs_signal_global: GlobalCompare;
  } | null;
};

type SubjectItem = { id: string; label: string; has_sus: boolean; has_signals: boolean; status: string };

type Questionnaires = {
  sus: { readable_rows: Record<string, string>[] };
};

const CHART_MARGIN = { top: 16, right: 12, left: 4, bottom: 8 };
const Y_AXIS_PCT_PROPS = {
  domain: [0, 100] as [number, number],
  ticks: [0, 25, 50, 75, 100],
  tickFormatter: (v: number) => `${v}%`,
  width: 48,
  allowDecimals: false,
};

function SignalOnlyBarChart({
  title,
  rows,
  color,
  domainNote,
  p95Ref,
}: {
  title: string;
  rows: TaskSignalRow[];
  color: string;
  domainNote?: string;
  p95Ref?: number;
}) {
  const data = rows.map((r) => ({
    label: r.label,
    Signal: r.signal,
    mean_delta: r.mean_delta,
  }));
  if (!data.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h5 className="mb-2 text-sm font-semibold text-slate-800">{title}</h5>
      <p className="mb-2 text-xs text-slate-500">
        Shared linear scale: min(100, 100 × Δ / p95). Hover for Δ.
        {p95Ref != null ? ` p95_shared = ${p95Ref.toFixed(3)}.` : ""}
      </p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis {...Y_AXIS_PCT_PROPS} />
            <Tooltip
              formatter={(v: number, name: string, props: { payload?: { mean_delta?: number | null } }) => {
                if (v == null) return "—";
                const d = props.payload?.mean_delta;
                const deltaTxt = d == null ? "" : ` · Δ=${Number(d).toFixed(3)}`;
                return [`${Number(v).toFixed(1)}%${deltaTxt}`, name === "Signal" ? "Activation" : name];
              }}
            />
            <Bar dataKey="Signal" name="Activation" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GlobalSusSignalChart({
  title,
  global,
  color,
  p95Ref,
}: {
  title: string;
  global: GlobalCompare | undefined;
  color: string;
  p95Ref?: number;
}) {
  if (!global?.sus_mean && !global?.mean_global_signal) return null;
  const data = [
    {
      label: "Global",
      SUS: global.sus_mean,
      Signal: global.mean_global_signal,
    },
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h5 className="mb-2 text-sm font-semibold text-slate-800">{title}</h5>
      <p className="mb-2 text-xs text-slate-500">
        Shared linear scale (stress & load comparable). Mean Δ=
        {global.mean_global_delta != null ? Number(global.mean_global_delta).toFixed(3) : "—"}
        {p95Ref != null ? ` · p95_shared = ${p95Ref.toFixed(3)}` : ""}
      </p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis {...Y_AXIS_PCT_PROPS} />
            <Tooltip formatter={(v: number) => (v == null ? "—" : `${Number(v).toFixed(1)}%`)} />
            <Legend />
            <Bar dataKey="SUS" name="SUS" fill={BAR_AUTOINFORME} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Signal" name="Global activation" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SimpleTable({ rows }: { rows: Record<string, string>[] }) {
  if (!rows.length) return <p className="text-sm text-slate-500">No data.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 text-slate-800">
                  {row[c] || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UxUvResultsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [research, setResearch] = useState<ResearchSummary | null>(null);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaires | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const load = async (path: string) => {
          const r = await fetch(apiUrl(path));
          if (!r.ok) throw new Error(`${path} → ${r.status}`);
          return r.json();
        };
        const [res, subs, q] = await Promise.all([
          load("/api/v1/ux-uv/research-summary"),
          load("/api/v1/ux-uv/subjects"),
          load("/api/v1/ux-uv/questionnaires"),
        ]);
        if (!cancelled) {
          setResearch(res as ResearchSummary);
          setSubjects((subs as { subjects: SubjectItem[] }).subjects ?? []);
          setQuestionnaires(q as Questionnaires);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error loading results");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const susRows = useMemo(() => {
    const base = questionnaires?.sus?.readable_rows ?? [];
    const byId = new Map(base.map((r) => [r.Participant, r]));
    return ["UX_U01", "UX_U02", "UX_U03", "UX_U04", "UX_U05", "UX_U06", "UX_U07", "UX_U08", "UX_U09", "UX_U10"].map(
      (id) =>
        byId.get(id) ?? {
          Participant: id,
          Age: "—",
          SUS: "—",
          Major: "—",
          "Portal (frequency)": "—",
        },
    );
  }, [questionnaires]);

  if (loading) {
    return <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading results…</section>;
  }
  if (error) {
    return <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</section>;
  }

  const stress = research?.stress_domain;
  const cog = research?.cognitive_domain;

  return (
    <section className="space-y-8">
      <p className="text-xs text-slate-500">
        Activation scaling and Δ are defined on the Home page. Charts below use the shared linear level (0–100).
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold" style={{ color: DOMAIN_STRESS }}>
            Stress domain
          </h4>
          <div className="mt-4 space-y-4">
            <GlobalSusSignalChart
              title="Global comparison: SUS vs stress"
              global={stress?.compare_sus_vs_signal_global}
              color={DOMAIN_STRESS}
              p95Ref={research?.shared_p95_delta ?? stress?.p95_delta ?? undefined}
            />
            <SignalOnlyBarChart
              title="Mean physiological activation per task."
              rows={stress?.signal_distribution_by_task ?? []}
              color={DOMAIN_STRESS}
              p95Ref={research?.shared_p95_delta ?? stress?.p95_delta ?? undefined}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold" style={{ color: DOMAIN_COGNITIVE }}>
            Cognitive load domain
          </h4>
          <div className="mt-4 space-y-4">
            <GlobalSusSignalChart
              title="Global comparison: SUS vs load"
              global={cog?.compare_sus_vs_signal_global}
              color={DOMAIN_COGNITIVE}
              p95Ref={research?.shared_p95_delta ?? cog?.p95_delta ?? undefined}
            />
            <SignalOnlyBarChart
              title="Mean physiological activation per task."
              rows={cog?.signal_distribution_by_task ?? []}
              color={DOMAIN_COGNITIVE}
              p95Ref={research?.shared_p95_delta ?? cog?.p95_delta ?? undefined}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="mb-3 text-sm font-semibold text-slate-800">Per-participant analysis</h4>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {subjects.map((s) => {
            const tone =
              s.status === "complete"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : s.status === "sus_only"
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-slate-200 bg-slate-50 text-slate-500";
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`w-full rounded-full border px-2 py-1.5 text-center text-sm font-medium transition hover:opacity-90 ${tone}`}
              >
                {s.label}
                {s.status === "sus_only" ? " · SUS only" : ""}
                {s.status === "pending" ? " · —" : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="mb-3 text-sm font-semibold text-slate-800">SUS per participant</h4>
        <SimpleTable rows={susRows} />
      </div>

      {selectedId ? <UxUvSubjectModal userId={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </section>
  );
}
