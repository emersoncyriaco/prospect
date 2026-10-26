import { useEffect, useMemo, useRef, useState } from "react";
import { useAutomation } from "../lib/automation";
import { hue, initials, norm, relativeTime } from "../lib/format";
import { parseBrPhone } from "../lib/phone";
import { Badge, EmptyState, Spinner } from "../components/ui";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";

// Etapas do funil (as mesmas do servidor)
export const STAGES = [
  { id: "novo", label: "Novo", tone: "gray" },
  { id: "interessado", label: "Interessado", tone: "blue" },
  { id: "negociando", label: "Negociando", tone: "yellow" },
  { id: "agendado", label: "Agendado", tone: "green" },
  { id: "fechado", label: "Fechado", tone: "green" },
  { id: "perdido", label: "Perdido", tone: "red" },
];
const stageById = Object.fromEntries(STAGES.map((s) => [s.id, s]));

const replied = (c) => c.messages.some((m) => m.from === "lead");
const lastMsg = (c) => c.messages[c.messages.length - 1];
const AUTHOR = { lead: "", me: "Você: ", ai: "IA: " };
const KIND = { prospect: "Prospecção", followup: "Follow-up", ai: "IA", me: "Você" };
const time = (ts) => new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const phoneOf = (c) => parseBrPhone(c.to)?.display || `+${c.to}`;

