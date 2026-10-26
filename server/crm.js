// CRM das conversas do WhatsApp: mensagens de cada lead, etapa da negociação e respostas da IA.
// Só entram conversas de leads (números que receberam a prospecção): contatos pessoais nunca são lidos nem respondidos.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isConnected, sendHuman, sendNow } from "./whatsapp.js";
import { getDiagnosis, hostKey } from "./diagnoses.js";
import { friendlyError, keyInfo, removeKey as removeAiKey, saveKey as saveAiKey, suggestReply } from "./ai.js";

const FILE = path.resolve(".prospect-data", "conversas.json");
export const STAGES = ["novo", "interessado", "negociando", "agendado", "fechado", "perdido"];
const AI_STAGE = { interested: "interessado", negotiating: "negociando", scheduled: "agendado", lost: "perdido" };

export const DEFAULT_AI = {
  enabled: false,
  mode: "auto", // auto: a IA envia · draft: a IA escreve e você aprova
  waitSec: 15, // espera o lead terminar de escrever (várias mensagens seguidas viram uma resposta)
  maxPerDay: 12, // respostas da IA por conversa por dia (trava contra robôs que respondem robôs)
  name: "Emerson",
  business: "Sou o Emerson, web designer. Crio sites profissionais e landing pages para negócios locais, pensados para aparecer no Google e trazer clientes pelo WhatsApp.",
  goal: "Entender o que o negócio precisa e marcar uma conversa rápida de 15 minutos (ligação ou vídeo) para o Emerson mostrar uma ideia, sem compromisso.",
  rules: "Não fale de preço nem de prazo: diga que depende do projeto e que o Emerson manda uma proposta depois de entender a necessidade. Não envie links nem arquivos.",
};

// Um estado por processo (o servidor de desenvolvimento recarrega este arquivo)
const R = (globalThis.__prospectCrm ??= { data: null, timers: new Map(), working: new Set() });
R.data ??= load();
const data = R.data;

function load() {
  try {
    if (existsSync(FILE)) {
      const d = JSON.parse(readFileSync(FILE, "utf8"));
      return { ai: { ...DEFAULT_AI, ...d.ai }, convs: Array.isArray(d.convs) ? d.convs : [], synced: d.synced || [] };
    }
  } catch { /* arquivo corrompido: começa de novo */ }
  return { ai: { ...DEFAULT_AI }, convs: [], synced: [] };
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(data, null, 2));
  }, 300);
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const digits = (n) => String(n || "").replace(/\D/g, "");
const sameNumber = (a, b) => digits(a).slice(-8).length === 8 && digits(a).slice(-8) === digits(b).slice(-8);
const findConv = (numbers) => data.convs.find((c) => numbers.some((n) => sameNumber(n, c.to)));
const byId = (id) => {
  const conv = data.convs.find((c) => c.id === id);
  if (!conv) throw Object.assign(new Error("Conversa não encontrada."), { status: 404 });
  return conv;
};
const str = (v, max) => String(v || "").trim().slice(0, max);

function cleanContext(c = {}) {
  return { owner: str(c.owner, 120), city: str(c.city, 120), site: str(c.site, 300), observation: str(c.observation, 200), score: Number(c.score) || 0 };
}

function ensureConv({ to, jid, leadId, company, context }) {
  let conv = findConv([to]);
  if (!conv) {
    conv = {
      id: uid(), to: digits(to), jid: jid || "", leadId: String(leadId || ""), company: str(company, 120),
      contactName: "", context: cleanContext(context), stage: "novo", stageBy: "", aiMode: "auto",
      needsYou: null, draft: null, summary: "", notes: "", unread: 0, aiError: "",
      aiToday: { date: "", count: 0 }, optedOut: false, messages: [], createdAt: Date.now(), updatedAt: Date.now(),
    };
    data.convs.push(conv);
  } else {
    if (jid && !conv.jid) conv.jid = jid;
    if (company && !conv.company) conv.company = str(company, 120);
    if (leadId && !conv.leadId) conv.leadId = String(leadId);
    if (context && !conv.context?.site && !conv.context?.owner) conv.context = cleanContext(context);
  }
  return conv;
}

function push(conv, msg) {
  if (msg.id && conv.messages.some((m) => m.id === msg.id)) return false;
  conv.messages.push({ id: msg.id || uid(), from: msg.from, kind: msg.kind || msg.from, text: str(msg.text, 4000), at: msg.at || Date.now() });
  if (conv.messages.length > 300) conv.messages = conv.messages.slice(-300);
  conv.updatedAt = Date.now();
  return true;
}

// ---------- Eventos vindos da prospecção e do WhatsApp ----------

/** Mensagem de prospecção ou follow-up que a automação enviou. */
export function recordOutgoing({ item, text, kind, id }) {
  const conv = ensureConv({ to: item.to, jid: item.jid, leadId: item.leadId, company: item.company, context: item.context });
  push(conv, { id, from: "me", kind, text, at: Date.now() });
  save();
}

