import { useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import { ApiError } from "../lib/api";
import { requestPasswordResetOnline } from "../lib/cloud";
import { generateSecurePassword } from "../lib/secure-password";

interface SignInPageProps {
  onSignIn: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  onResendVerification: (email: string) => Promise<void>;
  onSignUp: () => void;
  onBack: () => void;
}

export default function SignInPage({ onSignIn, onResendVerification, onSignUp, onBack }: SignInPageProps) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resetRequested, setResetRequested] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResendMessage("");
    setVerificationRequired(false);
    try {
      await onSignIn(email.trim(), password, rememberMe);
    } catch (signInError) {
      setError(t(signInError instanceof Error ? signInError.message : "Could not sign in. Please try again."));
      setVerificationRequired(signInError instanceof ApiError && signInError.code === "email_not_verified");
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    setLoading(true);
    setError("");
    setResendMessage("");
    try {
      await onResendVerification(email.trim());
      setResendMessage(t("If the account needs verification, a new email has been sent."));
    } catch (resendError) {
      setError(t(resendError instanceof Error ? resendError.message : "Could not send a verification email."));
    } finally {
      setLoading(false);
    }
  };

  const requestReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResendMessage("");
    try {
      await requestPasswordResetOnline(email.trim());
      setResetRequested(true);
    } catch (requestError) {
      setError(t(requestError instanceof Error ? requestError.message : "Could not request a password reset."));
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = () => {
    setPassword(generateSecurePassword());
    setShowPassword(true);
    setError("");
  };

  if (forgotPassword) {
    return (
      <main className="auth-screen auth-screen-split">
        <div className="auth-artwork"><img src="/1.jpg" alt="" /></div>
        <section className="auth-panel">
          <div className="auth-panel-inner">
            <button className="auth-back" type="button" onClick={() => { setForgotPassword(false); setResetRequested(false); setError(""); }}>← {t("Back to sign in")}</button>
            <div className="w-full justify-center text-center flex"><img src="/icon.png" className="size-23" /></div>
            <div className="auth-heading"><h1>{t("Forgot password?")}</h1><p>{t("Enter your account email and we will send a reset link.")}</p></div>
            {error && <ErrorAlert className="auth-error" message={error} />}
            {resetRequested
              ? <p className="auth-success-message" role="status">{t("If an account exists for that email, a password reset link has been sent.")}</p>
              : <form onSubmit={(event) => void requestReset(event)} className="auth-form">
                <label>{t("Email")}<div className="auth-input-wrap"><Mail size={16} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div></label>
                <button className="button button-primary auth-submit" disabled={loading}>{loading ? t("Sending...") : t("Send reset link")}</button>
              </form>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-screen auth-screen-split">
      <div className="auth-artwork"><img src="/1.jpg" alt="" /></div>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <button className="auth-back" type="button" onClick={onBack}>← {t("Back")}</button>
          <div className="w-full justify-center text-center flex"><img src = "/icon.png" className="size-23" /></div>
          <div className="auth-heading"><h1>{t("Welcome back")}</h1><p>{t("Sign in to your Shelve library")}</p></div>
          {error && <ErrorAlert className="auth-error" message={error} />}
          {resendMessage && <p className="auth-success-message" role="status">{resendMessage}</p>}
          <form onSubmit={(event) => void submit(event)} className="auth-form">
            <label>{t("Email")}<div className="auth-input-wrap"><Mail size={16} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div></label>
            <label>{t("Password")}<div className="auth-input-wrap"><Lock size={16} /><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("Enter your password")} required /><button type="button" aria-label={showPassword ? t("Hide password") : t("Show password")} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
           
            <label className="auth-remember-me"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />{t("Remember me for 30 days")}</label>
            <p className="auth-hint">{t("Without Remember me, this session expires after 24 hours.")}</p>
            <button className="auth-forgot-password" type="button" onClick={() => { setForgotPassword(true); setError(""); setResendMessage(""); }}> {t("Forgot password?")}</button>
            <button className="button button-primary auth-submit" disabled={loading}>{loading ? t("Signing in...") : t("Sign in")}</button>
          </form>
          {verificationRequired && <button className="auth-resend-verification" type="button" disabled={loading || !email.trim()} onClick={() => void resendVerification()}>{t("Resend verification email")}</button>}
          <p className="auth-switch">{t("Don't have an account?")} <button type="button" onClick={onSignUp}>{t("Sign up")}</button></p>
        </div>
      </section>
    </main>
  );
}