/* CRM das conversas: funil no topo, lista à esquerda e a conversa aberta à direita */
export default function CrmView() {
  const auto = useAutomation();
  const toast = useToast();
  const [filter, setFilter] = useState("acao");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);

  const convs = auto.crm?.convs || [];
  const withReply = convs.filter(replied);
  const count = (id) => (id === "acao" ? convs.filter((c) => c.needsYou || c.draft || c.unread).length
    : id === "todas" ? withReply.length
    : id === "contatados" ? convs.filter((c) => !replied(c)).length
    : withReply.filter((c) => c.stage === id).length);

  const list = useMemo(() => {
    const q = norm(query);
    return convs
      .filter((c) => (filter === "acao" ? c.needsYou || c.draft || c.unread
        : filter === "todas" ? replied(c)
        : filter === "contatados" ? !replied(c)
        : replied(c) && c.stage === filter))
      .filter((c) => !q || norm(`${c.company} ${c.contactName} ${c.context?.owner} ${c.to}`).includes(q));
  }, [convs, filter, query]);

  const open = convs.find((c) => c.id === openId) || null;

  // Abriu a conversa (ou chegou mensagem nela): marca como lida
  useEffect(() => {
    if (open?.unread) auto.crmRead(open.id).catch(() => {});
  }, [open?.id, open?.unread]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, ok) => {
    try { await fn(); if (ok) toast({ message: ok, icon: "check.circle.fill", tone: "green" }); return true; }
    catch (e) { toast({ message: e.message, icon: "exclamation.fill", tone: "red", duration: 7000 }); return false; }
  };

  const filters = [
    { id: "acao", label: "Precisa de você" },
    { id: "todas", label: "Responderam" },
    ...STAGES.map((s) => ({ id: s.id, label: s.label })),
    { id: "contatados", label: "Sem resposta" },
  ];

  return (
    <div className={`crm ${open ? "is-open" : ""}`}>
      <div className="chips crm__filters" role="tablist" aria-label="Filtrar conversas">
        {filters.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`chip ${filter === f.id ? "is-active" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label} <span className="crm__count">{count(f.id)}</span>
          </button>
        ))}
      </div>

      <div className="crm__body">
        <aside className="crm__list surface" aria-label="Conversas">
          <label className="crm__search">
            <Icon name="search" size={16} />
            <span className="sr-only">Buscar conversa</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar empresa, nome ou número" />
          </label>
          {!list.length ? (
            <EmptyState icon="whatsapp" title={filter === "acao" ? "Tudo respondido" : "Nenhuma conversa aqui"}>
              {filter === "acao" ? "Quando um lead responder e precisar de você, ele aparece aqui." : "As conversas aparecem quando os leads respondem a prospecção."}
            </EmptyState>
          ) : (
            <ul className="crm__items">
              {list.map((c) => <ConvRow key={c.id} conv={c} active={c.id === openId} aiOn={auto.crm.ai.enabled} onOpen={() => setOpenId(c.id)} />)}
            </ul>
          )}
        </aside>

        {open ? (
          <Thread key={open.id} conv={open} run={run} onBack={() => setOpenId(null)} />
        ) : (
          <section className="crm__thread crm__thread--empty surface">
            <EmptyState icon="whatsapp" title="Escolha uma conversa">
              {auto.crm?.ai.enabled
                ? "A IA responde os leads sozinha. Ela passa para você quando pedirem preço, reunião ou algo que só você decide."
                : "Ligue a IA na aba “IA” para responder os leads na hora, ou responda daqui mesmo."}
            </EmptyState>
          </section>
        )}
      </div>
    </div>
  );
}

function ConvRow({ conv: c, active, aiOn, onOpen }) {
  const last = lastMsg(c);
  const stage = stageById[c.stage];
  return (
    <li>
      <button type="button" className={`crm-row ${active ? "is-active" : ""}`} onClick={onOpen} aria-current={active || undefined}>
        <span className="avatar" style={{ "--h": hue(c.company) }} aria-hidden="true">{initials(c.company)}</span>
        <span className="crm-row__main">
          <span className="crm-row__top">
            <b className="crm-row__name">{c.company || phoneOf(c)}</b>
            <time className={c.unread ? "is-unread" : ""}>{relativeTime(last?.at)}</time>
          </span>
          <span className="crm-row__last">{AUTHOR[last?.from] || ""}{last?.text}</span>
          <span className="crm-row__tags">
            {c.needsYou && <Badge tone="orange">Precisa de você</Badge>}
            {c.draft && <Badge tone="blue">Rascunho da IA</Badge>}
            {c.thinking && <Badge tone="gray">IA escrevendo…</Badge>}
            {replied(c) && stage && <Badge tone={stage.tone}>{stage.label}</Badge>}
            {aiOn && c.aiMode === "auto" && !c.optedOut && <span className="crm-row__ai" title="IA respondendo esta conversa"><Icon name="sparkles" size={13} /></span>}
            {c.unread > 0 && <span className="crm-row__unread" aria-label={`${c.unread} não lidas`}>{c.unread}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

function Thread({ conv: c, run, onBack }) {
  const auto = useAutomation();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState(c.draft?.text || "");
  const [busy, setBusy] = useState("");
  const endRef = useRef(null);
  const aiOn = auto.crm.ai.enabled;
  const connected = auto.status?.status === "connected";

  // Rascunho novo da IA: aparece pronto para editar
  useEffect(() => { setDraft(c.draft?.text || ""); }, [c.draft?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sempre na última mensagem
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [c.messages.length, c.thinking, !!c.draft]);

  const act = async (key, fn, ok) => { setBusy(key); const done = await run(fn, ok); setBusy(""); return done; };
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    if (await act("send", () => auto.crmSend(c.id, body))) setText("");
  };

  return (
    <section className="crm__thread surface" aria-label={`Conversa com ${c.company}`}>
      <header className="thread__head">
        <button type="button" className="icon-btn thread__back" onClick={onBack} aria-label="Voltar para a lista"><Icon name="chevron" size={18} className="flip" /></button>
        <span className="avatar" style={{ "--h": hue(c.company) }} aria-hidden="true">{initials(c.company)}</span>
        <div className="thread__titles">
          <h2 className="thread__title">{c.company || phoneOf(c)}</h2>
          <p className="thread__sub">{[c.context?.owner || c.contactName, phoneOf(c), c.context?.city].filter(Boolean).join(" · ")}</p>
        </div>
        <label className="select select--sm">
          <span className="sr-only">Etapa</span>
          <select value={c.stage} onChange={(e) => run(() => auto.crmUpdate(c.id, { stage: e.target.value }))}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </header>

      <div className="thread__bar">
        {c.optedOut ? (
          <p className="thread__state tone-red"><Icon name="exclamation.fill" size={14} /> Pediu para não receber mensagens. A IA não responde mais.</p>
        ) : (
          <button type="button" className={`ai-switch ${aiOn && c.aiMode === "auto" ? "is-on" : ""}`} disabled={!aiOn}
            onClick={() => run(() => auto.crmUpdate(c.id, { aiMode: c.aiMode === "auto" ? "paused" : "auto" }))}
            title={aiOn ? "" : "Ligue a IA na aba IA"}>
            <Icon name="sparkles" size={14} />
            {!aiOn ? "IA desligada" : c.aiMode === "auto" ? "IA respondendo" : "IA pausada nesta conversa"}
          </button>
        )}
        {c.summary && <p className="thread__summary"><b>Resumo:</b> {c.summary}</p>}
      </div>

      {c.needsYou && (
        <div className="notice notice--warn thread__notice" role="status">
          <Icon name="exclamation.fill" size={16} />
          <p><b>Precisa de você:</b> {c.needsYou.reason}</p>
          <button type="button" className="btn btn--plain btn--sm" onClick={() => run(() => auto.crmUpdate(c.id, { resolve: true }))}>Resolvido</button>
        </div>
      )}
      {c.aiError && !c.needsYou && <p className="thread__error"><Icon name="info" size={14} /> {c.aiError}</p>}

      <ol className="thread__msgs">
        {c.messages.map((m) => (
          <li key={m.id} className={`msg msg--${m.from === "lead" ? "in" : "out"} ${m.from === "ai" ? "msg--ai" : ""}`}>
            <p className="msg__text">{m.text}</p>
            <span className="msg__meta">{m.from !== "lead" && KIND[m.kind] ? `${KIND[m.kind]} · ` : ""}{time(m.at)}</span>
          </li>
        ))}
        {c.thinking && <li className="msg msg--out msg--ai msg--typing"><Spinner label="A IA está escrevendo" /> A IA está escrevendo…</li>}
        <li ref={endRef} aria-hidden="true" />
      </ol>

      {c.draft && (
        <div className="thread__draft">
          <p className="thread__draft-title"><Icon name="sparkles" size={14} /> Rascunho da IA: revise e envie</p>
          <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Rascunho da IA" />
          <div className="thread__draft-actions">
            <button type="button" className="btn btn--plain btn--sm" onClick={() => act("discard", () => auto.crmDraft(c.id, "discard"))} disabled={!!busy}>Descartar</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => act("draft", () => auto.crmDraft(c.id, "send", draft))} disabled={!!busy || !draft.trim() || !connected}>
              {busy === "draft" ? <Spinner label="Enviando" /> : "Enviar"}
            </button>
          </div>
        </div>
      )}

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={c.optedOut ? "Este lead pediu para não receber mensagens" : connected ? "Escreva sua resposta" : "WhatsApp desconectado"}
          disabled={c.optedOut || !connected}
          aria-label="Sua resposta"
        />
        <button type="button" className="btn btn--tinted btn--sm" onClick={() => act("suggest", () => auto.crmSuggest(c.id))}
          disabled={!!busy || c.optedOut || !auto.crm.key.configured} title={auto.crm.key.configured ? "A IA escreve um rascunho para você revisar" : "Cole a chave da Anthropic na aba IA"}>
          {busy === "suggest" ? <Spinner label="Escrevendo" /> : <><Icon name="sparkles" size={14} /> Sugerir</>}
        </button>
        <button type="submit" className="btn btn--primary btn--sm" disabled={!text.trim() || !!busy || c.optedOut || !connected}>
          {busy === "send" ? <Spinner label="Enviando" /> : "Enviar"}
        </button>
      </form>
    </section>
  );
}
