/** Canonical raw signal tags (CSV headers). Must match exactly when uploading data. */
export const CANONICAL_RAW_SIGNALS: { tag: string; hint: string }[] = [
  { tag: "PR", hint: "Photoplethysmography red signal" },
  { tag: "PG", hint: "Photoplethysmography green signal" },
  { tag: "PI", hint: "Photoplethysmography infrared" },
  { tag: "EA", hint: "Electrodermal activity" },
  { tag: "TH", hint: "Thermal temperature" },
];

export type ModalityProfile = { id: string; label: string; tags: string[] };

/** Ten valid modality profiles (PR/PI require PG; TH not alone). Order and tags match modality_combo_ml_eval FEATURE_SETS. */
export const MODALITY_PROFILES: ModalityProfile[] = [
  { id: "pg_only", label: "PG", tags: ["PG"] },
  { id: "pg_full", label: "PG + PR + PI", tags: ["PG", "PR", "PI"] },
  { id: "eda_only", label: "EA", tags: ["EA"] },
  { id: "pg_eda", label: "PG + EA", tags: ["PG", "EA"] },
  { id: "pg_full_eda", label: "PG + PR + PI + EA", tags: ["PG", "PR", "PI", "EA"] },
  { id: "pg_th", label: "PG + TH", tags: ["PG", "TH"] },
  { id: "pg_full_th", label: "PG + PR + PI + TH", tags: ["PG", "PR", "PI", "TH"] },
  { id: "eda_th", label: "EA + TH", tags: ["EA", "TH"] },
  { id: "pg_eda_th", label: "PG + EA + TH", tags: ["PG", "EA", "TH"] },
  { id: "multimodal", label: "PG + PR + PI + EA + TH", tags: ["PG", "PR", "PI", "EA", "TH"] },
];

export const UX_MAX_TASKS = 10;

/** Legacy fixed list (MexIHC pilot); prefer {@link uxPhasesForCount}. */
export const UX_TASK_PHASES = ["Basal", "Task 1", "Task 2", "Task 3"] as const;

/** Basal + Task 1 … Task N. Returns [] when taskCount is below 1. */
export function uxPhasesForCount(taskCount: number): string[] {
  const n = Math.max(0, Math.min(UX_MAX_TASKS, Math.round(taskCount)));
  if (n < 1) return [];
  return ["Basal", ...Array.from({ length: n }, (_, i) => `Task ${i + 1}`)];
}

export type SexOption = "" | "M" | "F" | "prefer_not_to_say";

export type AnalysisDomain =
  | ""
  | "stress"
  | "cognitive"
  | "usability_sus"
  | "ux_other_self_report"
  | "sin_autoinforme";

/** Partición ordinal para Likert o para % / escala 0–100 (terciles, cuartiles, quintiles o manual). */
export type OrdinalPartition = "terciles" | "cuartiles" | "quintiles" | "custom";

export type LikertBandId = "nada" | "baja" | "intermedia" | "alta" | "muy_alta";

export const LIKERT_BAND_SELECT: { id: LikertBandId; label: string }[] = [
  { id: "nada", label: "Sin carga / nada" },
  { id: "baja", label: "Baja" },
  { id: "intermedia", label: "Intermedia" },
  { id: "alta", label: "Alta" },
  { id: "muy_alta", label: "Muy alta" },
];

/** Rango entero Likert inclusive; null si inválido o demasiado ancho. */
export function likertIntegerRange(minStr: string, maxStr: string): number[] | null {
  const lo = Number(minStr);
  const hi = Number(maxStr);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null;
  if (lo > hi) return null;
  const n = hi - lo + 1;
  if (n <= 0 || n > 21) return null;
  const out: number[] = [];
  for (let v = lo; v <= hi; v++) out.push(v);
  return out;
}

/** Cinco estados de estrés (Likert → ordinal); el investigador puede reasignar cada punto del rango. */
export const STRESS_TIER_IDS = [
  "sin_estres",
  "estres_bajo",
  "estres_medio",
  "estres_alto",
  "estres_muy_alto",
] as const;
export type StressTierId = (typeof STRESS_TIER_IDS)[number];

