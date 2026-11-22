import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import type { AuthUser } from "../types";
import { useLanguage } from "./language-provider";
import { ErrorAlert } from "./error-feedback";

interface AccountMenuProps {
  user: AuthUser | null;
  avatar: string | null;
  onManageProfile: () => void;
  onSignIn: () => void;
  onSignOut: () => Promise<void>;
}

function formatAccountDate(value: string | undefined, locale: string): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export default function AccountMenu({ user, avatar, onManageProfile, onSignIn, onSignOut }: AccountMenuProps) {
  const { locale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const displayName = user?.name || user?.email.split("@")[0] || t("Reader");
  const plan = user?.plan ?? "free";
  const planLabel = t(plan[0].toUpperCase() + plan.slice(1));

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const signOut = async () => {
    setBusy(true);
    setError("");
    try {
      await onSignOut();
      setOpen(false);
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  };

  const manageProfile = () => {
    setOpen(false);
    onManageProfile();
  };

  const signIn = () => {
    setOpen(false);
    onSignIn();
  };

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        type="button"
        className="account-menu-trigger"
        aria-label={t("Open account menu")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="account-menu-popover"
        title={t("Account menu")}
        onClick={() => setOpen((value) => !value)}
      >
        {avatar ? <img src={avatar} alt="" /> : <UserRound size={17} />}
      </button>
      {open && (
        <section id="account-menu-popover" className="account-menu-popover" role="dialog" aria-label={t("Account management")}>
          <div className="account-menu-heading">
            <div className="account-menu-avatar">
              {avatar ? <img src={avatar} alt="" /> : <UserRound size={18} />}
            </div>
            <div className="account-menu-identity">
              <strong>{displayName}</strong>
              <span>{user?.email || t("Local library")}</span>
            </div>
          </div>
          <dl className="account-menu-details">
            <div><dt>{t("Member since")}</dt><dd>{formatAccountDate(user?.createdAt, locale)}</dd></div>
            <div><dt>{t("Last update")}</dt><dd>{formatAccountDate(user?.updatedAt, locale)}</dd></div>
            <div><dt>{t("Plan")}</dt><dd><span className="account-plan-badge">{planLabel}</span></dd></div>
          </dl>
          <button type="button" className="button button-outline account-update-plan" disabled title={t("Plan management is not available yet.")}>
            {t("Update plan")}
          </button>
          <div className="account-menu-actions">
            <button type="button" onClick={manageProfile}><UserRound size={14} /> {t("Manage profile")}</button>
            {user
              ? <button type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={14} /> {busy ? t("Signing out…") : t("Sign out")}</button>
              : <button type="button" onClick={signIn}><LogOut size={14} /> {t("Sign in")}</button>}
          </div>
          {error && <ErrorAlert className="account-menu-error" message={error} />}
        </section>
      )}
    </div>
  );
}
