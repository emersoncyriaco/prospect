import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { DEFAULT_TEMPLATE, statusById } from "./constants";
import { norm } from "./format";
import { finalize } from "./enrich";

const DATA_KEY = "prospect.data.v2";
const TOKEN_KEY = "prospect.apifyToken";

const defaultSettings = {
  profileName: "Emerson",
  template: DEFAULT_TEMPLATE,
  theme: "auto",
  remember: true,
  sort: "score",
  form: { terms: [], city: "", mode: "todos", limit: 50, enrich: true },
  recentCities: [],
};

const initialState = { settings: defaultSettings, token: "", leads: [], run: null };

// O token fica separado dos dados: nunca entra no backup exportado
function readToken() {
  try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
function writeToken(token, remember) {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch { /* armazenamento bloqueado */ }
}

// Valida leads vindos do armazenamento ou de um backup
export function sanitizeLeads(list) {
  if (!Array.isArray(list)) throw new Error("formato");
  return list
    .filter((l) => l && typeof l === "object" && typeof l.id === "string" && typeof l.company === "string" && l.site)
    .map((l) => ({
      phones: [], emails: [], reasons: [], notes: "", raw: { site: null, company: null }, ...l,
      status: statusById[l.status] ? l.status : "novo",
    }));
}

const refreshLead = (l) => {
  try { return finalize(l); } catch { return l; }
};

function load() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    const data = raw ? JSON.parse(raw) : {};
    const settings = { ...defaultSettings, ...(data.settings || {}) };
    settings.form = { ...defaultSettings.form, ...(data.settings?.form || {}) };
    return {
      // Recalcula contatos e nota com as regras atuais (ex.: prioridade do WhatsApp, números genéricos)
      state: { settings, token: readToken(), leads: data.leads ? sanitizeLeads(data.leads).map(refreshLead) : [], run: data.run || null },
      error: null,
    };
  } catch {
    return { state: { ...initialState, token: readToken() }, error: "load" };
  }
}

// O que é seu (status e notas) nunca é sobrescrito por uma busca nova
const keepUserFields = (incoming, old) => (old ? { ...incoming, status: old.status, notes: old.notes, createdAt: old.createdAt } : incoming);

function reducer(state, action) {
  switch (action.type) {
    case "settings":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case "form":
      return { ...state, settings: { ...state.settings, form: { ...state.settings.form, ...action.patch } } };
    case "rememberCity": {
      const city = action.city.trim();
      const list = [city, ...state.settings.recentCities.filter((c) => norm(c) !== norm(city))].slice(0, 6);
      return { ...state, settings: { ...state.settings, recentCities: list } };
    }
    case "token":
      return { ...state, token: action.token };
    case "upsertLeads": {
      const byId = new Map(state.leads.map((l) => [l.id, l]));
      const fresh = [];
      for (const lead of action.leads) {
        if (byId.has(lead.id)) byId.set(lead.id, keepUserFields(lead, byId.get(lead.id)));
        else fresh.push(lead);
      }
      return { ...state, leads: [...fresh, ...state.leads.map((l) => byId.get(l.id))] };
    }
    case "enrichLead":
      return { ...state, leads: state.leads.map((l) => (l.id === action.lead.id ? keepUserFields(action.lead, l) : l)) };
    case "update":
      return { ...state, leads: state.leads.map((l) => (l.id === action.id ? { ...l, ...action.patch } : l)) };
    case "replace":
      return { ...state, leads: state.leads.map((l) => (l.id === action.lead.id ? action.lead : l)) };
    case "remove":
      return { ...state, leads: state.leads.filter((l) => !action.ids.includes(l.id)) };
    case "restore":
      return { ...state, leads: [...action.leads, ...state.leads.filter((l) => !action.leads.some((r) => r.id === l.id))] };
    case "run":
      return { ...state, run: action.run === null ? null : { ...(state.run || {}), ...action.run } };
    case "import": {
      const byId = new Map(state.leads.map((l) => [l.id, l]));
      for (const l of action.leads) byId.set(l.id, l);
      return { ...state, leads: [...byId.values()] };
    }
    case "clear":
      return { ...state, leads: [], run: null };
    default:
      return state;
  }
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const loaded = useRef(null);
  if (!loaded.current) loaded.current = load();
  const [state, dispatch] = useReducer(reducer, loaded.current.state);
  const [storageError, setStorageError] = useState(loaded.current.error);

  // Salva com um pequeno atraso (a busca ao vivo dispara muitas atualizações)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const { settings, leads, run } = state;
        localStorage.setItem(DATA_KEY, JSON.stringify({ settings, leads, run }));
        setStorageError((e) => (e === "save" ? null : e));
      } catch {
        setStorageError("save");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [state.settings, state.leads, state.run]);

  useEffect(() => writeToken(state.token, state.settings.remember), [state.token, state.settings.remember]);

  const value = useMemo(() => ({ state, dispatch, storageError, dismissStorageError: () => setStorageError(null) }), [state, storageError]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
