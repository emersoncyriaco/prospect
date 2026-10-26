import { useState } from "react";
import { getAccount } from "../lib/apify";
import { useStore } from "../lib/store";
import { useRunner } from "../lib/runner";
import { fmtUsd } from "../lib/format";
import { Spinner } from "./ui";
import { useToast } from "./Toast";
import Icon from "./Icon";

const TOKEN_URL = "https://console.apify.com/settings/integrations";

function usageText(acc) {
  const u = acc?.usage;
  if (u?.usedUsd != null) return `${fmtUsd(u.usedUsd)}${u.limitUsd ? ` de ${fmtUsd(u.limitUsd)}` : ""} usados este mês`;
  return acc?.plan ? `Plano ${acc.plan}` : "";
}

// Conta Apify na barra lateral: token, mostrar/ocultar, manter conectado, trocar
export default function ApiKeyBox({ error: formError }) {
  const { state, dispatch } = useStore();
  const { account } = useRunner();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const connect = async () => {
    const token = draft.trim();
    if (!token) { setError("Cole o token da API da Apify."); return; }
    setBusy(true);
    setError("");
    try {
      await getAccount(token);
      dispatch({ type: "token", token });
      setDraft("");
      setEditing(false);
      toast({ message: "Conta Apify conectada", icon: "check.circle.fill", tone: "green" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const connected = !editing && account.status === "connected";
  const shownError = error || formError || (!editing && account.status === "error" ? account.error : "");

  return (
    <section className="pgroup" aria-labelledby="accountTitle">
      <h2 className="pgroup__title" id="accountTitle">Conta Apify</h2>

      {connected ? (
        <div className="connected">
          <span className="status-dot" aria-hidden="true" />
          <div className="connected__text">
            <p>Conectado como <b>{account.data.username}</b></p>
            <p className="pnote">{usageText(account.data)}</p>
          </div>
          <button type="button" className="btn btn--plain btn--sm" onClick={() => { setEditing(true); setDraft(state.token); }}>Trocar</button>
        </div>
      ) : !editing && account.status === "checking" ? (
        <div className="connected">
          <Spinner label="Conferindo a conta" />
          <div className="connected__text"><p>Conferindo a conta…</p></div>
        </div>
      ) : (
        <div className="token-form">
          <label className="plabel plabel--first" htmlFor="tokenInput">Token da API</label>
          <div className={`pfield ${shownError ? "is-invalid" : ""}`}>
            <Icon name="key" size={15} className="pfield__icon" />
            <input
              id="tokenInput"
              type={reveal ? "text" : "password"}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); connect(); } }}
              placeholder="apify_api_…"
              autoComplete="off"
              spellCheck="false"
              aria-invalid={!!shownError}
              aria-describedby={`tokenHelp${shownError ? " tokenError" : ""}`}
              data-token-input
            />
            <button type="button" className="pfield__action" onClick={() => setReveal((r) => !r)} aria-pressed={reveal} aria-label={reveal ? "Ocultar token" : "Mostrar token"}>
              <Icon name={reveal ? "eye.slash" : "eye"} size={17} />
            </button>
          </div>
          {shownError && <p id="tokenError" className="field-error" role="alert"><Icon name="exclamation.fill" size={13} /> {shownError}</p>}
          {!shownError?.includes("console.apify.com") && (
            <p id="tokenHelp" className="pnote">
              Copie em <a href={TOKEN_URL} target="_blank" rel="noopener">console.apify.com → Settings → API &amp; Integrations</a>.
            </p>
          )}
          <div className="token-form__actions">
            <label className="checkbox">
              <input type="checkbox" checked={state.settings.remember} onChange={(e) => dispatch({ type: "settings", patch: { remember: e.target.checked } })} />
              <span>Manter conectado</span>
            </label>
            {editing && <button type="button" className="btn btn--plain btn--sm" onClick={() => { setEditing(false); setError(""); }}>Cancelar</button>}
            <button type="button" className="btn btn--tinted btn--sm" onClick={connect} disabled={busy}>
              {busy ? <Spinner label="Conectando" /> : "Conectar"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
