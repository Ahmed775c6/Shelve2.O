import { useCallback, useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useLanguage } from "./language-provider";

interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel?: string;
}

function ConfirmationPrompt({ request, onResolve }: { request: ConfirmationOptions; onResolve: (confirmed: boolean) => void }) {
  const { t } = useLanguage();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onResolve(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [onResolve]);

  return (
    <div className="dialog-backdrop confirm-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onResolve(false);
    }}>
      <section className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message" onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        if (event.shiftKey && document.activeElement === cancelButtonRef.current) {
          event.preventDefault();
          confirmButtonRef.current?.focus();
        } else if (!event.shiftKey && document.activeElement === confirmButtonRef.current) {
          event.preventDefault();
          cancelButtonRef.current?.focus();
        }
      }}>
        <div className="confirm-dialog-icon"><TriangleAlert size={19} /></div>
        <h2 id="confirm-dialog-title">{request.title}</h2>
        <p id="confirm-dialog-message">{request.message}</p>
        <footer className="dialog-footer">
          <button ref={cancelButtonRef} type="button" className="button button-outline" onClick={() => onResolve(false)}>{t("Cancel")}</button>
          <button ref={confirmButtonRef} type="button" className="button button-danger" onClick={() => onResolve(true)}>{request.confirmLabel ?? t("Confirm")}</button>
        </footer>
      </section>
    </div>
  );
}

export function useConfirmationDialog() {
  const [request, setRequest] = useState<ConfirmationOptions | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const resolve = useCallback((confirmed: boolean) => {
    const resolveRequest = resolveRef.current;
    resolveRef.current = null;
    setRequest(null);
    resolveRequest?.(confirmed);
  }, []);

  const confirm = useCallback((options: ConfirmationOptions) => new Promise<boolean>((resolveRequest) => {
    resolveRef.current?.(false);
    resolveRef.current = resolveRequest;
    setRequest(options);
  }), []);

  const dialog = request ? <ConfirmationPrompt request={request} onResolve={resolve} /> : null;
  return { confirm, dialog };
}
