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
git clone https://github.com/Heeber24/dashboard_MexIHC.git
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

### 4. Add data

1. Download the Zenodo archive and extract into `data/` (see `data/README.md`).
2. Place the training feature matrix at `models/training_features_core10.csv` or set `TRAINING_FEATURES_CSV` in `apps/api/.env`.

Restart the API. Charts populate from `data/outputs/` and `data/self_report/cognitive/SUS.csv`.

## Zenodo dataset

> **DOI:** `https://doi.org/10.5281/zenodo.XXXXXXX` ← replace after you publish

The deposit should contain anonymized:

- EmotiBit CSV sessions per participant  
- `SUS.csv`  
- Precomputed `outputs/*.csv` (optional, for exact paper reproduction)

## Citation

If you use this software, cite the MexIHC 2026 paper and the Zenodo DOI. A `CITATION.cff` file is provided for GitHub/Zenodo integration.

## License

MIT — see `LICENSE`. Study data on Zenodo may use a separate license (recommended: CC BY 4.0).

## Related work

Inference uses classifiers trained on an external stress/cognitive corpus. That corpus is **not** the ESCOLAR dashboard project and is **not** shipped here—only the minimal feature-extraction and transfer-learning steps required for the MexIHC UX study.
