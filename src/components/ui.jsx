import { useEffect, useId, useRef } from "react";
import Icon from "./Icon";

/* ---------- Lista agrupada (camada de conteúdo, estilo Ajustes do iOS) ---------- */
export function Group({ title, footer, children, className = "" }) {
  const id = useId();
  return (
    <section className={`group ${className}`} aria-labelledby={title ? id : undefined}>
      {title && <h2 className="group__title" id={id}>{title}</h2>}
      <div className="group__body">{children}</div>
      {footer && <p className="group__footer">{footer}</p>}
    </section>
  );
}

export function Row({ label, detail, children, onClick, href, icon, iconTone, chevron, className = "", ...rest }) {
  const content = (
    <>
      {icon && <span className={`row__icon ${iconTone ? `tone-${iconTone}` : ""}`}><Icon name={icon} size={17} /></span>}
      <span className="row__main">
        {label && <span className="row__label">{label}</span>}
        {detail && <span className="row__detail">{detail}</span>}
      </span>
      {children}
      {chevron && <Icon name="chevron" size={14} className="row__chevron" />}
    </>
  );
  if (href) return <a className={`row row--action ${className}`} href={href} target="_blank" rel="noopener" {...rest}>{content}</a>;
  if (onClick) return <button type="button" className={`row row--action ${className}`} onClick={onClick} {...rest}>{content}</button>;
  return <div className={`row ${className}`} {...rest}>{content}</div>;
}

/* ---------- Interruptor (role=switch) ---------- */
export function Toggle({ checked, onChange, label, description, disabled }) {
  const id = useId();
  return (
    <div className={`row toggle-row ${disabled ? "is-disabled" : ""}`}>
      <span className="row__main">
        <label className="row__label" htmlFor={id}>{label}</label>
        {description && <span className="row__detail">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  );
}

/* ---------- Controle segmentado (radiogroup, setas do teclado) ---------- */
export function Segmented({ options, value, onChange, label, size = "md" }) {
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const refs = useRef([]);
  const onKey = (e) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (index + dir + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div
      className={`segmented segmented--${size}`}
      role="radiogroup"
      aria-label={label}
      style={{ "--count": options.length, "--index": index }}
      onKeyDown={onKey}
    >
      <span className="segmented__thumb" aria-hidden="true" />
      {options.map((o, i) => (
        <button
          key={o.id}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          tabIndex={o.id === value ? 0 : -1}
          className="segmented__item"
          onClick={() => onChange(o.id)}
        >
          {o.icon && <Icon name={o.icon} size={15} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Selo ---------- */
export function Badge({ tone = "neutral", icon, children }) {
  return (
    <span className={`badge tone-${tone}`}>
      {icon && <Icon name={icon} size={12} stroke={2.4} />}
      {children}
    </span>
  );
}

export function Spinner({ label = "Carregando" }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={30} /></span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

/* ---------- Sheet modal (foco preso, Esc fecha, devolve o foco) ---------- */
export function Sheet({ open, onClose, title, subtitle, trailing, children, labelledBy }) {
  const ref = useRef(null);
  const lastFocus = useRef(null);
  const titleId = useId();
  // ref: o efeito não pode reiniciar a cada render (o foco pularia enquanto se digita)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onClose = () => closeRef.current();
    lastFocus.current = document.activeElement;
    document.documentElement.classList.add("no-scroll");
    const el = ref.current;
    const focusables = () => [...el.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')];
    requestAnimationFrame(() => (el.querySelector("[data-autofocus]") || el.querySelector(".sheet__body") || el).focus({ preventScroll: true }));

    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("no-scroll");
      lastFocus.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="sheet-layer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy || titleId} tabIndex={-1}>
        <header className="sheet__bar glass">
          <span className="sheet__grabber" aria-hidden="true" />
          <button type="button" className="glass-circle" onClick={onClose} aria-label="Fechar">
            <Icon name="xmark" size={15} stroke={2.6} />
          </button>
          <div className="sheet__titles">
            <h2 id={titleId} className="sheet__title">{title}</h2>
            {subtitle && <p className="sheet__subtitle">{subtitle}</p>}
          </div>
          <div className="sheet__trailing">{trailing}</div>
        </header>
        <div className="sheet__body" tabIndex={-1}>{children}</div>
      </div>
    </div>
  );
}

/* ---------- Alerta de confirmação ---------- */
export function ConfirmDialog({ open, title, message, confirmLabel, destructive, onConfirm, onCancel }) {
  const ref = useRef(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    ref.current?.querySelector("[data-cancel]")?.focus();
    const onKey = (e) => e.key === "Escape" && cancelRef.current();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="alert-layer">
      <div ref={ref} className="alert glass" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="alert__actions">
          <button type="button" data-cancel onClick={onCancel}>Cancelar</button>
          <button type="button" className={destructive ? "is-destructive" : "is-default"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
