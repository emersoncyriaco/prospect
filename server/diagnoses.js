// Diagnóstico de cada site (o que está bom, as dores e o veredito), guardado pelo endereço do site.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(".prospect-data", "diagnosticos.json");
const VERDICTS = ["manter", "melhorar", "refazer"];

const D = (globalThis.__prospectDiagnoses ??= { byHost: null });
if (!D.byHost) {
  try { D.byHost = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {}; } catch { D.byHost = {}; }
}

// "https://www.site.com.br/pagina" → "site.com.br"
export function hostKey(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return "";
  try { return new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, ""); } catch { return ""; }
}

const list = (v) => (Array.isArray(v) ? v : String(v || "").split("\n")).map((x) => String(x).trim()).filter(Boolean).slice(0, 30).map((x) => x.slice(0, 400));

export const getDiagnosis = (host) => D.byHost[hostKey(host)] || null;
export const allDiagnoses = () => D.byHost;

export async function saveDiagnosis(input) {
  const key = hostKey(input.host);
  if (!key) throw Object.assign(new Error("Informe o endereço do site."), { status: 400 });
  D.byHost[key] = {
    host: key,
    verdict: VERDICTS.includes(input.verdict) ? input.verdict : "melhorar",
    summary: String(input.summary || "").trim().slice(0, 600),
    good: list(input.good),
    bad: list(input.bad),
    updatedAt: Date.now(),
  };
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(D.byHost, null, 2));
  return D.byHost[key];
}
