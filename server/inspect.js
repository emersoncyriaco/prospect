// Análise rápida da página inicial de um site (roda no servidor local: o navegador é bloqueado pelo CORS).
import { lookup } from "node:dns/promises";
import net from "node:net";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 1_500_000;
const SLOW_MS = 4_500;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const FREE_BUILDERS = /(wixsite\.com|webnode\.|site123\.me|godaddysites\.com|zyrosite\.com|wordpress\.com|blogspot\.com|webflow\.io|carrd\.co|squarespace\.com|yolasite\.com|jimdosite\.com)$/;

/* ---------- Proteção: só sites públicos (nada de rede interna) ---------- */

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublicUrl(url) {
  if (!/^https?:$/.test(url.protocol)) throw new Error("Endereço não permitido");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Endereço não permitido");
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) throw new Error("Endereço não permitido");
}

/* ---------- Extração ---------- */

function isValidCnpj(c) {
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const rest = weights.reduce((acc, w, i) => acc + Number(c[i]) * w, 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

function extractCnpjs(text = "") {
  const found = [];
  const re = /(?<!\d)(\d{2})\.?(\d{3})\.?(\d{3})\s?\/?\s?(\d{4})\s?-?\s?(\d{2})(?!\d)/g;
  for (const m of String(text).matchAll(re)) {
    const c = m.slice(1).join("");
    if (isValidCnpj(c) && !found.includes(c)) found.push(c);
  }
  return found;
}

const IGNORED_EMAIL = /\.(png|jpe?g|gif|webp|svg|avif)$|@(sentry|wixpress|example|exemplo|domain|dominio|email)\.|^(seu|nome|email|user|usuario)@/i;

function extractEmails(html) {
  const mailto = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => { try { return decodeURIComponent(m[1]); } catch { return m[1]; } });
  const loose = html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  return [...new Set([...mailto, ...loose].map((e) => e.toLowerCase().trim()))].filter((e) => !IGNORED_EMAIL.test(e)).slice(0, 5);
}

function extractWhatsapps(html) {
  const re = /(?:wa\.me\/|whatsapp\.com\/send\/?\?(?:[^"'\s]*?&(?:amp;)?)?phone=|whatsapp:\/\/send\?phone=)\+?(\d{10,13})/gi;
  return [...new Set([...html.matchAll(re)].map((m) => m[1]))].slice(0, 3);
}

function extractInstagram(html) {
  const m = html.match(/instagram\.com\/(?!p\/|reel|explore|accounts|stories|tv\/)([a-z0-9._]{2,30})/i);
  return m ? `https://instagram.com/${m[1].replace(/\.$/, "")}` : null;
}

async function readLimited(res) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  while (size < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString("utf8");
}

// Segue redirecionamentos conferindo cada destino
async function safeFetch(startUrl, signal) {
  let url = new URL(startUrl);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9" },
      signal,
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    return { res, finalUrl: url };
  }
  throw new Error("Redirecionamentos demais");
}

/** CNPJs, contatos e problemas visíveis da página inicial (argumentos para um redesign). */
export async function inspectWebsite(rawUrl) {
  const target = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const started = Date.now();
  const result = { cnpjs: [], emails: [], whatsapps: [], instagram: null, problems: [], online: true };

  let res, finalUrl;
  try {
    ({ res, finalUrl } = await safeFetch(target, AbortSignal.timeout(FETCH_TIMEOUT_MS)));
  } catch (err) {
    if (err.message === "Endereço não permitido") { result.online = null; return result; }
    const code = err.cause?.code || "";
    if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|CERT|SSL|ERR_TLS/i.test(code + err.message) || err.name === "TimeoutError") {
      result.online = false;
      result.problems.push(err.name === "TimeoutError" ? "Site não carrega (tempo esgotado)" : "Site fora do ar ou com certificado inválido");
    }
    return result;
  }

  const elapsed = Date.now() - started;
  if (res.status >= 500 && res.status !== 503) {
    result.online = false;
    result.problems.push(`Site com erro (HTTP ${res.status})`);
    return result;
  }
  if (!res.ok) return result; // 403/429 = proteção anti-robô; não dá para concluir nada

  const html = await readLimited(res);
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");

  result.cnpjs = extractCnpjs(text.replace(/<[^>]+>/g, " ")).concat(extractCnpjs(html)).filter((c, i, a) => a.indexOf(c) === i);
  result.emails = extractEmails(html);
  result.whatsapps = extractWhatsapps(html);
  result.instagram = extractInstagram(html);

  if (finalUrl.protocol !== "https:") result.problems.push("Sem HTTPS (navegador mostra “Não seguro”)");
  if (!/<meta[^>]+name=["']?viewport/i.test(html)) result.problems.push("Não é adaptado para celular");
  if (elapsed > SLOW_MS) result.problems.push(`Lento para carregar (${(elapsed / 1000).toFixed(1).replace(".", ",")} s)`);

  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => Number(m[1]));
  if (years.length && Math.max(...years) <= new Date().getFullYear() - 3) result.problems.push(`Rodapé parado em ${Math.max(...years)}`);

  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)?.[1] || "";
  if (FREE_BUILDERS.test(finalUrl.hostname) || /wix\.com|site123|webnode|jimdo/i.test(generator)) result.problems.push("Feito em construtor gratuito");
  return result;
}
