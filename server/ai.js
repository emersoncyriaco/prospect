// IA (Claude) que responde os leads no WhatsApp.
// A chave da Anthropic fica só no servidor: em .prospect-data/ia.json (fora do Git) ou na variável ANTHROPIC_API_KEY.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const FILE = path.resolve(".prospect-data", "ia.json");
export const MODEL = "claude-opus-5-5";

// Uma chave e um cliente por processo (o servidor de desenvolvimento recarrega este arquivo)
const K = (globalThis.__prospectAi ??= { key: null, client: null });
if (K.key === null) {
  try { K.key = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")).apiKey || "" : ""; } catch { K.key = ""; }
}

const activeKey = () => K.key || process.env.ANTHROPIC_API_KEY || "";
export const keyInfo = () => ({
  configured: !!activeKey(),
  source: K.key ? "salva" : process.env.ANTHROPIC_API_KEY ? "ambiente" : "",
  last4: activeKey().slice(-4),
  model: MODEL,
});

function client() {
  K.client ??= new Anthropic({ apiKey: activeKey(), timeout: 60_000, maxRetries: 2 });
  return K.client;
}

const BILLING_URL = "console.anthropic.com → Settings → Billing";

/** Erro da API em português, pelo tipo do erro (e pela classe do SDK). */
export function friendlyError(err) {
  if (err instanceof Anthropic.APIConnectionError) return "Sem conexão com a Anthropic. Confira a internet.";
  if (!(err instanceof Anthropic.APIError)) return err?.message || "Erro inesperado na IA.";
  const detail = err.error?.error?.message || "";
  // Saldo zerado às vezes vem como "invalid_request_error": só o texto diz que é crédito
  if (err.type === "billing_error" || /credit balance/i.test(detail)) return `Sem créditos na conta da Anthropic. Compre créditos em ${BILLING_URL} e a IA volta a responder.`;
  if (err instanceof Anthropic.AuthenticationError) return "A chave da Anthropic foi recusada. Cole uma chave válida na aba IA.";
  if (err instanceof Anthropic.PermissionDeniedError) return "Esta chave da Anthropic não tem permissão para usar o modelo.";
  if (err instanceof Anthropic.RateLimitError) {
    return /usage limit/i.test(detail)
      ? `Você atingiu o limite de gastos definido na Anthropic. Aumente em ${BILLING_URL} (Limits).`
      : "Muitas respostas ao mesmo tempo (limite da Anthropic). A IA tenta de novo na próxima mensagem.";
  }
  if (err.type === "overloaded_error") return "A Anthropic está sobrecarregada agora. A IA tenta de novo na próxima mensagem.";
  if (err.type === "timeout_error") return "A Anthropic demorou demais para responder. A IA tenta de novo na próxima mensagem.";
  if (err instanceof Anthropic.InternalServerError) return "Falha temporária na Anthropic. A IA tenta de novo na próxima mensagem.";
  return `A Anthropic recusou o pedido (erro ${err.status ?? "sem código"}). Detalhe: ${detail || err.message}`;
}

/** Confere a chave (consulta grátis ao modelo) e só então salva. */
export async function saveKey(apiKey) {
  const key = String(apiKey || "").trim();
  if (!/^sk-ant-/.test(key)) throw Object.assign(new Error("A chave da Anthropic começa com “sk-ant-”."), { status: 400 });
  try {
    await new Anthropic({ apiKey: key, timeout: 20_000, maxRetries: 1 }).models.retrieve(MODEL);
  } catch (err) {
    throw Object.assign(new Error(friendlyError(err)), { status: 400 });
  }
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify({ apiKey: key }, null, 2), { mode: 0o600 });
  K.key = key;
  K.client = null;
  return keyInfo();
}

export async function removeKey() {
  await rm(FILE, { force: true });
  K.key = "";
  K.client = null;
  return keyInfo();
}

// Resposta sempre neste formato (saída estruturada)
const REPLY_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["reply", "handoff", "skip"] },
    reply: { type: "string" },
    stage: { type: "string", enum: ["keep", "interested", "negotiating", "scheduled", "lost"] },
    summary: { type: "string" },
    reason: { type: "string" },
  },
  required: ["action", "reply", "stage", "summary", "reason"],
  additionalProperties: false,
};

