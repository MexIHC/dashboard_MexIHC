"""Read-only MexIHC study data (portal UX + SUS + physiological inference)."""

from __future__ import annotations

import csv
import io
import math
from collections import Counter
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.services.research_paths import resolve_data_root, resolve_repo_root
from app.services.sus_io import load_sus_by_activation_id, sus_csv_path

ALL_USER_IDS = [f"UX_U{i:02d}" for i in range(1, 11)]
PHASES_ORDER = ["Basal", "Task 1", "Task 2", "Task 3"]
PHASE_LABEL = {"__GLOBAL__": "Global (session)"}

GENDER = {1: "Male", 2: "Female", 3: "Other", 4: "Prefer not to say"}
DISCIPLINE = {
    1: "B.S. Computer Technologies",
    2: "Statistics",
}
SLEEP = {1: "Less than 5 h", 2: "Between 5 and 7 h", 3: "More than 7 h"}
STIMULANT = {
    1: "Did not consume",
    2: "Less than 2 h ago",
    3: "2 to 4 h ago",
    4: "More than 4 h ago",
}
PORTAL_FREQ = {
    1: "Daily",
    2: "2–3 times per week",
    3: "Once per week",
    4: "Rarely",
    5: "Never",
}

STRESS_MODEL = {"model": "SVM (RBF)", "bacc": 0.7769, "domain": "stress"}
COG_MODEL = {"model": "Gradient Boosting (transfer S->C)", "bacc": 0.8948, "domain": "cognitive_load"}


def _paths(settings: Settings) -> dict[str, Path]:
    base = resolve_data_root(settings)
    return {
        "sus": sus_csv_path(base),
        "activation": base / "outputs" / "UX_activation_summary.csv",
        "join": base / "outputs" / "UX_sus_activation_join.csv",
    }


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return [{k: ("" if v is None else str(v).strip()) for k, v in row.items()} for row in csv.DictReader(f)]


def _f(val: str | None) -> float | None:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _i(val: str | None) -> int | None:
    x = _f(val)
    return int(x) if x is not None else None


def _dash(val: Any) -> str:
    if val is None:
        return "—"
    s = str(val).strip()
    return s if s else "—"


def _fmt_float(val: float | None, digits: int = 3) -> str:
    if val is None:
        return "—"
    return f"{val:.{digits}f}"


def _nivel_0_100_p95(delta: float | None, p95: float, d_min: float = 0.0) -> float | None:
    """Map Δ to 0-100 vs domain p95: 100 × (Δ − Δ_min) / (p95 − Δ_min), capped."""
    if delta is None or p95 <= d_min:
        return None
    denom = p95 - d_min
    if denom <= 0:
        return None
    numer = max(0.0, float(delta)) - d_min
    return min(100.0, max(0.0, 100.0 * numer / denom))


def _p95_deltas(act_idx: dict, domain: str) -> float:
    """95th percentile of task-level Δ for one domain (30 tasks in this cohort)."""
    vals: list[float] = []
    for user in act_idx.values():
        for phase, row in user.get(domain, {}).items():
            if phase in ("Basal", "__GLOBAL__"):
                continue
            d = _f(row.get("delta_score"))
            if d is not None:
                vals.append(d)
    return _p95_from_values(vals)


def _p95_shared_deltas(act_idx: dict) -> float:
    """95th percentile of all task-level Δ (stress + cognitive load, 60 values in this cohort)."""
    vals: list[float] = []
    for user in act_idx.values():
        for domain in ("stress", "cognitive_load"):
            for phase, row in user.get(domain, {}).items():
                if phase in ("Basal", "__GLOBAL__"):
                    continue
                d = _f(row.get("delta_score"))
                if d is not None:
                    vals.append(d)
    return _p95_from_values(vals)


SHARED_ACTIVATION_NOTE = (
    "Activation level (0-100) is a visualization aid; primary metric is Delta (Δ). "
    "Shared linear scale: min(100, 100 × Δ / p95_shared), "
    "where p95_shared is the 95th percentile of all task-level Δ values (stress + load, 10 users × 3 tasks × 2 domains). "
    "Stress and load bars use the same reference so higher Δ yields a higher %."
)

ACTIVATION_SCALE_NOTE = SHARED_ACTIVATION_NOTE


