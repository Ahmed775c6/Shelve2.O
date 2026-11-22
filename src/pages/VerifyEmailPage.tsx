import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, MailCheck, XCircle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../components/language-provider";
import { verifyEmailOnline } from "../lib/cloud";

interface VerifyEmailPageProps {
  onSignIn: () => void;
}

type VerificationState = "loading" | "verified" | "failed";

export default function VerifyEmailPage({ onSignIn }: VerifyEmailPageProps) {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<VerificationState>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!token) {
      setState("failed");
      setError(t("This verification link is missing its token."));
      return () => { active = false; };
    }
    void verifyEmailOnline(token).then(() => {
      if (active) setState("verified");
    }).catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Could not verify this email address.");
      setState("failed");
    });
    return () => { active = false; };
  }, [token, t]);

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-panel-inner auth-verification">
          <div className={`auth-brand ${state === "failed" ? "auth-brand-error" : ""}`}>
            {state === "loading" ? <LoaderCircle className="studio-sync-spin" size={23} /> : state === "verified" ? <MailCheck size={23} /> : <XCircle size={23} />}
          </div>
          <div className="auth-heading">
            <h1>{state === "loading" ? t("Verifying your email") : state === "verified" ? t("Email verified") : t("Verification link unavailable")}</h1>
            <p>{state === "loading" ? t("Please wait while we confirm your address.") : state === "verified" ? t("Your Shelve account is ready to use.") : error}</p>
          </div>
          {state === "verified" && <div className="auth-success-check"><CheckCircle2 size={17} />{t("You can now sign in to Shelve.")}</div>}
          {state !== "loading" && <button type="button" className="button button-primary auth-submit" onClick={onSignIn}>{t("Continue to sign in")}</button>}
        </div>
      </section>
    </main>
  );
}
