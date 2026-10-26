// Normalização de texto e comparação de nomes de empresas.

const STOPWORDS = new Set([
  "ltda", "me", "epp", "eireli", "sa", "ss", "cia", "mei", "slu", "ltd", "inc",
  "de", "da", "do", "das", "dos", "e", "a", "o", "em", "na", "no", "the", "and",
  "comercio", "servicos", "empresa", "unidade", "filial", "matriz",
]);

const LOWERCASE_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e", "di", "du", "van", "von"]);

const UF_BY_NAME = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
  paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

export function normalize(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokens(value) {
  return normalize(value).split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function digits(value = "") {
  return String(value ?? "").replace(/\D/g, "");
}

/** "São Paulo" ou "SP" → "SP" */
export function toUf(value = "") {
  const n = normalize(value);
  if (n.length === 2) return n.toUpperCase();
  return UF_BY_NAME[n] || "";
}

/**
 * Semelhança entre o nome no Google Maps e o nome no CNPJ (0 a 1).
 * Palavras da categoria ("pet shop", "clínica") são descartadas: aparecem
 * em milhares de empresas e geram falsos positivos.
 */
export function nameSimilarity(mapsName, cnpjName, category = "") {
  const generic = new Set(tokens(category));
  let a = tokens(mapsName).filter((t) => !generic.has(t));
  if (!a.length) a = tokens(mapsName);
  const b = new Set(tokens(cnpjName));
  if (!a.length || !b.size) return 0;
  const hits = a.filter((t) => b.has(t)).length;
  return hits / Math.min(a.length, b.size);
}

/** "MARIA DA SILVA SANTOS" → "Maria da Silva Santos" */
export function titleCase(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word, i) => (i > 0 && LOWERCASE_PARTICLES.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** "Pet Amigo - Banho e Tosa | Centro" → "Pet Amigo" */
export function cleanBusinessName(name = "") {
  const base = String(name).split(/\s[-–|•·]\s|\s\(|,/)[0].trim();
  return base.length >= 3 ? base : String(name).trim();
}
