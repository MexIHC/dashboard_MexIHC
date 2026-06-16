# Training feature matrix

Physiological inference retrains two classifiers on each run:

- **Stress:** SVM (RBF), reference BACC 0.7769  
- **Cognitive load:** Gradient Boosting with stress→load transfer, reference BACC 0.8948  

Both models expect a CSV with ten window-level features plus columns `experiment`, `label`, and the usual metadata. The stress split uses rows where `experiment == stress`.

## This file is not included in the public repo

Place your licensed training corpus here:

```
models/training_features_core10.csv
```

Or set `TRAINING_FEATURES_CSV` in `apps/api/.env` to an absolute path.

The training corpus comes from a separate stress/cognitive-load study and is **not** part of the MexIHC UX pilot dataset on Zenodo.
