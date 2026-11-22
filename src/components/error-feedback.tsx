import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Send, TriangleAlert } from "lucide-react";
import { useLanguage } from "./language-provider";

type ErrorReporter = (message: string) => Promise<void>;

interface ErrorFeedbackContextValue {
  canReport: boolean;
  configureReporter: (reporter: ErrorReporter | null) => void;
  reportError: (message: string) => Promise<void>;
}

const ErrorFeedbackContext = createContext<ErrorFeedbackContextValue | null>(null);

export function ErrorFeedbackProvider({ children }: { children: ReactNode }) {
  const reporterRef = useRef<ErrorReporter | null>(null);
  const [canReport, setCanReport] = useState(false);

  const configureReporter = useCallback((reporter: ErrorReporter | null) => {
    reporterRef.current = reporter;
    setCanReport(Boolean(reporter));
  }, []);

  const reportError = useCallback(async (message: string) => {
    if (!reporterRef.current) throw new Error("Sign in to send an error report.");
    await reporterRef.current(message);
  }, []);

  const value = useMemo(() => ({ canReport, configureReporter, reportError }), [canReport, configureReporter, reportError]);
  return <ErrorFeedbackContext.Provider value={value}>{children}</ErrorFeedbackContext.Provider>;
}

export function useErrorFeedback(): ErrorFeedbackContextValue {
  const value = useContext(ErrorFeedbackContext);
  if (!value) throw new Error("useErrorFeedback must be used within an ErrorFeedbackProvider.");
  return value;
}

export function ErrorAlert({ message, className = "", onDismiss }: { message: string; className?: string; onDismiss?: () => void }) {
  const { canReport, reportError } = useErrorFeedback();
  const { t } = useLanguage();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [reportErrorMessage, setReportErrorMessage] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    requestId.current += 1;
    setSending(false);
    setSent(false);
    setReportErrorMessage("");
  }, [message]);

  const sendReport = async () => {
    if (!canReport || sending || sent) return;
    const currentRequestId = requestId.current;
    setSending(true);
    setReportErrorMessage("");
    try {
      await reportError(message);
      if (currentRequestId === requestId.current) setSent(true);
    } catch (error) {
      if (currentRequestId === requestId.current) {
        setReportErrorMessage(t(error instanceof Error ? error.message : "Could not send the error report."));
      }
    } finally {
      if (currentRequestId === requestId.current) setSending(false);
    }
  };

  return (
    <div className={`error-alert ${className}`.trim()} role="alert">
      <div className="error-alert-message"><TriangleAlert size={15} /><p>{t(message)}</p></div>
      <div className="error-alert-footer">
        <button
          type="button"
          className="error-report-button"
          disabled={!canReport || sending || sent}
          onClick={() => void sendReport()}
          title={canReport ? t("Sends this error message and screen, linked to your account.") : t("Sign in to send error reports.")}
        >
          <Send size={12} />
          {sending ? t("Sending report…") : sent ? t("Report sent") : t("Send error")}
        </button>
        {!canReport && <span className="error-report-hint">{t("Sign in to send error reports.")}</span>}
        {reportErrorMessage && <span className="error-report-result" role="status">{reportErrorMessage}</span>}
        {onDismiss && <button type="button" className="error-alert-dismiss" onClick={onDismiss} aria-label={t("Dismiss message")}>×</button>}
      </div>
    </div>
  );
}
