// Lead: criação a partir do Maps, correspondência com o CNPJ, contatos, nota e mensagem.
import { extractCnpjs, formatCnpj, isAccountantEmail, pickDecisionMaker } from "./cnpj";
import { parseBrPhone, samePhone } from "./phone";
import { classifyWebsite } from "./site";
import { cleanBusinessName, digits, nameSimilarity, normalize, toUf } from "./text";

export const MAX_CANDIDATES = 3;
export const ACCEPT_SCORE = 50;
export const HIGH_CONFIDENCE_SCORE = 75;

/*
  enrich: pending (na fila) · working (buscando) · done (CNPJ aceito) · nocnpj (não achou com segurança)
          · unverified (busca interrompida) · skipped ("Encontrar o dono" desligado)
*/
export function placeToLead(place, search) {
  const site = classifyWebsite(place.website);
  return {
    id: String(place.placeId || place.cid || place.url || `${place.title}|${place.address}`),
    company: place.title,
    category: place.categoryName || place.categories?.[0] || "",
    address: place.address || "",
    neighborhood: place.neighborhood || "",
    city: place.city || "",
    uf: toUf(place.state || ""),
    cep: digits(place.postalCode),
    mapsUrl: place.url || "",
    rating: typeof place.totalScore === "number" ? place.totalScore : null,
    reviews: place.reviewsCount || 0,
    mapsPhone: place.phone || place.phoneUnformatted || "",
    site: { ...site, problems: [], checked: false, online: null },
    instagram: site.network === "Instagram" ? place.website : null,
    cnpj: null,
    owner: null,
    phones: [],
    whatsapp: null,
    emails: [],
    email: null,
    raw: { site: null, company: null },
    enrich: search.enrich ? "pending" : "skipped",
    score: 0,
    reasons: [],
    status: "novo",
    notes: "",
    source: search.label,
    searchId: search.id,
    createdAt: Date.now(),
  };
}

export const cnpjQuery = (lead, fallbackCity = "") =>
  `${cleanBusinessName(lead.company)} ${lead.city || fallbackCity} CNPJ`.replace(/\s+/g, " ").trim();

