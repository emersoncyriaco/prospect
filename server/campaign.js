// Automação de prospecção: fila persistente com ritmo humano e proteções contra bloqueio.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isConnected, onIncoming, resolveJid, sendHuman } from "./whatsapp.js";

const FILE = path.resolve(".prospect-data", "automacao.json");
const TICK_MS = 5000;

export const DEFAULT_SETTINGS = {
  dailyLimit: 20,
  minDelay: 120, // segundos entre mensagens
  maxDelay: 300,
  startHour: 9,
  endHour: 18,
  weekdays: [1, 2, 3, 4, 5], // 0 = domingo
  followUp: { enabled: true, days: 3 },
};

/*
  Pedido para sair. Compara palavras inteiras (antes "pare" casava com "parece").
  - Frases fortes valem em qualquer mensagem.
  - Palavras soltas só valem em mensagens curtas (quem pede para sair é breve;
    resposta longa é conversa e você deve ler).
*/
const OPT_OUT_STRONG = [
  "nao tenho interesse", "sem interesse", "nao me interessa", "nao estou interessado", "nao estou interessada",
  "me tira da lista", "me tire da lista", "me remove", "me remova", "nao me mande", "nao mande mais",
  "nao me envie", "nao envie mais", "para de mandar", "pare de mandar", "nao entre em contato", "descadastrar", "descadastre",
];
const OPT_OUT_SHORT = ["sair", "parar", "pare", "stop", "remover", "nao quero", "nao obrigado", "nao obrigada", "chega", "spam"];
const SHORT_MESSAGE_WORDS = 8;

export function isOptOut(text) {
  const words = String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const padded = ` ${words.join(" ")} `;
  const has = (phrase) => padded.includes(` ${phrase} `);
  if (OPT_OUT_STRONG.some(has)) return true;
  return words.length <= SHORT_MESSAGE_WORDS && OPT_OUT_SHORT.some(has);
}

// Um único motor por processo (o servidor de desenvolvimento recarrega este arquivo;
// dois motores poderiam mandar a mesma mensagem duas vezes)
const C = (globalThis.__prospectCampaign ??= { data: null, nextSendAt: 0, working: false, started: false, listening: false });
C.data ??= load();
const data = C.data;

function load() {
  try {
    if (existsSync(FILE)) {
      const d = JSON.parse(readFileSync(FILE, "utf8"));
      return { settings: { ...DEFAULT_SETTINGS, ...d.settings, followUp: { ...DEFAULT_SETTINGS.followUp, ...d.settings?.followUp } }, queue: d.queue || [], log: d.log || [], paused: !!d.paused, sent: d.sent || { date: "", count: 0 }, hoursOverride: d.hoursOverride || null, optedOut: d.optedOut || [] };
    }
  } catch { /* arquivo corrompido: começa de novo */ }
  return { settings: DEFAULT_SETTINGS, queue: [], log: [], paused: false, sent: { date: "", count: 0 }, optedOut: [] };
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(data, null, 2));
  }, 300);
}

// Data local (o "dia" do limite diário vira à meia-noite de Brasília, não às 21h do UTC)
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const log = (type, text) => {
  data.log.unshift({ at: Date.now(), type, text });
  data.log = data.log.slice(0, 200);
  save();
};
const sentToday = () => (data.sent.date === today() ? data.sent.count : 0);
const normalize = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
// Números genéricos (99999-9999, 1234-5678…) pertencem a desconhecidos: nunca enviar
const isPlaceholder = (e164) => {
  const last8 = String(e164).replace(/\D/g, "").slice(-8);
  const seq = "0123456789012345678";
  return last8.length < 8 || new Set(last8).size <= 2 || seq.includes(last8) || [...seq].reverse().join("").includes(last8);
};
const sameNumber = (a, b) => a.slice(-8) === b.slice(-8) && a.slice(-8).length === 8;