export function isStressTierId(s: string): s is StressTierId {
  return (STRESS_TIER_IDS as readonly string[]).includes(s);
}

export const STRESS_TIER_OPTIONS: { id: StressTierId; label: string }[] = [
  { id: "sin_estres", label: "Sin estrés" },
  { id: "estres_bajo", label: "Estrés bajo" },
  { id: "estres_medio", label: "Estrés medio" },
  { id: "estres_alto", label: "Estrés alto" },
  { id: "estres_muy_alto", label: "Estrés muy alto" },
];

/** Partición del rango Likert en 3, 4 o 5 grupos contiguos (solo número, no “terciles”). */
export type StressLikertPartition = 3 | 4 | 5;

/** Índices en STRESS_TIER_IDS asignados a cada grupo (de bajo a alto en el rango Likert). */
const PARTITION_TIER_INDEX: Record<StressLikertPartition, number[]> = {
  3: [0, 2, 4],
  4: [0, 1, 2, 4],
  5: [0, 1, 2, 3, 4],
};

function tierIndicesForGroupCount(k: number): number[] {
  if (k <= 0) return [];
  if (k === 1) return [2];
  if (k === 2) return [0, 4];
  if (k === 3) return PARTITION_TIER_INDEX[3];
  if (k === 4) return PARTITION_TIER_INDEX[4];
  return PARTITION_TIER_INDEX[5];
}

function groupSizes(n: number, k: number): number[] {
  const sizes: number[] = [];
  const base = Math.floor(n / k);
  let rem = n % k;
  for (let j = 0; j < k; j++) {
    sizes.push(base + (j < rem ? 1 : 0));
  }
  return sizes;
}

/**
 * Rango Likert validado: enteros 1–10, máximo 10 valores distintos (p. ej. 1–10).
 */
export function stressLikertRangeValidated(lo: number, hi: number): number[] | null {
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null;
  if (lo < 1 || hi > 10 || lo > hi) return null;
  if (hi - lo + 1 > 10) return null;
  const out: number[] = [];
  for (let v = lo; v <= hi; v++) out.push(v);
  return out;
}

/**
 * Reparte los valores del rango en `parts` grupos contiguos y asigna un estado de estrés por grupo.
 * Si hay menos valores que particiones, se usa una partición efectiva de n grupos.
 */
export function stressLikertAutoMap(
  vals: number[],
  parts: StressLikertPartition,
): Record<string, StressTierId> {
  const n = vals.length;
  if (n === 0) return {};
  const k = Math.min(parts, n);
  const tierIdx = tierIndicesForGroupCount(k);
  const sizes = groupSizes(n, k);
  const out: Record<string, StressTierId> = {};
  let vi = 0;
  for (let g = 0; g < k; g++) {
    const tid = tierIdx[g] ?? 0;
    const tier = STRESS_TIER_IDS[tid] ?? "sin_estres";
    for (let i = 0; i < sizes[g]!; i++) {
      out[String(vals[vi]!)] = tier;
      vi++;
    }
  }
  return out;
}

const TIER3: LikertBandId[] = ["baja", "intermedia", "alta"];
const TIER4: LikertBandId[] = ["baja", "intermedia", "alta", "muy_alta"];
const TIER5: LikertBandId[] = ["nada", "baja", "intermedia", "alta", "muy_alta"];

/** Reparte n valores consecutivos en k grupos contiguos lo más equilibrados posible. */
function bucketLikertBands(n: number, k: 3 | 4 | 5): LikertBandId[] {
  const tier = k === 3 ? TIER3 : k === 4 ? TIER4 : TIER5;
  const sizes: number[] = [];
  const base = Math.floor(n / k);
  let rem = n % k;
  for (let j = 0; j < k; j++) {
    sizes.push(base + (j < rem ? 1 : 0));
  }
  const out: LikertBandId[] = [];
  let t = 0;
  for (let g = 0; g < k; g++) {
    for (let i = 0; i < sizes[g]; i++) {
      out.push(tier[g]);
      t++;
    }
  }
  return out;
}