/** Mensagem de um lead (a automação já sabe se é pedido para sair e de qual item da fila veio). */
export function leadMessage({ numbers, text, at, jid, name, id, optOut, item }) {
  const conv = findConv(numbers) || (item ? ensureConv({ to: item.to, jid: item.jid || jid, leadId: item.leadId, company: item.company, context: item.context }) : null);
  if (!conv) return; // não é lead: ignora
  if (jid) conv.jid = jid; // responde no mesmo endereço em que o lead escreveu
  if (name && !conv.contactName) conv.contactName = str(name, 80);
  if (!push(conv, { id, from: "lead", text, at })) return;
  conv.unread += 1;
  conv.lastLeadAt = at;
  if (optOut) {
    conv.optedOut = true;
    conv.stage = "perdido";
    conv.aiMode = "paused";
    conv.draft = null;
    clearTimeout(R.timers.get(conv.id));
  } else {
    scheduleAi(conv);
  }
  save();
}

/** Você respondeu pelo celular: a mensagem entra na conversa e a IA para de responder esse lead. */
export function ownMessage({ numbers, text, at, id }) {
  const conv = findConv(numbers);
  if (!conv || !push(conv, { id, from: "me", kind: "me", text, at })) return;
  clearTimeout(R.timers.get(conv.id));
  conv.draft = null;
  conv.needsYou = null;
  if (conv.aiMode === "auto") {
    conv.aiMode = "paused";
    conv.aiError = "Você respondeu pelo celular, então a IA parou nesta conversa. Religue quando quiser.";
  }
  save();
}

/** Uma vez só: traz para o CRM as conversas que já existiam na fila (antes do CRM). */
export function syncFromQueue(queue) {
  let changed = false;
  for (const item of queue) {
    if (!["sent", "replied", "optout"].includes(item.status) || !item.sentAt || data.synced.includes(item.id)) continue;
    const conv = ensureConv({ to: item.to, jid: item.jid, leadId: item.leadId, company: item.company, context: item.context });
    if (!conv.messages.length) {
      push(conv, { from: "me", kind: "prospect", text: item.text, at: item.sentAt });
      if (item.followUpSentAt) push(conv, { from: "me", kind: "followup", text: item.followText, at: item.followUpSentAt });
      if (item.reply) push(conv, { from: "lead", text: item.reply.text, at: item.reply.at });
      if (item.status === "optout") Object.assign(conv, { optedOut: true, stage: "perdido", aiMode: "paused" });
      conv.messages.sort((a, b) => a.at - b.at);
    }
    data.synced.push(item.id);
    changed = true;
  }
  if (changed) save();
}

// ---------- IA ----------

function scheduleAi(conv) {
  const ai = data.ai;
  if (!ai.enabled || conv.aiMode !== "auto" || conv.optedOut || !keyInfo().configured) return;
  clearTimeout(R.timers.get(conv.id));
  R.timers.set(conv.id, setTimeout(() => R.runAi(conv.id).catch(() => {}), Math.max(5, ai.waitSec) * 1000));
}

const aiCount = (conv) => (conv.aiToday?.date === today() ? conv.aiToday.count : 0);

/**
 * Pede a resposta à IA e aplica: envia (modo automático), guarda como rascunho (modo rascunho
 * ou pedido manual), passa para você ou não faz nada.
 */
async function runAi(id, { asDraft = false } = {}) {
  if (R.working.has(id)) return null;
  const conv = data.convs.find((c) => c.id === id);
  if (!conv) return null;
  const last = conv.messages[conv.messages.length - 1];
  if (!asDraft && (last?.from !== "lead" || conv.aiMode !== "auto" || !data.ai.enabled)) return null;
  if (!asDraft && aiCount(conv) >= data.ai.maxPerDay) {
    conv.needsYou = { reason: `A IA já respondeu ${data.ai.maxPerDay} vezes hoje nesta conversa. Continue você.`, at: Date.now() };
    conv.aiMode = "paused";
    save();
    return null;
  }

  R.working.add(id);
  conv.aiError = "";
  try {
    const host = hostKey(conv.context?.site);
    const result = await suggestReply({ ...data.ai }, conv, host ? getDiagnosis(host) : null);
    if (result.summary) conv.summary = result.summary;
    if (AI_STAGE[result.stage] && conv.stageBy !== "you" && conv.stage !== "fechado") conv.stage = AI_STAGE[result.stage];

    // O lead mandou outra mensagem enquanto a IA pensava: responde de novo, já com tudo
    const stillLast = conv.messages[conv.messages.length - 1] === last;
    if (!asDraft && !stillLast) { scheduleAi(conv); return result; }

    if (result.action === "skip") { save(); return result; }
    if (result.action === "handoff") {
      conv.needsYou = { reason: result.reason || "O lead precisa de uma resposta sua.", at: Date.now() };
      if (!asDraft) conv.aiMode = "paused";
    }
    if (!result.reply) { save(); return result; }

    if (asDraft || data.ai.mode === "draft" || !isConnected()) {
      conv.draft = { text: result.reply, at: Date.now() };
      if (!asDraft && data.ai.mode !== "draft") conv.aiError = "WhatsApp desconectado: a resposta da IA ficou como rascunho.";
    } else {
      const sentId = await sendHuman(conv.jid || `${conv.to}@s.whatsapp.net`, result.reply);
      push(conv, { id: sentId, from: "ai", kind: "ai", text: result.reply });
      conv.aiToday = { date: today(), count: aiCount(conv) + 1 };
    }
    save();
    return result;
  } catch (err) {
    conv.aiError = friendlyError(err);
    if (!asDraft) conv.needsYou = { reason: conv.aiError, at: Date.now() };
    save();
    throw Object.assign(new Error(conv.aiError), { status: 502 });
  } finally {
    R.working.delete(id);
  }
}
// O temporizador sempre chama a versão mais nova do código
R.runAi = runAi;