def _sus_band(score: float | None) -> str:
    if score is None:
        return "—"
    if score < 50:
        return "Low usability"
    if score < 68:
        return "Below average"
    if score < 80:
        return "Above average"
    return "Excellent"


def _activation_verbal(pct: float | None) -> str:
    if pct is None:
        return "—"
    if pct < 25:
        return "Very low"
    if pct < 50:
        return "Low"
    if pct < 75:
        return "Moderate"
    if pct < 90:
        return "High"
    return "Very high"


def _load_sus_by_user(data_root: Path) -> dict[str, dict[str, str]]:
    return load_sus_by_activation_id(data_root)


def _load_activation(data_root: Path) -> list[dict[str, str]]:
    return _read_csv(data_root / "outputs" / "UX_activation_summary.csv")


def _self_report_id_to_signal_id(srid: str) -> str:
    """UX_U01 -> UX_U1 (Usuarios/U1 folder)."""
    if not srid.startswith("UX_U"):
        return srid
    tail = srid.replace("UX_U", "")
    try:
        return f"UX_U{int(tail)}"
    except ValueError:
        return srid


def _activation_indexed(data_root: Path) -> dict[str, dict[str, dict[str, dict[str, str]]]]:
    """user_self_report -> domain -> phase -> row."""
    out: dict[str, dict[str, dict[str, dict[str, str]]]] = {}
    for row in _load_activation(data_root):
        srid = row.get("self_report_id") or ""
        if not srid:
            continue
        dom = row.get("domain") or ""
        phase = row.get("phase") or ""
        out.setdefault(srid, {}).setdefault(dom, {})[phase] = row
    return out


def _users_with_signals(act_idx: dict) -> set[str]:
    return set(act_idx.keys())


def _p95_from_values(vals: list[float]) -> float:
    if not vals:
        return 1.0
    vals.sort()
    k = max(0, min(len(vals) - 1, int(math.ceil(0.95 * len(vals))) - 1))
    return max(vals[k], 1e-6)


def _ranking_max_phase(
    act_idx: dict,
    domain: str,
    users: list[str],
) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    for uid in users:
        phases = act_idx.get(uid, {}).get(domain, {})
        best_phase = None
        best_delta = -1.0
        for ph in PHASES_ORDER:
            if ph == "Basal":
                continue
            d = _f(phases.get(ph, {}).get("delta_score"))
            if d is not None and d > best_delta:
                best_delta = d
                best_phase = ph
        if best_phase:
            counts[best_phase] += 1
    total = sum(counts.values()) or 1
    return [
        {"label": ph, "count": counts[ph], "share": counts[ph] / total}
        for ph in PHASES_ORDER
        if ph != "Basal"
    ]


