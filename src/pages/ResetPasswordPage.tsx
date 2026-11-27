import { useState } from "react";
import { Lock } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import { resetPasswordOnline } from "../lib/cloud";

interface ResetPasswordPageProps {
  onSignIn: () => void;
}

export default function ResetPasswordPage({ onSignIn }: ResetPasswordPageProps) {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError(t("This password reset link is invalid or expired."));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("Passwords do not match."));
      return;
    }
    setBusy(true);
    try {
      await resetPasswordOnline(token, password);
      setComplete(true);
    } catch (resetError) {
      setError(t(resetError instanceof Error ? resetError.message : "Could not reset your password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen auth-screen-split">
      <div className="auth-artwork"><img src="/1.jpg" alt="" /></div>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="w-full justify-center text-center flex"><img src="/icon.png" className="size-23" /></div>
          <div className="auth-heading"><h1>{t("Reset your password")}</h1><p>{t("Choose a new password for your Shelve account.")}</p></div>
          {error && <ErrorAlert className="auth-error" message={error} />}
          {complete
            ? <div><p className="auth-success-message" role="status">{t("Your password has been reset. You can now sign in.")}</p><button className="button button-primary auth-submit" onClick={onSignIn}>{t("Sign in")}</button></div>
            : <form onSubmit={(event) => void submit(event)} className="auth-form">
              <label>{t("New password")}<div className="auth-input-wrap"><Lock size={16} /><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={72} required /></div></label>
              <label>{t("Confirm new password")}<div className="auth-input-wrap"><Lock size={16} /><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={72} required /></div></label>
              <button className="button button-primary auth-submit" disabled={busy}>{busy ? t("Resetting...") : t("Reset password")}</button>
            </form>}
        </div>
      </section>
    </main>
  );
}