/** Por que não está enviando agora (ou null se pode enviar). */
function blockedReason(now = new Date()) {
  const s = data.settings;
  if (data.paused) return "Pausada";
  if (!isConnected()) return "WhatsApp desconectado";
  // Exceção de horário: vale só no dia em que foi ligada e expira sozinha à meia-noite
  if (data.hoursOverride !== today()) {
    if (!s.weekdays.includes(now.getDay())) return "Fora dos dias de envio";
    const h = now.getHours();
    if (h < s.startHour || h >= s.endHour) return `Fora do horário (${s.startHour}h–${s.endHour}h)`;
  }
  if (sentToday() >= s.dailyLimit) return `Limite de hoje atingido (${s.dailyLimit})`;
  return null;
}

function nextItem(now) {
  const due = data.queue.find((i) => i.status === "sent" && data.settings.followUp.enabled && i.followText && !i.followUpSent && i.followUpAt && now >= i.followUpAt);
  return due ? { item: due, kind: "followup" } : (() => {
    const q = data.queue.find((i) => i.status === "queued");
    return q ? { item: q, kind: "first" } : null;
  })();
}

async function tick() {
  if (C.working) return;
  const now = Date.now();
  if (blockedReason() || now < C.nextSendAt) return;
  const next = nextItem(now);
  if (!next) return;
  C.working = true;
  const { item, kind } = next;
  try {
    if (kind === "first") {
      if (isPlaceholder(item.to)) {
        item.status = "skipped";
        item.error = "Número genérico (não é da empresa)";
        log("skip", `${item.company}: número genérico ignorado`);
        return;
      }
      if (isOptedOut(item.to)) {
        item.status = "optout";
        item.error = "Já pediu para não receber mensagens";
        log("skip", `${item.company}: já pediu para sair, não enviado`);
        return;
      }
      item.status = "sending";
      save();
      const jid = await resolveJid(item.to);
      if (!jid) {
        item.status = "skipped";
        item.error = "Número sem WhatsApp";
        log("skip", `${item.company}: número sem WhatsApp`);
        return; // não conta no limite nem espera o intervalo
      }
      item.jid = jid;
      await sendHuman(jid, item.text);
      item.status = "sent";
      item.sentAt = Date.now();
      item.followUpAt = item.sentAt + data.settings.followUp.days * 86400000;
      log("sent", `Mensagem enviada para ${item.company}`);
    } else {
      if (isOptedOut(item.to)) {
        item.status = "optout";
        item.followUpSent = true;
        log("skip", `${item.company}: pediu para sair, follow-up cancelado`);
        return;
      }
      await sendHuman(item.jid || `${item.to}@s.whatsapp.net`, item.followText);
      item.followUpSent = true;
      item.followUpSentAt = Date.now();
      log("followup", `Follow-up enviado para ${item.company}`);
    }
    data.sent = { date: today(), count: sentToday() + 1 };
    const { minDelay, maxDelay } = data.settings;
    C.nextSendAt = Date.now() + (minDelay + Math.random() * Math.max(0, maxDelay - minDelay)) * 1000;
  } catch (err) {
    if (kind === "first") {
      item.status = isConnected() ? "failed" : "queued"; // caiu a conexão: tenta de novo depois
      item.error = err.message;
    }
    log("error", `${item.company}: ${err.message}`);
    C.nextSendAt = Date.now() + 60_000;
  } finally {
    C.working = false;
    save();
  }
}

// Lista permanente de quem pediu para sair (8 últimos dígitos): nenhuma limpeza apaga
const last8 = (n) => String(n).replace(/\D/g, "").slice(-8);
const isOptedOut = (n) => (data.optedOut || []).includes(last8(n));

// Respostas: param o follow-up e detectam pedido para sair
function handleReply({ numbers, text, at }) {
  const optOut = isOptOut(text);
  const item = data.queue.find((i) => ["sent", "queued", "sending"].includes(i.status) && numbers.some((n) => sameNumber(n, i.to)));
  if (optOut) {
    data.optedOut ??= [];
    for (const n of [...numbers, item?.to].filter(Boolean)) if (!isOptedOut(n)) data.optedOut.push(last8(n));
  }
  if (!item) { if (optOut) save(); return; }
  item.status = optOut ? "optout" : "replied";
  item.reply = { text: text.slice(0, 500), at };
  log(optOut ? "optout" : "reply", optOut ? `${item.company} pediu para não receber mais mensagens` : `${item.company} respondeu`);
  save();
}