// ---------- Ações da tela ----------

const summaryOf = (c) => ({ ...c, thinking: R.working.has(c.id) });

export function getCrm() {
  return {
    ai: data.ai,
    key: keyInfo(),
    convs: data.convs.filter((c) => c.messages.length).map(summaryOf).sort((a, b) => (b.lastLeadAt || b.updatedAt) - (a.lastLeadAt || a.updatedAt)),
  };
}

export function markRead(id) {
  byId(id).unread = 0;
  save();
  return getCrm();
}

export function updateConv(id, patch = {}) {
  const conv = byId(id);
  if (STAGES.includes(patch.stage)) { conv.stage = patch.stage; conv.stageBy = "you"; }
  if (["auto", "paused"].includes(patch.aiMode)) {
    conv.aiMode = patch.aiMode;
    conv.aiError = "";
    if (patch.aiMode === "auto") { conv.needsYou = null; scheduleAi(conv); } else clearTimeout(R.timers.get(conv.id));
  }
  if (patch.resolve) conv.needsYou = null;
  if (typeof patch.notes === "string") conv.notes = str(patch.notes, 2000);
  save();
  return getCrm();
}

/** Mensagem escrita por você na tela do CRM. */
export async function sendManual(id, text) {
  const conv = byId(id);
  const body = str(text, 4000);
  if (!body) throw Object.assign(new Error("Escreva a mensagem."), { status: 400 });
  if (conv.optedOut) throw Object.assign(new Error("Este lead pediu para não receber mensagens."), { status: 400 });
  if (!isConnected()) throw Object.assign(new Error("WhatsApp desconectado."), { status: 409 });
  clearTimeout(R.timers.get(conv.id));
  const sentId = await sendNow(conv.jid || `${conv.to}@s.whatsapp.net`, body);
  push(conv, { id: sentId, from: "me", kind: "me", text: body });
  conv.draft = null;
  conv.needsYou = null;
  conv.unread = 0;
  save();
  return getCrm();
}

export async function draftAction(id, action, text) {
  const conv = byId(id);
  if (action === "discard") { conv.draft = null; save(); return getCrm(); }
  return sendManual(id, text ?? conv.draft?.text);
}

/** "Sugerir resposta": a IA escreve um rascunho agora, mesmo com a resposta automática desligada. */
export async function suggestDraft(id) {
  if (!keyInfo().configured) throw Object.assign(new Error("Cole a chave da Anthropic na aba IA."), { status: 400 });
  await runAi(byId(id).id, { asDraft: true });
  return getCrm();
}

/** O navegador manda o que sabe de cada lead (dono, cidade, site) para a IA ter contexto. */
export function setContexts(items = []) {
  for (const it of items.slice(0, 500)) {
    const conv = data.convs.find((c) => c.id === it.id);
    if (conv) conv.context = cleanContext({ ...conv.context, ...it.context });
  }
  save();
  return { ok: true };
}

export function updateAi(patch = {}) {
  const a = { ...data.ai };
  if (typeof patch.enabled === "boolean") a.enabled = patch.enabled;
  if (["auto", "draft"].includes(patch.mode)) a.mode = patch.mode;
  if (patch.waitSec != null) a.waitSec = Math.max(5, Math.min(300, Number(patch.waitSec) || DEFAULT_AI.waitSec));
  if (patch.maxPerDay != null) a.maxPerDay = Math.max(1, Math.min(50, Number(patch.maxPerDay) || DEFAULT_AI.maxPerDay));
  for (const k of ["name", "business", "goal", "rules"]) if (typeof patch[k] === "string") a[k] = str(patch[k], k === "name" ? 60 : 3000);
  data.ai = a;
  save();
  return getCrm();
}

export const saveKey = async (key) => { await saveAiKey(key); return getCrm(); };
export const removeKey = async () => { await removeAiKey(); return getCrm(); };
