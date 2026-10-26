import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { useRunner } from "../lib/runner";
import { EXAMPLES, STATUSES, statusById } from "../lib/constants";
import { buildMessage } from "../lib/enrich";
import { waUrl } from "../lib/phone";
import { fmtNumber, fmtRating, hue, initials, norm, plural, relativeTime } from "../lib/format";
import { download, leadsToCsv, slug, today } from "../lib/csv";
import { Badge, EmptyState, Sheet } from "../components/ui";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";
import LeadDetail from "./LeadDetail";
import RunStatus from "./RunStatus";
import { VERDICTS, diagKey, fetchAllDiagnoses } from "../lib/diagnoses";

const FILTERS = {
  semSite: { label: "Sem site", test: (l) => l.site.type !== "site" || l.site.online === false },
  comSite: { label: "Site com problemas", test: (l) => l.site.type === "site" && (l.site.online === false || l.site.problems?.length > 0) },
  dono: { label: "Com dono", test: (l) => !!l.owner },
  whatsapp: { label: "Com WhatsApp", test: (l) => !!l.whatsapp },
  email: { label: "Com e-mail", test: (l) => !!l.email },
};

const SORTS = {
  score: { label: "Maior oportunidade", fn: (a, b) => b.score - a.score || b.reviews - a.reviews },
  reviews: { label: "Mais avaliações", fn: (a, b) => b.reviews - a.reviews || b.score - a.score },
  rating: { label: "Melhor nota", fn: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviews - a.reviews },
  name: { label: "Nome (A–Z)", fn: (a, b) => a.company.localeCompare(b.company, "pt-BR") },
  recent: { label: "Mais recentes", fn: (a, b) => b.createdAt - a.createdAt },
};

const COMPACT_BELOW = 720;
const SIDE_BY_SIDE = "(min-width: 1280px)";