// Registrado uma vez por processo; sempre chama a versão mais nova do código
C.handleReply = handleReply;
if (!C.listening) { C.listening = true; onIncoming((msg) => C.handleReply(msg)); }

// O intervalo sempre chama a versão mais nova do código (o servidor de desenvolvimento recarrega este arquivo)
C.tick = tick;

export function startWorker() {
  if (!C.started) {
    C.started = true;
    // Itens que estavam "enviando" quando o servidor caiu voltam para a fila
    data.queue.forEach((i) => { if (i.status === "sending") i.status = "queued"; });
  }
  clearInterval(C.interval);
  C.interval = setInterval(() => C.tick().catch(() => {}), TICK_MS);
}

/** Libera envios fora do horário/dias só hoje (expira à meia-noite). */
export function setHoursOverride(on) {
  data.hoursOverride = on ? today() : null;
  log("info", on ? "Exceção de horário ligada até o fim do dia" : "Exceção de horário desligada");
  save();
}

export function getCampaign() {
  return {
    settings: data.settings,
    paused: data.paused,
    queue: data.queue,
    log: data.log.slice(0, 50),
    sentToday: sentToday(),
    blocked: blockedReason(),
    hoursOverride: data.hoursOverride === today(),
    optedOutCount: (data.optedOut || []).length,
    nextSendAt: C.nextSendAt > Date.now() ? C.nextSendAt : null,
  };
}

export function enqueue(items) {
  const active = new Set(data.queue.filter((i) => !["failed", "skipped"].includes(i.status)).map((i) => i.to));
  let added = 0;
  for (const it of items) {
    if (!it?.to || !it?.text || active.has(it.to) || isPlaceholder(it.to) || isOptedOut(it.to)) continue;
    data.queue.push({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      leadId: String(it.leadId || ""),
      company: String(it.company || "").slice(0, 120),
      to: String(it.to).replace(/\D/g, ""),
      text: String(it.text).slice(0, 2000),
      followText: it.followText ? String(it.followText).slice(0, 2000) : "",
      status: "queued",
      createdAt: Date.now(),
    });
    active.add(it.to);
    added++;
  }
  if (added) log("queue", `${added} ${added === 1 ? "lead adicionado" : "leads adicionados"} à fila`);
  save();
  return added;
}

export function setPaused(paused) {
  data.paused = !!paused;
  log("info", paused ? "Automação pausada" : "Automação retomada");
  save();
}

export function updateSettings(patch) {
  const s = { ...data.settings, ...patch, followUp: { ...data.settings.followUp, ...(patch.followUp || {}) } };
  // Limites de segurança: nada de disparo em massa
  s.dailyLimit = Math.max(1, Math.min(60, Number(s.dailyLimit) || 20));
  s.minDelay = Math.max(45, Number(s.minDelay) || 120);
  s.maxDelay = Math.max(s.minDelay, Number(s.maxDelay) || 300);
  s.startHour = Math.max(0, Math.min(23, Number(s.startHour)));
  s.endHour = Math.max(s.startHour + 1, Math.min(24, Number(s.endHour)));
  s.followUp.days = Math.max(1, Math.min(30, Number(s.followUp.days) || 3));
  data.settings = s;
  save();
  return s;
}

/** Corrige o número (ou remove) de itens que ainda não foram enviados. */
export function retarget(changes) {
  let fixed = 0;
  for (const ch of changes) {
    const item = data.queue.find((i) => i.id === ch.id && i.status === "queued");
    if (!item) continue;
    if (ch.remove || !ch.to || isPlaceholder(ch.to)) {
      data.queue = data.queue.filter((i) => i !== item);
      log("queue", `${item.company}: removido da fila (sem WhatsApp confiável)`);
    } else if (ch.to !== item.to) {
      log("queue", `${item.company}: número corrigido de ${item.to} para ${ch.to}`);
      item.to = String(ch.to).replace(/\D/g, "");
    }
    fixed++;
  }
  save();
  return fixed;
}

export function removeItem(id) {
  data.queue = data.queue.filter((i) => i.id !== id || i.status === "sending");
  save();
}

export function clearFinished() {
  data.queue = data.queue.filter((i) => ["queued", "sending", "sent"].includes(i.status));
  save();
}
