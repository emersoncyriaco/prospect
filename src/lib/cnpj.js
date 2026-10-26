// CNPJ: validação, extração de texto, consulta na Receita (APIs públicas) e dono.
import { digits, normalize, titleCase, tokens } from "./text";

const LOOKUP_TIMEOUT_MS = 12_000;
const cache = new Map();

export function isValidCnpj(value) {
  const c = digits(value);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(c[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

export function formatCnpj(value) {
  const c = digits(value);
  return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : value;
}

/** CNPJs válidos em qualquer texto (formatados ou só dígitos). */
export function extractCnpjs(text = "") {
  const found = [];
  const re = /(?<!\d)(\d{2})\.?(\d{3})\.?(\d{3})\s?\/?\s?(\d{4})\s?-?\s?(\d{2})(?!\d)/g;
  for (const m of String(text).matchAll(re)) {
    const c = m.slice(1).join("");
    if (isValidCnpj(c) && !found.includes(c)) found.push(c);
  }
  return found;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const truthy = (v) => v === true || /^(s|sim|true)$/i.test(String(v ?? "").trim());

// OpenCNPJ: traz o e-mail e todos os telefones do cadastro
async function fromOpenCnpj(cnpj) {
  const d = await getJson(`https://api.opencnpj.org/${cnpj}`);
  if (d.notFound) return d;
  const principal = (d.cnaes || []).find((c) => c.is_principal);
  return {
    cnpj,
    razaoSocial: d.razao_social || "",
    nomeFantasia: d.nome_fantasia || "",
    situacao: String(d.situacao_cadastral || "").toUpperCase(),
    abertura: d.data_inicio_atividade || "",
    municipio: d.municipio || "",
    uf: d.uf || "",
    cep: digits(d.cep),
    email: (d.email || "").toLowerCase(),
    phones: (d.telefones || []).filter((t) => !t.is_fax).map((t) => `${t.ddd}${t.numero}`),
    naturezaJuridica: d.natureza_juridica || "",
    porte: d.porte_empresa || "",
    cnae: principal?.descricao || (typeof d.cnae_principal === "object" ? d.cnae_principal?.descricao : "") || "",
    mei: truthy(d.opcao_mei),
    socios: (d.QSA || []).map((s) => ({
      nome: s.nome_socio || "",
      qualificacao: s.qualificacao_socio || "",
      pessoaFisica: !/jur[ií]dica/i.test(s.identificador_socio || ""),
    })),
    fonte: "OpenCNPJ",
  };
}

// BrasilAPI e Minha Receita compartilham o mesmo formato
function fromReceitaFormat(name, urlFor) {
  return async (cnpj) => {
    const d = await getJson(urlFor(cnpj));
    if (d.notFound) return d;
    return {
      cnpj,
      razaoSocial: d.razao_social || "",
      nomeFantasia: d.nome_fantasia || "",
      situacao: String(d.descricao_situacao_cadastral || "").toUpperCase(),
      abertura: d.data_inicio_atividade || "",
      municipio: d.municipio || "",
      uf: d.uf || "",
      cep: digits(d.cep),
      email: (d.email || "").toLowerCase(),
      phones: [d.ddd_telefone_1, d.ddd_telefone_2].filter(Boolean),
      naturezaJuridica: d.natureza_juridica || "",
      porte: d.porte || "",
      cnae: d.cnae_fiscal_descricao || "",
      mei: truthy(d.opcao_pelo_mei),
      socios: (d.qsa || []).map((s) => ({
        nome: s.nome_socio || "",
        qualificacao: s.qualificacao_socio || "",
        pessoaFisica: s.identificador_de_socio !== 1,
      })),
      fonte: name,
    };
  };
}

const PROVIDERS = [
  fromOpenCnpj,
  fromReceitaFormat("BrasilAPI", (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}`),
  fromReceitaFormat("Minha Receita", (c) => `https://minhareceita.org/${c}`),
];

/** Consulta o CNPJ com reserva entre fontes. Retorna null se não existir. */
export async function lookupCnpj(value) {
  const cnpj = digits(value);
  if (cache.has(cnpj)) return cache.get(cnpj);

  const pending = (async () => {
    let lastError;
    for (const provider of PROVIDERS) {
      try {
        const result = await provider(cnpj);
        return result.notFound ? null : result;
      } catch (err) {
        lastError = err;
      }
    }
    cache.delete(cnpj);
    throw new Error(`Consulta de CNPJ indisponível agora (${lastError?.message || "erro"}).`);
  })();

  cache.set(cnpj, pending);
  return pending;
}

const ROLE_RANK = [
  [/administrador/i, "Sócio-administrador"],
  [/titular|empres[aá]rio/i, "Titular"],
  [/presidente/i, "Presidente"],
  [/diretor/i, "Diretor"],
  [/s[oó]cio/i, "Sócio"],
];

const rankRole = (q = "") => {
  const i = ROLE_RANK.findIndex(([re]) => re.test(q));
  return i === -1 ? ROLE_RANK.length : i;
};

function prettyRole(q = "") {
  const hit = ROLE_RANK.find(([re]) => re.test(q));
  if (hit) return /s[oó]cio.?administrador/i.test(q) ? "Sócio-administrador" : hit[1];
  return q ? q.charAt(0).toUpperCase() + q.slice(1).toLowerCase() : "Responsável";
}

/**
 * O tomador de decisão: o sócio-administrador do quadro societário ou,
 * em MEI/empresário individual, o titular cujo nome está na razão social.
 */
export function pickDecisionMaker(company) {
  const people = company.socios.filter((s) => s.pessoaFisica && s.nome);
  if (people.length) {
    const [best, ...rest] = [...people].sort((a, b) => rankRole(a.qualificacao) - rankRole(b.qualificacao));
    const name = titleCase(best.nome);
    return {
      name,
      firstName: name.split(" ")[0],
      role: prettyRole(best.qualificacao),
      origin: "Quadro societário",
      others: rest.map((s) => ({ name: titleCase(s.nome), role: prettyRole(s.qualificacao) })),
    };
  }

  const individual = company.mei || /empres[aá]rio.*individual/i.test(company.naturezaJuridica);
  const razao = company.razaoSocial.replace(/^[\d.\-/\s]+/, "").replace(/[\s\d.\-/]+$/, "").trim();
  const looksLikePerson = /^\d{2}\.?\d{3}\.?\d{3}\s/.test(company.razaoSocial) || /\d{11}$/.test(digits(company.razaoSocial));
  if ((individual || looksLikePerson) && tokens(razao).length >= 2) {
    const name = titleCase(razao);
    return {
      name,
      firstName: name.split(" ")[0],
      role: company.mei ? "Titular (MEI)" : "Empresário individual",
      origin: "Razão social",
      others: [],
    };
  }
  return null;
}

const ACCOUNTANT_HINT = /contab|contador|cont[aá]beis|contabil|escritorio|assessoria|fiscal|despachante|consultoria/i;

/** E-mails do cadastro muitas vezes são do contador, não do dono. */
export const isAccountantEmail = (email = "") => ACCOUNTANT_HINT.test(normalize(email).replace(/ /g, ""));
