import { useEffect, useRef, useState } from "react";
import { useStore } from "./lib/store";
import { useRunner } from "./lib/runner";
import { useAutomation } from "./lib/automation";
import { useToast } from "./components/Toast";
import { Sheet, Spinner } from "./components/ui";
import Icon from "./components/Icon";
import SearchPanel from "./views/SearchPanel";
import LeadsView from "./views/LeadsView";
import AutomationView from "./views/AutomationView";
import SettingsView from "./views/SettingsView";

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

// Trilho de ícones (sempre visível) + painel de busca recolhível + conteúdo
export default function App() {
  const { state, dispatch, storageError, dismissStorageError } = useStore();
  const runner = useRunner();
  const auto = useAutomation();
  const toast = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusTemplate, setFocusTemplate] = useState(0);
  const [, rerender] = useState(0);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const mainRef = useRef(null);

  const view = state.settings.view === "automacao" ? "automacao" : "prospeccao";
  const collapsed = !!state.settings.panelCollapsed;
  const panelVisible = view === "prospeccao" && !collapsed;
  const setView = (v) => { dispatch({ type: "settings", patch: { view: v } }); mainRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); };
  const togglePanel = () => {
    if (view !== "prospeccao") { dispatch({ type: "settings", patch: { view: "prospeccao", panelCollapsed: false } }); return; }
    dispatch({ type: "settings", patch: { panelCollapsed: !collapsed } });
  };

  // Tema (Automático segue o sistema em tempo real)
  const theme = state.settings.theme;
  useEffect(() => {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => rerender((n) => n + 1);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  const isDark = theme === "dark" || (theme === "auto" && systemDark());

  const prevPhase = useRef(state.run?.phase);
  useEffect(() => {
    const phase = state.run?.phase;
    if (prevPhase.current !== phase && phase === "done") toast({ message: state.run.message, icon: "check.circle.fill", tone: "green" });
    prevPhase.current = phase;
  }, [state.run?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atalhos: ⌘↩ busca · ⌘B recolhe o painel · "/" filtra
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        dispatch({ type: "settings", patch: { view: "prospeccao", panelCollapsed: false } });
        setTimeout(() => panelRef.current?.submit(), 30);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        togglePanel();
        return;
      }
      const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
      if (!typing && e.key === "/" && searchRef.current && !document.querySelector(".sheet-layer, .alert-layer")) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onExample = (term, city) => {
    dispatch({ type: "form", patch: { terms: [term], city } });
    dispatch({ type: "settings", patch: { panelCollapsed: false } });
    setTimeout(() => panelRef.current?.focusButton(), 30);
    toast({ message: "Exemplo preenchido. Toque em “Buscar leads”.", icon: "sparkles" });
  };

  const onEditTemplate = () => { setSettingsOpen(true); setFocusTemplate((n) => n + 1); };

  const onStarted = () => {
    if (window.matchMedia("(max-width: 899px)").matches) mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const waConnected = auto.status?.status === "connected";
  // Conversas que pedem você (rascunho da IA, passou para você ou mensagem não lida)
  const waPending = (auto.crm?.convs || []).filter((c) => c.needsYou || c.draft || c.unread).length;
  useEffect(() => { document.title = `${waPending ? `(${waPending}) ` : ""}Prospect — CRM de prospecção`; }, [waPending]);

  return (
    <div className={`shell ${panelVisible ? "has-panel" : ""}`}>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>

      {/* Trilho de navegação (Liquid Glass) */}
      <nav className="rail glass" aria-label="Navegação">
        <span className="rail__mark" aria-hidden="true">EC</span>
        <div className="rail__group">
          <RailButton icon="search.fill" label="Prospecção" active={view === "prospeccao"} onClick={() => setView("prospeccao")}>
            {runner.busy && <span className="rail__spinner"><Spinner label="Buscando" /></span>}
          </RailButton>
          <RailButton icon="whatsapp" label="WhatsApp" active={view === "automacao"} onClick={() => setView("automacao")}>
            {waPending > 0 ? <span className="rail__badge" aria-label={`${waPending} conversas pedem você`}>{waPending}</span>
              : <span className={`rail__dot ${waConnected ? "is-on" : ""}`} aria-hidden="true" />}
          </RailButton>
        </div>
        <div className="rail__group rail__group--end">
          <RailButton icon={isDark ? "sun" : "moon"} label={isDark ? "Modo claro" : "Modo escuro"} onClick={() => dispatch({ type: "settings", patch: { theme: isDark ? "light" : "dark" } })} />
          <RailButton icon="gear.fill" label="Ajustes" onClick={() => setSettingsOpen(true)} />
          <RailButton icon="sidebar" label={panelVisible ? "Recolher painel (⌘B)" : "Mostrar painel de busca (⌘B)"} onClick={togglePanel} pressed={panelVisible} />
        </div>
      </nav>

      {/* Painel de busca (recolhível) */}
      {view === "prospeccao" && (
        <aside className={`sidebar glass ${collapsed ? "is-collapsed" : ""}`} aria-label="Configurar busca" hidden={collapsed}>
          <header className="brand">
            <span className="brand__text">Prospect<small>Leads com o contato do dono</small></span>
            <button type="button" className="glass-circle" onClick={togglePanel} aria-label="Recolher painel" title="Recolher painel (⌘B)">
              <Icon name="sidebar" size={17} />
            </button>
          </header>
          <SearchPanel ref={panelRef} onStarted={onStarted} />
        </aside>
      )}

      <main id="conteudo" ref={mainRef} className="main" tabIndex={-1}>
        {storageError && (
          <div className="notice notice--error" role="alert">
            <Icon name="exclamation.fill" size={18} />
            <p>
              {storageError === "save"
                ? "Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado). Exporte um backup em Ajustes."
                : "Não foi possível ler os dados salvos. Começamos uma lista nova."}
            </p>
            <button type="button" className="btn btn--plain btn--sm" onClick={dismissStorageError}>OK</button>
          </div>
        )}
        {view === "prospeccao"
          ? <LeadsView onExample={onExample} onEditTemplate={onEditTemplate} searchRef={searchRef} onOpenPanel={collapsed ? togglePanel : null} />
          : <AutomationView />}
      </main>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Ajustes">
        <SettingsView focusTemplate={focusTemplate} />
      </Sheet>
    </div>
  );
}

function RailButton({ icon, label, active, pressed, onClick, children }) {
  return (
    <button
      type="button"
      className={`rail__btn ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      aria-pressed={pressed}
      data-tip={label}
    >
      <Icon name={icon} size={21} />
      {children}
    </button>
  );
}