/** Asignación preset según partición (para rangos no estándar reparte en k bandas). */
export function likertPresetMap(
  vals: number[],
  mode: Exclude<OrdinalPartition, "custom">,
): Record<string, LikertBandId> {
  const n = vals.length;
  const k = mode === "terciles" ? 3 : mode === "cuartiles" ? 4 : 5;
  if (n === 0) return {};
  if (n < k) {
    const tier = k === 3 ? TIER3 : k === 4 ? TIER4 : TIER5;
    const out: Record<string, LikertBandId> = {};
    vals.forEach((v, i) => {
      const idx = Math.min(tier.length - 1, Math.floor(((i + 1) * tier.length) / (n + 1)));
      out[String(v)] = tier[idx] ?? "intermedia";
    });
    return out;
  }
  const bands = bucketLikertBands(n, k);
  return Object.fromEntries(vals.map((v, i) => [String(v), bands[i] ?? "intermedia"]));
}

/** Partición del nivel de señal 0–100 (derivado de Δ; misma granularidad que Likert: 3, 4 o 5 niveles). */
export type SignalPctPartition = 3 | 4 | 5;

export type PctBand = { min: number; max: number };

/**
 * Rangos enteros inclusivos 0–100 para el nivel de señal (presets coherentes; editables en la UI).
 * Ej. 5 niveles: 0–20, 21–40, … 81–100.
 */
export function defaultPctActivationBands(parts: SignalPctPartition): PctBand[] {
  if (parts === 5) {
    return [
      { min: 0, max: 20 },
      { min: 21, max: 40 },
      { min: 41, max: 60 },
      { min: 61, max: 80 },
      { min: 81, max: 100 },
    ];
  }
  if (parts === 4) {
    return [
      { min: 0, max: 25 },
      { min: 26, max: 50 },
      { min: 51, max: 75 },
      { min: 76, max: 100 },
    ];
  }
  return [
    { min: 0, max: 33 },
    { min: 34, max: 66 },
    { min: 67, max: 100 },
  ];
}

/** Límites superiores de cada banda (excepto la última), útil si algo consume solo cortes. */
export function pctBandsToLegacyCuts(bands: PctBand[]): string[] {
  if (bands.length <= 1) return [];
  return bands.slice(0, -1).map((b) => String(b.max));
}

function groupSizesPct(n: number, k: number): number[] {
  const sizes: number[] = [];
  const base = Math.floor(n / k);
  let rem = n % k;
  for (let j = 0; j < k; j++) {
    sizes.push(base + (j < rem ? 1 : 0));
  }
  return sizes;
}

/**
 * Cuando el primer valor del Likert es “sin estrés / basal” (no lleva banda % propia),
 * reparte el intervalo **1–100 %** en `parts - 1` bandas contiguas (p. ej. parts=5 → cuatro bandas 1–25, 26–50, …).
 */
export function defaultPctActivationBandsSkipFirstLikert(parts: SignalPctPartition): PctBand[] {
  const k = Math.max(1, parts - 1);
  const sizes = groupSizesPct(100, k);
  let cur = 1;
  const out: PctBand[] = [];
  for (const w of sizes) {
    const hi = cur + w - 1;
    out.push({ min: cur, max: hi });
    cur = hi + 1;
  }
  return out;
}

/** Cortes sugeridos en eje 0–100 (p. ej. TLX o nivel de señal); terciles = 2 cortes, cuartiles = 3, quintiles = 4. */
export function suggestedCuts(scaleMax: number, mode: Exclude<OrdinalPartition, "custom">): string[] {
  if (mode === "terciles") {
    const a = scaleMax / 3;
    return [a.toFixed(2), (2 * a).toFixed(2)];
  }
  if (mode === "cuartiles") {
    return [(scaleMax / 4).toFixed(2), (scaleMax / 2).toFixed(2), ((3 * scaleMax) / 4).toFixed(2)];
  }
  return [20, 40, 60, 80].map((x) => String(x));
}
