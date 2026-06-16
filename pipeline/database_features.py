"""
Pipeline de features DMAPS a partir del dataset de señales crudas (dataset_raw_v1.csv).

Fundamentación:
- PPG/HRV: Señal cruda PG → ppg_process (NeuroKit2) → picos → RR → hrv_time, hrv_frequency, hrv_nonlinear (NeuroKit2).
  Refs: NeuroKit2 PPG/HRV; Shaffer & Ginsberg (2017) HRV metrics and norms (PMC5624990).
- EDA: Señal cruda EA → eda_process → componentes tónico/fásico y SCR (NeuroKit2).
  Refs: NeuroKit2 EDA; tónico (SCL), fásico (SCR), amplitud, número de picos.
- SpO2: Ratio R = (AC_red/DC_red)/(AC_infrared/DC_infrared) desde PR y PI; SpO2 ≈ 110 - 25*R (aproximación empírica).
  Refs: ratio of ratios (Maxim, TI app notes); calibración device-specific en producción.
- TH: Temperatura en °C; estadísticos básicos (media, SD) por ventana. No requiere NeuroKit.
- IMU: Magnitud ACC/GYR, frecuencia pico y entropía espectral (literatura estrés/fatiga con wearables).

Entrada: dataset_raw_v1.csv (generado por database_raw.py).
Salida: dataset_features_v1.csv + Reporte_Datos_Features.txt.
"""
import pandas as pd
import numpy as np
import neurokit2 as nk
import os
import contextlib
import joblib
from tqdm import tqdm
import warnings
from scipy.signal import welch
from scipy.interpolate import interp1d
from datetime import datetime
from joblib import Parallel, delayed

# =============================================================================
# 1. CONFIGURACIÓN
# =============================================================================
CONFIG = {
    "INPUT_FILE": "dataset_raw_v1.csv",
    "OUTPUT_FILE": "dataset_features_v1.csv",
    "REPORT_FILE": "Reporte_Datos_Features.txt",
    "FS": 15,
    "FS_PPG": 25,  # NeuroKit elgendi requiere fs > 16 Hz; resampleamos PG a 25 Hz solo para PPG/HRV
    "WINDOW_SEC": 60,
    "STEP_SEC": 30,
    "MIN_RR_MS": 250,
    "MAX_RR_MS": 1500,
    "N_JOBS": -1,
}

WIN_SIZE = CONFIG["WINDOW_SEC"] * CONFIG["FS"]
STEP_SIZE = CONFIG["STEP_SEC"] * CONFIG["FS"]
warnings.filterwarnings("ignore")

# Features: HRV (desde PG), EDA, SpO2/R (PR+PI), IMU, TH
ALL_FEATURE_KEYS = [
    "HRV_MeanNN", "HRV_SDNN", "HRV_RMSSD", "HRV_pNN50",
    "HRV_LF", "HRV_HF", "HRV_LFHF",
    "HRV_SD1", "HRV_SD2", "HRV_SD1SD2", "HRV_SampEn",
    "PPG_Rate_Mean",
    "EDA_Tonic_Mean", "EDA_Tonic_SD", "EDA_Tonic_Slope",
    "EDA_SCR_Peaks_N", "EDA_SCR_Amplitude_Mean",
    "SpO2_R_Value", "SpO2_Est",
    "IMU_ACC_Mag_Mean", "IMU_ACC_Peak_Freq", "IMU_ACC_Entropy",
    "IMU_GYR_Mag_Mean", "IMU_GYR_Peak_Freq", "IMU_GYR_Entropy",
    "TH_Mean", "TH_SD",
]

