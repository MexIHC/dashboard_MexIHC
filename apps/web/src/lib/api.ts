/** Si `VITE_API_ORIGIN` está definido (p. ej. http://127.0.0.1:8002), las peticiones van directo al API. */
export function apiUrl(path: string): string {
  const origin = (import.meta.env.VITE_API_ORIGIN ?? "").trim().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return origin ? `${origin}${p}` : p;
}
