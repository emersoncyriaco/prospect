import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useStore } from "./store";
import { runPipeline } from "./pipeline";
import { getAccount } from "./apify";

const RunnerContext = createContext(null);
const ACTIVE = ["maps", "sites", "google", "receita"];

// Mantém a busca rodando enquanto você navega entre as abas, e guarda a conta Apify
export function RunnerProvider({ children }) {
  const { state, dispatch } = useStore();
  const ctrl = useRef(null);
  const leadsRef = useRef(state.leads);
  leadsRef.current = state.leads;
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState({ status: state.token ? "checking" : "none", data: null, error: "" });

  const refreshAccount = async (token = state.token) => {
    if (!token) { setAccount({ status: "none", data: null, error: "" }); return false; }
    setAccount((a) => ({ ...a, status: "checking", error: "" }));
    try {
      const data = await getAccount(token);
      setAccount({ status: "connected", data, error: "" });
      return true;
    } catch (e) {
      setAccount({ status: "error", data: null, error: e.message });
      return false;
    }
  };

  useEffect(() => { refreshAccount(); }, [state.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (params, resume = null) => {
    if (busy || !state.token) return;
    ctrl.current = new AbortController();
    setBusy(true);
    if (!resume) {
      dispatch({ type: "run", run: null });
      dispatch({ type: "run", run: { startedAt: Date.now() } });
    }
    try {
      await runPipeline({ params, token: state.token, dispatch, getLeads: () => leadsRef.current, signal: ctrl.current.signal, resume });
    } finally {
      setBusy(false);
      refreshAccount(); // atualiza o uso do mês
    }
  };

  const run = state.run;
  const value = {
    busy,
    account,
    refreshAccount,
    start,
    cancel: () => ctrl.current?.abort(),
    resume: () => run?.params && start(run.params, run),
    retry: () => run?.params && start(run.params),
    dismiss: () => dispatch({ type: "run", run: null }),
    // A página foi recarregada no meio de uma busca
    interrupted: !busy && !!run && ACTIVE.includes(run.phase),
  };
  return <RunnerContext.Provider value={value}>{children}</RunnerContext.Provider>;
}

export const useRunner = () => useContext(RunnerContext);
