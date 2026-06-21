# MexIHC Multimodal UX Dashboard

Interactive dashboard for the MexIHC pilot: **System Usability Scale (SUS)** vs **physiological stress and cognitive-load activation** during tasks on an institutional web portal (*n* = 10).

This repository contains **application code only**. Participant data are distributed separately (see [Study data](#study-data) below).

## Technology stack

| Layer | Stack |
|-------|--------|
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS, Recharts |
| **Backend** | Python 3.10+, FastAPI, Pydantic Settings, Uvicorn |
| **Inference** | pandas, NumPy, scikit-learn (SVM RBF + Gradient Boosting) |
| **Storage** | File-based CSV under `data/` — no database |

## Repository layout

| Path | Role |
|------|------|
| `apps/web/` | Browser UI — cohort charts, per-participant detail, optional upload form |
| `apps/api/` | REST API (`/api/v1`) — reads CSVs, triggers the pipeline on upload |
| `pipeline/` | EmotiBit alignment → window features → model inference → SUS join |
| `data/` | Local study files (**empty in Git**; see setup below) |
| `models/` | Slot for external training feature CSV (**not redistributed**) |
| `docs/` | Architecture notes and CSV data contract |

## How it works

1. **View mode (default):** the API loads precomputed CSVs from `data/outputs/` and `data/self_report/SUS.csv` (Zenodo format: `user_id` U01–U10; IDs are mapped automatically to match activation), then the React app renders cohort and per-user charts.
2. **Upload mode (optional):** a new participant’s EmotiBit CSVs and SUS responses are saved under `data/`, the API runs `pipeline/run_inference.py` as a subprocess, and outputs are refreshed.

```
Browser (React, :5173)
    ↕  REST /api/v1
FastAPI (:8002)
    ↕  reads / writes  data/*.csv
    ↕  subprocess (on upload)
pipeline/run_inference.py  →  data/outputs/UX_activation_summary.csv
```

### Metrics

- **Δ (delta):** mean activation probability in a phase minus that participant’s baseline. Reported in the paper.
- **0–100 level (UI only):** `min(100, 100 × Δ / p95_shared)` where p95_shared is the 95th percentile of **all** task-level Δ (stress + cognitive load pooled). Same scale for both domains; paper reports raw Δ.

### Models

- **Stress:** SVM (RBF), reference BACC 0.7769  
- **Cognitive load:** Gradient Boosting (stress→load transfer), reference BACC 0.8948  
- **Features:** ten window-level descriptors (60 s windows, 30 s step) from EmotiBit PG, PR, PI, EA, TH

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

On Windows you can also run `start-dashboard.cmd` from the repo root.

### 4. Add study data

Full folder mapping: **`data/README.md`**.

#### Path A — Quick view *(recommended for reviewers)*

Precomputed inference — **no raw signals**, no training file.

Copy from the study data archive into `data/`:

| Archive file | Dashboard path |
|--------------|----------------|
| `outputs/UX_activation_summary.csv` | `data/outputs/UX_activation_summary.csv` |
| `outputs/UX_sus_activation_join.csv` | `data/outputs/UX_sus_activation_join.csv` |
| `self_report/SUS.csv` | `data/self_report/SUS.csv` |

Restart the API.

#### Path B — Full reproduction from raw signals

1. Map `participants/U01/` → `data/Usuarios/U1/`, …, `U10/` → `U10/` (all `*_EA.csv`, `*_TH.csv`, `*_PG.csv`, `*_PR.csv`, `*_PI.csv`, `*_UN.csv`, `*_info.json`).
2. Copy `self_report/SUS.csv` → `data/self_report/SUS.csv`.
3. Place `models/training_features_core10.csv` (external training corpus — not in the public data deposit).
4. Run `python pipeline/run_inference.py` and `python pipeline/join_sus_activation.py`.
5. Restart the API.

## Study data

Participant recordings, SUS responses, and precomputed outputs are **not** in this Git repository.

- **Application code:** https://github.com/MexIHC/dashboard_MexIHC  
- **Data deposit:** https://zenodo.org/records/20714287 *(restricted until publication; access instructions in the MexIHC 2026 paper)*

After public release, cite the Zenodo DOI from the paper. Do not publish private upload tokens in open repositories.

## What is not included here

- Raw EmotiBit exports (`data/Usuarios/`)
- `SUS.csv` and inference outputs (in the data deposit)
- External training feature matrix (`models/training_features_core10.csv`)
- Secrets (`.env`)

## Citation

Cite the MexIHC 2026 paper and the Zenodo data record. A `CITATION.cff` file is provided for GitHub integration.

## License

MIT — see `LICENSE`. Study data may use a separate license on Zenodo (recommended: CC BY 4.0).

## Related work

Inference reuses classifiers trained on an **external** stress/cognitive-load corpus. That training matrix is not redistributed with this repository; only the feature-extraction and transfer-learning steps required for the MexIHC UX pilot are included here.
