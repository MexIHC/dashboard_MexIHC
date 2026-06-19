import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "@/lib/api";
import {
  AnalysisDomain,
  CANONICAL_RAW_SIGNALS,
  MODALITY_PROFILES,
  OrdinalPartition,
  PctBand,
  SexOption,
  STRESS_TIER_OPTIONS,
  StressLikertPartition,
  StressTierId,
  SignalPctPartition,
  UX_MAX_TASKS,
  uxPhasesForCount,
  defaultPctActivationBands,
  defaultPctActivationBandsSkipFirstLikert,
  isStressTierId,
  pctBandsToLegacyCuts,
  stressLikertAutoMap,
  stressLikertRangeValidated,
  suggestedCuts,
} from "@/lib/newAnalysisDefaults";
import {
  PROJECT_PROFILE_META,
  PHYSIOLOGY_MAPPING_OPTIONS,
  QUESTIONNAIRE_REGISTRY,
  computeSusScoreFromItems,
  plannedQuestionnairesForProfile,
  questionnaireByDomain,
  questionnairesForProfile,
  scopeLabel,
  susInterpretationBand,
  type PhysiologyMappingMode,
  type ProjectProfile,
  type SelfReportScope,
} from "@/lib/questionnaireRegistry";
import { useProjects, visibleProjects } from "@/lib/projects";

type CustomDemographic = { id: string; label: string; value: string };

type StressSection = {
  id: string;
  name: string;
  likertValue: string;
};

type CognitiveTask = {
  id: string;
  name: string;
  aggregatedTlx: string;
};

type PhaseTiming = { durationMin: string; notes: string };

