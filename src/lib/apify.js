// Cliente mínimo da API REST da Apify (aceita chamadas do navegador).
const BASE = "https://api.apify.com/v2";

export const MAPS_ACTOR = "compass~crawler-google-places";
export const SEARCH_ACTOR = "apify~google-search-scraper";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

export class ApifyError extends Error {
  constructor(message, status, type) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

function friendlyMessage(status, type, fallback) {
  if (status === 401) return "Token da Apify inválido. Copie de novo em console.apify.com → Settings → API & Integrations.";
  if (type === "not-enough-usage-to-run-paid-actor" || status === 402) return "Sua conta Apify está sem créditos para rodar esta busca.";
  if (type === "actor-memory-limit-exceeded") return "A Apify recusou a execução: limite de memória da conta atingido. Aguarde outras execuções terminarem.";
  if (status === 429) return "A Apify está limitando as requisições. Tente de novo em alguns segundos.";
  return fallback || `Erro da Apify (HTTP ${status}).`;
}

async function call(token, path, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApifyError("Não foi possível falar com a Apify. Verifique sua conexão.", 0);
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* corpo não-JSON */ }
  if (!res.ok) {
    const type = json?.error?.type;
    throw new ApifyError(friendlyMessage(res.status, type, json?.error?.message), res.status, type);
  }
  return json;
}

// Conta + uso do mês (o uso é opcional: o token já foi validado)
export async function getAccount(token, signal) {
  const user = (await call(token, "/users/me", { signal })).data;
  let usage = null;
  try {
    const limits = (await call(token, "/users/me/limits", { signal })).data;
    usage = { usedUsd: limits?.current?.monthlyUsageUsd ?? null, limitUsd: limits?.limits?.maxMonthlyUsageUsd ?? null };
  } catch { /* opcional */ }
  return { username: user.username, plan: user.plan?.id || "", usage };
}

export const startRun = (token, actor, input, signal) =>
  call(token, `/acts/${actor}/runs`, { method: "POST", body: input, signal }).then((r) => r.data);

export const getRun = (token, runId, signal) => call(token, `/actor-runs/${runId}`, { signal }).then((r) => r.data);

export const abortRun = (token, runId) => call(token, `/actor-runs/${runId}/abort`, { method: "POST" }).catch(() => {});

export const getItems = (token, datasetId, offset = 0, signal) =>
  call(token, `/datasets/${datasetId}/items?clean=true&offset=${offset}&limit=1000`, { signal });

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason ?? new DOMException("aborted", "AbortError")); }, { once: true });
  });

/**
 * Roda um actor (ou acompanha uma execução existente, via runId) até o fim,
 * entregando os itens do dataset conforme chegam: onItems(novos).
 */
export async function runActor(token, actor, input, { signal, runId, onStart, onItems, pollMs = 2500 } = {}) {
  const run = runId ? await getRun(token, runId, signal) : await startRun(token, actor, input, signal);
  onStart?.(run);
  let offset = 0;
  let status = run.status;
  const onAbort = () => abortRun(token, run.id);
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    for (;;) {
      const current = await getRun(token, run.id, signal);
      status = current.status;
      const items = await getItems(token, run.defaultDatasetId, offset, signal);
      if (items.length) {
        offset += items.length;
        onItems?.(items);
      }
      if (TERMINAL.has(status)) break;
      await sleep(pollMs, signal);
    }
    // Última leitura: itens gravados entre o último poll e o fim
    const tail = await getItems(token, run.defaultDatasetId, offset, signal);
    if (tail.length) { offset += tail.length; onItems?.(tail); }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }

  if (status !== "SUCCEEDED" && offset === 0) {
    throw new ApifyError(status === "TIMED-OUT" ? "A execução na Apify passou do tempo limite." : "A execução na Apify falhou. Veja os detalhes em console.apify.com.", 0, status);
  }
  return { runId: run.id, status, count: offset };
}
