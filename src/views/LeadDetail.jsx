import { useState } from "react";
import { useStore } from "../lib/store";
import { useAutomation } from "../lib/automation";
import { diagKey } from "../lib/diagnoses";
import DiagnosisSection from "../components/DiagnosisSection";
import { STATUSES } from "../lib/constants";
import { isValidCnpj, lookupCnpj } from "../lib/cnpj";
import { applyCompany, buildMessage, cnpjQuery, finalize, matchScore } from "../lib/enrich";
import { waUrl } from "../lib/phone";
import { siteHref } from "../lib/site";
import { fmtNumber, fmtRating, formatDate, hue, initials } from "../lib/format";
import { Badge, Group, Row, Spinner } from "../components/ui";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";
import { Score, SiteBadge, subline } from "./LeadsView";

// Detalhes de um lead: usado no painel lateral (telas largas) e no sheet (demais)
export default function LeadDetail({ lead, pending, onClose, onEditTemplate, onWhatsapp, panel, diagnosis, onDiagnosisSaved }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const message = buildMessage(state.settings.template, lead, state.settings.profileName);
  const update = (patch) => dispatch({ type: "update", id: lead.id, patch });

  const copy = async (text, what = "Copiado") => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ message: what, icon: "copy" });
    } catch {
      toast({ message: "Não foi possível copiar", icon: "exclamation.fill", tone: "red" });
    }
  };

  const remove = () => {
    const snapshot = lead;
    dispatch({ type: "remove", ids: [lead.id] });
    onClose();
    toast({ message: `${snapshot.company} removido`, icon: "trash", action: { label: "Desfazer", onClick: () => dispatch({ type: "restore", leads: [snapshot] }) } });
  };

  const firstPhone = lead.phones[0];
  return (
    <div className={`detail ${panel ? "detail--panel" : ""}`}>
      {panel && (
        <header className="detail__head glass">
          <div className="detail__titles">
            <h2 className="detail__title">{lead.company}</h2>
            <p className="detail__subtitle">{subline(lead, true)}</p>
          </div>
          <button type="button" className="glass-circle" onClick={onClose} aria-label="Fechar detalhes"><Icon name="xmark" size={15} stroke={2.6} /></button>
        </header>
      )}

      <div className="detail__body">
        <div className="detail__summary">
          <Score value={lead.score} />
          <SiteBadge lead={lead} />
          {lead.rating != null && <Badge tone="gray" icon="star.fill">{fmtRating(lead.rating)} · {fmtNumber(lead.reviews)}</Badge>}
        </div>

        <div className="actions">
          <a className={`action action--primary ${lead.whatsapp ? "" : "is-disabled"}`} href={lead.whatsapp ? waUrl(lead.whatsapp.e164, message) : undefined} target="_blank" rel="noopener" aria-disabled={!lead.whatsapp} onClick={lead.whatsapp ? onWhatsapp : (e) => e.preventDefault()}>
            <Icon name="whatsapp" size={22} /><span>WhatsApp</span>
          </a>
          <a className={`action ${lead.email ? "" : "is-disabled"}`} href={lead.email ? `mailto:${lead.email.address}` : undefined} aria-disabled={!lead.email}>
            <Icon name="envelope.fill" size={20} /><span>E-mail</span>
          </a>
          <a className={`action ${firstPhone ? "" : "is-disabled"}`} href={firstPhone ? `tel:+${firstPhone.e164}` : undefined} aria-disabled={!firstPhone}>
            <Icon name="phone.fill" size={20} /><span>Ligar</span>
          </a>
          <a className={`action ${lead.mapsUrl ? "" : "is-disabled"}`} href={lead.mapsUrl || undefined} target="_blank" rel="noopener" aria-disabled={!lead.mapsUrl}>
            <Icon name="map.fill" size={20} /><span>Maps</span>
          </a>
        </div>

        <OwnerSection lead={lead} pending={pending} />

        {/* Contatos */}
        <Group title="Contatos" footer={lead.phones.some((p) => p.origin.includes("CNPJ")) ? "O telefone do cadastro do CNPJ costuma ser do dono em empresas pequenas, mas às vezes é do contador." : undefined}>
          {lead.phones.map((p) => (
            <Row key={p.e164} icon={p.mobile ? "whatsapp" : "phone.fill"} iconTone={p.mobile ? "green" : "gray"} label={<span className="tabular">{p.display}</span>} detail={`${p.mobile ? "Celular" : "Fixo"} · ${p.origin}`}>
              {p.mobile ? (
                <a className="icon-btn icon-btn--whats" href={waUrl(p.e164, message)} target="_blank" rel="noopener" aria-label={`Abrir ${p.display} no WhatsApp`} onClick={onWhatsapp}><Icon name="whatsapp" size={18} /></a>
              ) : (
                <a className="icon-btn" href={`tel:+${p.e164}`} aria-label={`Ligar para ${p.display}`}><Icon name="phone.fill" size={17} /></a>
              )}
              <button type="button" className="icon-btn" onClick={() => copy(p.display, "Telefone copiado")} aria-label={`Copiar ${p.display}`}><Icon name="copy" size={17} /></button>
            </Row>
          ))}
          {lead.emails.map((e) => (
            <Row key={e.address} icon="envelope.fill" iconTone={e.accountant ? "orange" : "blue"} label={e.address} detail={`${e.accountant ? "Parece ser do contador · " : ""}${e.origin}`}>
              <a className="icon-btn" href={`mailto:${e.address}`} aria-label={`Enviar e-mail para ${e.address}`}><Icon name="envelope.fill" size={17} /></a>
              <button type="button" className="icon-btn" onClick={() => copy(e.address, "E-mail copiado")} aria-label={`Copiar ${e.address}`}><Icon name="copy" size={17} /></button>
            </Row>
          ))}
          {lead.instagram && (
            <Row icon="instagram" iconTone="pink" label={lead.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@").replace(/\/.*$/, "")} detail="Instagram" href={lead.instagram} chevron />
          )}
          {!lead.phones.length && !lead.emails.length && !lead.instagram && (
            pending ? <Row label="Procurando contatos…"><Spinner label="Procurando contatos" /></Row> : <Row icon="exclamation.fill" iconTone="gray" label="Nenhum contato encontrado" />
          )}
        </Group>

        {/* Motivos */}
        <Group title={`Por que abordar · ${lead.score} de 100`}>
          <ul className="reasons">
            {(lead.reasons.length ? lead.reasons : ["Poucos sinais de oportunidade"]).map((r) => (
              <li key={r}><Icon name="check" size={15} stroke={2.6} /><span>{r}</span></li>
            ))}
          </ul>
        </Group>

        {/* Mensagem */}
        <Group title="Mensagem pronta">
          <div className="row row--pad preview">
            <p className="bubble">{message}</p>
          </div>
          <div className="row row--actions">
            <button type="button" className="btn btn--plain btn--sm" onClick={onEditTemplate}><Icon name="doc" size={15} /> Editar modelo</button>
            <button type="button" className="btn btn--tinted btn--sm" onClick={() => copy(message, "Mensagem copiada")}><Icon name="copy" size={15} /> Copiar texto</button>
          </div>
        </Group>

        <AutomationRow lead={lead} />

        {diagKey(lead) && <DiagnosisSection host={diagKey(lead)} diagnosis={diagnosis} onSaved={onDiagnosisSaved} />}
        <SiteSection lead={lead} />
        <CompanySection lead={lead} copy={copy} />

        {/* Google Maps */}
        <Group title="Google Maps">
          <Row label="Nota" detail={lead.rating != null ? `${fmtRating(lead.rating)} ★ · ${fmtNumber(lead.reviews)} avaliações` : "Sem avaliações"} />
          <Row label="Endereço" detail={lead.address || "—"} href={lead.mapsUrl || undefined} chevron={!!lead.mapsUrl} />
          <Row label="Categoria" detail={lead.category || "—"} />
        </Group>

        {/* Acompanhamento */}
        <Group title="Acompanhamento">
          <label className="row row--split">
            <span className="row__label">Status</span>
            <span className="select select--plain">
              <select value={lead.status} onChange={(e) => update({ status: e.target.value })}>
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </span>
          </label>
          <label className="row field field--stack">
            <span className="sr-only">Notas</span>
            <textarea rows={3} value={lead.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Notas: o que conversaram, próximo passo…" />
          </label>
        </Group>

        <Group>
          <button type="button" className="row row--action row--destructive" onClick={remove}>
            <span className="row__main"><span className="row__label">Remover da lista</span></span>
          </button>
        </Group>
      </div>
    </div>
  );
}

// Coloca o lead na fila de disparos automáticos
function AutomationRow({ lead }) {
  const auto = useAutomation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (auto?.available === false) return null;
  const item = auto?.campaign?.queue.find((i) => i.leadId === lead.id && !["failed", "skipped"].includes(i.status));
  const label = { queued: "Na fila de disparos", sending: "Enviando agora", sent: "Mensagem enviada pela automação", replied: "Respondeu pela automação", optout: "Pediu para não receber mensagens" }[item?.status];

  const add = async () => {
    setBusy(true);
    try {
      const n = await auto.enqueueLeads([lead]);
      toast(n ? { message: `${lead.company} entrou na fila de disparos`, icon: "check.circle.fill", tone: "green" } : { message: "Este número já está na fila", icon: "exclamation.fill" });
    } catch (e) {
      toast({ message: e.message, icon: "exclamation.fill", tone: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group title="Automação">
      {item ? (
        <Row icon="whatsapp" iconTone={item.status === "optout" ? "red" : "green"} label={label} detail={item.reply ? `“${item.reply.text}”` : undefined} />
      ) : (
        <Row icon="whatsapp" iconTone="gray" label="Enviar pela automação" detail={lead.whatsapp ? "Entra na fila e sai no ritmo das regras de envio" : "Precisa de um celular (WhatsApp)"}>
          <button type="button" className="btn btn--tinted btn--sm" onClick={add} disabled={!lead.whatsapp || busy}>{busy ? <Spinner label="Adicionando" /> : "Adicionar"}</button>
        </Row>
      )}
    </Group>
  );
}

function OwnerSection({ lead, pending }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [cnpj, setCnpj] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // CNPJ informado à mão: consulta e aplica mesmo sem os sinais automáticos
  const consult = async (e) => {
    e.preventDefault();
    if (!isValidCnpj(cnpj)) { setError("CNPJ inválido. Confira os 14 números."); return; }
    setBusy(true);
    setError("");
    try {
      const co = await lookupCnpj(cnpj);
      if (!co) { setError("CNPJ não encontrado na Receita."); return; }
      const next = finalize(applyCompany(lead, co, matchScore(lead, co, "manual")));
      dispatch({ type: "replace", lead: next });
      setCnpj("");
      toast({ message: next.owner ? `Dono: ${next.owner.name}` : "CNPJ consultado", icon: "person.fill" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reason = {
    skipped: "A opção “Encontrar o dono” estava desligada nesta busca.",
    unverified: "A busca foi interrompida antes de verificar esta empresa.",
  }[lead.enrich] || "Não encontramos o CNPJ desta empresa com segurança suficiente.";

  return (
    <Group title="Tomador de decisão">
      {lead.owner ? (
        <>
          <div className="row row--pad owner">
            <span className="avatar avatar--lg" style={{ "--h": hue(lead.owner.name) }} aria-hidden="true">{initials(lead.owner.name)}</span>
            <div className="row__main">
              <span className="owner__name">{lead.owner.name}</span>
              <span className="row__detail">{lead.owner.role} · {lead.owner.origin}</span>
            </div>
          </div>
          {lead.owner.others?.length > 0 && (
            <Row label="Outros sócios" detail={lead.owner.others.map((s) => `${s.name} (${s.role.toLowerCase()})`).join(", ")} />
          )}
        </>
      ) : pending ? (
        <div className="row row--pad owner">
          <span className="avatar avatar--lg skeleton-avatar" aria-hidden="true" />
          <div className="row__main"><span className="skeleton" style={{ width: "60%" }} /><span className="skeleton" style={{ width: "40%" }} /></div>
        </div>
      ) : (
        <>
          <Row icon="person.fill" iconTone="gray" label="Dono não identificado" detail={reason} />
          <form className="row cnpj-form" onSubmit={consult}>
            <label className="field field--inline">
              <span className="sr-only">CNPJ</span>
              <input value={cnpj} onChange={(e) => { setCnpj(e.target.value); setError(""); }} placeholder="CNPJ: 00.000.000/0000-00" inputMode="numeric" aria-invalid={!!error} aria-describedby={error ? `cnpj-err-${lead.id}` : undefined} />
            </label>
            <button type="submit" className="btn btn--tinted btn--sm" disabled={busy || !cnpj.trim()}>{busy ? <Spinner label="Consultando" /> : "Consultar"}</button>
          </form>
          {error && <p id={`cnpj-err-${lead.id}`} className="field-error row--pad" role="alert"><Icon name="exclamation.fill" size={14} /> {error}</p>}
          <Row icon="search" iconTone="gray" label="Procurar o CNPJ no Google" href={`https://www.google.com/search?q=${encodeURIComponent(cnpjQuery(lead))}`} chevron />
        </>
      )}
    </Group>
  );
}

function SiteSection({ lead }) {
  const { site } = lead;
  if (site.type !== "site") return null;
  return (
    <Group title="Site atual" footer={site.free ? "Feito em construtor gratuito." : undefined}>
      <Row icon="globe" iconTone={site.online === false ? "red" : "blue"} label={site.host} detail={site.online === false ? "Fora do ar" : "Abrir site"} href={siteHref(site.url)} chevron />
      {site.problems?.length ? (
        <ul className="reasons reasons--warn">
          {site.problems.map((p) => <li key={p}><Icon name="exclamation.fill" size={15} /><span>{p}</span></li>)}
        </ul>
      ) : (
        <Row label={site.checked ? "Nenhum problema óbvio na página inicial." : "O site não foi analisado nesta busca."} className="row--muted" />
      )}
    </Group>
  );
}

function CompanySection({ lead, copy }) {
  const c = lead.cnpj;
  if (!c) return null;
  const rows = [
    ["CNPJ", <span key="c" className="kv__value"><span className="tabular">{c.number}</span> <button type="button" className="icon-btn icon-btn--inline" onClick={() => copy(c.number, "CNPJ copiado")} aria-label="Copiar CNPJ"><Icon name="copy" size={15} /></button></span>],
    ["Razão social", c.razao],
    c.fantasia && ["Nome fantasia", c.fantasia],
    ["Situação", c.situacao === "ATIVA" ? <Badge key="s" tone="green">Ativa</Badge> : <Badge key="s" tone="red">{c.situacao || "Desconhecida"}</Badge>],
    c.abertura && ["Abertura", formatDate(c.abertura)],
    c.porte && ["Porte", c.porte],
    ["MEI", c.mei ? "Sim" : "Não"],
    c.cnae && ["Atividade", c.cnae],
    ["Confiança", `${c.confidence === "alta" ? "Alta" : "Média"} — ${c.signals.join(", ") || "sem sinais"}`],
    ["Fonte", c.source],
  ].filter(Boolean);
  return (
    <Group title="Receita Federal">
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k} className="kv__row"><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </Group>
  );
}
