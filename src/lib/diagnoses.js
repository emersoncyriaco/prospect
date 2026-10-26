// Diagnóstico de cada site, guardado no servidor local (por endereço do site)
const headers = { "X-Prospect": "1", "Content-Type": "application/json" };

export const VERDICTS = {
  manter: { label: "Manter", tone: "green", hint: "Site bom: venda melhorias pontuais" },
  melhorar: { label: "Melhorar", tone: "orange", hint: "Tem dores reais para resolver" },
  refazer: { label: "Refazer", tone: "red", hint: "Vale propor um site novo" },
};

export async function fetchAllDiagnoses() {
  try {
    const res = await fetch("/api/diag", { headers });
    return res.ok ? await res.json() : {};
  } catch {
    return {};
  }
}

export async function saveDiagnosis(diagnosis) {
  const res = await fetch("/api/diag", { method: "POST", headers, body: JSON.stringify(diagnosis) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || "Não foi possível salvar o diagnóstico.");
  return data;
}

export const diagKey = (lead) => (lead?.site?.type === "site" ? lead.site.host : "");
