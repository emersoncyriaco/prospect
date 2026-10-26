import { useEffect, useState } from "react";
import { useAutomation } from "../lib/automation";
import { Group, Row, Segmented, Spinner, Toggle } from "../components/ui";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";

const MODES = [
  { id: "auto", label: "Automático" },
  { id: "draft", label: "Só rascunho" },
];
const WAITS = [10, 15, 30, 60].map((n) => ({ id: n, label: n < 60 ? `${n} s` : "1 min" }));
const KEY_URL = "https://console.anthropic.com/settings/keys";

/* Configuração da IA que responde os leads */
export default function AiSettings() {
  const auto = useAutomation();
  const toast = useToast();
  const ai = auto.crm.ai;
  const key = auto.crm.key;
  const [form, setForm] = useState({ name: ai.name, business: ai.business, goal: ai.goal, rules: ai.rules });
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState("");

  // Mantém o formulário em dia se a configuração mudar por outro caminho
  useEffect(() => { setForm({ name: ai.name, business: ai.business, goal: ai.goal, rules: ai.rules }); }, [ai.name, ai.business, ai.goal, ai.rules]);

  const run = async (k, fn, ok) => {
    setBusy(k);
    try { await fn(); if (ok) toast({ message: ok, icon: "check.circle.fill", tone: "green" }); return true; }
    catch (e) { toast({ message: e.message, icon: "exclamation.fill", tone: "red", duration: 7000 }); return false; }
    finally { setBusy(""); }
  };
  const save = (patch) => run("save", () => auto.saveAi(patch));
  const dirty = ["name", "business", "goal", "rules"].some((k) => form[k] !== ai[k]);

  return (
    <div className="ai-settings">
      <Group title="Resposta automática" footer="A IA só conversa com leads que receberam a sua prospecção. Seus contatos pessoais nunca são lidos nem respondidos. Se você responder um lead pelo celular, a IA para naquela conversa.">
        <Toggle
          label="IA responde os leads"
          description={key.configured ? "Responde em segundos, 24 horas por dia, e passa para você quando precisar." : "Cole a chave da Anthropic abaixo para ligar."}
          checked={ai.enabled}
          disabled={!key.configured}
          onChange={(enabled) => run("toggle", () => auto.saveAi({ enabled }), enabled ? "IA ligada" : "IA desligada")}
        />
        <div className="row row--split">
          <span className="row__label">Modo</span>
          <Segmented label="Modo da IA" options={MODES} value={ai.mode} onChange={(mode) => save({ mode })} size="sm" />
        </div>
        <p className="row pnote-row">
          {ai.mode === "auto"
            ? "A IA envia a resposta sozinha. Você acompanha tudo na aba Conversas."
            : "A IA escreve um rascunho em cada conversa e você aprova com um toque antes de enviar."}
        </p>
        <div className="row row--split">
          <span className="row__label">Esperar</span>
          <Segmented label="Tempo antes de responder" options={WAITS} value={ai.waitSec} onChange={(waitSec) => save({ waitSec })} size="sm" />
        </div>
        <p className="row pnote-row">Tempo para o lead terminar de escrever: várias mensagens seguidas recebem uma resposta só. Depois, a IA mostra “digitando…” por alguns segundos, como uma pessoa.</p>
      </Group>

      <Group title="Chave da Anthropic (Claude)" footer={<>A chave fica só no seu computador, em <code>.prospect-data/ia.json</code>, que não vai para o Git. Crie em <a href={KEY_URL} target="_blank" rel="noopener">console.anthropic.com → API Keys</a>. Cada resposta custa alguns centavos de dólar.</>}>
        {key.configured ? (
          <Row icon="key" iconTone="green" label={`Conectada · termina em ${key.last4}`} detail={`Modelo ${key.model}${key.source === "ambiente" ? " · chave da variável ANTHROPIC_API_KEY" : ""}`}>
            {key.source === "salva" && (
              <button type="button" className="btn btn--plain btn--sm is-destructive" onClick={() => run("rm", () => auto.removeAiKey(), "Chave removida")} disabled={!!busy}>Remover</button>
            )}
          </Row>
        ) : (
          <form className="row field" onSubmit={(e) => { e.preventDefault(); run("key", () => auto.saveAiKey(newKey), "Chave conectada").then((ok) => ok && setNewKey("")); }}>
            <span className="field__label">Chave</span>
            <input type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" spellCheck="false" aria-label="Chave da API da Anthropic" />
            <button type="submit" className="btn btn--tinted btn--sm" disabled={!newKey.trim() || !!busy}>{busy === "key" ? <Spinner label="Conferindo" /> : "Conectar"}</button>
          </form>
        )}
      </Group>

      <Group title="O que a IA sabe sobre você" footer="A IA usa só este texto e a conversa. Ela nunca inventa preço, prazo ou resultado, nunca fecha negócio sozinha e, se perguntarem, diz que é a sua assistente.">
        <label className="row field">
          <span className="field__label">Seu nome</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="row field field--stack">
          <span className="ai-settings__label">Quem você é e o que oferece</span>
          <textarea rows={3} value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} />
        </label>
        <label className="row field field--stack">
          <span className="ai-settings__label">Objetivo das conversas</span>
          <textarea rows={2} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
        </label>
        <label className="row field field--stack">
          <span className="ai-settings__label">Regras (o que a IA não pode fazer)</span>
          <textarea rows={3} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} />
        </label>
        <div className="row row--actions">
          <button type="button" className="btn btn--primary btn--sm" disabled={!dirty || !!busy} onClick={() => run("text", () => auto.saveAi(form), "Instruções da IA salvas")}>
            {busy === "text" ? <Spinner label="Salvando" /> : "Salvar"}
          </button>
        </div>
      </Group>

      <Group title="Quando a IA passa para você">
        <Row icon="exclamation.fill" iconTone="orange" label="Pedido de preço, proposta ou orçamento" />
        <Row icon="exclamation.fill" iconTone="orange" label="Reunião com dia e hora marcados" />
        <Row icon="exclamation.fill" iconTone="orange" label="Reclamação, irritação ou assunto que ela não domina" />
        <Row icon="info" iconTone="gray" label={`Mais de ${ai.maxPerDay} respostas da IA no mesmo dia`} detail="Trava contra robôs de atendimento respondendo a IA sem parar" />
        <Row icon="info" iconTone="gray" label="Áudio, foto ou documento" detail="A IA não ouve nem vê mídias: pede para o lead escrever ou passa para você" />
      </Group>

      <p className="ai-settings__foot"><Icon name="sparkles" size={13} /> Respostas geradas pelo Claude ({key.model}), da Anthropic.</p>
    </div>
  );
}
