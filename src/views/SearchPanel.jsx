import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useStore } from "../lib/store";
import { useRunner } from "../lib/runner";
import { LIMITS, MAX_TERMS, NICHES } from "../lib/constants";
import { estimate } from "../lib/pipeline";
import { fmtNumber, fmtUsd, norm } from "../lib/format";
import ApiKeyBox from "../components/ApiKeyBox";
import { Segmented, Spinner } from "../components/ui";
import Icon from "../components/Icon";

const MODES = [
  { id: "todos", label: "Todos" },
  { id: "semSite", label: "Sem site" },
  { id: "comSite", label: "Com site" },
];

// Formulário de busca da barra lateral (modelo de UX do Prospecta)
const SearchPanel = forwardRef(function SearchPanel({ onStarted }, ref) {
  const { state, dispatch } = useStore();
  const runner = useRunner();
  const form = state.settings.form;
  const setForm = (patch) => dispatch({ type: "form", patch });
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState({});
  const termRef = useRef(null);
  const cityRef = useRef(null);
  const buttonRef = useRef(null);

  const addTerms = (text) => {
    const next = [...form.terms];
    for (const part of text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
      if (next.length < MAX_TERMS && !next.some((t) => norm(t) === norm(part))) next.push(part.slice(0, 80));
    }
    setForm({ terms: next });
    if (next.length) setErrors((e) => ({ ...e, terms: "" }));
  };
  const commitDraft = () => { if (draft.trim()) { addTerms(draft); setDraft(""); } };
  const removeTerm = (i) => setForm({ terms: form.terms.filter((_, j) => j !== i) });
  const onTermKey = (e) => {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) { e.preventDefault(); commitDraft(); }
    else if (e.key === "Backspace" && !draft && form.terms.length) removeTerm(form.terms.length - 1);
  };

  const pendingTerms = draft.trim() ? [...form.terms, draft.trim()] : form.terms;
  const est = estimate({ terms: pendingTerms, limit: form.limit, mode: form.mode, enrich: form.enrich });
  const connected = runner.account.status === "connected";

  const submit = (e) => {
    e?.preventDefault();
    if (runner.busy) return;
    const extra = draft.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const terms = [...form.terms, ...extra.filter((x) => !form.terms.some((t) => norm(t) === norm(x)))].slice(0, MAX_TERMS);
    if (extra.length) { setForm({ terms }); setDraft(""); }
    const city = form.city.trim();
    const errs = {
      account: connected ? "" : "Conecte sua conta Apify para buscar.",
      terms: terms.length ? "" : "Adicione pelo menos um nicho.",
      city: city ? "" : "Informe a cidade ou região.",
    };
    setErrors(errs);
    if (errs.account) { document.querySelector("[data-token-input]")?.focus(); return; }
    if (errs.terms) { termRef.current?.focus(); return; }
    if (errs.city) { cityRef.current?.focus(); return; }
    dispatch({ type: "rememberCity", city });
    runner.start({ terms, city, limit: form.limit, mode: form.mode, enrich: form.enrich });
    onStarted?.();
  };

  // Usado pelo atalho ⌘↩ e pelos exemplos do estado vazio
  useImperativeHandle(ref, () => ({ submit, focusButton: () => buttonRef.current?.focus() }));

  useEffect(() => { if (connected) setErrors((e) => ({ ...e, account: "" })); }, [connected]);

  return (
    <form className="search-panel" onSubmit={submit} noValidate>
      <div className="search-panel__scroll">
        <ApiKeyBox error={errors.account} />

        <section className="pgroup" aria-labelledby="newSearchTitle">
          <h2 className="pgroup__title" id="newSearchTitle">Nova busca</h2>

          <label className="plabel" htmlFor="termInput">Nicho</label>
          <div className={`pfield pfield--tokens ${errors.terms ? "is-invalid" : ""}`} onClick={() => termRef.current?.focus()}>
            <ul className="tokens" aria-label="Nichos adicionados">
              {form.terms.map((t, i) => (
                <li key={t} className="token">
                  {t}
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeTerm(i); }} aria-label={`Remover ${t}`}>
                    <Icon name="xmark" size={10} stroke={3} />
                  </button>
                </li>
              ))}
              <li className="tokens__input">
                <input
                  id="termInput"
                  ref={termRef}
                  value={draft}
                  onChange={(e) => { const v = e.target.value; if (/[,;\n]/.test(v)) { addTerms(v); setDraft(""); } else setDraft(v); }}
                  onKeyDown={onTermKey}
                  onBlur={commitDraft}
                  disabled={form.terms.length >= MAX_TERMS}
                  placeholder={form.terms.length ? (form.terms.length >= MAX_TERMS ? "Limite de 10 nichos" : "Adicionar outro nicho") : "ex.: dentista, pet shop"}
                  aria-invalid={!!errors.terms}
                  aria-describedby={errors.terms ? "termError" : "termHelp"}
                  autoComplete="off"
                  enterKeyHint="done"
                />
              </li>
            </ul>
          </div>
          {errors.terms
            ? <p id="termError" className="field-error" role="alert"><Icon name="exclamation.fill" size={13} /> {errors.terms}</p>
            : <p id="termHelp" className="pnote">Pressione Enter para adicionar. Até {MAX_TERMS} nichos.</p>}
          <div className="psuggest" role="group" aria-label="Sugestões de nicho">
            {NICHES.filter((n) => !form.terms.some((t) => norm(t) === norm(n))).slice(0, 8).map((n) => (
              <button type="button" key={n} className="chip chip--sm" onClick={() => addTerms(n)} disabled={form.terms.length >= MAX_TERMS}>
                <Icon name="plus" size={11} stroke={3} /> {n}
              </button>
            ))}
          </div>

          <label className="plabel" htmlFor="cityInput">Cidade ou região</label>
          <div className={`pfield ${errors.city ? "is-invalid" : ""}`}>
            <Icon name="map.fill" size={15} className="pfield__icon" />
            <input
              id="cityInput"
              ref={cityRef}
              value={form.city}
              onChange={(e) => { setForm({ city: e.target.value }); if (e.target.value.trim()) setErrors((x) => ({ ...x, city: "" })); }}
              placeholder="ex.: Campinas, SP"
              list="recent-cities"
              autoComplete="off"
              aria-invalid={!!errors.city}
              aria-describedby={errors.city ? "cityError" : undefined}
              enterKeyHint="search"
            />
            <datalist id="recent-cities">{state.settings.recentCities.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          {errors.city && <p id="cityError" className="field-error" role="alert"><Icon name="exclamation.fill" size={13} /> {errors.city}</p>}
        </section>

        <section className="pgroup">
          <h3 className="plabel plabel--first" id="modeLabel">Tipo de lead</h3>
          <Segmented label="Tipo de lead" options={MODES} value={form.mode} onChange={(mode) => setForm({ mode })} />
          <p className="pnote">
            {form.mode === "semSite"
              ? "Só negócios ativos que não têm site cadastrado no Google."
              : form.mode === "comSite"
                ? "Só negócios com site próprio, para vender redesign. Cada site é analisado: sem HTTPS, lento, não adaptado ao celular, rodapé antigo, fora do ar. Quem usa só Instagram ou link na bio fica de fora."
                : "Negócios ativos. Quem usa Instagram ou link na bio como site aparece como “Só Instagram”."}
          </p>

          <h3 className="plabel">Negócios por nicho</h3>
          <Segmented label="Negócios por nicho" options={LIMITS.map((n) => ({ id: n, label: String(n) }))} value={form.limit} onChange={(limit) => setForm({ limit })} />
        </section>

        <section className="pgroup pgroup--row">
          <div className="pswitch__text">
            <label className="pswitch__title" htmlFor="enrichSwitch">Encontrar o dono</label>
            <p className="pnote" id="enrichHelp">Descobre o CNPJ e traz o sócio responsável, o WhatsApp e o e-mail do cadastro na Receita Federal.</p>
          </div>
          <button
            id="enrichSwitch"
            type="button"
            role="switch"
            aria-checked={form.enrich}
            aria-describedby="enrichHelp"
            className="switch"
            onClick={() => setForm({ enrich: !form.enrich })}
          >
            <span className="switch__knob" />
          </button>
        </section>
      </div>

      <footer className="search-panel__footer">
        <p className="estimate" aria-live="polite">
          {pendingTerms.length
            ? <>Até {fmtNumber(est.places)} negócios · no máximo ~{fmtUsd(est.cost)} na Apify</>
            : "Adicione um nicho para ver a estimativa de custo"}
        </p>
        <button ref={buttonRef} type="submit" className="btn btn--primary btn--lg" disabled={runner.busy}>
          {runner.busy
            ? <><Spinner label="Buscando" /> Buscando…</>
            : <><Icon name="search" size={18} stroke={2.6} /> Buscar leads <kbd className="kbd-inline" aria-hidden="true">⌘↩</kbd></>}
        </button>
      </footer>
    </form>
  );
});

export default SearchPanel;