type UxOtherSection = {
  id: string;
  name: string;
  score: string;
};

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Límites del protocolo Likert (min/máx del rango permitido). */
function clampProtocolLikertBound(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function clampPctInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function taskFormSlug(task: string): string {
  return task === "Basal" ? "Basal" : task.replace(/\s+/g, "");
}

/** CSV upload per EmotiBit channel. */
function SignalFileInput({
  tag,
  file,
  onChange,
  label,
}: {
  tag: string;
  file: File | null;
  onChange: (tag: string, file: File | null) => void;
  label?: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[280px]">
      <span className="text-xs font-medium text-slate-700">
        {label ?? tag}
        {(tag === "EA" || tag === "UN") && <span className="text-red-600"> *</span>}
      </span>
      <input
        type="file"
        accept=".csv,text/csv"
        className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        onChange={(e) => onChange(tag, e.target.files?.[0] ?? null)}
      />
      {file ? (
        <span className="truncate text-xs text-emerald-700" title={file.name}>
          {file.name}
        </span>
      ) : (
        <span className="text-xs text-slate-400">No file</span>
      )}
    </label>
  );
}

export function UploadPage() {
  const { projects, activeProjectId, setActiveProjectId, createProject } = useProjects();
  const [projectSelectionMode, setProjectSelectionMode] = useState<"existing" | "new">("existing");
  const [selectedProjectId, setSelectedProjectId] = useState("mexihc");
  const [newProjectName, setNewProjectName] = useState("");
  const [projectReady, setProjectReady] = useState(true);

  const [subjectId, setSubjectId] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<SexOption>("");
  const [customDemo, setCustomDemo] = useState<CustomDemographic[]>([]);

  const [selectedSignals, setSelectedSignals] = useState<Record<string, boolean>>({});
  const [modalityProfileId, setModalityProfileId] = useState("");
  const [signalFiles, setSignalFiles] = useState<Record<string, File | null>>({});
  const [signalFilesByTask, setSignalFilesByTask] = useState<Record<string, Record<string, File | null>>>({});

  const [saveState, setSaveState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [savedUserId, setSavedUserId] = useState<string | null>(null);

  const [domain, setDomain] = useState<AnalysisDomain>("");

  const [likertMin, setLikertMin] = useState("");
  const [likertMax, setLikertMax] = useState("");
  const [likertPartitionParts, setLikertPartitionParts] = useState<StressLikertPartition>(5);
  const [likertValueToStressTier, setLikertValueToStressTier] = useState<Record<string, StressTierId>>({});

  type StressBaselineLikertMode = "no_aplica" | "sin_estres_primer_valor_basal";
  const [stressBaselineLikertMode, setStressBaselineLikertMode] = useState<StressBaselineLikertMode>("no_aplica");
  const [stressBaselineNote, setStressBaselineNote] = useState("");
  const [stressGlobal, setStressGlobal] = useState("");
  const [stressSections, setStressSections] = useState<StressSection[]>([{ id: newId(), name: "", likertValue: "" }]);

  const [signalPctParts, setSignalPctParts] = useState<SignalPctPartition>(5);
  const [signalPctBands, setSignalPctBands] = useState<PctBand[]>(() => defaultPctActivationBands(5));

  const [cognitiveTasks, setCognitiveTasks] = useState<CognitiveTask[]>([{ id: newId(), name: "", aggregatedTlx: "" }]);

  const [tlxPartitionMode, setTlxPartitionMode] = useState<OrdinalPartition>("cuartiles");
  const [tlxCut1, setTlxCut1] = useState("25");
  const [tlxCut2, setTlxCut2] = useState("50");
  const [tlxCut3, setTlxCut3] = useState("75");
  const [tlxCut4, setTlxCut4] = useState("80");

  const [globalSessionDurationMin, setGlobalSessionDurationMin] = useState("");
  const [uxTaskCount, setUxTaskCount] = useState(0);
  const [phaseTiming, setPhaseTiming] = useState<Record<string, PhaseTiming>>({});

  type SusInputMode = "items" | "score";
  const [susInputMode, setSusInputMode] = useState<SusInputMode>("items");
  const [susItems, setSusItems] = useState<Record<number, string>>(() =>
    Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, ""])),
  );
  const [susScoreDirect, setSusScoreDirect] = useState("");
  const [susNotes, setSusNotes] = useState("");

  const [uxInstrumentName, setUxInstrumentName] = useState("");
  const [uxInstrumentScore, setUxInstrumentScore] = useState("");
  const [uxInstrumentScale, setUxInstrumentScale] = useState("");
  const [uxInstrumentNotes, setUxInstrumentNotes] = useState("");
  const [uxSelfReportScope, setUxSelfReportScope] = useState<SelfReportScope>("global");
  const [uxOtherSections, setUxOtherSections] = useState<UxOtherSection[]>([
    { id: newId(), name: "", score: "" },
  ]);
  const [physiologyMapping, setPhysiologyMapping] = useState<PhysiologyMappingMode>("both");

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  );
  const projectProfile: ProjectProfile = selectedProject?.profile ?? "physiological_lab";
  const availableQuestionnaires = useMemo(() => questionnairesForProfile(projectProfile), [projectProfile]);
  const plannedQuestionnaires = useMemo(() => plannedQuestionnairesForProfile(projectProfile), [projectProfile]);
  const allowedDomains = useMemo(
    () => new Set(availableQuestionnaires.map((q) => q.domain)),
    [availableQuestionnaires],
  );

  const susComputedScore = useMemo(() => {
    if (susInputMode === "score") {
      const v = parseFloat(susScoreDirect);
      if (!Number.isFinite(v) || v < 0 || v > 100) return null;
      return v;
    }
    return computeSusScoreFromItems(susItems);
  }, [susInputMode, susScoreDirect, susItems]);

  useEffect(() => {
    if (!projectReady) return;
    if (domain && !allowedDomains.has(domain)) setDomain("");
  }, [projectReady, domain, allowedDomains]);

  useEffect(() => {
    if (!projectReady || domain !== "") return;
    setDomain(PROJECT_PROFILE_META[projectProfile].defaultQuestionnaire);
  }, [projectReady, projectProfile, domain]);

  const activeQuestionnaire = useMemo(
    () => (domain ? questionnaireByDomain(domain) : undefined),
    [domain],
  );

  useEffect(() => {
    if (!activeQuestionnaire) return;
    setPhysiologyMapping(activeQuestionnaire.defaultPhysiologyMapping);
    if (activeQuestionnaire.fixedScope === "global") setUxSelfReportScope("global");
    if (activeQuestionnaire.fixedScope === "per_phase") setUxSelfReportScope("per_phase");
  }, [activeQuestionnaire?.id]);

  const effectiveSelfReportScope = useMemo((): SelfReportScope | null => {
    if (!domain || domain === "sin_autoinforme") return null;
    if (activeQuestionnaire?.fixedScope) return activeQuestionnaire.fixedScope;
    if (domain === "usability_sus" || domain === "ux_other_self_report") return uxSelfReportScope;
    if (domain === "stress" || domain === "cognitive") return "per_phase";
    return "global";
  }, [domain, activeQuestionnaire, uxSelfReportScope]);

  const questionnaireChoices = useMemo(() => {
    if (projectProfile === "ux_usability") {
      return QUESTIONNAIRE_REGISTRY.filter((q) => q.id === "sus" || q.id === "ux_other_self_report");
    }
    return availableQuestionnaires;
  }, [projectProfile, availableQuestionnaires]);

  const likertValues = useMemo(() => {
    if (likertMin.trim() === "" || likertMax.trim() === "") return null;
    const lo = parseInt(likertMin, 10);
    const hi = parseInt(likertMax, 10);
    return stressLikertRangeValidated(lo, hi);
  }, [likertMin, likertMax]);

  useEffect(() => {
    if (!likertValues || likertValues.length === 0) {
      setLikertValueToStressTier({});
      return;
    }
    setLikertValueToStressTier(stressLikertAutoMap(likertValues, likertPartitionParts));
  }, [likertValues, likertPartitionParts]);

  useEffect(() => {
    if (domain !== "stress") {
      setSignalPctBands(defaultPctActivationBands(signalPctParts));
      return;
    }
    const skipFirst = stressBaselineLikertMode === "sin_estres_primer_valor_basal";
    setSignalPctBands(
      skipFirst ? defaultPctActivationBandsSkipFirstLikert(signalPctParts) : defaultPctActivationBands(signalPctParts),
    );
  }, [domain, signalPctParts, stressBaselineLikertMode]);

  useEffect(() => {
    setSelectedProjectId(activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    if (tlxPartitionMode === "custom") return;
    const c = suggestedCuts(100, tlxPartitionMode);
    if (c.length === 2) {
      setTlxCut1(c[0]!);
      setTlxCut2(c[1]!);
      setTlxCut3("");
      setTlxCut4("");
    } else if (c.length === 3) {
      setTlxCut1(c[0]!);
      setTlxCut2(c[1]!);
      setTlxCut3(c[2]!);
      setTlxCut4("");
    } else {
      setTlxCut1(c[0]!);
      setTlxCut2(c[1]!);
      setTlxCut3(c[2]!);
      setTlxCut4(c[3]!);
    }
  }, [tlxPartitionMode]);

  const selectModalityProfile = (id: string) => {
    const profile = MODALITY_PROFILES.find((p) => p.id === id);
    if (!profile) return;
    setModalityProfileId(id);
    const next: Record<string, boolean> = {};
    for (const { tag } of CANONICAL_RAW_SIGNALS) {
      next[tag] = profile.tags.includes(tag);
    }
    setSelectedSignals(next);
    setSignalFiles({});
    setSignalFilesByTask({});
  };

  const setSignalFile = (tag: string, file: File | null) => {
    setSignalFiles((f) => ({ ...f, [tag]: file }));
  };

  const setSignalFileForTask = (task: string, tag: string, file: File | null) => {
    setSignalFilesByTask((prev) => ({
      ...prev,
      [task]: { ...(prev[task] ?? {}), [tag]: file },
    }));
  };

  const selectedSignalList = useMemo(
    () => CANONICAL_RAW_SIGNALS.map((x) => x.tag).filter((t) => selectedSignals[t]),
    [selectedSignals],
  );

  const signalPctCutsPayload = useMemo(() => pctBandsToLegacyCuts(signalPctBands), [signalPctBands]);

  const signalPctRowLikertLabels = useMemo(() => {
    if (domain !== "stress" || !likertValues?.length) {
      return signalPctBands.map(() => null as number | null);
    }
    const skip = stressBaselineLikertMode === "sin_estres_primer_valor_basal";
    if (skip) {
      return signalPctBands.map((_, i) => likertValues[i + 1] ?? null);
    }
    return signalPctBands.map((_, i) => likertValues[i] ?? null);
  }, [domain, likertValues, stressBaselineLikertMode, signalPctBands]);

  const signalPctBandsPayload = useMemo(
    () =>
      signalPctBands.map((b, i) => ({
        ordinal: i + 1,
        min_pct: b.min,
        max_pct: b.max,
        mapped_likert_value: signalPctRowLikertLabels[i],
      })),
    [signalPctBands, signalPctRowLikertLabels],
  );

  const tlxCutsPayload = useMemo(() => {
    return [tlxCut1, tlxCut2, tlxCut3, tlxCut4].filter((x) => x.trim() !== "");
  }, [tlxCut1, tlxCut2, tlxCut3, tlxCut4]);

  const addCustomDemo = () => {
    setCustomDemo((rows) => [...rows, { id: newId(), label: "", value: "" }]);
  };

  const updateCustomDemo = (id: string, field: "label" | "value", v: string) => {
    setCustomDemo((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: v } : r)));
  };

  const removeCustomDemo = (id: string) => {
    setCustomDemo((rows) => rows.filter((r) => r.id !== id));
  };

  const addStressSection = () => {
    setStressSections((s) => [...s, { id: newId(), name: "", likertValue: "" }]);
  };

  const updateStressSection = (id: string, field: "name" | "likertValue", v: string) => {
    setStressSections((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: v } : r)));
  };

  const onStressSectionLikertNumber = (id: string, raw: string) => {
    if (raw.trim() === "") {
      updateStressSection(id, "likertValue", "");
      return;
    }
    if (!likertValues?.length) return;
    const lo = likertValues[0]!;
    const hi = likertValues[likertValues.length - 1]!;
    const n = Math.round(parseInt(raw, 10));
    if (Number.isNaN(n)) return;
    updateStressSection(id, "likertValue", String(Math.max(lo, Math.min(hi, n))));
  };

  const removeStressSection = (id: string) => {
    setStressSections((rows) => rows.filter((r) => r.id !== id));
  };

  const addCognitiveTask = () => {
    setCognitiveTasks((t) => [...t, { id: newId(), name: "", aggregatedTlx: "" }]);
  };

  const updateCognitiveTask = (id: string, field: "name" | "aggregatedTlx", v: string) => {
    setCognitiveTasks((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: v } : r)));
  };

  const removeCognitiveTask = (id: string) => {
    setCognitiveTasks((rows) => rows.filter((r) => r.id !== id));
  };

  const addUxOtherSection = () => {
    setUxOtherSections((rows) => [...rows, { id: newId(), name: "", score: "" }]);
  };

  const updateUxOtherSection = (id: string, field: "name" | "score", v: string) => {
    setUxOtherSections((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: v } : r)));
  };

  const removeUxOtherSection = (id: string) => {
    setUxOtherSections((rows) => rows.filter((r) => r.id !== id));
  };

  const setStressTierForLikertValue = (val: string, tier: StressTierId) => {
    setLikertValueToStressTier((m) => ({ ...m, [val]: tier }));
  };

  const onLikertMinNumber = (raw: string) => {
    if (raw.trim() === "") {
      setLikertMin("");
      return;
    }
    const lo = clampProtocolLikertBound(parseInt(raw, 10));
    setLikertMin(String(lo));
    if (likertMax.trim() !== "") {
      let hi = clampProtocolLikertBound(parseInt(likertMax, 10));
      if (hi < lo) hi = lo;
      if (hi > lo + 9) hi = lo + 9;
      setLikertMax(String(hi));
    }
  };

  const onLikertMaxNumber = (raw: string) => {
    if (raw.trim() === "") {
      setLikertMax("");
      return;
    }
    let hi = clampProtocolLikertBound(parseInt(raw, 10));
    if (likertMin.trim() !== "") {
      const lo = clampProtocolLikertBound(parseInt(likertMin, 10));
      if (hi < lo) hi = lo;
      if (hi > lo + 9) hi = lo + 9;
    }
    setLikertMax(String(hi));
  };

  const onLikertWithinDeclaredRange = (raw: string, setV: (s: string) => void) => {
    if (raw.trim() === "") {
      setV("");
      return;
    }
    if (!likertValues?.length) {
      setV(String(clampProtocolLikertBound(parseInt(raw, 10))));
      return;
    }
    const lo = likertValues[0]!;
    const hi = likertValues[likertValues.length - 1]!;
    const n = Math.round(parseInt(raw, 10));
    if (Number.isNaN(n)) return;
    setV(String(Math.max(lo, Math.min(hi, n))));
  };

  const setPctBandField = (idx: number, field: "min" | "max", raw: string) => {
    if (raw.trim() === "") return;
    const v = clampPctInt(parseInt(raw, 10));
    setSignalPctBands((rows) => {
      const next = rows.map((r, i) => (i === idx ? { ...r, [field]: v } : r));
      const cur = next[idx]!;
      if (cur.min > cur.max) {
        if (field === "min") next[idx] = { min: cur.min, max: cur.min };
        else next[idx] = { min: cur.max, max: cur.max };
      }
      return next;
    });
  };

  const attachToExistingProject = () => {
    setActiveProjectId(selectedProjectId);
    const p = projects.find((x) => x.id === selectedProjectId);
    const prof = p?.profile ?? "physiological_lab";
    setDomain(PROJECT_PROFILE_META[prof].defaultQuestionnaire);
    setProjectReady(true);
  };

  const createAndAttachProject = () => {
    const p = createProject(newProjectName, "ux_usability");
    if (!p) return;
    setSelectedProjectId(p.id);
    setDomain(PROJECT_PROFILE_META[p.profile].defaultQuestionnaire);
    setProjectReady(true);
    setNewProjectName("");
  };

  const baseFormReady = subjectId.trim() !== "" && domain !== "";
  const stressReady =
    domain !== "stress"
      ? true
      : !!(likertValues?.length && stressGlobal.trim() && stressSections.some((s) => s.name.trim() && s.likertValue.trim()));
  const cognitiveReady =
    domain !== "cognitive" ? true : cognitiveTasks.some((t) => t.name.trim() && t.aggregatedTlx.trim());
  const usabilityReady = domain !== "usability_sus" ? true : susComputedScore != null;
  const uxOtherReady =
    domain !== "ux_other_self_report"
      ? true
      : !!uxInstrumentName.trim() &&
        (uxSelfReportScope === "global"
          ? !!uxInstrumentScore.trim()
          : uxOtherSections.some((s) => s.name.trim() && s.score.trim()));
  const uxPerTaskSignals =
    projectProfile === "ux_usability" && uxSelfReportScope === "per_phase";

  const activeUxPhases = useMemo(
    () => (uxPerTaskSignals ? uxPhasesForCount(uxTaskCount) : []),
    [uxPerTaskSignals, uxTaskCount],
  );

  useEffect(() => {
    const keep = new Set(activeUxPhases);
    setSignalFilesByTask((prev) => {
      const next: Record<string, Record<string, File | null>> = {};
      for (const phase of keep) {
        if (prev[phase]) next[phase] = prev[phase];
      }
      return next;
    });
    setPhaseTiming((prev) => {
      const next: Record<string, PhaseTiming> = {};
      for (const phase of keep) {
        next[phase] = prev[phase] ?? { durationMin: "", notes: "" };
      }
      return next;
    });
  }, [activeUxPhases]);

  const setPhaseTimingField = (phase: string, field: keyof PhaseTiming, value: string) => {
    setPhaseTiming((prev) => ({
      ...prev,
      [phase]: { ...(prev[phase] ?? { durationMin: "", notes: "" }), [field]: value },
    }));
  };

  const uploadedSignalTags = useMemo(() => {
    if (uxPerTaskSignals) {
      const tags = new Set<string>();
      for (const task of activeUxPhases) {
        for (const tag of selectedSignalList) {
          if (signalFilesByTask[task]?.[tag]) tags.add(tag);
        }
      }
      return [...tags];
    }
    return selectedSignalList.filter((t) => signalFiles[t] != null);
  }, [uxPerTaskSignals, activeUxPhases, selectedSignalList, signalFiles, signalFilesByTask]);
  const hasInferenceInputs = uploadedSignalTags.includes("EA");
  const canSaveParticipant =
    baseFormReady && stressReady && cognitiveReady && usabilityReady && uxOtherReady && saveState !== "saving";

  const buildPayload = useCallback(() => {
    return {
      version: "new_analysis_draft_v2",
      project_id: selectedProjectId,
      project_profile: projectProfile,
      questionnaire_id: availableQuestionnaires.find((q) => q.domain === domain)?.id ?? null,
      demographics: {
        subject_id: subjectId.trim(),
        age: age.trim(),
        sex,
        custom: customDemo.filter((r) => r.label.trim() || r.value.trim()),
      },
      signals_selected: selectedSignalList,
      modality_profile_id: modalityProfileId || null,
      domain,
      self_report_meta:
        domain && domain !== "sin_autoinforme"
          ? {
              scope: effectiveSelfReportScope,
              physiology_mapping: physiologyMapping,
            }
          : null,
      stress:
        domain === "stress"
          ? {
              self_report_scope: "per_phase",
              physiology_mapping: physiologyMapping,
              likert_range: { min: likertMin.trim(), max: likertMax.trim() },
              likert_partition_parts: likertPartitionParts,
              likert_value_to_stress_tier: likertValueToStressTier,
              baseline: {
                likert_sin_estres_mode:
                  stressBaselineLikertMode === "sin_estres_primer_valor_basal"
                    ? "sin_estres_es_primer_valor_likert"
                    : "no_aplica",
                note: stressBaselineNote.trim(),
              },
              global_perceived_stress: stressGlobal.trim(),
              sections: stressSections.map((s) => ({
                name: s.name.trim(),
                likert: s.likertValue.trim(),
              })),
              signal_pct_partition_parts: signalPctParts,
              signal_pct_bands: signalPctBandsPayload,
              signal_pct_cuts: signalPctCutsPayload,
            }
          : null,
      usability:
        domain === "usability_sus"
          ? {
              instrument: "SUS",
              self_report_scope: uxSelfReportScope,
              physiology_mapping: physiologyMapping,
              input_mode: susInputMode,
              sus_score_0_100: susComputedScore != null ? String(susComputedScore) : "",
              items_1_5:
                susInputMode === "items"
                  ? Object.fromEntries(
                      Array.from({ length: 10 }, (_, i) => {
                        const n = i + 1;
                        return [`SUS_Q${n}`, susItems[n]?.trim() ?? ""];
                      }),
                    )
                  : null,
              interpretation_band:
                susComputedScore != null ? susInterpretationBand(susComputedScore).label : null,
              notes: susNotes.trim(),
              signal_pct_partition_parts: signalPctParts,
              signal_pct_bands: signalPctBandsPayload,
              signal_pct_cuts: signalPctCutsPayload,
            }
          : null,
      ux_other_self_report:
        domain === "ux_other_self_report"
          ? {
              instrument_name: uxInstrumentName.trim(),
              self_report_scope: uxSelfReportScope,
              physiology_mapping: physiologyMapping,
              score_or_value: uxSelfReportScope === "global" ? uxInstrumentScore.trim() : null,
              sections:
                uxSelfReportScope === "per_phase"
                  ? uxOtherSections.map((s) => ({
                      name: s.name.trim(),
                      score: s.score.trim(),
                    }))
                  : null,
              scale_description: uxInstrumentScale.trim(),
              notes: uxInstrumentNotes.trim(),
              signal_pct_partition_parts: signalPctParts,
              signal_pct_bands: signalPctBandsPayload,
              signal_pct_cuts: signalPctCutsPayload,
            }
          : null,
      cognitive:
        domain === "cognitive"
          ? {
              self_report_scope: "per_phase",
              physiology_mapping: physiologyMapping,
              tasks: cognitiveTasks.map((t) => ({
                name: t.name.trim(),
                nasa_tlx_0_100: t.aggregatedTlx.trim(),
              })),
              tlx_ordinal_mode: tlxPartitionMode,
              tlx_cuts_0_100: tlxCutsPayload,
              signal_pct_partition_parts: signalPctParts,
              signal_pct_bands: signalPctBandsPayload,
              signal_pct_cuts: signalPctCutsPayload,
            }
          : null,
      optional_timing:
        projectProfile === "ux_usability"
          ? uxPerTaskSignals && uxTaskCount > 0
            ? {
                scope: "per_phase",
                task_count: uxTaskCount,
                phases: activeUxPhases.map((phase) => ({
                  name: phase,
                  duration_minutes: phaseTiming[phase]?.durationMin?.trim() ?? "",
                  notes: phaseTiming[phase]?.notes?.trim() ?? "",
                })),
              }
            : {
                scope: "global",
                experiment_duration_minutes: globalSessionDurationMin.trim(),
              }
          : null,
    };
  }, [
    subjectId,
    selectedProjectId,
    projectProfile,
    availableQuestionnaires,
    age,
    sex,
    customDemo,
    selectedSignalList,
    domain,
    likertMin,
    likertMax,
    likertPartitionParts,
    likertValueToStressTier,
    stressBaselineLikertMode,
    stressBaselineNote,
    stressGlobal,
    stressSections,
    signalPctParts,
    signalPctBandsPayload,
    signalPctCutsPayload,
    cognitiveTasks,
    tlxPartitionMode,
    tlxCutsPayload,
    globalSessionDurationMin,
    uxTaskCount,
    activeUxPhases,
    phaseTiming,
    uxPerTaskSignals,
    susInputMode,
    susItems,
    susScoreDirect,
    susComputedScore,
    susNotes,
    uxInstrumentName,
    uxInstrumentScore,
    uxInstrumentScale,
    uxInstrumentNotes,
    uxSelfReportScope,
    uxOtherSections,
    physiologyMapping,
    effectiveSelfReportScope,
    activeQuestionnaire,
  ]);

  const saveParticipant = async () => {
    if (!canSaveParticipant) return;
    setSaveState("saving");
    setSaveMessage("");
    setSavedUserId(null);

    const form = new FormData();
    form.append("payload", JSON.stringify(buildPayload()));
    const perTaskSignals = uxPerTaskSignals;
    if (perTaskSignals) {
      for (const task of activeUxPhases) {
        for (const tag of selectedSignalList) {
          const file = signalFilesByTask[task]?.[tag];
          if (file) form.append(`signal_${taskFormSlug(task)}_${tag}`, file, file.name);
        }
      }
    } else {
      for (const tag of selectedSignalList) {
        const file = signalFiles[tag];
        if (file) form.append(`signal_${tag}`, file, file.name);
      }
    }

    try {
      const r = await fetch(apiUrl(`/api/v1/projects/${encodeURIComponent(selectedProjectId)}/participants`), {
        method: "POST",
        body: form,
      });
      const data = (await r.json()) as { message?: string; user_id?: string; detail?: string };
      if (!r.ok) {
        setSaveState("error");
        setSaveMessage(typeof data.detail === "string" ? data.detail : "Could not save participant.");
        return;
      }
      setSaveState("ok");
      setSaveMessage(data.message ?? "Participant saved.");
      setSavedUserId(data.user_id ?? null);
    } catch {
      setSaveState("error");
      setSaveMessage("Network error contacting the API. Is the backend running?");
    }
  };

  const inputCls =
    "mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400";

  const renderScopeSelector = (fixedScope: SelfReportScope | null | undefined) => (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-indigo-900">Self-report scope</p>
      {fixedScope != null ? (
        <p className="mt-1 text-sm text-slate-800">
          <strong>{scopeLabel(fixedScope)}</strong>
          {fixedScope === "global" ? (
            <span className="mt-1 block text-xs font-normal text-slate-600">
              One score at the end of the session (e.g. global SUS).
            </span>
          ) : (
            <span className="mt-1 block text-xs font-normal text-slate-600">
              One value per protocol phase or task (e.g. per-task SUS).
            </span>
          )}
        </p>
      ) : (
        <fieldset className="mt-2 flex flex-wrap gap-2">
          {(["global", "per_phase"] as SelfReportScope[]).map((sc) => (
            <label
              key={sc}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${
                uxSelfReportScope === sc
                  ? "border-indigo-700 bg-indigo-700 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="ux-self-report-scope"
                className="sr-only"
                checked={uxSelfReportScope === sc}
                onChange={() => {
                  setUxSelfReportScope(sc);
                  if (sc === "global") setUxTaskCount(0);
                }}
              />
              {scopeLabel(sc)}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );

  const renderPhysiologyMapping = () => (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-sm font-medium text-slate-800">Contrast with physiological signals</p>
      <p className="mt-1 text-xs text-slate-500">
        Choose whether the self-report is validated against stress, cognitive load, or both.
      </p>
      <fieldset className="mt-3 space-y-2">
        {PHYSIOLOGY_MAPPING_OPTIONS.map((opt) => (
          <label key={opt.id} className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              type="radio"
              name="physiology-mapping"
              className="mt-1"
              checked={physiologyMapping === opt.id}
              onChange={() => setPhysiologyMapping(opt.id)}
            />
            <span>
              <strong>{opt.label}</strong>
              <span className="mt-0.5 block text-xs font-normal text-slate-500">{opt.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );

  const renderScopeAndMapping = (fixedScope: SelfReportScope | null | undefined) => (
    <div className="space-y-4">
      {renderScopeSelector(fixedScope)}
      {renderPhysiologyMapping()}
    </div>
  );

  const tlxPartitionHelp = () => (
    <p className="mt-1 text-xs text-slate-500">
      Cortes en la escala NASA-TLX agregada <strong>0–100</strong>. Al elegir terciles, cuartiles o quintiles se
      rellenan valores recomendados; en <strong>Personalizado</strong> los editas libremente.
    </p>
  );

  const partitionSelect = (
    value: OrdinalPartition,
    onChange: (m: OrdinalPartition) => void,
    id: string,
  ) => (
    <select
      id={id}
      className={inputCls}
      value={value}
      onChange={(e) => onChange(e.target.value as OrdinalPartition)}
    >
      <option value="terciles">Terciles (3 bandas)</option>
      <option value="cuartiles">Cuartiles (4 bandas)</option>
      <option value="quintiles">Quintiles (5 bandas)</option>
      <option value="custom">Personalizado</option>
    </select>
  );

  const tlxCutFields = () => {
    const n =
      tlxPartitionMode === "terciles" ? 2 : tlxPartitionMode === "cuartiles" ? 3 : tlxPartitionMode === "quintiles" ? 4 : 4;
    const setters = [setTlxCut1, setTlxCut2, setTlxCut3, setTlxCut4];
    const vals = [tlxCut1, tlxCut2, tlxCut3, tlxCut4];
    const labels =
      tlxPartitionMode === "terciles"
        ? ["Corte 1 (0–100)", "Corte 2 (0–100)"]
        : tlxPartitionMode === "cuartiles"
          ? ["Corte 1 (0–100)", "Corte 2 (0–100)", "Corte 3 (0–100)"]
          : ["Corte 1 (0–100)", "Corte 2 (0–100)", "Corte 3 (0–100)", "Corte 4 (0–100)"];

    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: n }, (_, i) => (
          <label key={i} className="text-xs font-medium text-slate-600">
            {labels[i] ?? `Corte ${i + 1}`}
            <input
              className={inputCls}
              value={vals[i] ?? ""}
              onChange={(e) => setters[i]?.(e.target.value)}
            />
          </label>
        ))}
      </div>
    );
  };

  if (!projectReady) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-16">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold text-slate-900">New analysis</h2>
          <p className="mt-2 text-sm text-slate-600">
            Choose whether to attach this analysis to an existing project or create a new one before capturing the
            study configuration.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setProjectSelectionMode("existing")}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                projectSelectionMode === "existing"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Select existing project
            </button>
            <button
              type="button"
              onClick={() => setProjectSelectionMode("new")}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                projectSelectionMode === "new"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Create new project
            </button>
          </div>

          {projectSelectionMode === "existing" ? (
            <div className="mt-5 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Available project
                <select
                  className={inputCls}
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                >
                  {visibleProjects(projects).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({PROJECT_PROFILE_META[p.profile].label})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={attachToExistingProject}
                className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Continue with project
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                New project name
                <input
                  className={inputCls}
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Example: Portal usability study"
                />
              </label>
              <p className="text-xs text-slate-500">New projects use the UX / usability profile.</p>
              <button
                type="button"
                onClick={createAndAttachProject}
                disabled={!newProjectName.trim()}
                className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create project and continue
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">New analysis</h2>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Project: {selectedProject?.name ?? selectedProjectId} ·{" "}
          {PROJECT_PROFILE_META[projectProfile].label}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {PROJECT_PROFILE_META[projectProfile].description} Complete demographics and questionnaire, upload signals if
          available, and click <strong>Save participant</strong> to feed the project cohort and charts.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold tracking-wide text-slate-700">Demographics</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Participant ID <span className="text-red-600">*</span>
            <input
              className={inputCls}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="Unique identifier"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Age
            <input
              className={inputCls}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Years"
              inputMode="numeric"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
            Gender
            <select
              className={inputCls}
              value={sex}
              onChange={(e) => setSex(e.target.value as SexOption)}
            >
              <option value="">— Select —</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </label>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-800">Additional fields (optional)</p>
            <button
              type="button"
              onClick={addCustomDemo}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              + Add field
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Free label and value (demographics or other protocol variables).
          </p>
          <ul className="mt-3 space-y-2">
            {customDemo.map((row) => (
              <li key={row.id} className="flex flex-wrap items-end gap-2">
                <input
                  className={`${inputCls} min-w-[140px] flex-1`}
                  value={row.label}
                  onChange={(e) => updateCustomDemo(row.id, "label", e.target.value)}
                  placeholder="Question label"
                />
                <input
                  className={`${inputCls} min-w-[140px] flex-1`}
                  value={row.value}
                  onChange={(e) => updateCustomDemo(row.id, "value", e.target.value)}
                  placeholder="Answer"
                />
                <button
                  type="button"
                  onClick={() => removeCustomDemo(row.id)}
                  className="rounded-md px-2 py-2 text-xs text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          2. Physiological signals
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Select one modality profile (tags <strong>PG</strong>, <strong>PR</strong>, <strong>PI</strong>,{" "}
          <strong>EA</strong>, <strong>TH</strong>). CSV column names must match exactly. Signals must be aligned
          (same rows / same time base per window).
        </p>

        {projectProfile === "ux_usability" ? (
          <div className="mt-4 space-y-4">
            {renderScopeSelector(null)}
            {uxPerTaskSignals ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <label className="block text-sm font-medium text-slate-700" htmlFor="ux-task-count">
                  Number of tasks
                </label>
                <select
                  id="ux-task-count"
                  className={inputCls}
                  value={uxTaskCount > 0 ? String(uxTaskCount) : ""}
                  onChange={(e) => setUxTaskCount(e.target.value ? Number(e.target.value) : 0)}
                >
                  <option value="">— Select —</option>
                  {Array.from({ length: UX_MAX_TASKS }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Phases shown: <strong>Basal</strong> plus <strong>Task 1</strong> … <strong>Task {uxTaskCount || "N"}</strong>.
                  Select a count to enable per-phase signal uploads.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MODALITY_PROFILES.map((profile) => (
            <label
              key={profile.id}
              htmlFor={`modality-${profile.id}`}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition ${
                modalityProfileId === profile.id
                  ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                id={`modality-${profile.id}`}
                name="modality-profile"
                checked={modalityProfileId === profile.id}
                onChange={() => selectModalityProfile(profile.id)}
                className="h-4 w-4 shrink-0 border-slate-300"
              />
              <span className="font-mono text-sm font-semibold text-slate-800">{profile.label}</span>
            </label>
          ))}
        </div>
        {!modalityProfileId && (
          <p className="mt-3 text-xs text-amber-700">
            You can save demographics and questionnaire without signals; pick a modality above to enable CSV uploads.
          </p>
        )}

        {selectedSignalList.length > 0 && (
          <div className="mt-6 border-t border-slate-100 pt-4">
            {uxPerTaskSignals ? (
              uxTaskCount < 1 ? (
                <p className="text-xs text-amber-700">
                  Select the <strong>number of tasks</strong> above to configure per-phase CSV uploads.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-800">CSV files per phase and signal</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Upload one CSV per phase for each tag in the selected modality. Duration and notes are optional.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {activeUxPhases.map((phase) => (
                      <div key={phase} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{phase}</p>
                        <div className="mt-3 flex flex-col gap-3">
                          {selectedSignalList.map((tag) => (
                            <SignalFileInput
                              key={`${phase}-${tag}`}
                              tag={tag}
                              label={tag}
                              file={signalFilesByTask[phase]?.[tag] ?? null}
                              onChange={(_, file) => setSignalFileForTask(phase, tag, file)}
                            />
                          ))}
                        </div>
                        <label className="mt-3 block text-xs font-medium text-slate-700">
                          Approximate duration (minutes, optional)
                          <input
                            className={inputCls}
                            value={phaseTiming[phase]?.durationMin ?? ""}
                            onChange={(e) => setPhaseTimingField(phase, "durationMin", e.target.value)}
                            placeholder="Minutes"
                            inputMode="decimal"
                          />
                        </label>
                        <label className="mt-2 block text-xs font-medium text-slate-700">
                          Notes (optional)
                          <textarea
                            className={`${inputCls} min-h-[64px]`}
                            value={phaseTiming[phase]?.notes ?? ""}
                            onChange={(e) => setPhaseTimingField(phase, "notes", e.target.value)}
                            placeholder="Breaks, incidents, protocol details…"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </>
              )
            ) : (
              <>
                <p className="text-sm font-medium text-slate-800">CSV files per channel (optional)</p>
                <p className="mt-1 text-xs text-slate-500">
                  EmotiBit format: one file per tag (e.g. <code className="rounded bg-slate-100 px-1">*_EA.csv</code>,{" "}
                  <code className="rounded bg-slate-100 px-1">*_PG.csv</code>). EA enables inference when saved.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {selectedSignalList.map((tag) => (
                    <SignalFileInput
                      key={tag}
                      tag={tag}
                      file={signalFiles[tag] ?? null}
                      onChange={setSignalFile}
                    />
                  ))}
                </div>
                {projectProfile === "ux_usability" ? (
                  <label className="mt-4 block text-sm font-medium text-slate-700">
                    Approximate total duration (minutes, optional)
                    <input
                      className={inputCls}
                      value={globalSessionDurationMin}
                      onChange={(e) => setGlobalSessionDurationMin(e.target.value)}
                      placeholder="Minutes"
                      inputMode="decimal"
                    />
                  </label>
                ) : null}
              </>
            )}
            {uploadedSignalTags.length > 0 && !hasInferenceInputs && !selectedSignalList.includes("EA") && (
              <p className="mt-2 text-xs text-amber-700">
                Uploaded {uploadedSignalTags.join(", ")}. For automatic inference, pick a modality that includes EA.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          3. Questionnaire / self-report
        </h3>
        <p className="mt-2 text-xs text-slate-500">
          {projectProfile === "ux_usability"
            ? "UX profile: SUS is validated for entry. Additional UX self-report instruments will be supported in future releases."
            : "Physiological lab profile: ordinal self-report and NASA-TLX."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {questionnaireChoices.map((q) => (
            <button
              key={q.id}
              type="button"
              disabled={!q.available}
              title={q.available ? q.description : "Not available yet"}
              onClick={() => q.available && setDomain(q.domain)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                !q.available
                  ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                  : domain === q.domain
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {q.buttonLabel}
            </button>
          ))}
        </div>

        {projectProfile === "ux_usability" ? (
          <p className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <strong>Other UX self-report:</strong> only SUS entry is validated for now. Future work will add UMUX,
            AttrakDiff, SEQ, and other UX instruments.
          </p>
        ) : plannedQuestionnaires.length > 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-600">Próximamente (mismo perfil UX)</p>
            <ul className="mt-1 list-inside list-disc text-xs text-slate-500">
              {plannedQuestionnaires.map((q) => (
                <li key={q.id}>
                  {q.buttonLabel} — {q.description}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {domain === "sin_autoinforme" ? (
          <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
            Only <strong>demographics</strong> and <strong>physiological signals</strong> will be used, with no linked
            questionnaire.
          </p>
        ) : null}

        {domain === "stress" && (
          <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
            {renderScopeAndMapping("per_phase")}
            <p className="text-sm text-slate-600">
              Escala ordinal <strong>1–10</strong> por etapa. Define el rango y cómo cada valor se asocia a niveles de
              activación frente a la señal.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Mínimo (1–10)
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  inputMode="numeric"
                  className={inputCls}
                  value={likertMin}
                  onChange={(e) => onLikertMinNumber(e.target.value)}
                  placeholder="1"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Máximo (1–10)
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  inputMode="numeric"
                  className={inputCls}
                  value={likertMax}
                  onChange={(e) => onLikertMaxNumber(e.target.value)}
                  placeholder="10"
                />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              El rango admite como máximo <strong>10</strong> enteros consecutivos dentro de <strong>1–10</strong>; al
              ajustar el mínimo o el máximo, el otro extremo se recorta si hace falta.
            </p>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <label className="text-sm font-medium text-slate-800" htmlFor="likert-partition">
                Partición del rango (número de grupos)
              </label>
              <select
                id="likert-partition"
                className={inputCls}
                value={likertPartitionParts}
                onChange={(e) => setLikertPartitionParts(Number(e.target.value) as StressLikertPartition)}
              >
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Divide el rango en grupos contiguos; cada grupo recibe un estado de activación percibida.
              </p>
              {likertValues && likertValues.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[280px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                        <th className="py-2 pr-2">Valor</th>
                        <th className="py-2">Estado percibido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {likertValues.map((v) => (
                        <tr key={v} className="border-b border-slate-100">
                          <td className="py-2 pr-2 font-mono font-medium">{v}</td>
                          <td className="py-2">
                            <select
                              className={inputCls}
                              value={likertValueToStressTier[String(v)] ?? "estres_medio"}
                              onChange={(e) => {
                                const t = e.target.value;
                                if (isStressTierId(t)) setStressTierForLikertValue(String(v), t);
                              }}
                            >
                              {STRESS_TIER_OPTIONS.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-slate-500">
                    La tabla se rellena según el número de grupos y el rango; puedes cambiar cualquier fila manualmente.
                    Si cambias el rango o la partición, se vuelve a calcular la asignación sugerida.
                  </p>
                </div>
              )}
              {(!likertValues || likertValues.length === 0) && (
                <p className="mt-3 text-xs text-amber-700">
                  Indica mínimo y máximo (enteros 1–10, máximo 10 valores en el rango, mín. ≤ máx.).
                </p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-sm font-medium text-slate-800">Referencia basal del autoinforme</p>
              <p className="mt-1 text-xs text-slate-500">
                Indica si el <strong>valor mínimo</strong> del rango corresponde a la condición basal (activación
                fisiológica ~0 %).
              </p>
              <fieldset className="mt-3 space-y-2">
                <legend className="sr-only">Referencia basal</legend>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="baseline-likert-mode"
                    className="mt-1"
                    checked={stressBaselineLikertMode === "sin_estres_primer_valor_basal"}
                    onChange={() => setStressBaselineLikertMode("sin_estres_primer_valor_basal")}
                  />
                  <span>
                    <strong>Valor mínimo = referencia basal</strong> (activación ~0 %; los tramos de señal reparten desde
                    el siguiente valor del rango).
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="baseline-likert-mode"
                    className="mt-1"
                    checked={stressBaselineLikertMode === "no_aplica"}
                    onChange={() => setStressBaselineLikertMode("no_aplica")}
                  />
                  <span>
                    <strong>Escala completa</strong> (todos los valores del rango mapean a tramos desde 0 % de señal).
                  </span>
                </label>
              </fieldset>
              {stressBaselineLikertMode === "sin_estres_primer_valor_basal" &&
                likertValues &&
                likertValues.length < 2 && (
                  <p className="mt-2 text-xs text-amber-700">
                    Hace falta un rango con al menos <strong>dos</strong> valores distintos.
                  </p>
                )}
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="block min-w-[180px] flex-1 text-sm font-medium text-slate-700">
                  Nota
                  <input
                    className={inputCls}
                    value={stressBaselineNote}
                    onChange={(e) => setStressBaselineNote(e.target.value)}
                    placeholder="Condición basal, instrucciones, etc."
                  />
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-sm font-medium text-slate-800">Valor global (opcional)</p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="block min-w-[120px] flex-1 text-sm font-medium text-slate-700">
                  Autoinforme global
                  <input
                    type="number"
                    min={likertValues?.[0] ?? 1}
                    max={likertValues?.[likertValues.length - 1] ?? 10}
                    step={1}
                    disabled={!likertValues?.length}
                    className={inputCls}
                    value={stressGlobal}
                    onChange={(e) => onLikertWithinDeclaredRange(e.target.value, setStressGlobal)}
                    placeholder={likertValues?.length ? `${likertValues[0]}–${likertValues[likertValues.length - 1]}` : "—"}
                  />
                </label>
              </div>
              {!likertValues?.length && (
                <p className="mt-2 text-xs text-amber-700">Define primero el rango arriba.</p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">Etapas o secciones</p>
                <button
                  type="button"
                  onClick={addStressSection}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  + Etapa
                </button>
              </div>
              <ul className="mt-3 space-y-3">
                {stressSections.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-slate-100 bg-white p-3 sm:flex sm:flex-wrap sm:items-end sm:gap-2"
                  >
                    <input
                      className={`${inputCls} sm:min-w-[120px] sm:flex-1`}
                      value={s.name}
                      onChange={(e) => updateStressSection(s.id, "name", e.target.value)}
                      placeholder="Nombre de la etapa"
                    />
                    <label className="block text-sm font-medium text-slate-700 sm:w-32">
                      Valor
                      <input
                        type="number"
                        min={likertValues?.[0] ?? 1}
                        max={likertValues?.[likertValues.length - 1] ?? 10}
                        step={1}
                        disabled={!likertValues?.length}
                        className={inputCls}
                        value={s.likertValue}
                        onChange={(e) => onStressSectionLikertNumber(s.id, e.target.value)}
                        placeholder={likertValues?.length ? `${likertValues[0]}–${likertValues[likertValues.length - 1]}` : "—"}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeStressSection(s.id)}
                      className="mt-2 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 sm:mt-0"
                    >
                      Quitar etapa
                    </button>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        )}

        {domain === "cognitive" && (
          <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
            {renderScopeAndMapping("per_phase")}
            <p className="text-sm text-slate-600">
              Enter aggregated <strong>NASA-TLX</strong> (0–100) for each task.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">Tareas</p>
              <button
                type="button"
                onClick={addCognitiveTask}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                + Tarea
              </button>
            </div>
            <ul className="space-y-3">
              {cognitiveTasks.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:flex sm:flex-wrap sm:items-end sm:gap-2"
                >
                  <input
                    className={`${inputCls} sm:min-w-[120px] sm:flex-1`}
                    value={t.name}
                    onChange={(e) => updateCognitiveTask(t.id, "name", e.target.value)}
                    placeholder="Nombre de la tarea"
                  />
                  <input
                    className={`${inputCls} sm:w-32`}
                    value={t.aggregatedTlx}
                    onChange={(e) => updateCognitiveTask(t.id, "aggregatedTlx", e.target.value)}
                    placeholder="NASA-TLX 0–100"
                  />
                  <button
                    type="button"
                    onClick={() => removeCognitiveTask(t.id)}
                    className="mt-2 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 sm:mt-0"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <label className="text-sm font-medium text-slate-800" htmlFor="tlx-part">
                Partición ordinal de la carga NASA-TLX (0–100)
              </label>
              {partitionSelect(tlxPartitionMode, setTlxPartitionMode, "tlx-part")}
              {tlxPartitionHelp()}
              {tlxCutFields()}
            </div>
          </div>
        )}

        {domain === "usability_sus" && (
          <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
            {renderPhysiologyMapping()}
            <p className="text-sm text-slate-600">
              <strong>SUS:</strong> 10 items (1–5) → score <strong>0–100</strong>. Higher SUS = better perceived
              usability. Set scope in <strong>section 2</strong> (global or per task).
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSusInputMode("items")}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  susInputMode === "items"
                    ? "border-indigo-700 bg-indigo-700 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                10 items (1–5)
              </button>
              <button
                type="button"
                onClick={() => setSusInputMode("score")}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  susInputMode === "score"
                    ? "border-indigo-700 bg-indigo-700 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                Direct SUS score (0–100)
              </button>
            </div>

            {susInputMode === "items" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 10 }, (_, i) => {
                  const n = i + 1;
                  return (
                    <label key={n} className="text-xs font-medium text-slate-700">
                      SUS Q{n}
                      <input
                        type="number"
                        min={1}
                        max={5}
                        step={1}
                        className={inputCls}
                        value={susItems[n] ?? ""}
                        onChange={(e) => setSusItems((prev) => ({ ...prev, [n]: e.target.value }))}
                        placeholder="1–5"
                      />
                    </label>
                  );
                })}
              </div>
            ) : (
              <label className="block text-sm font-medium text-slate-700">
                SUS score (0–100)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className={inputCls}
                  value={susScoreDirect}
                  onChange={(e) => setSusScoreDirect(e.target.value)}
                  placeholder="e.g. 72.5"
                />
              </label>
            )}

            {susComputedScore != null ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Computed SUS: <strong>{susComputedScore.toFixed(1)}</strong> ·{" "}
                {susInterpretationBand(susComputedScore).label}
              </p>
            ) : (
              <p className="text-xs text-amber-700">Complete all 10 items or enter a valid score 0–100.</p>
            )}

            {uxSelfReportScope === "per_phase" ? (
              <p className="text-xs text-slate-500">
                Per-task scope: select the number of tasks and upload signal CSVs per phase in <strong>section 2</strong>.
              </p>
            ) : null}

            <label className="block text-sm font-medium text-slate-700">
              Questionnaire notes (optional)
              <textarea
                className={`${inputCls} min-h-[72px]`}
                value={susNotes}
                onChange={(e) => setSusNotes(e.target.value)}
                placeholder="Questionnaire language, version, incidents…"
              />
            </label>
          </div>
        )}
      </section>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveParticipant}
          disabled={!canSaveParticipant}
          title={
            canSaveParticipant
              ? hasInferenceInputs
                ? "Save and run physiological inference."
                : "Save demographics and questionnaire to the cohort."
              : "Complete participant ID, questionnaire, and required fields."
          }
          className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
            canSaveParticipant
              ? "border border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
              : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
          }`}
        >
          {saveState === "saving" ? "Saving…" : "Save participant"}
        </button>
        <button
          type="button"
          onClick={() => {
            setSubjectId("");
            setAge("");
            setSex("");
            setCustomDemo([]);
            setSelectedSignals({});
            setModalityProfileId("");
            setSignalFiles({});
            setSignalFilesByTask({});
            setSaveState("idle");
            setSaveMessage("");
            setSavedUserId(null);
            setDomain("");
            setLikertMin("");
            setLikertMax("");
            setLikertPartitionParts(5);
            setLikertValueToStressTier({});
            setStressBaselineLikertMode("no_aplica");
            setStressBaselineNote("");
            setStressGlobal("");
            setStressSections([{ id: newId(), name: "", likertValue: "" }]);
            setSignalPctParts(5);
            setSignalPctBands(defaultPctActivationBands(5));
            setCognitiveTasks([{ id: newId(), name: "", aggregatedTlx: "" }]);
            setTlxPartitionMode("cuartiles");
            setTlxCut1("25");
            setTlxCut2("50");
            setTlxCut3("75");
            setTlxCut4("80");
            setSusInputMode("items");
            setSusItems(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, ""])));
            setSusScoreDirect("");
            setSusNotes("");
            setUxInstrumentName("");
            setUxInstrumentScore("");
            setUxInstrumentScale("");
            setUxInstrumentNotes("");
            setUxSelfReportScope("global");
            setUxTaskCount(0);
            setPhaseTiming({});
            setGlobalSessionDurationMin("");
            setUxOtherSections([{ id: newId(), name: "", score: "" }]);
            setPhysiologyMapping("both");
          }}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear form
        </button>
        </div>
        {saveState === "ok" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p>{saveMessage}</p>
            {savedUserId && (
              <p className="mt-2">
                <Link
                  to="/"
                  className="font-medium text-emerald-800 underline hover:text-emerald-950"
                >
                  View project cohort and charts →
                </Link>
              </p>
            )}
          </div>
        )}
        {saveState === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{saveMessage}</div>
        )}
        <p className="text-xs text-slate-500">
          <strong>Save participant</strong> persists demographics, questionnaire, and signals in the project and updates
          dashboard calculations. EDA (EA) enables automatic inference when saved.
        </p>
      </div>
    </div>
  );
}
