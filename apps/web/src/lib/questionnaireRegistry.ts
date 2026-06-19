import type { AnalysisDomain } from "@/lib/newAnalysisDefaults";

/** Project profile: which self-report instruments fit the protocol. */
export type ProjectProfile = "physiological_lab" | "ux_usability";

export type QuestionnaireId =
  | "likert_stress"
  | "nasa_tlx"
  | "sus"
  | "sin_autoinforme"
  | "ux_other_self_report"
  | "umux_lite"
  | "attrakdiff"
  | "quis";

export type SelfReportScope = "global" | "per_phase";

/** Which physiological inference the self-report is contrasted with. */
export type PhysiologyMappingMode = "stress" | "cognitive_load" | "both";

export type QuestionnaireDef = {
  id: QuestionnaireId;
  domain: AnalysisDomain;
  buttonLabel: string;
  description: string;
  profiles: ProjectProfile[];
  available: boolean;
  scaleMin?: number;
  scaleMax?: number;
  fixedScope?: SelfReportScope | null;
  defaultPhysiologyMapping: PhysiologyMappingMode;
};

export const PROJECT_PROFILE_META: Record<
  ProjectProfile,
  { label: string; description: string; defaultQuestionnaire: AnalysisDomain }
> = {
  physiological_lab: {
    label: "Physiological lab",
    description:
      "Ordinal self-report by protocol phase and NASA-TLX (0–100) per task, linked to physiological signals.",
    defaultQuestionnaire: "stress",
  },
  ux_usability: {
    label: "UX / usability",
    description:
      "UX research questionnaires comparable with global or per-task physiological activation.",
    defaultQuestionnaire: "usability_sus",
  },
};

export const QUESTIONNAIRE_REGISTRY: QuestionnaireDef[] = [
  {
    id: "sus",
    domain: "usability_sus",
    buttonLabel: "SUS",
    description: "System Usability Scale: 10 items (1–5) → 0–100. Higher score = better usability.",
    profiles: ["ux_usability"],
    available: true,
    scaleMin: 0,
    scaleMax: 100,
    fixedScope: null,
    defaultPhysiologyMapping: "both",
  },
  {
    id: "ux_other_self_report",
    domain: "ux_other_self_report",
    buttonLabel: "Other UX self-report",
    description:
      "Additional UX instruments (UMUX, AttrakDiff, SEQ, etc.) will be supported in future releases.",
    profiles: ["ux_usability"],
    available: false,
    fixedScope: null,
    defaultPhysiologyMapping: "both",
  },
  {
    id: "likert_stress",
    domain: "stress",
    buttonLabel: "Ordinal self-report",
    description: "Integer scale 1–10 by protocol phase (perceived stress per phase).",
    profiles: ["physiological_lab"],
    available: true,
    scaleMin: 1,
    scaleMax: 10,
    fixedScope: "per_phase",
    defaultPhysiologyMapping: "stress",
  },
  {
    id: "nasa_tlx",
    domain: "cognitive",
    buttonLabel: "NASA-TLX",
    description: "Aggregated Task Load Index 0–100 per task or experimental block.",
    profiles: ["physiological_lab"],
    available: true,
    scaleMin: 0,
    scaleMax: 100,
    fixedScope: "per_phase",
    defaultPhysiologyMapping: "cognitive_load",
  },
  {
    id: "sin_autoinforme",
    domain: "sin_autoinforme",
    buttonLabel: "Signals only",
    description: "Demographics and physiological signals without a linked questionnaire.",
    profiles: ["physiological_lab"],
    available: true,
    fixedScope: null,
    defaultPhysiologyMapping: "stress",
  },
  {
    id: "umux_lite",
    domain: "" as AnalysisDomain,
    buttonLabel: "UMUX-Lite",
    description: "Compact usability (2 items + optional global).",
    profiles: ["ux_usability"],
    available: false,
    scaleMin: 0,
    scaleMax: 100,
    fixedScope: "global",
    defaultPhysiologyMapping: "both",
  },
  {
    id: "attrakdiff",
    domain: "" as AnalysisDomain,
    buttonLabel: "AttrakDiff",
    description: "Hedonic and pragmatic appeal (semantic pairs).",
    profiles: ["ux_usability"],
    available: false,
    fixedScope: null,
    defaultPhysiologyMapping: "both",
  },
  {
    id: "quis",
    domain: "" as AnalysisDomain,
    buttonLabel: "QUIS",
    description: "Questionnaire for User Interaction Satisfaction.",
    profiles: ["ux_usability"],
    available: false,
    scaleMin: 0,
    scaleMax: 9,
    fixedScope: "per_phase",
    defaultPhysiologyMapping: "both",
  },
];

export function inferProjectProfile(projectId: string): ProjectProfile {
  if (projectId === "mexihc" || projectId === "ux_uv" || projectId.startsWith("ux-") || projectId.includes("ux_")) {
    return "ux_usability";
  }
  return "physiological_lab";
}

export function normalizeProjectProfile(
  projectId: string,
  profile?: ProjectProfile | string | null,
): ProjectProfile {
  if (profile === "ux_usability" || profile === "physiological_lab") return profile;
  return inferProjectProfile(projectId);
}

export function questionnairesForProfile(profile: ProjectProfile, opts?: { includePlanned?: boolean }) {
  let list = QUESTIONNAIRE_REGISTRY.filter((q) => q.profiles.includes(profile));
  if (profile === "ux_usability") {
    list = list.filter((q) => q.id === "sus" || q.id === "ux_other_self_report");
  }
  if (opts?.includePlanned) return list;
  return list.filter((q) => q.available);
}

export function plannedQuestionnairesForProfile(profile: ProjectProfile) {
  return QUESTIONNAIRE_REGISTRY.filter((q) => q.profiles.includes(profile) && !q.available);
}

export function questionnaireByDomain(domain: AnalysisDomain): QuestionnaireDef | undefined {
  return QUESTIONNAIRE_REGISTRY.find((q) => q.domain === domain && q.available);
}

export const PHYSIOLOGY_MAPPING_OPTIONS: { id: PhysiologyMappingMode; label: string; hint: string }[] = [
  {
    id: "stress",
    label: "Stress",
    hint: "Contrast with transferred stress model activation.",
  },
  {
    id: "cognitive_load",
    label: "Cognitive load",
    hint: "Contrast with window-level inferred cognitive load.",
  },
  {
    id: "both",
    label: "Both",
    hint: "Report vs stress and load.",
  },
];

export function scopeLabel(scope: SelfReportScope): string {
  return scope === "global" ? "Global (full session)" : "Per task";
}

export const SUS_REVERSE_ITEMS = new Set([2, 4, 6, 8, 10]);

export function computeSusScoreFromItems(items: Record<number, string>): number | null {
  let sum = 0;
  for (let i = 1; i <= 10; i++) {
    const raw = items[i]?.trim();
    if (!raw) return null;
    let v = parseInt(raw, 10);
    if (!Number.isFinite(v) || v < 1 || v > 5) return null;
    if (SUS_REVERSE_ITEMS.has(i)) v = 6 - v;
    sum += v;
  }
  return sum * 2.5;
}

export function susInterpretationBand(score: number): { id: string; label: string } {
  if (score >= 71) return { id: "excellent", label: "Excellent (71–100)" };
  if (score >= 51) return { id: "acceptable", label: "Acceptable (51–70)" };
  return { id: "poor", label: "Poor (1–50)" };
}