// CNPJs dos resultados do Google, priorizando os resultados com nome parecido
export function candidatesFromSerp(lead, results) {
  const ranked = results
    .map((r, i) => ({ r, i, sim: nameSimilarity(lead.company, `${r.title} ${r.description}`, lead.category) }))
    .sort((a, b) => b.sim - a.sim || a.i - b.i);
  const out = [];
  for (const { r } of ranked) {
    const text = `${r.title || ""} ${r.url || ""} ${r.description || ""}`;
    for (const cnpj of extractCnpjs(text)) if (!out.some((c) => c.cnpj === cnpj)) out.push({ cnpj, origin: "google" });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out.slice(0, MAX_CANDIDATES);
}

export function dedupeCandidates(list) {
  const seen = new Map();
  for (const c of list) if (!seen.has(c.cnpj) || c.origin === "site") seen.set(c.cnpj, c);
  return [...seen.values()].sort((a, b) => (a.origin === "site" ? -1 : 0) - (b.origin === "site" ? -1 : 0));
}

// Pontos de correspondência entre o lead do Maps e o cadastro na Receita
export function matchScore(lead, co, origin) {
  let score = 0;
  const signals = [];
  if (origin === "site") { score += 45; signals.push("CNPJ publicado no site da empresa"); }
  if (origin === "manual") { score += 60; signals.push("informado por você"); }
  const city = normalize(lead.city);
  const mun = normalize(co.municipio);
  if (city && mun) {
    if (city === mun) { score += 25; signals.push("mesma cidade"); }
    // CNPJ publicado no próprio site costuma ser o da matriz (pode ser outra cidade)
    else if (origin === "site" || origin === "manual") { score -= 10; signals.push(`registrado em ${co.municipio.charAt(0)}${co.municipio.slice(1).toLowerCase()}`); }
    else score -= 35;
  }
  if (lead.cep && co.cep && lead.cep === co.cep) { score += 25; signals.push("mesmo CEP"); }
  if (lead.mapsPhone && co.phones.some((p) => samePhone(p, lead.mapsPhone))) { score += 35; signals.push("mesmo telefone do Google Maps"); }
  const sim = Math.max(
    nameSimilarity(lead.company, co.nomeFantasia, lead.category),
    nameSimilarity(lead.company, co.razaoSocial, lead.category),
  );
  if (sim >= 0.99) { score += 35; signals.push("mesmo nome"); }
  else if (sim >= 0.5) { score += Math.round(sim * 30); signals.push("nome parecido"); }
  else if (origin === "google") score -= 10;
  if (co.situacao && co.situacao !== "ATIVA") score -= 20;
  return { score, signals };
}

export function applyCompany(lead, company, match) {
  return {
    ...lead,
    raw: { ...lead.raw, company },
    cnpj: {
      number: formatCnpj(company.cnpj),
      razao: company.razaoSocial,
      fantasia: company.nomeFantasia,
      situacao: company.situacao,
      abertura: company.abertura,
      porte: company.porte,
      mei: company.mei,
      cnae: company.cnae,
      municipio: company.municipio,
      uf: company.uf,
      source: company.fonte,
      confidence: match.score >= HIGH_CONFIDENCE_SCORE ? "alta" : "media",
      signals: match.signals,
    },
    enrich: "done",
  };
}

// Recalcula contatos, dono e nota a partir do que já foi descoberto
export function finalize(lead) {
  const { site: siteInfo, company } = lead.raw || {};

  // Telefones: Google Maps primeiro (é o número que a própria empresa publica e que bate com o lead);
  // depois o WhatsApp do site; por último o do cadastro do CNPJ (muitas vezes é do contador)
  const phones = [];
  const addPhone = (raw, origin) => {
    const p = parseBrPhone(raw);
    if (!p) return;
    const existing = phones.find((x) => x.e164 === p.e164);
    if (existing) { if (!existing.origin.includes(origin)) existing.origin += ` · ${origin}`; }
    else phones.push({ ...p, origin });
  };
  addPhone(lead.mapsPhone, "Google Maps");
  (siteInfo?.whatsapps || []).forEach((p) => addPhone(p, "WhatsApp no site"));
  (company?.phones || []).forEach((p) => addPhone(p, "Cadastro do CNPJ"));

  const emails = [];
  const addEmail = (address, origin) => {
    if (address && !emails.some((e) => e.address === address)) emails.push({ address, origin, accountant: isAccountantEmail(address) });
  };
  addEmail(company?.email, "Cadastro do CNPJ");
  (siteInfo?.emails || []).forEach((e) => addEmail(e, "Site"));

  const next = {
    ...lead,
    phones,
    whatsapp: phones.find((p) => p.mobile) || null,
    emails,
    email: emails.find((e) => !e.accountant) || emails[0] || null,
    owner: company ? pickDecisionMaker(company) : null,
    instagram: lead.instagram || siteInfo?.instagram || null,
  };
  return scoreLead(next);
}

// Nota de oportunidade (0–100) para um web designer, com os motivos
export function scoreLead(lead) {
  let score = 0;
  const reasons = [];
  const { site } = lead;

  if (site.type === "none") { score += 35; reasons.push("Não tem site"); }
  else if (site.type === "social") { score += 30; reasons.push(`Usa ${site.network} no lugar de um site`); }
  else if (site.online === false) { score += 28; reasons.push("Site fora do ar"); }
  else if (site.problems?.length) {
    score += Math.min(24, site.problems.length * 8);
    reasons.push(`Site com problemas: ${site.problems.join(", ").toLowerCase()}`);
  }

  if (lead.reviews >= 100) { score += 15; reasons.push(`Movimento alto (${lead.reviews} avaliações)`); }
  else if (lead.reviews >= 30) { score += 10; reasons.push(`Bom movimento (${lead.reviews} avaliações)`); }
  else if (lead.reviews >= 10) score += 5;

  if (lead.rating >= 4.5) { score += 10; reasons.push(`Reputação excelente (${lead.rating.toFixed(1).replace(".", ",")} ★)`); }
  else if (lead.rating >= 4) score += 5;

  if (lead.owner) { score += 15; reasons.push("Dono identificado"); }
  if (lead.whatsapp) { score += 15; reasons.push("Tem WhatsApp"); }
  if (lead.email) score += 5;
  if (lead.cnpj?.situacao === "ATIVA") score += 5;

  return { ...lead, score: Math.min(100, score), reasons };
}

/* ---------- Mensagem do WhatsApp ---------- */

const LINK_ARTICLE = {
  Instagram: "o Instagram", Facebook: "o Facebook", WhatsApp: "o WhatsApp", "Link na bio": "um link na bio",
  TikTok: "o TikTok", YouTube: "o YouTube", "Cardápio de delivery": "um cardápio de delivery", "Página do Google": "a página do Google",
};

export function observation(lead) {
  const { site } = lead;
  if (site.type === "none") return "vi que vocês ainda não têm um site";
  if (site.type === "social") return `vi que vocês usam ${LINK_ARTICLE[site.network] || "as redes sociais"} como site`;
  if (site.online === false) return "notei que o site de vocês está fora do ar";
  if (site.problems?.length) return "notei alguns pontos no site de vocês que podem estar afastando clientes";
  return "dei uma olhada no site de vocês";
}

export function buildMessage(template, lead, myName = "") {
  const name = lead.owner?.firstName || "";
  let text = template;
  if (!name) text = text.replace(/,?\s*\{nome\}/g, "");
  if (!myName) text = text.replace(/\s*o \{eu\},?/g, "").replace(/\{eu\}/g, "");
  return text
    .replaceAll("{nome}", name)
    .replaceAll("{empresa}", cleanBusinessName(lead.company))
    .replaceAll("{observacao}", observation(lead))
    .replaceAll("{cidade}", lead.city || "sua cidade")
    .replaceAll("{eu}", myName)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,.!?])/g, "$1")
    .trim();
}
