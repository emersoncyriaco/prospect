// Conexão com o WhatsApp do seu número via Baileys (protocolo do WhatsApp Web, não oficial).
// A sessão fica em .prospect-data/whatsapp-auth: escaneia o QR uma vez e reconecta sozinho.
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import pino from "pino";

const DATA_DIR = path.resolve(".prospect-data");
const AUTH_DIR = path.join(DATA_DIR, "whatsapp-auth");

/*
  Uma única conexão por processo. Fica em globalThis porque o servidor de
  desenvolvimento recarrega este arquivo: duas conexões com a mesma sessão
  fazem o WhatsApp derrubar as duas ("conexão substituída").
*/
const G = (globalThis.__prospectWhatsapp ??= {
  state: { status: "disconnected", qr: null, me: null, error: null }, // disconnected · connecting · qr · connected
  sock: null,
  starting: false,
  reconnectTimer: null,
  retries: 0,
  listeners: new Set(),
  events: [],
});

const REASON = {
  401: "sessão encerrada (logout)", 403: "acesso negado", 408: "tempo esgotado", 411: "versão incompatível",
  428: "conexão fechada", 440: "conexão substituída por outra", 500: "sessão corrompida", 503: "serviço indisponível",
  515: "reinício pedido pelo WhatsApp",
};

function event(text) {
  G.events.unshift({ at: Date.now(), text });
  G.events = G.events.slice(0, 30);
}

export const onIncoming = (fn) => G.listeners.add(fn);
export const getStatus = () => ({ ...G.state, events: G.events.slice(0, 12) });
export const isConnected = () => G.state.status === "connected" && !!G.sock;

const digitsOf = (jid = "") => String(jid).split("@")[0].split(":")[0].replace(/\D/g, "");

function scheduleReconnect(ms) {
  clearTimeout(G.reconnectTimer);
  G.state.status = "connecting";
  G.reconnectTimer = setTimeout(() => start(), ms);
}

/** Pedido do usuário (botão Conectar). */
export async function connect() {
  if (G.sock || G.starting) return getStatus();
  G.retries = 0;
  G.state.error = null;
  await start();
  return getStatus();
}