def _mean_delta_by_phase(
    act_idx: dict,
    domain: str,
    users: list[str],
    p95: float,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for ph in PHASES_ORDER:
        if ph == "Basal":
            continue
        deltas = []
        levels = []
        for uid in users:
            row = act_idx.get(uid, {}).get(domain, {}).get(ph)
            if not row:
                continue
            d = _f(row.get("delta_score"))
            if d is not None:
                deltas.append(d)
                lvl = _nivel_0_100_p95(d, p95)
                if lvl is not None:
                    levels.append(lvl)
        rows.append(
            {
                "label": ph,
                "signal": (sum(levels) / len(levels)) if levels else None,
                "mean_delta": (sum(deltas) / len(deltas)) if deltas else None,
                "n": len(deltas),
            }
        )
    return rows


def _sus_mean_by_phase(sus_map: dict[str, dict[str, str]], users: list[str]) -> list[dict[str, Any]]:
    scores = [_f(sus_map[u].get("sus_score")) for u in users if _f(sus_map[u].get("sus_score")) is not None]
    mean_sus = (sum(scores) / len(scores)) if scores else None
    return [
        {
            "label": ph,
            "sus": mean_sus,
            "signal": None,
        }
        for ph in PHASES_ORDER
        if ph != "Basal"
    ]


def build_cohort_summary(settings: Settings) -> dict[str, Any]:
    data_root = resolve_data_root(settings)
    sus_map = _load_sus_by_user(data_root)
    act_idx = _activation_indexed(data_root)
    signal_users = _users_with_signals(act_idx)

    sus_filled = [u for u in ALL_USER_IDS if _f(sus_map.get(u, {}).get("sus_score")) is not None]
    with_signals = [u for u in ALL_USER_IDS if u in signal_users]

    def hist(field: str, mapping: dict[int, str]) -> list[dict[str, Any]]:
        c: Counter[str] = Counter()
        for u in sus_filled:
            v = _i(sus_map[u].get(field))
            c[mapping.get(v or -1, _dash(v))] += 1
        return [{"label": k, "count": v} for k, v in sorted(c.items())]

    sus_scores = [_f(sus_map[u].get("sus_score")) for u in sus_filled]
    sus_scores = [s for s in sus_scores if s is not None]

    def sus_bins() -> list[dict[str, Any]]:
        """Tercios del rango 0-100; solo devuelve bins con participantes (sin huecos vacíos)."""
        bins = [
            ("1-50", 0),
            ("51-70", 0),
            ("71-100", 0),
        ]
        for s in sus_scores:
            if s <= 50:
                bins[0] = (bins[0][0], bins[0][1] + 1)
            elif s <= 70:
                bins[1] = (bins[1][0], bins[1][1] + 1)
            else:
                bins[2] = (bins[2][0], bins[2][1] + 1)
        return [{"label": b[0], "count": b[1]} for b in bins if b[1] > 0]

    def age_bins() -> list[dict[str, Any]]:
        """Rangos fijos de edad para el gráfico demográfico."""
        labels = ["19–20", "21–22", "23–24", "25–26"]
        bounds = [(19, 20), (21, 22), (23, 24), (25, 26)]
        counts = [0, 0, 0, 0]
        for u in sus_filled:
            age = _i(sus_map[u].get("age"))
            if age is None:
                continue
            for i, (lo, hi) in enumerate(bounds):
                if lo <= age <= hi:
                    counts[i] += 1
                    break
        return [{"label": labels[i], "count": counts[i]} for i in range(len(labels))]

    return {
        "project": "MexIHC",
        "samples": {
            "sus_completed": len(sus_filled),
            "with_signals": len(with_signals),
            "total_slots": len(ALL_USER_IDS),
        },
        "sus_distribution": sus_bins(),
        "sus_mean": (sum(sus_scores) / len(sus_scores)) if sus_scores else None,
        "sus_interpretation": (
            "SUS (0-100): global usability score at session end. "
            "<50 = difficult to use; 50-70 = acceptable with improvements; "
            ">70 = good experience; >80 = excellent. "
            "Industry reference ~68 (above = better than typical average)."
        ),
        "ages": age_bins(),
        "gender": hist("gender", GENDER),
        "discipline": hist("academic_discipline", DISCIPLINE),
        "semester": hist("current_semester", {}),
        "sleep": hist("sleep_hours_category", SLEEP),
        "portal_usage": hist("portal_usage_frequency", PORTAL_FREQ),
        "sources": {k: str(v) for k, v in _paths(settings).items()},
    }


def build_research_summary(settings: Settings) -> dict[str, Any]:
    data_root = resolve_data_root(settings)
    sus_map = _load_sus_by_user(data_root)
    act_idx = _activation_indexed(data_root)
    users_sig = sorted(_users_with_signals(act_idx))

    shared_p95 = _p95_shared_deltas(act_idx)

    stress_compare = _mean_delta_by_phase(act_idx, "stress", users_sig, shared_p95)
    cog_compare = _mean_delta_by_phase(act_idx, "cognitive_load", users_sig, shared_p95)

    sus_scores = [_f(sus_map[u].get("sus_score")) for u in ALL_USER_IDS if _f(sus_map.get(u, {}).get("sus_score")) is not None]
    sus_mean = (sum(sus_scores) / len(sus_scores)) if sus_scores else None

    def enrich_compare(compare_rows: list[dict], p95: float) -> list[dict[str, Any]]:
        out = []
        for r in compare_rows:
            signal = r.get("signal")
            out.append(
                {
                    "label": r["label"],
                    "sus": sus_mean,
                    "signal": signal,
                    "self_report": sus_mean,
                }
            )
        return out

    def task_distribution(compare_rows: list[dict]) -> list[dict[str, Any]]:
        return [
            {
                "label": r["label"],
                "signal": r.get("signal"),
                "mean_delta": r.get("mean_delta"),
                "n": r.get("n"),
            }
            for r in compare_rows
        ]

    def global_sus_vs_signal(domain: str, p95: float) -> dict[str, Any]:
        levels: list[float] = []
        deltas: list[float] = []
        for uid in users_sig:
            row = act_idx.get(uid, {}).get(domain, {}).get("__GLOBAL__", {})
            d = _f(row.get("delta_score"))
            if d is None:
                continue
            deltas.append(d)
            lvl = _nivel_0_100_p95(d, p95)
            if lvl is not None:
                levels.append(lvl)
        return {
            "sus_mean": sus_mean,
            "mean_global_signal": (sum(levels) / len(levels)) if levels else None,
            "mean_global_delta": (sum(deltas) / len(deltas)) if deltas else None,
            "n": len(levels),
        }

    return {
        "repo_root": str(resolve_repo_root(settings)),
        "project": "MexIHC",
        "sus_signal_notice": (
            "SUS is a global usability score (0-100; higher = better experience). "
            "SUS vs physiological activation comparison applies only at session level. "
            "Per-task charts show cohort mean activation level per task, without SUS, "
            "because the questionnaire was not administered per stage. "
            "The highest individual peak per participant is shown in their profile. "
            + ACTIVATION_SCALE_NOTE
        ),
        "activation_scale_note": ACTIVATION_SCALE_NOTE,
        "shared_p95_delta": shared_p95,
        "p95_stress": _p95_deltas(act_idx, "stress"),
        "p95_cognitive_load": _p95_deltas(act_idx, "cognitive_load"),
        "sources": {k: str(v) for k, v in _paths(settings).items()},
        "cohort": {
            "n_sus": len([u for u in ALL_USER_IDS if _f(sus_map.get(u, {}).get("sus_score")) is not None]),
            "n_signals": len(users_sig),
            "sus_mean": sus_mean,
        },
        "stress_domain": {
            "n_subjects": len(users_sig),
            "p95_delta": shared_p95,
            "activation_note": SHARED_ACTIVATION_NOTE,
            "ranking_by_signal_max_delta_task": _ranking_max_phase(act_idx, "stress", users_sig),
            "compare_sus_vs_signal": enrich_compare(stress_compare, shared_p95),
            "signal_distribution_by_task": task_distribution(stress_compare),
            "compare_sus_vs_signal_global": global_sus_vs_signal("stress", shared_p95),
            "methodology": (
                "Stress inferred with SVM (RBF) trained on an external stress corpus (reference BACC 0.7769). "
                "0-100 level: min(100, 100 × Δ / p95_shared) — same shared reference as cognitive load."
            ),
        },
        "cognitive_domain": {
            "n_subjects": len(users_sig),
            "p95_delta": shared_p95,
            "activation_note": SHARED_ACTIVATION_NOTE,
            "ranking_by_signal_max_delta_task": _ranking_max_phase(act_idx, "cognitive_load", users_sig),
            "compare_sus_vs_signal": enrich_compare(cog_compare, shared_p95),
            "signal_distribution_by_task": task_distribution(cog_compare),
            "compare_sus_vs_signal_global": global_sus_vs_signal("cognitive_load", shared_p95),
            "methodology": (
                "Cognitive load with Gradient Boosting transfer S->C (reference BACC 0.8948). "
                "0-100 level: min(100, 100 × Δ / p95_shared) — same shared reference as stress."
            ),
        },
        "model_policy": {
            "stress": STRESS_MODEL,
            "cognitive": COG_MODEL,
        },
    }


def list_subjects(settings: Settings) -> dict[str, Any]:
    data_root = resolve_data_root(settings)
    sus_map = _load_sus_by_user(data_root)
    act_idx = _activation_indexed(data_root)
    items = []
    for uid in ALL_USER_IDS:
        has_sus = _f(sus_map.get(uid, {}).get("sus_score")) is not None
        has_sig = uid in act_idx
        label = uid.replace("UX_U", "U")
        status = "complete" if (has_sus and has_sig) else ("sus_only" if has_sus else "pending")
        items.append(
            {
                "id": uid,
                "label": label,
                "has_sus": has_sus,
                "has_signals": has_sig,
                "status": status,
            }
        )
    return {"subjects": items}


def _sus_adjetivo(score: float | None) -> str:
    """Escala Bangor/Sauro: <50 bajo; 50-68 aceptable (bajo promedio ~68); 68-80 bueno; >=80 excelente."""
    if score is None:
        return "—"
    if score < 50:
        return "low"
    if score < 68:
        return "acceptable"
    if score < 80:
        return "good"
    return "excellent"


def _activacion_adjetivo(pct: float | None) -> str:
    if pct is None:
        return "—"
    if pct < 50:
        return "low"
    if pct < 75:
        return "moderate"
    return "high"


def _activacion_fragmento(etiqueta: str, pct: float | None) -> str | None:
    if pct is None:
        return None
    adj = _activacion_adjetivo(pct)
    return f"{etiqueta} {adj}"


def _lectura_sus_vs_senal(
    sus: float | None,
    nivel_estres: float | None,
    nivel_carga: float | None,
) -> str:
    if sus is None:
        return "—"
    sa = _sus_adjetivo(sus)
    frag_estres = _activacion_fragmento("stress", nivel_estres)
    frag_carga = _activacion_fragmento("load", nivel_carga)
    frags = [f for f in (frag_estres, frag_carga) if f]
    if not frags:
        return f"SUS {sa}"
    act_txt = " and ".join(frags)
    activacion_elevada = any(
        v is not None and v >= 50 for v in (nivel_estres, nivel_carga)
    )
    activacion_baja = all(
        v is None or v < 50 for v in (nivel_estres, nivel_carga)
    )
    if activacion_elevada and sa in ("acceptable", "good", "excellent"):
        return f"SUS {sa} but {act_txt}"
    if activacion_baja:
        return f"SUS {sa} and {act_txt}"
    return f"SUS {sa}; {act_txt}"


def build_subject_detail(settings: Settings, user_id: str) -> dict[str, Any]:
    uid = (user_id or "").strip().upper()
    if not uid:
        return {"error": "empty_id"}
    if uid not in ALL_USER_IDS:
        return {"error": "not_found"}

    data_root = resolve_data_root(settings)
    sus_map = _load_sus_by_user(data_root)
    act_idx = _activation_indexed(data_root)
    sus = sus_map.get(uid, {})
    sus_score = _f(sus.get("sus_score"))
    phases_stress = act_idx.get(uid, {}).get("stress", {})
    phases_cog = act_idx.get(uid, {}).get("cognitive_load", {})

    shared_p95 = _p95_shared_deltas(act_idx)

    sr_glob = phases_stress.get("__GLOBAL__", {})
    cr_glob = phases_cog.get("__GLOBAL__", {})
    sd_glob = _f(sr_glob.get("delta_score"))
    cd_glob = _f(cr_glob.get("delta_score"))
    sn_glob = _nivel_0_100_p95(sd_glob, shared_p95)
    cn_glob = _nivel_0_100_p95(cd_glob, shared_p95)

    tabla = [
        {
            "Scope": "Global (session)",
            "SUS": _fmt_float(sus_score, 1),
            "Stress Δ": _fmt_float(sd_glob, 3),
            "Load Δ": _fmt_float(cd_glob, 3),
            "Stress level (%)": _fmt_float(sn_glob, 1),
            "Load level (%)": _fmt_float(cn_glob, 1),
            "Description": _lectura_sus_vs_senal(sus_score, sn_glob, cn_glob),
        }
    ]

    global_bar = {
        "sus": sus_score,
        "stress": sn_glob,
        "load": cn_glob,
        "stress_delta": sd_glob,
        "load_delta": cd_glob,
    }

    temporal_series: list[dict[str, Any]] = [{"label": "Basal", "order": 0, "stress": 0.0, "load": 0.0}]
    for i, ph in enumerate(("Task 1", "Task 2", "Task 3"), start=1):
        sr = phases_stress.get(ph, {})
        cr = phases_cog.get(ph, {})
        nw_s = _i(sr.get("n_windows")) or 0
        nw_c = _i(cr.get("n_windows")) or 0
        if nw_s <= 0 and nw_c <= 0:
            continue
        sd = _f(sr.get("delta_score")) if nw_s > 0 else None
        cd = _f(cr.get("delta_score")) if nw_c > 0 else None
        sn = _nivel_0_100_p95(sd, shared_p95) if sd is not None else None
        cn = _nivel_0_100_p95(cd, shared_p95) if cd is not None else None
        if sn is None and cn is None:
            continue
        temporal_series.append(
            {
                "label": ph,
                "order": i,
                "stress": sn,
                "load": cn,
                "stress_delta": sd,
                "load_delta": cd,
            }
        )
    has_temporal_series = len(temporal_series) >= 2

    def max_task(phases: dict) -> str:
        best = None
        best_d = -1.0
        for ph in ("Task 1", "Task 2", "Task 3"):
            d = _f(phases.get(ph, {}).get("delta_score"))
            if d is not None and d > best_d:
                best_d = d
                best = ph
        return best or "—"

    max_stress_task = max_task(phases_stress)
    max_cog_task = max_task(phases_cog)

    edad = _dash(sus.get("age"))
    genero = GENDER.get(_i(sus.get("gender")) or -1, _dash(sus.get("gender")))
    disc = DISCIPLINE.get(_i(sus.get("academic_discipline")) or -1, _dash(sus.get("academic_discipline")))

    notas_tecnicas = [
        "SUS (0-100, post-session): <50 difficult · 50-70 acceptable · >70 good · ≥80 excellent · industry reference ~68.",
        SHARED_ACTIVATION_NOTE,
        f"Shared p95 reference = {_fmt_float(shared_p95, 4)} (all task-level Δ values, both domains).",
        (
            f"Informative per-task distribution (signals only, no SUS): "
            f"highest stress in {max_stress_task}; highest load in {max_cog_task}."
            if phases_stress or phases_cog
            else "No physiological inference available for this participant."
        ),
        "SUS was administered once at session end; not compared per stage at individual level.",
    ]

    view = {
        "demographics": {
            "lines": [
                f"Participant {uid.replace('UX_', '')}",
                f"Age: {edad} · Gender: {genero}",
                f"Major: {disc}",
                f"Semester: {_dash(sus.get('current_semester'))}",
            ],
        },
        "sus_score": _fmt_float(sus_score, 1),
        "sus_band": _sus_band(sus_score),
        "max_stress_task": max_stress_task,
        "max_load_task": max_cog_task,
        "global_summary": (
            f"SUS {_fmt_float(sus_score, 1)} ({_sus_band(sus_score)}). "
            f"Global Δ stress {_fmt_float(sd_glob, 3)} ({_activation_verbal(sn_glob)}); "
            f"Δ load {_fmt_float(cd_glob, 3)} ({_activation_verbal(cn_glob)})."
            if sus_score is not None and (sn_glob is not None or cn_glob is not None)
            else (
                f"SUS {_fmt_float(sus_score, 1)} ({_sus_band(sus_score)}). No physiological inference available."
                if sus_score is not None
                else "Participant pending SUS and signals."
            )
        ),
        "global_table": tabla,
        "global_bar_comparison": global_bar,
        "temporal_series": temporal_series if has_temporal_series else [],
        "has_temporal_series": has_temporal_series,
        "technical_notes": notas_tecnicas,
        "habits_context": {
            "Sleep": SLEEP.get(_i(sus.get("sleep_hours_category")) or -1, "—"),
            "Stimulants": STIMULANT.get(_i(sus.get("stimulant_intake_recency")) or -1, "—"),
            "Portal usage": PORTAL_FREQ.get(_i(sus.get("portal_usage_frequency")) or -1, "—"),
        },
        "method_note": (
            "60 s windows, ten physiological features, intra-subject z-score. "
            "Individual view summarized at global level; per-task mean reported in cohort."
        ),
        "has_sus": sus_score is not None,
        "has_signals": bool(phases_stress or phases_cog),
    }

    return {
        "user_id": uid,
        "design_view": view,
        "sources": {k: str(v) for k, v in _paths(settings).items()},
    }


def questionnaires_preview(settings: Settings, limit: int = 10) -> dict[str, Any]:
    data_root = resolve_data_root(settings)
    path = sus_csv_path(data_root)
    shape = None
    if path.exists():
        with path.open("r", encoding="utf-8-sig", newline="") as f:
            first = f.readline()
            n = sum(1 for _ in f)
        header = next(csv.reader(io.StringIO(first))) if first.strip() else []
        shape = {"rows": n, "columns": header, "path": str(path)}
    rows = _read_csv(path)[:limit]
    legible = []
    for r in rows:
        legible.append(
            {
                "Participant": _dash(r.get("user_id")),
                "Age": _dash(r.get("age")),
                "SUS": _dash(r.get("sus_score")),
                "Major": DISCIPLINE.get(_i(r.get("academic_discipline")) or -1, "—"),
                "Portal (frequency)": PORTAL_FREQ.get(_i(r.get("portal_usage_frequency")) or -1, "—"),
            }
        )
    return {"sus": {"shape": shape, "readable_rows": legible}}