/*
  Instruções fixas + o que você escreveu na aba IA. Esse bloco muda pouco, então fica
  em cache (as próximas respostas leem do cache: mais rápidas e mais baratas).
*/
function systemPrompt(cfg) {
  const me = cfg.name || "o responsável";
  return `Você responde, pelo WhatsApp, empresários que receberam uma mensagem de prospecção de ${me}. Você escreve em nome dele, como o assistente dele.

Como escrever:
- Português do Brasil, tom cordial e direto, como numa conversa de WhatsApp entre profissionais.
- Mensagens curtas: de uma a três frases. Uma pergunta por vez.
- Sem markdown, listas ou títulos. No máximo um emoji, e só se o lead usar emojis.
- Use o primeiro nome do lead quando souber.
- Responda o que foi perguntado e conduza para o objetivo abaixo, sem pressionar.
- Mensagens como [áudio], [imagem], [vídeo] e [documento] são mídias que você não consegue ver nem ouvir: peça com gentileza que o lead escreva, ou passe para ${me}.

O que você nunca faz:
- Inventar preços, prazos, garantias, resultados, clientes atendidos ou fatos sobre o lead. Use só este texto e a conversa.
- Fechar negócio, aceitar condições ou confirmar dia e hora de reunião sem ${me}.
- Dizer que é uma pessoa. Se perguntarem se é robô ou IA, diga com naturalidade que é o assistente de ${me} e que ele acompanha a conversa.
- Insistir com quem disse que não tem interesse.

Escolha a ação ("action"):
- "reply": você consegue responder bem com o que sabe. Escreva a mensagem em "reply".
- "handoff": o lead pediu preço, proposta, orçamento ou reunião com dia e hora; fez uma reclamação; parece irritado; ou o assunto vai além do que você sabe. Em "reply", escreva uma mensagem curta avisando que ${me} vai responder pessoalmente em breve (ou deixe vazio se não couber resposta agora). Em "reason", diga em poucas palavras o que ${me} precisa fazer.
- "skip": não responda. Use quando a mensagem for automática (boas-vindas, ausência, "em breve retornaremos", menu de opções), quando o lead só encerrar a conversa ("ok", "obrigado", um emoji) ou pedir para não receber mais mensagens. Deixe "reply" vazio.

Também devolva:
- "stage": a etapa da negociação depois desta mensagem: "interested" (demonstrou interesse), "negotiating" (está discutindo proposta, preço ou detalhes), "scheduled" (aceitou ou marcou uma conversa), "lost" (recusou) ou "keep" (sem mudança).
- "summary": uma frase, para o CRM, com o que o lead quer ou disse até agora.
- "reason": vazio, a não ser em "handoff".

# Quem você representa
${cfg.business || "(não informado)"}

# Objetivo das conversas
${cfg.goal || "(não informado)"}

# Regras de ${me}
${cfg.rules || "(nenhuma regra extra)"}`;
}

const WHO = { lead: "Lead", me: "Você (pessoalmente)", ai: "Assistente", prospect: "Você (prospecção)", followup: "Você (follow-up)" };
const when = (ts) => new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Contexto do lead e a conversa, em texto (a parte que muda a cada resposta fica depois do cache)
function conversationText(conv, diagnosis) {
  const c = conv.context || {};
  const lines = [
    `Empresa: ${conv.company || "(sem nome)"}`,
    c.owner || conv.contactName ? `Dono/contato: ${c.owner || conv.contactName}` : "",
    c.city ? `Cidade: ${c.city}` : "",
    c.site ? `Site: ${c.site}${c.observation ? ` (${c.observation})` : ""}` : c.observation ? `Situação do site: ${c.observation}` : "",
    diagnosis?.summary ? `Diagnóstico do site: ${diagnosis.summary}` : "",
    diagnosis?.bad?.length ? `Pontos a melhorar no site: ${diagnosis.bad.slice(0, 5).join("; ")}` : "",
    conv.notes ? `Anotações de quem prospecta: ${conv.notes}` : "",
    `Agora: ${new Date().toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
  ].filter(Boolean);
  const history = conv.messages.slice(-40).map((m) => `[${WHO[m.kind] || WHO[m.from]} · ${when(m.at)}] ${m.text}`);
  return `${lines.join("\n")}\n\nConversa (da mais antiga para a mais recente):\n${history.join("\n")}\n\nResponda à última mensagem do lead.`;
}

/** Pede à IA a próxima resposta da conversa. Devolve { action, reply, stage, summary, reason }. */
export async function suggestReply(cfg, conv, diagnosis) {
  const response = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    // Se o modelo recusar por segurança, a Anthropic tenta de novo no modelo recomendado
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Esforço baixo: conversa curta, resposta rápida
    output_config: { effort: "low", format: { type: "json_schema", schema: REPLY_SCHEMA } },
    system: [{ type: "text", text: systemPrompt(cfg), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: conversationText(conv, diagnosis) }],
  });

  if (response.stop_reason === "refusal") {
    return { action: "handoff", reply: "", stage: "keep", summary: conv.summary || "", reason: "A IA não respondeu esta mensagem. Responda você." };
  }
  const text = response.content.find((b) => b.type === "text")?.text || "";
  let out;
  try { out = JSON.parse(text); } catch { out = null; }
  if (!out || response.stop_reason === "max_tokens") {
    return { action: "handoff", reply: "", stage: "keep", summary: conv.summary || "", reason: "A IA não conseguiu montar a resposta. Responda você." };
  }
  return {
    action: ["reply", "handoff", "skip"].includes(out.action) ? out.action : "handoff",
    reply: String(out.reply || "").trim().slice(0, 1500),
    stage: out.stage,
    summary: String(out.summary || "").trim().slice(0, 300),
    reason: String(out.reason || "").trim().slice(0, 300),
  };
}
