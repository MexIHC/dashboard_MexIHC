# Data contract (v1.0.0)

Official layout for the MexIHC multimodal UX study when using this dashboard.

## Directory layout

```
data/
  Usuarios/U{n}/*_{TAG}.csv     # EmotiBit exports
  self_report/SUS.csv
  outputs/UX_activation_summary.csv
  outputs/UX_sus_activation_join.csv
  participants_registry/{user_id}.json   # optional manifests
```

## EmotiBit signals

Required for inference: **EA** (EDA) and **UN** (user notes / phase markers).  
Recommended: TH, PG, PR, PI, AX–AZ, GX–GZ.

Phase markers in UN files use tags: `baseline`, `task1`, `task1_end`, `task2`, …

## SUS file

CSV with columns including `user_id` (`U01` … `U10`, Zenodo format), `sus_score` (0–100), demographics as coded integers (see API `ux_uv_data.py` mappings).

## Inference outputs

`UX_activation_summary.csv` columns include:

- `self_report_id`, `phase` (`Basal`, `Task 1`, `Task 2`, `Task 3`, `__GLOBAL__`)
- `domain` (`stress`, `cognitive_load`)
- `delta_score`, `mean_score`, `baseline_score`, `n_windows`

## Training matrix (external)

Not part of the Zenodo UX deposit. Must include ten feature columns, `experiment`, `label`, and stress rows for model fitting. See `models/README.md`.

## Versioning

Breaking schema changes increment `DATA_CONTRACT_VERSION` in `.env` and this document.