# Origen de cada feature para el reporte (NeuroKit2 vs NumPy/SciPy)
FEATURE_SOURCE = {
    "HRV_MeanNN": "NeuroKit2",
    "HRV_SDNN": "NeuroKit2",
    "HRV_RMSSD": "NeuroKit2",
    "HRV_pNN50": "NeuroKit2",
    "HRV_LF": "NeuroKit2",
    "HRV_HF": "NeuroKit2",
    "HRV_LFHF": "NeuroKit2",
    "HRV_SD1": "NeuroKit2",
    "HRV_SD2": "NeuroKit2",
    "HRV_SD1SD2": "NeuroKit2",
    "HRV_SampEn": "NeuroKit2",
    "PPG_Rate_Mean": "NeuroKit2",
    "EDA_Tonic_Mean": "NeuroKit2",
    "EDA_Tonic_SD": "NeuroKit2",
    "EDA_Tonic_Slope": "NeuroKit2",
    "EDA_SCR_Peaks_N": "NeuroKit2",
    "EDA_SCR_Amplitude_Mean": "NeuroKit2",
    "SpO2_R_Value": "NumPy/SciPy",
    "SpO2_Est": "NumPy/SciPy",
    "IMU_ACC_Mag_Mean": "NumPy/SciPy",
    "IMU_ACC_Peak_Freq": "NumPy/SciPy",
    "IMU_ACC_Entropy": "NumPy/SciPy",
    "IMU_GYR_Mag_Mean": "NumPy/SciPy",
    "IMU_GYR_Peak_Freq": "NumPy/SciPy",
    "IMU_GYR_Entropy": "NumPy/SciPy",
    "TH_Mean": "NumPy/SciPy",
    "TH_SD": "NumPy/SciPy",
}


# =============================================================================
# 2. UTILERÍA
# =============================================================================
@contextlib.contextmanager
def tqdm_joblib(tqdm_object):
    class TqdmBatchCompletionCallback(joblib.parallel.BatchCompletionCallBack):
        def __call__(self, *args, **kwargs):
            tqdm_object.update(n=self.batch_size)
            return super().__call__(*args, **kwargs)
    old_cb = joblib.parallel.BatchCompletionCallBack
    joblib.parallel.BatchCompletionCallBack = TqdmBatchCompletionCallback
    try:
        yield tqdm_object
    finally:
        joblib.parallel.BatchCompletionCallBack = old_cb
        tqdm_object.close()


def _hrv_fallback_math(rr_clean):
    """Rescate manual cuando NeuroKit falla (ruido o pocos latidos)."""
    out = {k: np.nan for k in ["HRV_LF", "HRV_HF", "HRV_LFHF", "HRV_SD1", "HRV_SD2", "HRV_SD1SD2"]}
    if len(rr_clean) < 5:
        return out
    try:
        diff_rr = np.diff(rr_clean)
        sd1 = np.sqrt(np.std(diff_rr, ddof=1) ** 2 * 0.5)
        sd2 = np.sqrt(2 * np.std(rr_clean, ddof=1) ** 2 - 0.5 * np.std(diff_rr, ddof=1) ** 2)
        out["HRV_SD1"], out["HRV_SD2"] = sd1, sd2
        out["HRV_SD1SD2"] = sd1 / sd2 if sd2 > 0 else np.nan
        ts = (np.cumsum(rr_clean) / 1000.0) - (rr_clean[0] / 1000.0)
        fs_i = 4.0
        steps = np.arange(0, ts[-1], 1 / fs_i)
        if len(steps) > 32:
            f_int = interp1d(ts, rr_clean, kind="linear", fill_value="extrapolate")
            rr_i = f_int(steps)
            f, p = welch(rr_i, fs=fs_i, nperseg=min(256, len(rr_i)))
            lf = np.trapz(p[(f >= 0.04) & (f < 0.15)], f[(f >= 0.04) & (f < 0.15)])
            hf = np.trapz(p[(f >= 0.15) & (f < 0.40)], f[(f >= 0.15) & (f < 0.40)])
            out["HRV_LF"], out["HRV_HF"] = lf, hf
            out["HRV_LFHF"] = lf / hf if hf > 0 else np.nan
    except Exception:
        pass
    return out


