// Classificação do "site" do Google Maps + análise da página via servidor local.

// Links que o dono cadastra no Maps no lugar de um site de verdade
const LINK_ONLY = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(facebook|fb)\.com$|(^|\.)fb\.me$/, "Facebook"],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, "WhatsApp"],
  [/(^|\.)linktr\.ee$|(^|\.)(beacons\.ai|bio\.link|taplink\.cc|linkbio\.co|lnk\.bio|campsite\.bio)$/, "Link na bio"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)(ifood\.com\.br|anota\.ai|goomer\.app|cardapioweb\.com|aiqfome\.com)$/, "Cardápio de delivery"],
  [/(^|\.)(business\.site|negocio\.site|g\.page)$/, "Página do Google"],
];

const FREE_BUILDERS = /(wixsite\.com|webnode\.|site123\.me|godaddysites\.com|zyrosite\.com|wordpress\.com|blogspot\.com|webflow\.io|carrd\.co|squarespace\.com|yolasite\.com|jimdosite\.com)$/;

// type: none (sem site) · social (só rede/link) · site (site próprio)
export function classifyWebsite(url) {
  if (!url) return { type: "none", label: "Sem site" };
  let host;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return { type: "none", label: "Sem site" };
  }
  const hit = LINK_ONLY.find(([re]) => re.test(host));
  if (hit) return { type: "social", label: `Só ${hit[1]}`, network: hit[1], url, host };
  return { type: "site", label: "Tem site", url, host, free: FREE_BUILDERS.test(host) };
}

export const siteHref = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

// O servidor local (npm run dev / npm start) lê o site; o navegador sozinho é bloqueado pelo CORS
export async function siteApiAvailable() {
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(3000) });
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

export async function inspectSite(url, signal) {
  const res = await fetch(`/api/inspect?url=${encodeURIComponent(url)}`, { signal });
  if (!res.ok) throw new Error(`Análise do site falhou (${res.status})`);
  return res.json();
}

export async function saveResultsCsv(name, csv) {
  try {
    const res = await fetch("/api/resultados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: name, csv }),
    });
    return res.ok ? (await res.json()).arquivo : null;
  } catch {
    return null;
  }
}
