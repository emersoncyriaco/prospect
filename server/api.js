// API local do Prospect: análise de sites e CSV salvo em resultados/.
// Usada como middleware no Vite (npm run dev) e no servidor de produção (npm start).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectWebsite } from "./inspect.js";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Requisição grande demais."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("JSON inválido."), { status: 400 });
  }
}

const slug = (s) =>
  String(s || "busca").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "busca";

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}m${p(d.getSeconds())}s`;
}

// WhatsApp + automação só carregam quando usados (a Baileys é pesada)
let waModule = null;
async function loadWhatsapp() {
  if (!waModule) {
    const [wa, campaign, crm] = await Promise.all([import("./whatsapp.js"), import("./campaign.js"), import("./crm.js")]);
    campaign.startWorker();
    waModule = { ...wa, ...campaign, crm };
  }
  return waModule;
}

/** Reconecta a sessão salva e liga o motor da automação ao subir o servidor. */
export async function startAutomation() {
  const wa = await loadWhatsapp();
  wa.autoStart();
}

export function createApi({ resultsDir }) {
  return async function api(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) return next ? next() : send(res, 404, { erro: "Rota não encontrada." });

    // Só a própria página pode chamar (protege contra sites de terceiros)
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) return send(res, 403, { erro: "Origem não permitida." });
      } catch {
        return send(res, 403, { erro: "Origem não permitida." });
      }
    }

    try {
      if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true });

      if (req.method === "GET" && url.pathname === "/api/inspect") {
        const target = url.searchParams.get("url") || "";
        if (!target || target.length > 500) return send(res, 400, { erro: "Informe o endereço do site." });
        return send(res, 200, await inspectWebsite(target));
      }

      if (req.method === "POST" && url.pathname === "/api/resultados") {
        const body = await readJson(req);
        if (typeof body.csv !== "string" || !body.csv) return send(res, 400, { erro: "CSV vazio." });
        await mkdir(resultsDir, { recursive: true });
        const name = `${stamp()}_${slug(body.nome)}.csv`;
        await writeFile(path.join(resultsDir, name), body.csv);
        return send(res, 200, { arquivo: `resultados/${name}` });
      }

      // ---------- Diagnóstico dos sites ----------
      if (url.pathname === "/api/diag") {
        if (req.headers["x-prospect"] !== "1") return send(res, 403, { erro: "Requisição não autorizada." });
        const diag = await import("./diagnoses.js");
        if (req.method === "GET") return send(res, 200, url.searchParams.get("host") ? { diagnosis: diag.getDiagnosis(url.searchParams.get("host")) } : diag.allDiagnoses());
        if (req.method === "POST") return send(res, 200, await diag.saveDiagnosis(await readJson(req)));
      }

      // ---------- WhatsApp e automação ----------
      if (url.pathname.startsWith("/api/wa/")) {
        // Cabeçalho próprio: um site de terceiros não consegue enviá-lo sem pré-autorização (CORS)
        if (req.headers["x-prospect"] !== "1") return send(res, 403, { erro: "Requisição não autorizada." });
        const wa = await loadWhatsapp();
        const route = `${req.method} ${url.pathname}`;
        if (route === "GET /api/wa/status") return send(res, 200, wa.getStatus());
        if (route === "POST /api/wa/connect") return send(res, 200, await wa.connect());
        if (route === "POST /api/wa/logout") return send(res, 200, await wa.logout());
        if (route === "GET /api/wa/campaign") return send(res, 200, wa.getCampaign());
        if (route === "POST /api/wa/enqueue") {
          const body = await readJson(req);
          return send(res, 200, { added: wa.enqueue(Array.isArray(body.items) ? body.items.slice(0, 200) : []) });
        }
        if (route === "POST /api/wa/retarget") {
          const body = await readJson(req);
          return send(res, 200, { fixed: wa.retarget(Array.isArray(body.changes) ? body.changes.slice(0, 500) : []) });
        }
        if (route === "POST /api/wa/override") { wa.setHoursOverride(!!(await readJson(req)).on); return send(res, 200, wa.getCampaign()); }
        if (route === "POST /api/wa/pause") { wa.setPaused((await readJson(req)).paused); return send(res, 200, wa.getCampaign()); }
        if (route === "POST /api/wa/settings") return send(res, 200, wa.updateSettings(await readJson(req)));
        if (route === "POST /api/wa/remove") { wa.removeItem(String((await readJson(req)).id || "")); return send(res, 200, wa.getCampaign()); }
        if (route === "POST /api/wa/clear") { wa.clearFinished(); return send(res, 200, wa.getCampaign()); }

        // ---------- CRM das conversas e IA ----------
        const { crm } = wa;
        if (route === "GET /api/wa/crm") return send(res, 200, crm.getCrm());
        if (req.method === "POST" && url.pathname.startsWith("/api/wa/crm/")) {
          const body = await readJson(req);
          const id = String(body.id || "");
          switch (url.pathname.slice("/api/wa/crm/".length)) {
            case "read": return send(res, 200, crm.markRead(id));
            case "update": return send(res, 200, crm.updateConv(id, body.patch || {}));
            case "send": return send(res, 200, await crm.sendManual(id, body.text));
            case "draft": return send(res, 200, await crm.draftAction(id, body.action, body.text));
            case "suggest": return send(res, 200, await crm.suggestDraft(id));
            case "context": return send(res, 200, crm.setContexts(Array.isArray(body.items) ? body.items : []));
            case "ai": return send(res, 200, crm.updateAi(body.patch || {}));
            case "key": return send(res, 200, await crm.saveKey(body.key));
            case "key-remove": return send(res, 200, await crm.removeKey());
          }
        }
        return send(res, 404, { erro: "Rota não encontrada." });
      }

      return send(res, 404, { erro: "Rota não encontrada." });
    } catch (err) {
      return send(res, err.status || 500, { erro: err.message || "Erro inesperado." });
    }
  };
}
