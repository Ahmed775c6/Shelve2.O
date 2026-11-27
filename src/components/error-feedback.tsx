import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ImagePlus, Send, TriangleAlert, X } from "lucide-react";
import { useLanguage } from "./language-provider";

const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type ErrorReporter = (message: string, screenshots: File[]) => Promise<void>;

interface ErrorFeedbackContextValue {
  canReport: boolean;
  configureReporter: (reporter: ErrorReporter | null) => void;
  reportError: (message: string, screenshots: File[]) => Promise<void>;
}

const ErrorFeedbackContext = createContext<ErrorFeedbackContextValue | null>(null);

export function ErrorFeedbackProvider({ children }: { children: ReactNode }) {
  const reporterRef = useRef<ErrorReporter | null>(null);
  const [canReport, setCanReport] = useState(false);

  const configureReporter = useCallback((reporter: ErrorReporter | null) => {
    reporterRef.current = reporter;
    setCanReport(Boolean(reporter));
  }, []);

  const reportError = useCallback(async (message: string, screenshots: File[]) => {
    if (!reporterRef.current) throw new Error("Sign in to send an error report.");
    await reporterRef.current(message, screenshots);
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
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const previews = useMemo(() => screenshots.map((file) => URL.createObjectURL(file)), [screenshots]);
  const requestId = useRef(0);

  useEffect(() => {
    requestId.current += 1;
    setSending(false);
    setSent(false);
    setReportErrorMessage("");
    setScreenshots([]);
  }, [message]);

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const changeScreenshots = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setReportErrorMessage("");
    if (files.length + screenshots.length > MAX_SCREENSHOTS) {
      setReportErrorMessage(t("Attach no more than 3 screenshots."));
      return;
    }
    if (files.some((file) => !ALLOWED_SCREENSHOT_TYPES.has(file.type) || file.size === 0 || file.size > MAX_SCREENSHOT_SIZE)) {
      setReportErrorMessage(t("Screenshots must be PNG, JPEG, or WebP images no larger than 5 MiB each."));
      return;
    }
    setScreenshots((current) => [...current, ...files]);
  };

  const sendReport = async () => {
    if (!canReport || sending || sent) return;
    const currentRequestId = requestId.current;
    setSending(true);
    setReportErrorMessage("");
    try {
      await reportError(message, screenshots);
      if (currentRequestId === requestId.current) {
        setSent(true);
        setScreenshots([]);
      }
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
        <div className="error-alert-actions">
          <label className="error-report-button error-report-attachments" title={t("Attach up to 3 screenshots to this error report.")}>
            <ImagePlus size={12} />
            {t("Add screenshots")}
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={!canReport || sending || sent || screenshots.length >= MAX_SCREENSHOTS} onChange={changeScreenshots} />
          </label>
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
        {screenshots.length > 0 && <div className="error-alert-screenshots">
          {screenshots.map((file, index) => <div className="screenshot-preview" key={`${file.name}-${file.lastModified}`}>
            <img src={previews[index]} alt={`${t("Screenshots")} ${index + 1}`} />
            <span>{file.name}</span>
            <button type="button" aria-label={`${t("Remove")} ${file.name}`} onClick={() => setScreenshots((current) => current.filter((_, fileIndex) => fileIndex !== index))}><X size={13} /></button>
          </div>)}
        </div>}
      </div>
    </div>
  );
}
