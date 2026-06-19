# Study data (not included in Git)

This repository ships **code only**. The MexIHC pilot dataset (*n* = 10) is on **Zenodo**:

- **Record (restricted until publication):** https://zenodo.org/records/20714287  
- **Public DOI (after acceptance):** replace with `https://doi.org/10.5281/zenodo.XXXXXXX`

Companion application code: https://github.com/MexIHC/dashboard_MexIHC

---

## Two ways to run the dashboard

### Path A — Quick view (precomputed inference, recommended for reviewers)

Use this when you only want to **explore cohort charts and participant profiles** matching the paper, without raw signals or model training.

1. Download the Zenodo archive and extract it anywhere.
2. Copy these files into this repo under `data/`:

| From Zenodo | To dashboard |
|-------------|--------------|
| `outputs/UX_activation_summary.csv` | `data/outputs/UX_activation_summary.csv` |
| `outputs/UX_sus_activation_join.csv` | `data/outputs/UX_sus_activation_join.csv` |
| `self_report/cognitive/SUS.csv` | `data/self_report/cognitive/SUS.csv` |

3. Restart the API (`uvicorn` or `start-dashboard.cmd`).
4. Open http://127.0.0.1:5173

**You do not need** `data/Usuarios/` or `models/training_features_core10.csv` for this path.

---

### Path B — Full reproduction from raw signals

Use this to **re-run the inference pipeline** from EmotiBit exports.

1. Download the full Zenodo archive.
2. Map participant folders (Zenodo → dashboard):

| Zenodo folder | Dashboard folder |
|---------------|------------------|
| `participants/U01/` | `data/Usuarios/U1/` |
| `participants/U02/` | `data/Usuarios/U2/` |
| … | … |
| `participants/U09/` | `data/Usuarios/U9/` |
| `participants/U10/` | `data/Usuarios/U10/` |

Copy all seven files per session (`*_EA.csv`, `*_TH.csv`, `*_PG.csv`, `*_PR.csv`, `*_PI.csv`, `*_UN.csv`, `*_info.json`) unchanged.

3. Copy self-report:

| Zenodo | Dashboard |
|--------|-----------|
| `self_report/cognitive/SUS.csv` | `data/self_report/cognitive/SUS.csv` |

(`user_id` must be `UX_U01` … `UX_U10`; the Zenodo `cognitive/SUS.csv` file is already in this format.)

4. Place the external training feature matrix:

```
models/training_features_core10.csv
```

(or set `TRAINING_FEATURES_CSV` in `apps/api/.env`).

5. Run inference from the repo root:

```bash
cd pipeline
python run_inference.py
python join_sus_activation.py
```

6. Restart the API. Outputs are written to `data/outputs/`.

---

## Expected layout (complete)

```
data/
  Usuarios/
    U1/ … U10/          # Path B only — raw EmotiBit CSVs
  self_report/
    cognitive/
      SUS.csv           # required for both paths
  outputs/
    UX_activation_summary.csv
    UX_sus_activation_join.csv
  participants_registry/  # optional — created by the upload UI
```

## Zenodo deposit contents

| Path on Zenodo | Purpose |
|----------------|---------|
| `participants/U01` … `U10` | Raw EmotiBit exports (Path B) |
| `self_report/SUS.csv` | Public self-report (`user_id` = U01 … U10) |
| `self_report/cognitive/SUS.csv` | Dashboard-ready SUS (`user_id` = UX_U01 … UX_U10) |
| `outputs/UX_activation_summary.csv` | Precomputed activation (Path A) |
| `outputs/UX_sus_activation_join.csv` | SUS × activation join (Path A) |
