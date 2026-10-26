export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const nf = new Intl.NumberFormat("pt-BR");
export const fmtNumber = (n) => nf.format(n);
export const plural = (n, one, many) => `${fmtNumber(n)} ${n === 1 ? one : many}`;
export const fmtUsd = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
export const fmtRating = (n) => n.toFixed(1).replace(".", ",");

export function relativeTime(ts) {
  if (!ts) return "";
  const minutes = Math.round((Date.now() - ts) / 60000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (minutes < 1) return "agora";
  if (minutes < 60) return rtf.format(-minutes, "minute");
  if (minutes < 1440) return rtf.format(-Math.round(minutes / 60), "hour");
  return rtf.format(-Math.round(minutes / 1440), "day");
}

// "2016-03-14" → "14/03/2016 · 10 anos"
export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  const years = Math.floor((Date.now() - new Date(iso).getTime()) / (365.25 * 864e5));
  return `${d}/${m}/${y}${years >= 1 ? ` · ${plural(years, "ano", "anos")}` : ""}`;
}

export function initials(name) {
  const parts = String(name || "?").split(" ").filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p));
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts.at(-1)[0] : "")).toUpperCase();
}

// Cor estável do avatar a partir do nome
export const hue = (text) => [...String(text)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