async function start() {
  if (G.starting) return;
  G.starting = true;
  G.state.status = "connecting";
  try {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = await import("baileys");
    const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version;
    try { ({ version } = await fetchLatestBaileysVersion()); } catch { /* usa a versão embutida */ }

    // Encerra qualquer conexão anterior antes de abrir outra
    try { G.sock?.end(undefined); } catch { /* já fechada */ }

    const sock = makeWASocket({
      auth,
      version,
      browser: Browsers.macOS("Desktop"),
      logger: pino({ level: "silent" }),
      markOnlineOnConnect: false, // não aparece "online" o tempo todo
      syncFullHistory: false,
      connectTimeoutMs: 30_000,
    });
    G.sock = sock;
    let closed = false;
    event(`Conectando (WhatsApp Web ${version ? version.join(".") : "padrão"})`);

    // Uma gravação atrasada não pode recriar uma sessão que acabou de ser apagada
    sock.ev.on("creds.update", () => { if (!closed) saveCreds(); });

    sock.ev.on("connection.update", async (u) => {
      if (G.sock !== sock) return; // evento de uma conexão antiga
      if (u.qr) {
        G.state.qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 300 });
        G.state.status = "qr";
        event("QR Code pronto para escanear");
      }
      if (u.isNewLogin) event("QR escaneado: finalizando o login…");
      if (u.connection === "open") {
        G.retries = 0;
        Object.assign(G.state, {
          status: "connected", qr: null, error: null,
          me: { number: digitsOf(sock.user?.id), name: sock.user?.name || sock.user?.verifiedName || "" },
        });
        event(`Conectado como +${G.state.me.number}`);
      }
      if (u.connection === "close") {
        closed = true;
        G.sock = null;
        G.state.qr = null;
        const code = u.lastDisconnect?.error?.output?.statusCode;
        const reason = REASON[code] || u.lastDisconnect?.error?.message || "motivo desconhecido";
        event(`Conexão fechada: ${reason}${code ? ` (${code})` : ""}`);

        if (code === DisconnectReason.restartRequired) {
          // Normal logo após escanear o QR: reabre na hora com a sessão nova
          scheduleReconnect(500);
        } else if (code === DisconnectReason.loggedOut || code === DisconnectReason.badSession) {
          await rm(AUTH_DIR, { recursive: true, force: true });
          Object.assign(G.state, {
            status: "disconnected", me: null,
            error: code === DisconnectReason.loggedOut
              ? "O WhatsApp encerrou a sessão. Gere um novo QR e escaneie de novo."
              : "A sessão salva estava corrompida e foi apagada. Gere um novo QR.",
          });
        } else if (code === DisconnectReason.forbidden) {
          Object.assign(G.state, { status: "disconnected", error: "O WhatsApp bloqueou esta conexão (número restrito)." });
        } else if (code === DisconnectReason.connectionReplaced) {
          Object.assign(G.state, { status: "disconnected", error: "Outra conexão do Prospect assumiu esta sessão. Feche outras janelas do terminal e conecte de novo." });
        } else if (auth.creds?.me && G.retries < 6) {
          // Queda de rede com sessão válida: tenta de novo com espera crescente
          G.retries += 1;
          scheduleReconnect(Math.min(30_000, 2000 * 2 ** G.retries));
        } else if (!auth.creds?.me) {
          Object.assign(G.state, { status: "disconnected", error: "O QR Code expirou. Gere um novo para conectar." });
        } else {
          Object.assign(G.state, { status: "disconnected", error: `Não foi possível reconectar (${reason}). Tente conectar de novo.` });
        }
      }
    });

    // Mensagens recebidas (respostas dos leads)
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        if (!m.message || m.key.fromMe || m.key.remoteJid?.endsWith("@g.us") || m.key.remoteJid === "status@broadcast") continue;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "[mídia]";
        // WhatsApp novo usa LID: tenta achar o número real
        const candidates = [m.key.remoteJid, m.key.remoteJidAlt, m.key.senderPn].filter(Boolean);
        if (m.key.remoteJid?.endsWith("@lid")) {
          try {
            const pn = await sock.signalRepository?.lidMapping?.getPNForLID(m.key.remoteJid);
            if (pn) candidates.push(pn);
          } catch { /* sem mapeamento */ }
        }
        const numbers = [...new Set(candidates.map(digitsOf).filter((d) => d.length >= 10))];
        for (const fn of G.listeners) fn({ numbers, text, at: Date.now() });
      }
    });
  } catch (err) {
    G.sock = null;
    Object.assign(G.state, { status: "disconnected", error: `Não foi possível iniciar o WhatsApp: ${err.message}` });
    event(`Erro ao iniciar: ${err.message}`);
  } finally {
    G.starting = false;
  }
}

export async function logout() {
  clearTimeout(G.reconnectTimer);
  const sock = G.sock;
  G.sock = null;
  try { await sock?.logout(); } catch { /* já desconectado */ }
  await rm(AUTH_DIR, { recursive: true, force: true });
  Object.assign(G.state, { status: "disconnected", qr: null, me: null, error: null });
  event("Desconectado por você");
  return getStatus();
}

/** Confere se o número tem WhatsApp e devolve o JID certo. */
export async function resolveJid(e164) {
  if (!isConnected()) throw new Error("WhatsApp desconectado");
  const [res] = (await G.sock.onWhatsApp(`${e164}@s.whatsapp.net`)) || [];
  return res?.exists ? res.jid : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Envia como uma pessoa: "digitando…" por alguns segundos, depois a mensagem. */
export async function sendHuman(jid, text) {
  if (!isConnected()) throw new Error("WhatsApp desconectado");
  const sock = G.sock;
  await sock.presenceSubscribe(jid).catch(() => {});
  await sock.sendPresenceUpdate("composing", jid).catch(() => {});
  await sleep(Math.min(9000, 2500 + text.length * 35 + Math.random() * 2000));
  await sock.sendPresenceUpdate("paused", jid).catch(() => {});
  const sent = await sock.sendMessage(jid, { text });
  return sent?.key?.id || null;
}

// Reconecta sozinho se já existe uma sessão salva (uma vez por processo)
export function autoStart() {
  if (G.autoStarted) return;
  G.autoStarted = true;
  if (existsSync(path.join(AUTH_DIR, "creds.json"))) connect();
}
