/* ─────────────────────────────────────────────
   src/components/ConfirmModal/ConfirmModal.jsx
   Drop-in replacement for window.confirm()
   Usage:
     const { confirm } = useConfirm();
     const ok = await confirm("Are you sure you want to log out?");
     if (ok) { ... }
───────────────────────────────────────────── */
import { createContext, useContext, useState, useCallback } from "react";
import "./ConfirmModal.css";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
    const [state, setState] = useState(null); // { message, resolve }

    const confirm = useCallback((message) => {
        return new Promise((resolve) => {
            setState({ message, resolve });
        });
    }, []);

    const handleChoice = (result) => {
        state?.resolve(result);
        setState(null);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {state && (
                <div className="cm-overlay" onClick={() => handleChoice(false)}>
                    <div className="cm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="cm-icon">🤔</div>
                        <p className="cm-message">{state.message}</p>
                        <div className="cm-actions">
                            <button className="cm-btn cm-cancel" onClick={() => handleChoice(false)}>
                                Cancel
                            </button>
                            <button className="cm-btn cm-confirm" onClick={() => handleChoice(true)}>
                                Yes, confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const confirm = useContext(ConfirmContext);
    if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>");
    return { confirm };
}