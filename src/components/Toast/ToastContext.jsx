/* ─────────────────────────────────────────────
   src/components/Toast/ToastContext.jsx
   Global toast provider + useToast hook
───────────────────────────────────────────── */
import { createContext, useContext, useState, useCallback, useRef } from "react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const idRef = useRef(0);

    const addToast = useCallback((message, type = "info", duration = 3500) => {
        const id = ++idRef.current;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={addToast}>
            {children}
            <ToastList toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const addToast = useContext(ToastContext);
    if (!addToast) throw new Error("useToast must be used inside <ToastProvider>");

    return {
        success: (msg) => addToast(msg, "success"),
        error: (msg) => addToast(msg, "error"),
        info: (msg) => addToast(msg, "info"),
        warning: (msg) => addToast(msg, "warning"),
    };
}

/* ── Toast list renderer ── */
function ToastList({ toasts, onRemove }) {
    if (!toasts.length) return null;

    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast toast-${t.type}`}>
                    <span className="toast-icon">{icons[t.type]}</span>
                    <span className="toast-msg">{t.message}</span>
                    <button className="toast-close" onClick={() => onRemove(t.id)}>✕</button>
                </div>
            ))}
        </div>
    );
}

const icons = {
    success: "✅",
    error: "❌",
    info: "ℹ️",
    warning: "⚠️",
};