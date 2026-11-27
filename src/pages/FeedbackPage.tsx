import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Bug, CheckCircle2, ImagePlus, Lightbulb, LoaderCircle, Send, X } from "lucide-react";
import { apiRequest } from "../lib/api";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import { SectionTitle } from "./shared";

type FeedbackMode = "insight" | "bug";
const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export default function FeedbackPage({ token, onSignIn }: { token: string | null; onSignIn: () => void }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<FeedbackMode>("insight");
  const [category, setCategory] = useState("insight");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState("");
  const [steps, setSteps] = useState("");
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const previews = useMemo(() => screenshots.map((file) => URL.createObjectURL(file)), [screenshots]);

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const changeScreenshots = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setError("");
    if (files.length + screenshots.length > MAX_SCREENSHOTS) {
      setError(t("Attach no more than 3 screenshots."));
      return;
    }
    const invalid = files.find((file) => !ALLOWED_SCREENSHOT_TYPES.has(file.type) || file.size === 0 || file.size > MAX_SCREENSHOT_SIZE);
    if (invalid) {
      setError(t("Screenshots must be PNG, JPEG, or WebP images no larger than 5 MiB each."));
      return;
    }
    setScreenshots((current) => [...current, ...files]);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!token) {
      setError(t("Sign in to send feedback."));
      return;
    }
    setBusy(true);
    try {
      if (mode === "insight") {
        await apiRequest("/api/reports", {
          method: "POST",
          body: JSON.stringify({ category, message: message.trim() }),
        }, token);
      } else {
        const form = new FormData();
        form.set("title", title.trim());
        form.set("message", message.trim());
        form.set("details", details.trim());
        form.set("steps", steps.trim());
        form.set("screen", "feedback");
        form.set("metadata", JSON.stringify({
          platform: navigator.platform,
          userAgent: navigator.userAgent,
          route: window.location.pathname,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        }));
        screenshots.forEach((file) => form.append("screenshots", file, file.name));
        await apiRequest("/api/error-reports", { method: "POST", body: form }, token);
      }
      setSuccess(mode === "insight" ? t("Thank you — your insight was sent.") : t("Bug report sent. Thank you for the details."));
      setTitle("");
      setMessage("");
      setDetails("");
      setSteps("");
      setScreenshots([]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("Could not send your feedback."));
    } finally {
      setBusy(false);
    }
  };

  return <div className="page-shell feedback-page">
    <SectionTitle eyebrow={t("HELP IMPROVE SHELVE")} title={t("Insights & bug reports")} detail={t("Share an idea or help us understand a problem in detail.")} />
    {!token && <div className="feedback-signin-note"><span>{t("Sign in to send feedback.")}</span><button type="button" className="button button-outline" onClick={onSignIn}>{t("Sign in")}</button></div>}
    {error && <ErrorAlert className="settings-message" message={error} onDismiss={() => setError("")} />}
    {success && <p className="feedback-success" role="status"><CheckCircle2 size={17} />{success}</p>}
    <section className="feedback-panel">
      <div className="feedback-mode-switch" role="tablist" aria-label={t("Feedback type")}>
        <button type="button" role="tab" aria-selected={mode === "insight"} className={mode === "insight" ? "active" : ""} onClick={() => { setMode("insight"); setError(""); setSuccess(""); }}>
          <Lightbulb size={16} />{t("Share an insight")}
        </button>
        <button type="button" role="tab" aria-selected={mode === "bug"} className={mode === "bug" ? "active" : ""} onClick={() => { setMode("bug"); setError(""); setSuccess(""); }}>
          <Bug size={16} />{t("Report a bug")}
        </button>
      </div>
      <form className="feedback-page-form" onSubmit={(event) => void submit(event)}>
        {mode === "insight" ? <>
          <label>{t("Insight type")}
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="insight">{t("Insight")}</option>
              <option value="feature_request">{t("Feature request")}</option>
              <option value="other">{t("Other")}</option>
            </select>
          </label>
          <label>{t("Your insight")}<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={7} maxLength={4000} placeholder={t("Describe what you noticed or what would improve Shelve…")} required /></label>
        </> : <>
          <label>{t("Short title")}<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder={t("A short summary of the problem")} required /></label>
          <label>{t("What happened?")}<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={4000} placeholder={t("Describe the error and what you expected instead…")} required /></label>
          <label>{t("Additional details")}<textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={4} maxLength={8000} placeholder={t("Include any error text or other useful context.")} /></label>
          <label>{t("Steps to reproduce")}<textarea value={steps} onChange={(event) => setSteps(event.target.value)} rows={3} maxLength={4000} placeholder={t("1. Open…  2. Select…  3. The problem appears…")} /></label>
          <div className="screenshot-upload-field">
            <div><strong>{t("Screenshots")}</strong><small>{t("Up to 3 PNG, JPEG, or WebP images · 5 MiB each")}</small></div>
            <label className="button button-outline screenshot-add-button"><ImagePlus size={14} />{t("Add screenshots")}
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={screenshots.length >= MAX_SCREENSHOTS} onChange={(event) => changeScreenshots(event)} />
            </label>
          </div>
          {screenshots.length > 0 && <div className="screenshot-preview-grid">
            {screenshots.map((file, index) => <div className="screenshot-preview" key={`${file.name}-${file.lastModified}`}>
              <img src={previews[index]} alt={`${t("Screenshot")} ${index + 1}`} />
              <span>{file.name}</span>
              <button type="button" aria-label={`${t("Remove")} ${file.name}`} onClick={() => setScreenshots((current) => current.filter((_, fileIndex) => fileIndex !== index))}><X size={13} /></button>
            </div>)}
          </div>}
          <p className="feedback-privacy-note">{t("Screenshots are stored privately with this report and can only be viewed by the Shelve admin team.")}</p>
        </>}
        <button type="submit" className="button button-primary" disabled={busy || !token || !message.trim() || (mode === "bug" && !title.trim())}>
          {busy ? <><LoaderCircle size={14} className="spin" />{t("Sending…")}</> : <><Send size={14} />{mode === "bug" ? t("Send bug report") : t("Send insight")}</>}
        </button>
      </form>
    </section>
  </div>;
}
