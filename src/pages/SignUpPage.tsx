import { useState } from "react";
import {  CheckCircle2, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import type { SignUpResult } from "../lib/cloud";

interface SignUpPageProps {
  onSignUp: (name: string, email: string, password: string) => Promise<SignUpResult>;
  onSignIn: () => void;
  onBack: () => void;
}

export default function SignUpPage({ onSignUp, onSignIn, onBack }: SignUpPageProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [createdAccountEmail, setCreatedAccountEmail] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError(t("Password must be at least 8 characters."));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("Passwords do not match."));
      return;
    }
    setLoading(true);
    try {
      const result = await onSignUp(name.trim(), email.trim(), password);
      if (result.verificationRequired) setVerificationEmail(result.email);
      else setCreatedAccountEmail(result.email);
    } catch (signUpError) {
      setError(t(signUpError instanceof Error ? signUpError.message : "Could not create your account."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-screen auth-screen-split auth-screen-signup">
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <button className="auth-back" type="button" onClick={onBack}>← {t("Back")}</button>
          <div className="flex w-full justify-center text-center"><img src="/icon.png" className="size-23" /></div>
          <div className="auth-heading"><h1>{t("Create your library")}</h1><p>{t("Start building your personal book collection")}</p></div>
          {error && <ErrorAlert className="auth-error" message={error} />}
          {verificationEmail ? <div className="auth-success" role="status">
            <CheckCircle2 size={26} />
            <h2>{t("Check your email")}</h2>
            <p>{t("We sent a verification link to")} <strong>{verificationEmail}</strong>.</p>
            <p>{t("Verify your address before signing in. The link expires in 24 hours.")}</p>
            <button type="button" className="button button-primary auth-submit" onClick={onSignIn}>{t("Continue to sign in")}</button>
          </div> : createdAccountEmail ? <div className="auth-success" role="status">
            <CheckCircle2 size={26} />
            <h2>{t("Account created")}</h2>
            <p><strong>{createdAccountEmail}</strong></p>
            <p>{t("Email verification is not configured on this server yet. You can sign in now.")}</p>
            <button type="button" className="button button-primary auth-submit" onClick={onSignIn}>{t("Continue to sign in")}</button>
          </div> :
          
          <form onSubmit={(event) => void submit(event)} className="auth-form grid lg:grid-cols-2 grid-cols-1 w-full gap-2">
            <label>{t("Full name")}<div className="auth-input-wrap"><User size={16} /><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Your name")} required /></div></label>
            <label>{t("Email")}
              
              
              <div className="auth-input-wrap">
                <Mail size={16} />
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div></label>
            <label>{t("Password")}
              <div className="auth-input-wrap">
              <Lock size={16} />
            
            <input type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("At least 8 characters")} minLength={8} required /><button type="button" aria-label={showPassword ? t("Hide password") : t("Show password")} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
          
            </label>

            <label>{t("Confirm password")}
              <div className="auth-input-wrap">
              <Lock size={16} />
              <input type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={t("Repeat your password")} required /><button type="button" aria-label={showConfirmPassword ? t("Hide confirmation password") : t("Show confirmation password")} onClick={() => setShowConfirmPassword((value) => !value)}>{showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
             <small className="auth-hint">{t("Must be at least 8 characters")}</small>
            <button className="button button-primary auth-submit" disabled={loading}>{loading ? t("Creating account...") : t("Create account")}</button>
          </form>}
          {!verificationEmail && !createdAccountEmail && <p className="auth-switch">{t("Already have an account?")} <button type="button" onClick={onSignIn}>{t("Sign in")}</button></p>}
        </div>
      </section>
      <div className="auth-artwork h-full object-cover min-h-screen"><img src="/1.jpg" alt="" /></div>
    </main>
  );
}
