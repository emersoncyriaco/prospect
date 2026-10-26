import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useStore } from "./store";
import { buildMessage } from "./enrich";

// Chamadas à automação no servidor local (o cabeçalho X-Prospect protege contra sites de terceiros)
async function wa(path, body) {
  const res = await fetch(`/api/wa/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "X-Prospect": "1", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);
  return data;
}

export const DEFAULT_FOLLOW_TEMPLATE =
  "Oi, {nome}! Passando para saber se você viu minha mensagem sobre {empresa}. Se fizer sentido, te mostro uma ideia em 2 minutos. 🙂";

const AutomationContext = createContext(null);

export function AutomationProvider({ children }) {
  const { state, dispatch } = useStore();
  const [available, setAvailable] = useState(null); // null = verificando
  const [status, setStatus] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const leadsRef = useRef(state.leads);
  leadsRef.current = state.leads;

  const refresh = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([wa("status"), wa("campaign")]);
      setStatus(s);
      setCampaign(c);
      setAvailable(true);
      return c;
    } catch {
      setAvailable(false);
      return null;
    }
  }, []);

  // Consulta frequente com QR na tela; mais espaçada no resto do tempo
  useEffect(() => {
    let alive = true;
    let timer;
    const loop = async () => {
      await refresh();
      if (!alive) return;
      timer = setTimeout(loop, status?.status === "qr" || status?.status === "connecting" ? 2000 : 6000);
    };
    loop();
    return () => { alive = false; clearTimeout(timer); };
  }, [refresh, status?.status]);

  // Fila sempre com o número certo: corrige (ou remove) itens não enviados
  // cujo WhatsApp mudou no lead (ex.: número genérico descartado, prioridade do Google Maps)
  const retargeting = useRef(false);
  useEffect(() => {
    if (!campaign || retargeting.current) return;
    const changes = [];
    for (const item of campaign.queue) {
      if (item.status !== "queued") continue;
      const lead = leadsRef.current.find((l) => l.id === item.leadId);
      if (!lead) continue;
      const to = lead.whatsapp?.e164;
      if (!to) changes.push({ id: item.id, remove: true });
      else if (to !== item.to) changes.push({ id: item.id, to });
    }
    if (!changes.length) return;
    retargeting.current = true;
    wa("retarget", { changes }).then(refresh).catch(() => {}).finally(() => { retargeting.current = false; });
  }, [campaign, refresh]);

  // Leva o resultado dos disparos para o status de cada lead
  useEffect(() => {
    if (!campaign) return;
    for (const item of campaign.queue) {
      const lead = leadsRef.current.find((l) => l.id === item.leadId);
      if (!lead) continue;
      if ((item.status === "replied" || item.status === "optout") && item.reply && lead.waReplyAt !== item.reply.at) {
        const optout = item.status === "optout";
        dispatch({
          type: "update",
          id: lead.id,
          patch: {
            status: optout ? "descartado" : ["novo", "contatado"].includes(lead.status) ? "conversando" : lead.status,
            waReplyAt: item.reply.at,
            notes: `${lead.notes ? `${lead.notes}\n` : ""}${optout ? "Pediu para não receber mensagens" : "Respondeu"} no WhatsApp: “${item.reply.text}”`,
          },
        });
      } else if (item.status === "sent" && lead.status === "novo") {
        dispatch({ type: "update", id: lead.id, patch: { status: "contatado" } });
      }
    }
  }, [campaign, dispatch]);

  const act = async (path, body) => {
    const r = await wa(path, body);
    await refresh();
    return r;
  };

  // Monta a mensagem de cada lead e coloca na fila do servidor
  const enqueueLeads = async (leads) => {
    const { template, profileName, followTemplate } = state.settings;
    const items = leads.filter((l) => l.whatsapp).map((l) => ({
      leadId: l.id,
      company: l.company,
      to: l.whatsapp.e164,
      text: buildMessage(template, l, profileName),
      followText: buildMessage(followTemplate || DEFAULT_FOLLOW_TEMPLATE, l, profileName),
    }));
    return (await act("enqueue", { items })).added;
  };

  const queuedIds = new Set((campaign?.queue || []).filter((i) => !["failed", "skipped"].includes(i.status)).map((i) => i.leadId));

  const value = {
    available, status, campaign, refresh, queuedIds,
    connect: () => act("connect", {}),
    logout: () => act("logout", {}),
    pause: (paused) => act("pause", { paused }),
    setHoursOverride: (on) => act("override", { on }),
    saveSettings: (patch) => act("settings", patch),
    remove: (id) => act("remove", { id }),
    clearFinished: () => act("clear", {}),
    enqueueLeads,
  };
  return <AutomationContext.Provider value={value}>{children}</AutomationContext.Provider>;
}

export const useAutomation = () => useContext(AutomationContext);
