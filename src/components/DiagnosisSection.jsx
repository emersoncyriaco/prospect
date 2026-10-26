import { useState } from "react";
import { VERDICTS, saveDiagnosis } from "../lib/diagnoses";
import { relativeTime } from "../lib/format";
import { Badge, Group, Row, Segmented, Spinner } from "./ui";
import { useToast } from "./Toast";
import Icon from "./Icon";

// O que está bom (não tocar), as dores (melhorar) e o veredito de cada site
export default function DiagnosisSection({ host, diagnosis, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const start = () => {
    setDraft({
      verdict: diagnosis?.verdict || "melhorar",
      summary: diagnosis?.summary || "",
      good: (diagnosis?.good || []).join("\n"),
      bad: (diagnosis?.bad || []).join("\n"),
    });
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveDiagnosis({ host, ...draft });
      onSaved(saved);
      setEditing(false);
      toast({ message: "Diagnóstico salvo", icon: "check.circle.fill", tone: "green" });
    } catch (e) {
      toast({ message: e.message, icon: "exclamation.fill", tone: "red" });
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <Group title="Diagnóstico do site" footer="Um item por linha. Fica salvo para este site, mesmo se o lead aparecer de novo em outra busca.">
        <div className="row row--pad">
          <Segmented label="Veredito" options={Object.entries(VERDICTS).map(([id, v]) => ({ id, label: v.label }))} value={draft.verdict} onChange={(verdict) => setDraft({ ...draft, verdict })} />
        </div>
        <label className="row field field--stack">
          <span className="diag__label">Resumo</span>
          <textarea rows={2} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} placeholder="Ex.: site de modelo pronto, vale propor um site próprio" />
        </label>
        <label className="row field field--stack">
          <span className="diag__label diag__label--good">Está bom · não tocar</span>
          <textarea rows={4} value={draft.good} onChange={(e) => setDraft({ ...draft, good: e.target.value })} placeholder={"Rápido no celular\nOAB visível"} />
        </label>
        <label className="row field field--stack">
          <span className="diag__label diag__label--bad">Dores · melhorar</span>
          <textarea rows={5} value={draft.bad} onChange={(e) => setDraft({ ...draft, bad: e.target.value })} placeholder={"Sem formulário de contato\nErro de português no destaque"} />
        </label>
        <div className="row row--actions">
          <button type="button" className="btn btn--plain btn--sm" onClick={() => setEditing(false)}>Cancelar</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={busy}>{busy ? <Spinner label="Salvando" /> : "Salvar"}</button>
        </div>
      </Group>
    );
  }

  if (!diagnosis) {
    return (
      <Group title="Diagnóstico do site">
        <Row icon="doc" iconTone="gray" label="Sem diagnóstico ainda" detail="Anote o que está bom e as dores para usar na abordagem.">
          <button type="button" className="btn btn--tinted btn--sm" onClick={start}>Criar</button>
        </Row>
      </Group>
    );
  }

  const v = VERDICTS[diagnosis.verdict] || VERDICTS.melhorar;
  return (
    <Group title="Diagnóstico do site" footer={`Atualizado ${relativeTime(diagnosis.updatedAt)}`}>
      <div className="row row--pad diag__head">
        <Badge tone={v.tone}>{v.label}</Badge>
        <span className="diag__hint">{diagnosis.summary || v.hint}</span>
        <button type="button" className="btn btn--plain btn--sm" onClick={start}>Editar</button>
      </div>
      {diagnosis.good.length > 0 && (
        <>
          <p className="diag__label diag__label--good row--pad">Está bom · não tocar</p>
          <ul className="reasons">
            {diagnosis.good.map((g) => <li key={g}><Icon name="check" size={15} stroke={2.6} /><span>{g}</span></li>)}
          </ul>
        </>
      )}
      {diagnosis.bad.length > 0 && (
        <>
          <p className="diag__label diag__label--bad row--pad">Dores · melhorar</p>
          <ul className="reasons reasons--warn">
            {diagnosis.bad.map((b) => <li key={b}><Icon name="exclamation.fill" size={15} /><span>{b}</span></li>)}
          </ul>
        </>
      )}
    </Group>
  );
}
