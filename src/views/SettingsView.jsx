import { useEffect, useRef, useState } from "react";
import { useStore, sanitizeLeads } from "../lib/store";
import { DEFAULT_TEMPLATE } from "../lib/constants";
import { buildMessage } from "../lib/enrich";
import { plural } from "../lib/format";
import { download, leadsToCsv, today } from "../lib/csv";
import { ConfirmDialog, Group, Row, Segmented } from "../components/ui";
import { useToast } from "../components/Toast";

const THEMES = [
  { id: "auto", label: "Automático" },
  { id: "light", label: "Claro" },
  { id: "dark", label: "Escuro" },
];

const VARIABLES = ["{nome}", "{empresa}", "{observacao}", "{cidade}", "{eu}"];

// Lead de exemplo para a prévia da mensagem
const SAMPLE = { company: "Bistrô Aurora - Cozinha de Autor", city: "Campinas", site: { type: "social", network: "Instagram" }, owner: { firstName: "Carla" } };

export default function SettingsView({ focusTemplate }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef(null);
  const tplRef = useRef(null);
  const set = (patch) => dispatch({ type: "settings", patch });

  // Vindo do botão "Editar modelo" de um lead
  useEffect(() => {
    if (!focusTemplate) return;
    const t = setTimeout(() => tplRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [focusTemplate]);

  const insertVar = (v) => {
    const el = tplRef.current;
    const t = state.settings.template;
    const start = el?.selectionStart ?? t.length;
    const end = el?.selectionEnd ?? t.length;
    set({ template: t.slice(0, start) + v + t.slice(end) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + v.length, start + v.length); });
  };

  const exportBackup = () => {
    const { profileName, template, sort, form, recentCities } = state.settings;
    const data = { app: "prospect", version: 2, exportedAt: new Date().toISOString(), settings: { profileName, template, sort, form, recentCities }, leads: state.leads };
    download(`prospect-backup-${today()}.json`, JSON.stringify(data, null, 2), "application/json");
    toast({ message: "Backup salvo (sem o token da Apify)", icon: "arrow.down.doc" });
  };

  const importBackup = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const leads = sanitizeLeads(data.leads);
      dispatch({ type: "import", leads });
      if (data.settings?.template) set({ template: data.settings.template });
      toast({ message: plural(leads.length, "lead importado", "leads importados"), icon: "check.circle.fill", tone: "green" });
    } catch {
      toast({ message: "Arquivo inválido. Use um backup exportado pelo Prospect.", icon: "exclamation.fill", tone: "red", duration: 7000 });
    }
  };

  const clearAll = () => {
    const snapshot = state.leads;
    dispatch({ type: "clear" });
    setConfirmClear(false);
    toast({ message: "Lista apagada", icon: "trash", action: { label: "Desfazer", onClick: () => dispatch({ type: "import", leads: snapshot }) }, duration: 8000 });
  };

  return (
    <div className="settings">
      <Group
        title="Mensagem do WhatsApp"
        footer={<><b>{"{nome}"}</b> é o primeiro nome do dono. <b>{"{observacao}"}</b> muda sozinha: “vi que vocês ainda não têm um site”, “vi que vocês usam o Instagram como site”, “notei alguns pontos no site de vocês…”.</>}
      >
        <label className="row field">
          <span className="field__label">Seu nome</span>
          <input value={state.settings.profileName} onChange={(e) => set({ profileName: e.target.value })} autoComplete="given-name" />
        </label>
        <label className="row field field--stack">
          <span className="sr-only">Texto da mensagem</span>
          <textarea ref={tplRef} rows={6} value={state.settings.template} onChange={(e) => set({ template: e.target.value })} />
        </label>
        <div className="row chips" role="group" aria-label="Variáveis">
          {VARIABLES.map((v) => <button type="button" key={v} className="chip chip--mono" onClick={() => insertVar(v)}>{v}</button>)}
          {state.settings.template !== DEFAULT_TEMPLATE && (
            <button type="button" className="chip chip--plain" onClick={() => set({ template: DEFAULT_TEMPLATE })}>Restaurar padrão</button>
          )}
        </div>
        <div className="row preview">
          <span className="preview__label">Prévia (lead que usa o Instagram como site)</span>
          <p className="bubble">{buildMessage(state.settings.template, SAMPLE, state.settings.profileName)}</p>
        </div>
      </Group>

      <Group title="Aparência">
        <div className="row row--pad">
          <Segmented label="Aparência" options={THEMES} value={state.settings.theme} onChange={(theme) => set({ theme })} />
        </div>
      </Group>

      <Group title="Dados" footer={`${plural(state.leads.length, "lead salvo", "leads salvos")} neste navegador. Cada busca concluída também é salva em CSV na pasta resultados/ do projeto.`}>
        <Row icon="arrow.down.doc" iconTone="green" label="Exportar planilha (CSV)" onClick={() => download(`prospect-leads-${today()}.csv`, leadsToCsv(state.leads), "text/csv;charset=utf-8")} disabled={!state.leads.length} chevron />
        <Row icon="arrow.down.doc" iconTone="blue" label="Fazer backup (JSON)" onClick={exportBackup} chevron />
        <Row icon="arrow.up.doc" iconTone="blue" label="Restaurar backup" onClick={() => fileRef.current?.click()} chevron />
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importBackup} />
        <Row icon="trash" iconTone="red" label="Apagar todos os leads" onClick={() => setConfirmClear(true)} disabled={!state.leads.length} className="row--destructive" />
      </Group>

      <Group title="Uso responsável">
        <div className="row row--pad prose">
          <p>
            Os dados vêm de fontes públicas (Google Maps, sites das empresas e Receita Federal) e servem para contato comercial B2B.
            Pela LGPD: apresente-se, seja relevante e atenda quem pedir para não receber mais mensagens.
          </p>
        </div>
      </Group>

      <Group title="Atalhos do teclado">
        <Row label="Buscar leads"><span><kbd>⌘</kbd> <kbd>↩</kbd></span></Row>
        <Row label="Filtrar os resultados"><kbd>/</kbd></Row>
        <Row label="Navegar entre os leads"><span><kbd>↑</kbd> <kbd>↓</kbd></span></Row>
        <Row label="Fechar detalhes"><kbd>Esc</kbd></Row>
      </Group>

      <ConfirmDialog
        open={confirmClear}
        title="Apagar todos os leads?"
        message={`${plural(state.leads.length, "lead será removido", "leads serão removidos")} deste navegador. Você ainda pode desfazer logo em seguida.`}
        confirmLabel="Apagar"
        destructive
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