def _spectral_entropy(signal, fs):
    """Entropía espectral normalizada (0-1)."""
    if len(signal) < 32:
        return np.nan
    try:
        f, p = welch(signal, fs=fs, nperseg=min(256, len(signal) // 2))
        p = p / (np.sum(p) + 1e-12)
        p = p[p > 0]
        return -np.sum(p * np.log2(p)) / np.log2(len(p)) if len(p) > 0 else np.nan
    except Exception:
        return np.nan


def _peak_freq(signal, fs, low=0.1, high=5.0):
    """Frecuencia de pico dominante en banda [low, high] Hz."""
    if len(signal) < 32:
        return np.nan
    try:
        f, p = welch(signal, fs=fs, nperseg=min(256, len(signal) // 2))
        mask = (f >= low) & (f <= high)
        if not np.any(mask):
            return np.nan
        idx = np.argmax(p[mask])
        return f[mask][idx]
    except Exception:
        return np.nan


def _spo2_from_ppg(red, ir, fs):
    """
    Ratio R y estimación SpO2 desde canales PPG rojo (PR) e infrarrojo (PI).
    R = (AC_red/DC_red) / (AC_ir/DC_ir). SpO2 ≈ 110 - 25*R (empírico; calibración device-specific).
    """
    if len(red) < 20 or len(ir) < 20:
        return np.nan, np.nan
    try:
        red = np.asarray(red, dtype=float)
        ir = np.asarray(ir, dtype=float)
        red = np.nan_to_num(red, nan=np.nanmean(red))
        ir = np.nan_to_num(ir, nan=np.nanmean(ir))
        win = max(int(0.75 * fs), 8)
        dc_r = pd.Series(red).rolling(win, min_periods=1).mean().values
        dc_i = pd.Series(ir).rolling(win, min_periods=1).mean().values
        ac_r = np.abs(red - dc_r)
        ac_i = np.abs(ir - dc_i)
        dc_r = np.clip(dc_r, 1e-6, None)
        dc_i = np.clip(dc_i, 1e-6, None)
        r_vals = (ac_r / dc_r) / (ac_i / dc_i + 1e-12)
        r_vals = r_vals[np.isfinite(r_vals)]
        if len(r_vals) < 5:
            return np.nan, np.nan
        r_median = np.median(r_vals)
        r_median = np.clip(r_median, 0.4, 2.0)
        spo2 = 110.0 - 25.0 * r_median
        spo2 = np.clip(spo2, 70.0, 100.0)
        return float(r_median), float(spo2)
    except Exception:
        return np.nan, np.nan


# =============================================================================
# 3. EXTRACCIÓN POR VENTANA (PG → HRV; EA → EDA; PR,PI → SpO2; IMU; TH)
# =============================================================================
def extract_window_features(win_df):
    feats = {k: np.nan for k in ALL_FEATURE_KEYS}
    fs = CONFIG["FS"]

    # ----- PPG (PG) → HRV y FC -----
    # NeuroKit elgendi exige fs > 16 Hz (filtro 0.5–8 Hz); PG está a 15 Hz → resamplear a FS_PPG
    try:
        pg = pd.to_numeric(win_df["PG"], errors="coerce").interpolate().values
        if len(pg) >= fs * 10:
            fs_ppg = CONFIG["FS_PPG"]
            n_ppg = int(len(pg) * fs_ppg / fs)
            pg_ppg = np.interp(np.linspace(0, len(pg) - 1, n_ppg), np.arange(len(pg)), pg)
            ppg_signals, info = nk.ppg_process(pg_ppg, sampling_rate=fs_ppg, method="elgendi")
            feats["PPG_Rate_Mean"] = ppg_signals["PPG_Rate"].replace(0, np.nan).mean()
            peaks = info.get("PPG_Peaks")
            if peaks is None:
                peaks = np.where(ppg_signals["PPG_Peaks"].values == 1)[0]
            else:
                peaks = np.atleast_1d(peaks)
            if len(peaks) >= 3:
                ppi_ms = (np.diff(peaks) / fs_ppg) * 1000.0
                rr_clean = ppi_ms[(ppi_ms >= CONFIG["MIN_RR_MS"]) & (ppi_ms <= CONFIG["MAX_RR_MS"])]
                if len(rr_clean) >= 3:
                    rri_time = np.cumsum(rr_clean) / 1000.0
                    peaks_dict = {"RRI": rr_clean, "RRI_Time": rri_time}
                    # HRV tiempo: NeuroKit (fallback NumPy si falla)
                    try:
                        ht = nk.hrv_time(peaks_dict, sampling_rate=1000)
                        feats["HRV_MeanNN"] = ht["HRV_MeanNN"].values[0]
                        feats["HRV_SDNN"] = ht["HRV_SDNN"].values[0]
                        feats["HRV_RMSSD"] = ht["HRV_RMSSD"].values[0]
                        feats["HRV_pNN50"] = ht["HRV_pNN50"].values[0]
                    except Exception:
                        diff = np.diff(rr_clean)
                        feats["HRV_MeanNN"] = np.mean(rr_clean)
                        feats["HRV_SDNN"] = np.std(rr_clean, ddof=1)
                        feats["HRV_RMSSD"] = np.sqrt(np.mean(diff ** 2))
                        feats["HRV_pNN50"] = (np.sum(np.abs(diff) > 50) / len(diff)) * 100
                    # HRV frecuencia y no lineal: NeuroKit (fallback _hrv_fallback_math si falla)
                    nk_ok = False
                    if len(rr_clean) >= 5:
                        try:
                            hf = nk.hrv_frequency(peaks_dict, sampling_rate=1000, psd_method="welch")
                            hn = nk.hrv_nonlinear(peaks_dict, sampling_rate=1000)
                            feats["HRV_SampEn"] = hn["HRV_SampEn"].values[0]
                            feats["HRV_LF"] = hf["HRV_LF"].values[0]
                            feats["HRV_HF"] = hf["HRV_HF"].values[0]
                            feats["HRV_LFHF"] = hf["HRV_LFHF"].values[0]
                            feats["HRV_SD1"] = hn["HRV_SD1"].values[0]
                            feats["HRV_SD2"] = hn["HRV_SD2"].values[0]
                            feats["HRV_SD1SD2"] = hn["HRV_SD1SD2"].values[0]
                            nk_ok = True
                        except Exception:
                            pass
                    if not nk_ok or np.isnan(feats.get("HRV_LF", np.nan)):
                        feats.update(_hrv_fallback_math(rr_clean))
    except Exception:
        pass

    # ----- EDA (EA) → Tónico, SCR -----
    try:
        eda = pd.to_numeric(win_df["EA"], errors="coerce").interpolate().values
        if len(eda) >= fs * 10:
            ep, _ = nk.eda_process(eda, sampling_rate=fs)
            feats["EDA_Tonic_Mean"] = ep["EDA_Tonic"].mean()
            feats["EDA_Tonic_SD"] = ep["EDA_Tonic"].std()
            if len(ep) > 2:
                x = np.arange(len(ep))
                feats["EDA_Tonic_Slope"] = np.polyfit(x, ep["EDA_Tonic"].values, 1)[0]
            ei = nk.eda_intervalrelated(ep, sampling_rate=fs)
            if ei is not None and not ei.empty:
                feats["EDA_SCR_Peaks_N"] = ei["SCR_Peaks_N"].iloc[0] if "SCR_Peaks_N" in ei.columns else np.nan
                feats["EDA_SCR_Amplitude_Mean"] = ei["SCR_Peaks_Amplitude_Mean"].iloc[0] if "SCR_Peaks_Amplitude_Mean" in ei.columns else np.nan
    except Exception:
        pass

    # ----- SpO2: PR (rojo), PI (infrarrojo) -----
    try:
        if "PR" in win_df.columns and "PI" in win_df.columns:
            pr = win_df["PR"].values
            pi = win_df["PI"].values
            r_val, spo2 = _spo2_from_ppg(pr, pi, fs)
            feats["SpO2_R_Value"] = r_val
            feats["SpO2_Est"] = spo2
    except Exception:
        pass

    # ----- IMU: magnitud, frecuencia pico, entropía espectral -----
    try:
        acc = np.sqrt(win_df["AX"].astype(float)**2 + win_df["AY"].astype(float)**2 + win_df["AZ"].astype(float)**2)
        feats["IMU_ACC_Mag_Mean"] = np.nanmean(acc)
        feats["IMU_ACC_Peak_Freq"] = _peak_freq(acc.values, fs)
        feats["IMU_ACC_Entropy"] = _spectral_entropy(acc.values, fs)
    except Exception:
        pass
    try:
        gyr = np.sqrt(win_df["GX"].astype(float)**2 + win_df["GY"].astype(float)**2 + win_df["GZ"].astype(float)**2)
        feats["IMU_GYR_Mag_Mean"] = np.nanmean(gyr)
        feats["IMU_GYR_Peak_Freq"] = _peak_freq(gyr.values, fs)
        feats["IMU_GYR_Entropy"] = _spectral_entropy(gyr.values, fs)
    except Exception:
        pass

    # ----- Temperatura (TH): media y SD -----
    try:
        th = pd.to_numeric(win_df["TH"], errors="coerce")
        feats["TH_Mean"] = th.mean()
        feats["TH_SD"] = th.std()
    except Exception:
        pass

    return feats


def process_subject_group(name, df_seg):
    results = []
    for i in range(0, len(df_seg) - (WIN_SIZE // 2), STEP_SIZE):
        end = min(i + WIN_SIZE, len(df_seg))
        f = extract_window_features(df_seg.iloc[i:end])
        f.update({
            "subject_id": name[0],
            "label": name[1],
            "experiment": name[2],
            "academic_level": name[3],
        })
        results.append(f)
    return results


def generar_reporte(df, report_path):
    """Genera Reporte_Datos_Features.txt con volumen, calidad por feature y distribución."""
    posibles_labels = ["Basal", "Inicio", "Desarrollo", "Cierre", "Preguntas", "Tarea 1", "Tarea 2"]
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("=" * 70 + "\n")
        f.write("   REPORTE DE FEATURES - PROYECTO DMAPS\n")
        f.write(f"   ARCHIVO: {CONFIG['OUTPUT_FILE']}\n")
        f.write(f"   FECHA: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("=" * 70 + "\n\n")
        f.write("1. VOLUMEN\n")
        f.write("-" * 40 + "\n")
        f.write(f"- Total ventanas: {len(df):,}\n")
        f.write(f"- Sujetos: {df['subject_id'].nunique()}\n\n")
        f.write("2. CALIDAD POR FEATURE (Non-Null %)\n")
        f.write("-" * 40 + "\n")
        for k in ALL_FEATURE_KEYS:
            if k in df.columns:
                rate = (1 - df[k].isna().mean()) * 100
                status = "OK" if rate > 80 else ("RUIDO" if rate > 50 else "CRÍTICO")
                f.write(f"  {k:<28} {rate:>7.2f}%  {status}\n")
        f.write("\n3. ORIGEN POR FEATURE (librería)\n")
        f.write("-" * 40 + "\n")
        for k in ALL_FEATURE_KEYS:
            if k in df.columns:
                lib = FEATURE_SOURCE.get(k, "—")
                f.write(f"  {k:<28} {lib}\n")
        f.write("\n4. DISTRIBUCIÓN POR FASE Y EXPERIMENTO\n")
        f.write("-" * 40 + "\n")
        audit = df.groupby(["subject_id", "experiment", "label"]).size().unstack(fill_value=0)
        cols = [c for c in posibles_labels if c in audit.columns]
        if cols:
            f.write(audit[cols].to_string() + "\n")
        f.write("\n--- FIN DEL REPORTE ---\n")
    print(f"  Reporte generado: {report_path}")


# =============================================================================
# 4. MAIN
# =============================================================================
if __name__ == "__main__":
    print("\n Pipeline de features DMAPS (PG → HRV; EA → EDA; PR/PI → SpO2; IMU; TH)")
    if not os.path.exists(CONFIG["INPUT_FILE"]):
        print(f"  Error: no se encontró {CONFIG['INPUT_FILE']}")
    else:
        df_raw = pd.read_csv(CONFIG["INPUT_FILE"])
        groups = list(df_raw.groupby(["subject_id", "label", "experiment", "academic_level"]))
        with tqdm_joblib(tqdm(desc="  Ventanas", total=len(groups))) as pbar:
            results_lists = Parallel(n_jobs=CONFIG["N_JOBS"])(
                delayed(process_subject_group)(name, grp) for name, grp in groups
            )
        df_final = pd.DataFrame([item for sublist in results_lists for item in sublist])
        meta = ["subject_id", "label", "experiment", "academic_level"]
        cols = meta + [c for c in ALL_FEATURE_KEYS if c in df_final.columns]
        df_final = df_final[[c for c in cols if c in df_final.columns]]
        df_final.to_csv(CONFIG["OUTPUT_FILE"], index=False)
        generar_reporte(df_final, CONFIG["REPORT_FILE"])
        print(f"  Dataset guardado: {CONFIG['OUTPUT_FILE']}")
