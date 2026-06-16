import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { apiUrl } from "@/lib/api";
import { DOMAIN_COGNITIVE, DOMAIN_STRESS, LINE_SELF_REPORT } from "@/lib/chartColors";

type TemporalPoint = {
  label: string;
  order: number;
  stress: number | null;
  load: number | null;
};

type DesignView = {
  demographics?: { lines?: string[] };
  sus_score?: string;
  sus_band?: string;
  global_summary?: string;
  global_table?: Record<string, string>[];
  global_bar_comparison?: { sus: number | null; stress: number | null; load: number | null };
  temporal_series?: TemporalPoint[];
  has_temporal_series?: boolean;
  technical_notes?: string[];
  habits_context?: Record<string, string>;
  method_note?: string;
};

type DetailPayload = {
  user_id: string;
  design_view?: DesignView;
};

const CHART_MARGIN = { top: 16, right: 12, left: 4, bottom: 8 };
const Y_AXIS_PCT_PROPS = {
  domain: [0, 100] as [number, number],
  ticks: [0, 25, 50, 75, 100],
  tickFormatter: (v: number) => `${v}%`,
  width: 48,
  allowDecimals: false,
};

function GlobalTable({ rows }: { rows: Record<string, string>[] }) {
  if (!rows.length) return <p className="text-xs text-slate-500">No data.</p>;
  const cols = Object.keys(rows[0]);
  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-center text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {cols.map((c) => (
              <th key={c} className="px-3 py-2.5 text-xs font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100 bg-white">
              {cols.map((c) => (
                <td key={c} className="px-3 py-3 text-slate-800">
                  {row[c] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TemporalActivationChart({ points }: { points: TemporalPoint[] }) {
  const hasStress = points.some((p) => p.stress != null && p.label !== "Basal");
  const hasLoad = points.some((p) => p.load != null && p.label !== "Basal");
  if (!hasStress && !hasLoad) return null;

  const data = points.map((p) => ({
    label: p.label,
    Stress: p.stress,
    "Cognitive load": p.load,
  }));

  return (
    <div className="mx-auto mt-4 max-w-lg rounded-lg border border-slate-200 bg-white p-3">
      <h5 className="mb-2 text-center text-sm font-semibold text-slate-800">
        Activation during tasks (vs baseline)
      </h5>
      <p className="mb-2 text-center text-xs text-slate-500">Tasks with available inference only. Level 0-100.</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis {...Y_AXIS_PCT_PROPS} />
            <Tooltip formatter={(v: number) => (v == null ? "—" : `${Number(v).toFixed(1)}%`)} />
            <Legend />
            {hasStress ? (
              <Line
                type="monotone"
                dataKey="Stress"
                stroke={DOMAIN_STRESS}
                strokeWidth={2.5}
                dot={{ r: 4 }}
                connectNulls={false}
              />
            ) : null}
            {hasLoad ? (
              <Line
                type="monotone"
                dataKey="Cognitive load"
                stroke={DOMAIN_COGNITIVE}
                strokeWidth={2.5}
                dot={{ r: 4 }}
                connectNulls={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GlobalContrastChart({ bars }: { bars: { sus: number | null; stress: number | null; load: number | null } }) {
  const { sus, stress, load } = bars;
  if (stress == null && load == null) return null;

  const data = [
    {
      label: "Session",
      SUS: sus,
      Stress: stress,
      "Cognitive load": load,
    },
  ];

  return (
    <div className="mx-auto mt-4 max-w-lg rounded-lg border border-slate-200 bg-white p-3">
      <h5 className="mb-2 text-center text-sm font-semibold text-slate-800">SUS vs global activation</h5>
      <p className="mb-2 text-center text-xs text-slate-500">
        Single post-session SUS alongside stress and load. Higher SUS = better perceived usability; lower
        activation = lower inferred physiological demand.
      </p>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis {...Y_AXIS_PCT_PROPS} />
            <Tooltip formatter={(v: number) => (v == null ? "—" : `${Number(v).toFixed(1)}%`)} />
            <Legend />
            <Bar dataKey="SUS" name="SUS" fill={LINE_SELF_REPORT} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Stress" name="Stress" fill={DOMAIN_STRESS} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Cognitive load" name="Load" fill={DOMAIN_COGNITIVE} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function UxUvSubjectModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl(`/api/v1/ux-uv/subject/${encodeURIComponent(userId)}`))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DetailPayload>;
      })
      .then(setDetail)
      .catch(() => setErr("Could not load participant."));
  }, [userId]);

  const v = detail?.design_view;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <h3 className="text-lg font-semibold text-slate-900">{userId}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 p-4">
          {err ? <p className="text-sm text-red-700">{err}</p> : null}
          {!detail && !err ? <p className="text-sm text-slate-500">Loading…</p> : null}

          {v ? (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {(v.demographics?.lines ?? []).map((ln) => (
                  <p key={ln}>{ln}</p>
                ))}
              </div>

              {v.habits_context ? (
                <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                  {Object.entries(v.habits_context).map(([k, val]) => (
                    <div key={k} className="rounded border border-slate-100 bg-white px-2 py-1.5 text-center">
                      <span className="font-semibold">{k}:</span> {val}
                    </div>
                  ))}
                </div>
              ) : null}

              <div>
                <h4 className="mb-3 text-center text-sm font-semibold text-slate-800">Global session summary</h4>
                <GlobalTable rows={v.global_table ?? []} />
              </div>

              {v.has_temporal_series && v.temporal_series?.length ? (
                <TemporalActivationChart points={v.temporal_series} />
              ) : null}

              {v.global_bar_comparison ? (
                <GlobalContrastChart bars={v.global_bar_comparison} />
              ) : null}

              {v.technical_notes?.length ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="mb-1 font-semibold text-slate-700">Technical notes</p>
                  <ul className="list-inside list-disc space-y-1">
                    {v.technical_notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {v.method_note ? <p className="text-center text-xs text-slate-500">{v.method_note}</p> : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
