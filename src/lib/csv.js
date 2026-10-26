// CSV compatível com o Excel em português (separador ";" e BOM UTF-8).
import { statusById } from "./constants";

const COLUMNS = [
  ["Empresa", (l) => l.company],
  ["Categoria", (l) => l.category],
  ["Oportunidade (0-100)", (l) => l.score],
  ["Por que abordar", (l) => l.reasons?.join(" | ")],
  ["Dono / decisor", (l) => l.owner?.name],
  ["Cargo", (l) => l.owner?.role],
  ["Outros sócios", (l) => l.owner?.others?.map((s) => `${s.name} (${s.role})`).join(" | ")],
  ["WhatsApp", (l) => l.whatsapp?.display],
  ["Origem do WhatsApp", (l) => l.whatsapp?.origin],
  ["Link do WhatsApp", (l) => (l.whatsapp ? `https://wa.me/${l.whatsapp.e164}` : "")],
  ["Todos os telefones", (l) => l.phones?.map((t) => `${t.display} (${t.origin})`).join(" | ")],
  ["E-mail", (l) => l.email?.address],
  ["E-mail parece do contador", (l) => (l.email ? (l.email.accountant ? "Sim" : "Não") : "")],
  ["Site", (l) => l.site?.url || ""],
  ["Situação do site", (l) => (l.site?.online === false ? "Fora do ar" : l.site?.label)],
  ["Problemas do site", (l) => l.site?.problems?.join(" | ")],
  ["Instagram", (l) => l.instagram],
  ["CNPJ", (l) => l.cnpj?.number],
  ["Razão social", (l) => l.cnpj?.razao],
  ["Situação cadastral", (l) => l.cnpj?.situacao],
  ["Abertura", (l) => l.cnpj?.abertura],
  ["MEI", (l) => (l.cnpj ? (l.cnpj.mei ? "Sim" : "Não") : "")],
  ["Confiança do CNPJ", (l) => l.cnpj?.confidence],
  ["Nota no Google", (l) => (l.rating != null ? String(l.rating).replace(".", ",") : "")],
  ["Avaliações", (l) => l.reviews],
  ["Endereço", (l) => l.address],
  ["Bairro", (l) => l.neighborhood],
  ["Cidade", (l) => l.city],
  ["UF", (l) => l.uf],
  ["Google Maps", (l) => l.mapsUrl],
  ["Status", (l) => statusById[l.status]?.label],
  ["Notas", (l) => l.notes],
  ["Busca", (l) => l.source],
];

function cell(value) {
  const s = value == null ? "" : String(value);
  // Evita que o Excel interprete o conteúdo como fórmula
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function leadsToCsv(leads) {
  const lines = [COLUMNS.map(([h]) => cell(h)).join(";")];
  for (const lead of leads) lines.push(COLUMNS.map(([, get]) => cell(get(lead))).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const today = () => new Date().toISOString().slice(0, 10);

export const slug = (s) =>
  String(s || "prospect").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "prospect";
