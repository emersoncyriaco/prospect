import { useStore } from "../lib/store";
import { useRunner } from "../lib/runner";
import { STAGES } from "../lib/pipeline";
import { Spinner } from "../components/ui";
import Icon from "../components/Icon";

const STAGE_LABEL = { maps: "Google Maps", sites: "Sites", google: "CNPJ no Google", receita: "Receita Federal" };

// Progresso da busca + avisos, no topo da área de resultados
export default function RunStatus() {
  const { state } = useStore();
  const runner = useRunner();
  const run = state.run;
  if (!run?.search) return null;

  const notices = [];
  if (runner.interrupted) {
    notices.push(
      <div key="int" className="notice" role="status">
        <Icon name="info" size={18} />
        <p>A busca “{run.search.label}” foi interrompida porque a página recarregou. Os leads recebidos até aqui foram mantidos.</p>
        <button type="button" className="btn btn--plain btn--sm" onClick={runner.dismiss}>Descartar</button>
        <button type="button" className="btn btn--tinted btn--sm" onClick={runner.resume}>Retomar</button>
      </div>,
    );
  }
  if (run.phase === "error") {
    notices.push(
      <div key="err" className="notice notice--error" role="alert">
        <Icon name="exclamation.fill" size={18} />
        <p>{run.error}</p>
        <button type="button" className="btn btn--tinted btn--sm" onClick={runner.retry}>Tentar novamente</button>
      </div>,
    );
  }
  if (run.phase === "cancelled") {
    notices.push(<div key="can" className="notice" role="status"><Icon name="info" size={18} /><p>{run.message}</p></div>);
  }
  (run.notices || []).forEach((n, i) => notices.push(<div key={`n${i}`} className="notice" role="status"><Icon name="exclamation.fill" size={18} /><p>{n}</p></div>));

  const running = runner.busy;
  if (!running) return notices.length ? <div className="notices">{notices}</div> : null;

  const stages = run.params?.enrich ? STAGES : ["maps"];
  const current = Math.max(0, stages.indexOf(run.phase));
  const { done = 0, total = 0 } = run.progress || {};
  const pct = Math.round(((current + (total ? Math.min(1, done / total) : 0)) / stages.length) * 100);

  return (
    <>
      <section className="run-card" aria-label="Progresso da busca">
        <ol className="stages">
          {stages.map((s, i) => (
            <li key={s} className={`stage is-${i < current ? "done" : i === current ? "active" : "pending"}`}>
              <span className="stage__mark" aria-hidden="true">
                {i < current ? <Icon name="check.circle.fill" size={18} /> : i === current ? <Spinner label={STAGE_LABEL[s]} /> : <span className="step__dot" />}
              </span>
              {STAGE_LABEL[s]}
            </li>
          ))}
        </ol>
        <div className={`progress ${done ? "" : "is-indeterminate"}`} role="progressbar" aria-label="Progresso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <div className="run-card__footer">
          <p className="run__message" aria-live="polite">{run.message}</p>
          <button type="button" className="btn btn--destructive btn--sm" onClick={runner.cancel}>
            <Icon name="stop" size={14} /> Parar
          </button>
        </div>
      </section>
      {notices.length > 0 && <div className="notices">{notices}</div>}
    </>
  );
}
