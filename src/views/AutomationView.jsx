import { useEffect, useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { DEFAULT_FOLLOW_TEMPLATE, useAutomation } from "../lib/automation";
import { buildMessage } from "../lib/enrich";
import { fmtNumber, plural, relativeTime } from "../lib/format";
import { Badge, ConfirmDialog, EmptyState, Group, Row, Segmented, Sheet, Spinner, Toggle } from "../components/ui";
import { useToast } from "../components/Toast";
import Icon from "../components/Icon";
import { Score } from "./LeadsView";

const STATUS = {
  queued: { label: "Na fila", tone: "gray" },
  sending: { label: "Enviando", tone: "blue" },
  sent: { label: "Enviada", tone: "blue" },
  replied: { label: "Respondeu", tone: "green" },
  optout: { label: "Pediu para sair", tone: "red" },
  failed: { label: "Falhou", tone: "red" },
  skipped: { label: "Sem WhatsApp", tone: "gray" },
};

const LIMITS = [10, 20, 30, 40].map((n) => ({ id: n, label: String(n) }));
const DELAYS = [
  { id: "2-5", label: "2–5 min", min: 120, max: 300 },
  { id: "5-10", label: "5–10 min", min: 300, max: 600 },
  { id: "10-20", label: "10–20 min", min: 600, max: 1200 },
];
const FOLLOW_DAYS = [2, 3, 5, 7].map((n) => ({ id: n, label: `${n} dias` }));
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const countdown = (ts) => {
  const s = Math.max(0, Math.round((ts - Date.now()) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim() : `${s} s`;
};

export default function AutomationView() {
  const auto = useAutomation();
  const toast = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  if (auto.available === false) {
    return (
      <div className="results">
        <Header />
        <div className="surface">
          <EmptyState icon="exclamation.fill" title="Servidor local desligado">
            A automação roda no servidor do Prospect. Abra pelo terminal com “npm run dev” ou “npm start” e recarregue a página.
          </EmptyState>
        </div>
      </div>
    );
  }
  if (!auto.status || !auto.campaign) {
    return <div className="results"><Header /><div className="surface"><EmptyState icon="whatsapp" title="Carregando a automação…" /></div></div>;
  }

  const { status, campaign } = auto;
  const q = campaign.queue;
  const counts = {
    queued: q.filter((i) => i.status === "queued" || i.status === "sending").length,
    replied: q.filter((i) => i.status === "replied").length,
    optout: q.filter((i) => i.status === "optout").length,
    sent: q.filter((i) => ["sent", "replied", "optout"].includes(i.status)).length,
  };
  const replyRate = counts.sent ? Math.round((counts.replied / counts.sent) * 100) : 0;
  const connected = status.status === "connected";

  const run = async (fn, ok) => {
    try { await fn(); if (ok) toast({ message: ok, icon: "check.circle.fill", tone: "green" }); }
    catch (e) { toast({ message: e.message, icon: "exclamation.fill", tone: "red", duration: 7000 }); }
  };

  const stateLine = campaign.blocked
    ? campaign.blocked
    : campaign.nextSendAt ? `Próximo envio em ${countdown(campaign.nextSendAt)}`
    : counts.queued ? "Enviando…" : "Fila vazia";

  return (
    <div className="results results--narrow">
      <Header />

      <div className="notice notice--warn" role="note">
        <Icon name="exclamation.fill" size={18} />
        <p>
          Conexão <b>não oficial</b> (como o WhatsApp Web). Disparos para quem não tem seu número salvo podem levar ao
          <b> bloqueio do número</b>. Mantenha poucos envios por dia, mensagens personalizadas e respeite quem pedir para sair.
        </p>
      </div>

      {/* Conexão */}
      <Group title="WhatsApp">
        {connected ? (
          <Row icon="whatsapp" iconTone="green" label={status.me?.name || "Conectado"} detail={status.me?.number ? `+${status.me.number}` : "Seu número"}>
            <button type="button" className="btn btn--plain btn--sm is-destructive" onClick={() => setConfirmLogout(true)}>Desconectar</button>
          </Row>
        ) : status.status === "qr" ? (
          <div className="qr">
            <img src={status.qr} alt="QR Code para conectar o WhatsApp" width="240" height="240" />
            <ol className="howto">
              <li><span>1</span><p>Abra o WhatsApp no celular</p></li>
              <li><span>2</span><p>Toque em <b>Configurações → Aparelhos conectados</b></p></li>
              <li><span>3</span><p>Toque em <b>Conectar um aparelho</b> e aponte para este código</p></li>
            </ol>
          </div>
        ) : status.status === "connecting" ? (
          <Row label={status.events?.[0]?.text?.startsWith("QR escaneado") ? "QR escaneado. Finalizando o login…" : "Conectando ao WhatsApp…"} detail="Mantenha o celular com internet por alguns segundos."><Spinner label="Conectando" /></Row>
        ) : (
          <>
            <Row icon="whatsapp" iconTone={status.error ? "red" : "gray"} label="WhatsApp desconectado" detail={status.error || "Conecte o número que você usa para prospectar."}>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => run(auto.connect)}>{status.error?.includes("QR") ? "Gerar novo QR" : "Conectar"}</button>
            </Row>
            {status.error && status.events?.length > 0 && (
              <details className="wa-events">
                <summary>Detalhes da conexão</summary>
                <ul>
                  {status.events.map((e) => <li key={e.at + e.text}><time>{new Date(e.at).toLocaleTimeString("pt-BR")}</time> {e.text}</li>)}
                </ul>
              </details>
            )}
          </>
        )}
      </Group>

      {/* Painel da fila */}
      <section className="run-card auto-card" aria-label="Disparos">
        <div className="stats">
          <Stat value={counts.queued} label="na fila" />
          <Stat value={`${campaign.sentToday}/${campaign.settings.dailyLimit}`} label="enviadas hoje" />
          <Stat value={counts.replied} label={`respostas${counts.sent ? ` · ${replyRate}%` : ""}`} />
          <Stat value={counts.optout} label="pediram para sair" />
        </div>
        <div className="run-card__footer">
          <p className="run__message"><span className={`live-dot ${!campaign.blocked && counts.queued ? "is-on" : ""}`} /> {stateLine}</p>
          <div className="auto-card__actions">
            <button type="button" className="btn btn--gray btn--sm" onClick={() => run(() => auto.pause(!campaign.paused))}>
              <Icon name={campaign.paused ? "play" : "stop"} size={13} /> {campaign.paused ? "Retomar" : "Pausar"}
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setPickerOpen(true)}>
              <Icon name="plus" size={14} stroke={2.6} /> Adicionar leads
            </button>
          </div>
        </div>
      </section>

      {/* Fila */}
      <Group
        title={`Disparos · ${fmtNumber(q.length)}`}
        footer={q.some((i) => ["replied", "optout", "failed", "skipped"].includes(i.status)) ? (
          <button type="button" className="btn btn--plain btn--sm" onClick={() => run(auto.clearFinished, "Concluídos removidos da lista")}>Limpar concluídos</button>
        ) : undefined}
      >
        {!q.length && <Row icon="whatsapp" iconTone="gray" label="Nenhum disparo ainda" detail="Toque em “Adicionar leads” para escolher quem recebe a primeira mensagem." />}
        {[...q].reverse().slice(0, 100).map((i) => (
          <div key={i.id} className="row qitem">
            <div className="row__main">
              <span className="row__label qitem__head">
                <b>{i.company}</b>
                <Badge tone={STATUS[i.status]?.tone}>{STATUS[i.status]?.label}</Badge>
                {i.followUpSent && <Badge tone="gray">follow-up enviado</Badge>}
              </span>
              <span className="row__detail">
                {i.reply ? `“${i.reply.text}” · ${relativeTime(i.reply.at)}`
                  : i.error ? i.error
                  : i.sentAt ? `Enviada ${relativeTime(i.sentAt)}${!i.followUpSent && campaign.settings.followUp.enabled && i.status === "sent" ? ` · follow-up ${new Date(i.followUpAt).toLocaleDateString("pt-BR")}` : ""}`
                  : i.text.slice(0, 110) + (i.text.length > 110 ? "…" : "")}
              </span>
            </div>
            {i.status === "queued" && (
              <button type="button" className="icon-btn" onClick={() => run(() => auto.remove(i.id))} aria-label={`Tirar ${i.company} da fila`}><Icon name="xmark" size={15} stroke={2.6} /></button>
            )}
          </div>
        ))}
      </Group>

      <Rules />

      {campaign.log.length > 0 && (
        <Group title="Atividade">
          {campaign.log.slice(0, 12).map((l) => (
            <Row key={l.at + l.text} label={l.text} detail={relativeTime(l.at)} className="row--compact" />
          ))}
        </Group>
      )}

      <LeadPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
      <ConfirmDialog
        open={confirmLogout}
        title="Desconectar o WhatsApp?"
        message="Os disparos param até você conectar de novo. A fila é mantida."
        confirmLabel="Desconectar"
        destructive
        onConfirm={() => { setConfirmLogout(false); run(auto.logout, "WhatsApp desconectado"); }}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}

const Header = () => (
  <header className="page__header">
    <h1 className="large-title">Automação</h1>
    <p className="page__subtitle">Prospecção pelo seu WhatsApp, no ritmo de uma pessoa.</p>
  </header>
);

const Stat = ({ value, label }) => (
  <div className="stat"><b>{typeof value === "number" ? fmtNumber(value) : value}</b><span>{label}</span></div>
);

/* ---------- Regras de envio ---------- */
function Rules() {
  const { state, dispatch } = useStore();
  const auto = useAutomation();
  const s = auto.campaign.settings;
  const save = (patch) => auto.saveSettings(patch);
  const delayId = DELAYS.find((d) => d.min === s.minDelay && d.max === s.maxDelay)?.id || "2-5";
  const hours = Array.from({ length: 25 }, (_, h) => h);
  const followTemplate = state.settings.followTemplate || DEFAULT_FOLLOW_TEMPLATE;

  return (
    <Group title="Regras de envio" footer="As regras protegem o seu número: poucos envios, intervalos aleatórios e “digitando…” antes de cada mensagem. Quem responde sai da fila e não recebe follow-up.">
      <div className="row row--split">
        <span className="row__label">Limite por dia</span>
        <Segmented label="Limite por dia" options={LIMITS} value={s.dailyLimit} onChange={(dailyLimit) => save({ dailyLimit })} size="sm" />
      </div>
      <div className="row row--split">
        <span className="row__label">Intervalo</span>
        <Segmented label="Intervalo entre mensagens" options={DELAYS} value={delayId} onChange={(id) => { const d = DELAYS.find((x) => x.id === id); save({ minDelay: d.min, maxDelay: d.max }); }} size="sm" />
      </div>
      <div className="row row--split">
        <span className="row__label">Horário</span>
        <span className="hours">
          <label className="select"><span className="sr-only">Início</span>
            <select value={s.startHour} onChange={(e) => save({ startHour: Number(e.target.value) })}>
              {hours.slice(0, 24).map((h) => <option key={h} value={h}>{h}h</option>)}
            </select>
          </label>
          <span className="hours__sep">às</span>
          <label className="select"><span className="sr-only">Fim</span>
            <select value={s.endHour} onChange={(e) => save({ endHour: Number(e.target.value) })}>
              {hours.slice(1).map((h) => <option key={h} value={h}>{h}h</option>)}
            </select>
          </label>
        </span>
      </div>
      <Toggle
        label="Liberar horário hoje"
        description="Envia fora do horário e dos dias até a meia-noite. O limite diário e os intervalos continuam valendo."
        checked={!!auto.campaign.hoursOverride}
        onChange={(on) => auto.setHoursOverride(on)}
      />
      <div className="row row--split">
        <span className="row__label">Dias</span>
        <span className="weekdays" role="group" aria-label="Dias de envio">
          {WEEKDAYS.map((d, i) => {
            const on = s.weekdays.includes(i);
            return (
              <button key={i} type="button" className={`weekday ${on ? "is-on" : ""}`} aria-pressed={on} aria-label={WEEKDAY_NAMES[i]}
                onClick={() => save({ weekdays: on ? s.weekdays.filter((x) => x !== i) : [...s.weekdays, i].sort() })}>
                {d}
              </button>
            );
          })}
        </span>
      </div>
      <Toggle
        label="Follow-up automático"
        description="Uma segunda mensagem para quem não respondeu"
        checked={s.followUp.enabled}
        onChange={(enabled) => save({ followUp: { enabled } })}
      />
      {s.followUp.enabled && (
        <>
          <div className="row row--split">
            <span className="row__label">Enviar após</span>
            <Segmented label="Dias até o follow-up" options={FOLLOW_DAYS} value={s.followUp.days} onChange={(days) => save({ followUp: { days } })} size="sm" />
          </div>
          <label className="row field field--stack">
            <span className="sr-only">Texto do follow-up</span>
            <textarea rows={3} value={followTemplate} onChange={(e) => dispatch({ type: "settings", patch: { followTemplate: e.target.value } })} />
          </label>
          <p className="row pnote-row">Variáveis: {"{nome}"}, {"{empresa}"}, {"{cidade}"}. Vale para os próximos leads adicionados à fila.</p>
        </>
      )}
    </Group>
  );
}

/* ---------- Escolher leads para a fila ---------- */
function LeadPicker({ open, onClose }) {
  const { state } = useStore();
  const auto = useAutomation();
  const toast = useToast();
  const [onlyNew, setOnlyNew] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(
    () => state.leads
      .filter((l) => l.whatsapp && !auto.queuedIds.has(l.id) && (!onlyNew || l.status === "novo"))
      .sort((a, b) => b.score - a.score),
    [state.leads, auto.queuedIds, onlyNew],
  );

  useEffect(() => {
    if (open) setSelected(new Set(candidates.slice(0, auto.campaign?.settings.dailyLimit || 20).map((l) => l.id)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = candidates.length > 0 && candidates.every((l) => selected.has(l.id));
  const preview = candidates.find((l) => selected.has(l.id));

  const add = async () => {
    setBusy(true);
    try {
      const added = await auto.enqueueLeads(candidates.filter((l) => selected.has(l.id)));
      toast({ message: `${plural(added, "lead adicionado", "leads adicionados")} à fila`, icon: "check.circle.fill", tone: "green" });
      onClose();
    } catch (e) {
      toast({ message: e.message, icon: "exclamation.fill", tone: "red" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Adicionar à fila"
      subtitle={`${plural(selected.size, "lead selecionado", "leads selecionados")}`}
      trailing={<button type="button" className="btn btn--primary btn--sm" onClick={add} disabled={!selected.size || busy}>{busy ? <Spinner label="Adicionando" /> : "Adicionar"}</button>}
    >
      <div className="picker__bar">
        <Segmented label="Quais leads" options={[{ id: "new", label: "Só novos" }, { id: "all", label: "Todos com WhatsApp" }]} value={onlyNew ? "new" : "all"} onChange={(v) => setOnlyNew(v === "new")} size="sm" />
        <button type="button" className="btn btn--plain btn--sm" onClick={() => setSelected(allOn ? new Set() : new Set(candidates.map((l) => l.id)))}>
          {allOn ? "Desmarcar todos" : "Marcar todos"}
        </button>
      </div>

      {!candidates.length ? (
        <EmptyState icon="whatsapp" title="Nenhum lead disponível">Faça uma busca com “Encontrar o dono” ligado. Só entram leads com WhatsApp que ainda não estão na fila.</EmptyState>
      ) : (
        <Group footer={`Ordenados pela nota de oportunidade. O limite diário (${auto.campaign?.settings.dailyLimit}) continua valendo: o resto espera os próximos dias.`}>
          {candidates.map((l) => (
            <label key={l.id} className="row pick">
              <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
              <span className="row__main">
                <span className="row__label"><b>{l.company}</b></span>
                <span className="row__detail">{[l.owner?.name, l.whatsapp.display].filter(Boolean).join(" · ")}</span>
              </span>
              <Score value={l.score} />
            </label>
          ))}
        </Group>
      )}

      {preview && (
        <Group title={`Prévia · ${preview.company}`}>
          <div className="row row--pad preview"><p className="bubble">{buildMessage(state.settings.template, preview, state.settings.profileName)}</p></div>
        </Group>
      )}
    </Sheet>
  );
}
