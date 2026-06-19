/**
 * Morado: autoinforme SUS · Rojo: estrés · Azul: carga cognitiva · Verde: demografía (cohorte UX_UV).
 * Tonos suavizados (400) para mejor lectura en pantalla.
 */
export const DOMAIN_STRESS = "#f87171";
export const DOMAIN_COGNITIVE = "#38bdf8";

/** Demografía UX_UV y chips U01–U10 (Tailwind emerald-300). */
export const BAR_DEMOGRAPHIC = "#6ee7b7";

/** Sample-summary bar colors; pie charts and chips use DOMAIN_*. */
export const HOME_DOMAIN_BAR_STRESS = BAR_DEMOGRAPHIC;
export const HOME_DOMAIN_BAR_COGNITIVE = "#7dd3fc";

/** SUS en barras y líneas. */
export const LINE_SELF_REPORT = "#a78bfa";
export const LINE_PHYSIO_SIGNAL = DOMAIN_STRESS;

/** Barras agrupadas autoinforme vs señales: morado (SUS) y rojo (estrés). */
export const BAR_AUTOINFORME = LINE_SELF_REPORT;
export const BAR_SENALES = LINE_PHYSIO_SIGNAL;
