import { createContext, useCallback, useContext, useRef, useState } from "react";
import Icon from "./Icon";

const ToastContext = createContext(() => {});

// Aviso curto em cápsula de vidro, com ação opcional (ex.: Desfazer)
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const show = useCallback((t) => {
    clearTimeout(timer.current);
    setToast({ ...t, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), t.duration ?? 5000);
  }, []);

  const close = () => { clearTimeout(timer.current); setToast(null); };

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast && (
          <div key={toast.key} className={`toast glass ${toast.tone ? `tone-${toast.tone}` : ""}`}>
            {toast.icon && <Icon name={toast.icon} size={18} className="toast__icon" />}
            <span className="toast__text">{toast.message}</span>
            {toast.action && (
              <button type="button" className="toast__action" onClick={() => { toast.action.onClick(); close(); }}>
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
