# MexIHC Multimodal UX Dashboard

Interactive dashboard for the MexIHC pilot: **System Usability Scale (SUS)** vs **physiological stress and cognitive-load activation** during tasks on an institutional web portal (*n* = 10).

This repository contains **application code and documentation only**. Participant recordings and questionnaire responses are published on **Zenodo** (add your DOI below).

## What is included

| Path | Purpose |
|------|---------|
| `apps/web/` | React + Vite frontend (English UI) |
| `apps/api/` | FastAPI backend — cohort charts, participant upload, inference trigger |
| `pipeline/` | EmotiBit alignment, feature extraction, SVM/GB inference, SUS join |
| `data/` | Expected layout for local study files (**empty in Git**) |
| `models/` | Slot for external training feature CSV (**not redistributed**) |
| `docs/` | Architecture and data contract |

## What is **not** included

- Raw EmotiBit exports under `data/Usuarios/`
- `SUS.csv` and inference outputs (→ Zenodo)
- Training corpus for stress/cognitive models (→ separate licensed file, see `models/README.md`)
- Secrets (`.env`)

## Architecture (short)

```
Browser (React)
    ↕ REST /api/v1
FastAPI
    ↕ reads CSVs in data/
    ↕ subprocess on upload
pipeline/run_inference.py
    → data/outputs/UX_activation_summary.csv
```

### Delta (Δ) vs 0–100 display

- **Δ (delta):** mean non-baseline activation probability minus baseline probability, per participant and phase. Used in analysis and paper results.
- **0–100 level (dashboard only):** `log1p(Δ) / log1p(cohort p95) × 100` for chart readability.

### Models

- **Stress:** SVM (RBF), reference BACC 0.7769  
- **Cognitive load:** Gradient Boosting (stress→load transfer), reference BACC 0.8948  
- **Features:** ten window-level physiological descriptors (60 s windows, 30 s step) from EmotiBit PG/PR/PI/EA/TH (+ motion channels for alignment)

## Quick start

### 1. Clone and configure

```bash
git clone https://github.com/MexIHC/dashboard_MexIHC.git
cd dashboard_MexIHC
copy .env.example apps\api\.env
```

### 2. Python API

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8002 --reload
```

### 3. Web

```bash
cd apps/web
npm install
npm run dev
```

Open **http://127.0.0.1:5173**

Or on Windows run `start-dashboard.cmd` from the repo root.

### 4. Add study data (choose one path)

See **`data/README.md`** for full detail. Summary:

#### Path A — Quick view (recommended for reviewers)

Precomputed inference only — **no raw signals**, no training file.

1. Download the [Zenodo record](https://zenodo.org/records/20714287) (restricted until publication; public DOI after acceptance).
2. Copy into `data/`:

| Zenodo file | Dashboard path |
|-------------|----------------|
| `outputs/UX_activation_summary.csv` | `data/outputs/UX_activation_summary.csv` |
| `outputs/UX_sus_activation_join.csv` | `data/outputs/UX_sus_activation_join.csv` |
| `self_report/cognitive/SUS.csv` | `data/self_report/cognitive/SUS.csv` |

3. Restart the API and open http://127.0.0.1:5173

#### Path B — Full reproduction from raw signals

Re-run `pipeline/run_inference.py` from EmotiBit exports.

1. Download the full Zenodo archive.
2. Map `participants/U01/` → `data/Usuarios/U1/`, …, `participants/U10/` → `data/Usuarios/U10/` (copy all `*_EA.csv`, `*_TH.csv`, `*_PG.csv`, `*_PR.csv`, `*_PI.csv`, `*_UN.csv`, `*_info.json` per folder).
3. Copy `self_report/cognitive/SUS.csv` → `data/self_report/cognitive/SUS.csv`.
4. Place `models/training_features_core10.csv` (external training corpus — not on Zenodo).
5. Run `python pipeline/run_inference.py` then `python pipeline/join_sus_activation.py`.
6. Restart the API.

## Zenodo dataset

- **Record:** https://zenodo.org/records/20714287 *(restricted draft; replace with public DOI after acceptance)*  
- **GitHub (this repo):** https://github.com/MexIHC/dashboard_MexIHC

The Zenodo deposit includes:

| Content | Used for |
|---------|----------|
| `participants/U01` … `U10` — EmotiBit CSV sessions | Path B (raw re-inference) |
| `self_report/SUS.csv` — demographics + SUS (`user_id` U01–U10) | General reuse |
| `self_report/cognitive/SUS.csv` — dashboard format (`UX_U01`–`UX_U10`) | Path A and Path B |
| `outputs/UX_activation_summary.csv` | Path A (quick dashboard) |
| `outputs/UX_sus_activation_join.csv` | Path A (quick dashboard) |

**Do not cite or share private upload tokens** in papers or README files; use the public record URL or DOI only.

## Citation

If you use this software, cite the MexIHC 2026 paper and the Zenodo DOI. A `CITATION.cff` file is provided for GitHub/Zenodo integration.

## License

MIT — see `LICENSE`. Study data on Zenodo may use a separate license (recommended: CC BY 4.0).

## Related work

Inference uses classifiers trained on an external stress/cognitive corpus. That corpus is **not** the ESCOLAR dashboard project and is **not** shipped here—only the minimal feature-extraction and transfer-learning steps required for the MexIHC UX study.
