# Study data (not included in Git)

Place downloaded files under this folder. The public data deposit is linked from the [root README](../README.md#study-data).

## Path A — Quick view *(recommended)*

Copy three files from the Zenodo archive:

| Archive path | Dashboard path |
|--------------|----------------|
| `outputs/UX_activation_summary.csv` | `data/outputs/UX_activation_summary.csv` |
| `outputs/UX_sus_activation_join.csv` | `data/outputs/UX_sus_activation_join.csv` |
| `self_report/SUS.csv` | `data/self_report/SUS.csv` |

Restart the API. No raw signals or training matrix required.

The SUS file uses `user_id` **U01–U10** (same as Zenodo). The API maps these to activation IDs (`UX_U01`, …) automatically.

## Path B — Full reproduction from raw signals

| Archive folder | Dashboard folder |
|----------------|------------------|
| `participants/U01/` | `data/Usuarios/U1/` |
| `participants/U02/` | `data/Usuarios/U2/` |
| … | … |
| `participants/U10/` | `data/Usuarios/U10/` |

Also copy `self_report/SUS.csv` → `data/self_report/SUS.csv`, add `models/training_features_core10.csv`, then run:

```bash
python pipeline/run_inference.py
python pipeline/join_sus_activation.py
```

## Complete layout

```
data/
  Usuarios/U1 … U10/     # Path B — raw EmotiBit CSVs
  self_report/SUS.csv
  outputs/
    UX_activation_summary.csv
    UX_sus_activation_join.csv
  participants_registry/   # optional — created by upload UI
```

**Legacy:** if you still have `self_report/cognitive/SUS.csv` (IDs `UX_U01`, …), the API and pipeline will read it as a fallback until you migrate to `self_report/SUS.csv`.
