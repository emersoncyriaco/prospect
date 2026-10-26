// Telefones brasileiros: normalização, celular x fixo e WhatsApp.
import { digits } from "./text";

/**
 * Interpreta um telefone brasileiro em qualquer formato.
 * Retorna null para números inválidos ou não pessoais (0800, 4004, 3003…).
 */
export function parseBrPhone(raw) {
  let d = digits(raw);
  if (!d) return null;
  if (/^0?(800|300|500|900)/.test(d) || /^(4003|4004|3003|3004)/.test(d)) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  d = d.replace(/^0+/, "");
  if (d.length !== 10 && d.length !== 11) return null;

  const ddd = d.slice(0, 2);
  let number = d.slice(2);
  if (Number(ddd) < 11 || ddd.endsWith("0")) return null;

  let mobile = false;
  if (number.length === 9) {
    if (number[0] !== "9") return null;
    mobile = true;
  } else if (/^[6-9]/.test(number)) {
    // Cadastros antigos da Receita guardam celulares sem o nono dígito.
    mobile = true;
    number = `9${number}`;
  } else if (!/^[2-5]/.test(number)) {
    return null;
  }

  if (isPlaceholderNumber(number)) return null;

  const display = mobile
    ? `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`
    : `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;

  return { e164: `55${ddd}${number}`, display, mobile };
}

/**
 * Números genéricos de modelos de site e cadastros (99999-9999, 1234-5678, 0000-0000…).
 * Eles existem no WhatsApp e pertencem a desconhecidos: nunca podem receber disparo.
 */
export function isPlaceholderNumber(local) {
  const last8 = digits(local).slice(-8);
  if (last8.length < 8) return true;
  if (new Set(last8).size <= 2) return true; // 99999999, 99990000, 98989898
  const seq = "0123456789012345678";
  if (seq.includes(last8) || [...seq].reverse().join("").includes(last8)) return true; // 12345678, 87654321
  return false;
}

/** Compara dois telefones ignorando formatação e o nono dígito. */
export function samePhone(a, b) {
  const x = digits(a).slice(-8);
  const y = digits(b).slice(-8);
  return x.length === 8 && x === y;
}

export const waUrl = (e164, text) => `https://wa.me/${e164}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