export default function LeadsView({ onExample, onEditTemplate, searchRef, onOpenPanel }) {
  const { state, dispatch } = useStore();
  const runner = useRunner();
  const toast = useToast();
  const [filters, setFilters] = useState(() => new Set());
  const [status, setStatus] = useState("todos");
  const [source, setSource] = useState("todas");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [compact, setCompact] = useState(false);
  const [sideBySide, setSideBySide] = useState(() => window.matchMedia(SIDE_BY_SIDE).matches);
  const q = useDeferredValue(query);
  const listRef = useRef(null);
  const seen = useRef(null);
  const sort = SORTS[state.settings.sort] ? state.settings.sort : "score";

  // Tabela ou cartões conforme a largura real da coluna
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCompact(e.contentRect.width < COMPACT_BELOW));
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.leads.length > 0]);

  // Diagnósticos dos sites (atualiza de tempos em tempos: podem ser registrados de fora)
  const [diagnoses, setDiagnoses] = useState({});
  useEffect(() => {
    let alive = true;
    const load = () => fetchAllDiagnoses().then((d) => alive && setDiagnoses(d));
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Esc fecha o painel lateral (no sheet, o próprio sheet cuida disso)
  useEffect(() => {
    if (!selectedId || !sideBySide) return;
    const onKey = (e) => e.key === "Escape" && !document.querySelector(".alert-layer") && setSelectedId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, sideBySide]);

  useEffect(() => {
    const mq = window.matchMedia(SIDE_BY_SIDE);
    const on = () => setSideBySide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const sources = useMemo(() => [...new Set(state.leads.map((l) => l.source).filter(Boolean))], [state.leads]);
  const counts = useMemo(() => Object.fromEntries(Object.entries(FILTERS).map(([k, f]) => [k, state.leads.filter(f.test).length])), [state.leads]);

  const list = useMemo(() => {
    const nq = norm(q.trim());
    let out = state.leads;
    if (nq) out = out.filter((l) => norm(`${l.company} ${l.owner?.name || ""} ${l.neighborhood} ${l.category} ${l.city}`).includes(nq));
    for (const k of filters) out = out.filter(FILTERS[k].test);
    if (status !== "todos") out = out.filter((l) => l.status === status);
    if (source !== "todas") out = out.filter((l) => l.source === source);
    return [...out].sort(SORTS[sort].fn);
  }, [state.leads, q, filters, status, source, sort]);

  // Linhas que chegam durante a busca ganham um destaque rápido (1,6 s)
  if (!seen.current) seen.current = new Map(state.leads.map((l) => [l.id, 0]));
  const now = Date.now();
  for (const l of list) if (!seen.current.has(l.id)) seen.current.set(l.id, now);
  const newIds = new Set(list.filter((l) => now - (seen.current.get(l.id) || 0) < 1600).map((l) => l.id));

  const toggleFilter = (k) => setFilters((f) => { const n = new Set(f); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const filtersActive = filters.size || status !== "todos" || source !== "todas" || query;
  const clearFilters = () => { setFilters(new Set()); setStatus("todos"); setSource("todas"); setQuery(""); };

  const exportCsv = () => {
    if (!list.length) { toast({ message: "Nenhum lead para exportar", icon: "exclamation.fill" }); return; }
    download(`leads-${slug(source !== "todas" ? source : state.run?.search?.label)}-${today()}.csv`, leadsToCsv(list), "text/csv;charset=utf-8");
    toast({ message: `${plural(list.length, "lead exportado", "leads exportados")}`, icon: "arrow.down.doc" });
  };

  const selected = state.leads.find((l) => l.id === selectedId) || null;
  const close = () => setSelectedId(null);

  // ↑ ↓ navegam entre os leads (e trocam o painel aberto)
  const onListKey = (e) => {
    if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
    const items = [...listRef.current.querySelectorAll("[data-open]")];
    const i = items.indexOf(document.activeElement);
    if (i === -1) return;
    const next = items[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    next.focus();
    if (selectedId) setSelectedId(next.dataset.open);
  };

  const pending = (l) => runner.busy && (l.enrich === "pending" || l.enrich === "working");
  const message = (l) => buildMessage(state.settings.template, l, state.settings.profileName);
  const onWhatsapp = (l) => {
    if (l.status === "novo") {
      dispatch({ type: "update", id: l.id, patch: { status: "contatado" } });
      toast({ message: `${l.company}: marcado como Contatado`, icon: "check.circle.fill", tone: "green", action: { label: "Desfazer", onClick: () => dispatch({ type: "update", id: l.id, patch: { status: "novo" } }) } });
    }
  };

  if (!state.leads.length) {
    return (
      <div className="results">
        <header className="page__header page__header--row">
          <div><h1 className="large-title">Leads</h1><p className="page__subtitle">Nenhuma busca ainda</p></div>
          {onOpenPanel && <button type="button" className="btn btn--tinted" onClick={onOpenPanel}><Icon name="search" size={16} stroke={2.6} /> Nova busca</button>}
        </header>
        <RunStatus />
        <div className="surface">
          {runner.account.status !== "connected" && runner.account.status !== "checking" ? (
            <EmptyState icon="key" title="Conecte sua conta da Apify" action={
              <ol className="howto">
                <li><span>1</span><p>Abra o <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noopener">painel de integrações da Apify</a></p></li>
                <li><span>2</span><p>Copie o “Personal API token”</p></li>
                <li><span>3</span><p>Cole na caixa “Token da API” e toque em Conectar</p></li>
              </ol>
            }>
              O Prospect usa a Apify para buscar negócios no Google Maps. É rápido:
            </EmptyState>
          ) : runner.busy ? (
            <EmptyState icon="search" title="Procurando negócios no Google Maps…">Os leads aparecem aqui assim que os primeiros resultados chegarem.</EmptyState>
          ) : (
            <EmptyState icon="map.fill" title="Encontre seus próximos clientes" action={
              <div className="examples">
                {EXAMPLES.map(([t, c]) => (
                  <button type="button" key={t} className="chip" onClick={() => onExample(t, c)}>{t} · {c}</button>
                ))}
              </div>
            }>
              Escolha um nicho e uma cidade. O Prospect traz os negócios do Google Maps com o nome do dono, o WhatsApp e o e-mail.
            </EmptyState>
          )}
        </div>
      </div>
    );
  }

  const detailProps = selected && {
    lead: selected, pending: pending(selected), onClose: close, onEditTemplate, onWhatsapp: () => onWhatsapp(selected),
    diagnosis: diagnoses[diagKey(selected)] || null,
    onDiagnosisSaved: (d) => setDiagnoses((all) => ({ ...all, [d.host]: d })),
  };

  return (
    <div className={`results ${selected && sideBySide ? "results--split" : ""}`}>
      <div className="split__main">
        <header className="page__header page__header--row">
          <div>
            <h1 className="large-title">Leads <span className="count">{fmtNumber(state.leads.length)}</span></h1>
            <p className="page__subtitle" title={state.run?.csvFile ? `CSV completo salvo em ${state.run.csvFile}` : undefined}>
              {filtersActive
                ? `${plural(list.length, "lead", "leads")} com esses filtros`
                : state.run?.search
                  ? [state.run.search.label, state.run.phase === "done" && state.run.message?.replace(/\.$/, ""), !runner.busy && relativeTime(state.run.finishedAt)].filter(Boolean).join(" — ")
                  : "Todas as buscas"}
            </p>
          </div>
          {onOpenPanel && (
            <button type="button" className="btn btn--tinted" onClick={onOpenPanel}>
              <Icon name="search" size={16} stroke={2.6} /> Nova busca
            </button>
          )}
        </header>

        <RunStatus />

        <div className="toolbar glass">
          <label className="searchfield">
            <Icon name="search" size={16} stroke={2.4} />
            <span className="sr-only">Filtrar por empresa, dono ou bairro</span>
            <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar leads" enterKeyHint="search" />
            {query ? (
              <button type="button" className="searchfield__clear" onClick={() => setQuery("")} aria-label="Limpar"><Icon name="xmark" size={11} stroke={3} /></button>
            ) : <kbd className="kbd-inline" aria-hidden="true">/</kbd>}
          </label>
          <div className="filter-chips" role="group" aria-label="Filtros">
            {Object.entries(FILTERS).map(([k, f]) => (
              <button type="button" key={k} className={`chip ${filters.has(k) ? "is-active" : ""}`} aria-pressed={filters.has(k)} onClick={() => toggleFilter(k)}>
                {f.label} <span className="chip__count">{fmtNumber(counts[k])}</span>
              </button>
            ))}
          </div>
          <div className="toolbar__selects">
            <button type="button" className="btn btn--gray btn--sm" onClick={exportCsv}>
              <Icon name="arrow.down.doc" size={15} /> Exportar CSV
            </button>
            <label className="select">
              <span className="sr-only">Ordenar por</span>
              <select value={sort} onChange={(e) => dispatch({ type: "settings", patch: { sort: e.target.value } })}>
                {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
              </select>
            </label>
            <label className="select">
              <span className="sr-only">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="todos">Todos os status</option>
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            {sources.length > 1 && (
              <label className="select">
                <span className="sr-only">Busca</span>
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="todas">Todas as buscas</option>
                  {sources.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>

        <div ref={listRef} onKeyDown={onListKey}>
          {!list.length ? (
            <EmptyState icon="search" title="Nenhum lead com esses filtros" action={<button type="button" className="btn btn--tinted" onClick={clearFilters}>Limpar filtros</button>}>
              Remova algum filtro ou mude o texto da busca.
            </EmptyState>
          ) : compact ? (
            <ul className="cards" aria-label="Leads">
              {list.map((l) => (
                <li key={l.id}>
                  <LeadCard lead={l} isNew={newIds.has(l.id)} selected={l.id === selectedId} pending={pending(l)} diagnosis={diagnoses[diagKey(l)]} onOpen={() => setSelectedId(l.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Leads encontrados. Selecione uma empresa para ver os detalhes.</caption>
                <thead>
                  <tr>
                    <th scope="col">Empresa</th>
                    <th scope="col">Tomador de decisão</th>
                    <th scope="col">Contato</th>
                    <th scope="col">Site</th>
                    <th scope="col" className="col-rating">Avaliação</th>
                    <th scope="col" className="col-score">Oportunidade</th>
                    <th scope="col"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((l) => (
                    <tr key={l.id} className={newIds.has(l.id) ? "is-new" : ""} aria-selected={l.id === selectedId} onClick={() => setSelectedId(l.id)}>
                      <td>
                        <div className="cell-stack">
                          <button type="button" className="row-open" data-open={l.id} onClick={(e) => { e.stopPropagation(); setSelectedId(l.id); }}>{l.company}</button>
                          <span className="cell-sub">{subline(l)}</span>
                        </div>
                      </td>
                      <td><OwnerCell lead={l} pending={pending(l)} /></td>
                      <td><ContactCell lead={l} pending={pending(l)} /></td>
                      <td><div className="cell-badges"><SiteBadge lead={l} /><VerdictBadge diagnosis={diagnoses[diagKey(l)]} /></div></td>
                      <td className="col-rating"><Rating lead={l} /></td>
                      <td className="col-score"><Score value={l.score} /></td>
                      <td className="col-action">
                        {l.whatsapp && (
                          <a className="icon-btn icon-btn--whats" href={waUrl(l.whatsapp.e164, message(l))} target="_blank" rel="noopener" aria-label={`WhatsApp de ${l.company}`} onClick={(e) => { e.stopPropagation(); onWhatsapp(l); }}>
                            <Icon name="whatsapp" size={18} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && sideBySide && (
        <aside className="inspector" aria-label={`Detalhes de ${selected.company}`}>
          <LeadDetail key={selected.id} {...detailProps} panel />
        </aside>
      )}
      {!sideBySide && (
        <Sheet open={!!selected} onClose={close} title={selected?.company || ""} subtitle={selected ? subline(selected, true) : ""}>
          {selected && <LeadDetail key={selected.id} {...detailProps} />}
        </Sheet>
      )}
    </div>
  );
}

/* ---------- Células ---------- */

export const subline = (l, full) =>
  [l.category, full ? [l.neighborhood, l.city].filter(Boolean).join(", ") : l.neighborhood || l.city].filter(Boolean).join(" · ");

const Skeleton = ({ w = "70%" }) => <span className="skeleton" style={{ width: w }} />;

function OwnerCell({ lead, pending }) {
  if (lead.owner) return <div className="cell-stack"><span className="cell-main">{lead.owner.name}</span><span className="cell-sub">{lead.owner.role}</span></div>;
  if (pending) return <div className="cell-stack"><Skeleton /><Skeleton w="45%" /></div>;
  const text = { nocnpj: "Não identificado", unverified: "Não verificado", skipped: "—" }[lead.enrich] || "—";
  return <span className="cell-muted">{text}</span>;
}

function ContactCell({ lead, pending }) {
  const lines = [];
  if (lead.whatsapp) lines.push(<span key="w" className="contact-line is-whats"><Icon name="whatsapp" size={14} /><span className="tabular">{lead.whatsapp.display}</span></span>);
  else if (lead.phones[0]) lines.push(<span key="p" className="contact-line"><Icon name="phone.fill" size={13} /><span className="tabular">{lead.phones[0].display}</span></span>);
  if (lead.email) lines.push(
    <span key="e" className="contact-line"><Icon name="envelope.fill" size={13} /><span className="ellipsis">{lead.email.address}</span>{lead.email.accountant && <Badge tone="orange">contador</Badge>}</span>,
  );
  if (lines.length) return <div className="cell-stack">{lines}</div>;
  if (pending) return <Skeleton w="60%" />;
  return <span className="cell-muted">Sem contato</span>;
}

export function SiteBadge({ lead }) {
  const { site } = lead;
  if (site.type === "none") return <Badge tone="orange" icon="nosite">Sem site</Badge>;
  if (site.type === "social") return <Badge tone="orange">{site.label}</Badge>;
  if (site.online === false) return <Badge tone="red">Fora do ar</Badge>;
  if (site.problems?.length) return <Badge tone="yellow">{plural(site.problems.length, "problema", "problemas")}</Badge>;
  return <Badge tone="gray" icon="globe">Tem site</Badge>;
}

function Rating({ lead }) {
  if (lead.rating == null) return <span className="cell-muted">Sem nota</span>;
  return <span className="rating"><Icon name="star.fill" size={12} />{fmtRating(lead.rating)} <span className="cell-sub">({fmtNumber(lead.reviews)})</span></span>;
}

export function Score({ value }) {
  const level = value >= 70 ? "high" : value >= 40 ? "mid" : "low";
  return <span className={`score is-${level}`} title={`Oportunidade: ${value} de 100`} aria-label={`Oportunidade ${value} de 100`}>{value}</span>;
}

// Selo do veredito do diagnóstico (Manter / Melhorar / Refazer)
function VerdictBadge({ diagnosis }) {
  const v = diagnosis && VERDICTS[diagnosis.verdict];
  return v ? <Badge tone={v.tone} icon="doc">{v.label}</Badge> : null;
}

function LeadCard({ lead, isNew, selected, pending, diagnosis, onOpen }) {
  return (
    <button type="button" className={`lead-card ${isNew ? "is-new" : ""}`} data-open={lead.id} aria-current={selected} onClick={onOpen}>
      <span className="lead-card__head">
        <span className="avatar" style={{ "--h": hue(lead.company) }} aria-hidden="true">{initials(lead.company)}</span>
        <span className="cell-stack">
          <span className="cell-main">{lead.company}</span>
          <span className="cell-sub">{subline(lead)}</span>
        </span>
        <Score value={lead.score} />
      </span>
      {lead.owner ? (
        <span className="contact-line"><Icon name="person.fill" size={13} /><span><b>{lead.owner.name}</b> · {lead.owner.role}</span></span>
      ) : pending ? <Skeleton w="55%" /> : null}
      <ContactCell lead={lead} pending={pending} />
      <span className="lead-card__meta">
        <SiteBadge lead={lead} />
        <VerdictBadge diagnosis={diagnosis} />
        {lead.rating != null && <Badge tone="gray" icon="star.fill">{fmtRating(lead.rating)} · {fmtNumber(lead.reviews)}</Badge>}
        {lead.status !== "novo" && <Badge tone={lead.status === "fechado" ? "green" : lead.status === "descartado" ? "gray" : "blue"}>{statusById[lead.status].label}</Badge>}
      </span>
    </button>
  );
}
