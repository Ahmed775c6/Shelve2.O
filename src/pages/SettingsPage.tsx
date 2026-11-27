import { useEffect, useState, type FormEvent } from "react";
import { Bell, Check, Cloud, Download, Languages, Library, MessageSquare, Sun, Trash2, Upload } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { LanguagePicker, useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import type { Theme } from "../components/theme-provider";
import type { LocalDataResetScope } from "../lib/storage";
import type { StorageMode } from "../types";
import { loadEmailNotificationPreferences, saveEmailNotificationPreferences } from "../lib/cloud";
import { apiRequest } from "../lib/api";
import { SectionTitle } from "./shared";

const themeChoices: Theme[] = ["dark", "light"];

interface SettingsPageProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onExport: () => void;
  storageMode: StorageMode;
  onStorageModeChange: (mode: StorageMode, source?: "local" | "cloud", password?: string) => Promise<void>;
  onDeleteLocalData: (scope: LocalDataResetScope) => Promise<void>;
  onDeleteAccount: (password: string) => Promise<void>;
  userName?: string;
  emailNotificationToken?: string;
  syncMessage?: string;
  onSignIn: () => void;
  onProfile: () => void;
  onImport: (file: File) => Promise<void>;
}

export default function SettingsPage({
  theme,
  onThemeChange,
  onExport,
  storageMode,
  onStorageModeChange,
  onDeleteLocalData,
  onDeleteAccount,
  userName,
  emailNotificationToken,
  syncMessage,
  onSignIn,
  onProfile,
  onImport,
}: SettingsPageProps) {
  const { t } = useLanguage();
  const [backupError, setBackupError] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailDeliveryAvailable, setEmailDeliveryAvailable] = useState(false);
  const [emailPreferencesReady, setEmailPreferencesReady] = useState(false);
  const [emailPreferencesBusy, setEmailPreferencesBusy] = useState(false);
  const [emailPreferencesError, setEmailPreferencesError] = useState("");
  const [switchMode, setSwitchMode] = useState<StorageMode | null>(null);
  const [switchSource, setSwitchSource] = useState<"local" | "cloud" | null>(null);
  const [switchPassword, setSwitchPassword] = useState("");
  const [switchError, setSwitchError] = useState("");
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [deleteAccountError, setDeleteAccountError] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("idea");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");

  const sendFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!emailNotificationToken || feedbackBusy) return;
    setFeedbackBusy(true);
    setFeedbackStatus("");
    try {
      await apiRequest("/api/reports", {
        method: "POST",
        body: JSON.stringify({ category: feedbackCategory, message: feedbackMessage }),
      }, emailNotificationToken);
      setFeedbackMessage("");
      setFeedbackStatus(t("Thanks for helping us improve Shelve."));
    } catch (error) {
      console.error("Could not send product feedback:", error);
      setFeedbackStatus(t(error instanceof Error ? error.message : "Could not send your feedback."));
    } finally {
      setFeedbackBusy(false);
    }
  };

  useEffect(() => {
    let active = true;
    setEmailPreferencesReady(false);
    if (!emailNotificationToken) {
      setEmailPreferencesReady(true);
      setEmailNotifications(false);
      setEmailVerified(false);
      setEmailDeliveryAvailable(false);
      setEmailPreferencesError("");
      return () => { active = false; };
    }
    void loadEmailNotificationPreferences(emailNotificationToken).then((preferences) => {
      if (!active) return;
      setEmailNotifications(preferences.emailNotifications);
      setEmailVerified(preferences.emailVerified);
      setEmailDeliveryAvailable(preferences.emailDeliveryAvailable);
      setEmailPreferencesError("");
    }).catch((error: unknown) => {
      if (!active) return;
      console.error("Could not load email notification preferences:", error);
      setEmailPreferencesError(t(error instanceof Error ? error.message : "Could not load email notification preferences."));
    }).finally(() => {
      if (active) setEmailPreferencesReady(true);
    });
    return () => { active = false; };
  }, [emailNotificationToken, t]);

  const toggleEmailNotifications = async () => {
    if (!emailNotificationToken || emailPreferencesBusy) return;
    const next = !emailNotifications;
    setEmailPreferencesBusy(true);
    setEmailPreferencesError("");
    try {
      await saveEmailNotificationPreferences(emailNotificationToken, next);
      setEmailNotifications(next);
    } catch (error) {
      console.error("Could not save email notification preferences:", error);
      setEmailPreferencesError(t(error instanceof Error ? error.message : "Could not save email notification preferences."));
    } finally {
      setEmailPreferencesBusy(false);
    }
  };

  const changeMode = async (mode: StorageMode) => {
    if (mode === storageMode) return;
    if (emailNotificationToken) {
      setSwitchMode(mode);
      setSwitchSource(null);
      setSwitchPassword("");
      setSwitchError("");
      return;
    }
    setBusy(true);
    setBackupError("");
    try {
      await onStorageModeChange(mode);
    } catch (error) {
      setBackupError(t(error instanceof Error ? error.message : "Could not change storage mode."));
    } finally {
      setBusy(false);
    }
  };

  const applyStorageChoice = async () => {
    if (!switchMode || !switchSource || !switchPassword) return;
    setBusy(true);
    setSwitchError("");
    try {
      await onStorageModeChange(switchMode, switchSource, switchPassword);
      setSwitchMode(null);
      setSwitchPassword("");
    } catch (error) {
      setSwitchError(t(error instanceof Error ? error.message : "Could not change storage mode."));
    } finally {
      setBusy(false);
    }
  };

  const deleteLocalData = async (scope: LocalDataResetScope) => {
    setBusy(true);
    setBackupError("");
    try {
      await onDeleteLocalData(scope);
    } catch (error) {
      setBackupError(t(error instanceof Error ? error.message : "Could not delete local data."));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setBackupError("");
    try {
      await onImport(file);
    } catch (error) {
      setBackupError(t(error instanceof Error ? error.message : "Could not import that backup."));
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!deleteAccountPassword) return;
    setBusy(true);
    setDeleteAccountError("");
    try {
      await onDeleteAccount(deleteAccountPassword);
    } catch (error) {
      setDeleteAccountError(t(error instanceof Error ? error.message : "Could not delete the account."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <SectionTitle eyebrow="MAKE SHELVE YOURS" title={t("Settings")} detail={t("Manage your library, account, and app preferences.")} />
      <section className="settings-card">
        <div className="settings-heading"><span className="settings-icon"><Languages size={17} /></span><div><h2>{t("Language")}</h2><p>{t("Choose a language for Shelve. You can change it later in Settings.")}</p></div></div>
        <LanguagePicker />
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span className="settings-icon"><Sun size={17} /></span><div><h2>{t("Appearance")}</h2><p>{t("Choose the look that feels right for your reading time.")}</p></div></div>
        <div className="theme-choices">
          {themeChoices.map((choice) => (
            <button key={choice} onClick={() => onThemeChange(choice)} className={`theme-choice theme-choice-${choice} ${theme === choice ? "selected" : ""}`}>
            <span className="theme-preview" /><span>{t(choice[0].toUpperCase() + choice.slice(1))}</span>{theme === choice && <Check size={14} />}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span className="settings-icon"><Cloud size={17} /></span><div><h2>{t("Storage and sync")}</h2><p>{t("Choose where your books and reading data are stored.")}</p></div></div>
        <div className="storage-mode-choices">
          <button disabled={busy || !isTauri()} className={`storage-mode-choice ${storageMode === "offline" ? "selected" : ""}`} onClick={() => void changeMode("offline")}>
            <Library size={18} /><span><strong>{t("Offline mode")}</strong><small>{t(isTauri() ? "Keep your library on this device in local SQLite." : "Offline mode is available in the Shelve desktop app.")}</small></span>{storageMode === "offline" && <Check size={15} />}
          </button>
          <button disabled={busy} className={`storage-mode-choice ${storageMode === "cloud" ? "selected" : ""}`} onClick={() => void changeMode("cloud")}>
            <Cloud size={18} /><span><strong>{t("Cloud online mode")}</strong><small>{t("Sign in to sync your library with your account.")}</small></span>{storageMode === "cloud" && <Check size={15} />}
          </button>
        </div>
        <div className="settings-action-row">
          <div><strong>{userName ? `${t("Signed in as")} ${userName}` : t("Shelve account")}</strong><p>{t(userName ? "Your session lasts 24 hours unless Remember me is enabled in Profile." : "Use an account to sync across devices.")}</p></div>
          {userName
            ? <button className="button button-outline" onClick={onProfile}>{t("Manage profile")}</button>
            : <button className="button button-outline" onClick={onSignIn}>{t("Sign in")}</button>}
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span className="settings-icon"><Bell size={17} /></span><div><h2>{t("Email alerts")}</h2><p>{t("Receive email for sync conflicts and account security changes.")}</p></div></div>
        <div className="settings-action-row email-notification-setting">
          <div>
            <strong>{t("Actionable email notifications")}</strong>
            <p>{!emailNotificationToken
              ? t("Sign in to manage email notifications.")
              : !emailVerified
                ? t("Verify your email address to enable notifications.")
                : !emailDeliveryAvailable
                  ? t("Email delivery is not configured on the server.")
                  : t("Only sync conflicts and account-security alerts are emailed.")}</p>
          </div>
          <button
            type="button"
            className={`notification-switch ${emailNotifications ? "enabled" : ""}`}
            role="switch"
            aria-checked={emailNotifications}
            aria-label={t("Email notifications")}
            disabled={!emailPreferencesReady || emailPreferencesBusy || !emailNotificationToken || !emailVerified || !emailDeliveryAvailable}
            onClick={() => void toggleEmailNotifications()}
          ><span /></button>
        </div>
        {emailPreferencesError && <ErrorAlert className="form-error settings-message" message={emailPreferencesError} />}
      </section>
      {isTauri() && <section className="settings-card">
        <div className="settings-heading"><span className="settings-icon"><Trash2 size={17} /></span><div><h2>{t("Delete local data")}</h2><p>{t("These actions affect only this device and cannot be undone.")}</p></div></div>
        <div className="settings-action-row">
          <div><strong>{t("Delete local library data")}</strong><p>{t("Removes books, reading data, writing, local files, and pending sync. Keeps sign-in and app preferences.")}</p></div>
          <button type="button" className="button button-danger" disabled={busy} onClick={() => void deleteLocalData("library")}>{t("Delete library data")}</button>
        </div>
        <div className="settings-action-row">
          <div><strong>{t("Reset all local data")}</strong><p>{t("Also removes sign-in and app preferences. Cloud account data is not deleted.")}</p></div>
          <button type="button" className="button button-danger" disabled={busy} onClick={() => void deleteLocalData("all")}>{t("Reset all local data")}</button>
        </div>
      </section>}
      {emailNotificationToken && <section className="settings-card">
        <div className="settings-heading"><span className="settings-icon"><Trash2 size={17} /></span><div><h2>{t("Delete account and cloud data")}</h2><p>{t("Permanently remove your account, cloud library, writing, and uploaded files.")}</p></div></div>
        <div className="settings-action-row">
          <div><strong>{t("Delete account and all data")}</strong><p>{t("This cannot be undone. Your password is required to confirm.")}</p></div>
          <button type="button" className="button button-danger" disabled={busy} onClick={() => { setDeleteAccountOpen(true); setDeleteAccountPassword(""); setDeleteAccountError(""); }}>{t("Delete account")}</button>
        </div>
      </section>}
      <section className="settings-card">
        <div className="settings-heading"><span className="settings-icon"><Download size={17} /></span><div><h2>{t("Your library data")}</h2><p>{t("Export or merge a Shelve JSON backup.")}</p></div></div>
        <div className="settings-action-row">
          <div><strong>{t("Backup and restore")}</strong><p>{t("Books, notes, writing, plans, and sessions are included.")}</p></div>
          <div className="settings-backup-actions">
            <label className="button button-outline"><Upload size={14} /> {t("Import JSON")}<input type="file" accept="application/json,.json" disabled={busy} onChange={(event) => { void importFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
            <button className="button button-outline" disabled={busy} onClick={onExport}>{t("Export library")}</button>
          </div>
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span className="settings-icon"><MessageSquare size={17} /></span><div><h2>{t("Share an idea")}</h2><p>{t("Tell us how we can make Shelve better. Your message is linked to your account.")}</p></div></div>
        {emailNotificationToken
          ? <form className="feedback-form" onSubmit={(event) => void sendFeedback(event)}>
            <label>{t("What is this about?")}<select value={feedbackCategory} onChange={(event) => setFeedbackCategory(event.target.value)}>
              <option value="idea">{t("Feature idea")}</option><option value="usability">{t("Usability")}</option><option value="accessibility">{t("Accessibility")}</option><option value="other">{t("Other")}</option>
            </select></label>
            <label>{t("Your feedback")}<textarea rows={4} maxLength={4000} required value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} placeholder={t("What would make Shelve better for you?")} /></label>
            {feedbackStatus && <p className="settings-message" role="status">{feedbackStatus}</p>}
            <button type="submit" className="button button-primary" disabled={feedbackBusy || !feedbackMessage.trim()}>{feedbackBusy ? t("Sending...") : t("Send feedback")}</button>
          </form>
          : <div className="settings-action-row"><div><strong>{t("Sign in to share feedback")}</strong><p>{t("Your ideas are sent privately to the Shelve team.")}</p></div><button className="button button-outline" onClick={onSignIn}>{t("Sign in")}</button></div>}
      </section>
      {backupError
        ? <ErrorAlert className="form-error settings-message" message={backupError} />
        : syncMessage && <p className="settings-message" role="status">{syncMessage}</p>}
      <div className="local-data-note"><Check size={15} /> {t("Online data is stored in your account; offline data is stored in this device's SQLite database.")}</div>
      {switchMode && <div className="dialog-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) setSwitchMode(null);
      }}>
        <section className="dialog confirm-dialog storage-switch-dialog" role="alertdialog" aria-modal="true" aria-labelledby="storage-switch-title">
          <div className="confirm-dialog-icon"><Cloud size={19} /></div>
          <h2 id="storage-switch-title">{t("Choose which library to keep")}</h2>
          <p>{t("Switching storage permanently replaces one copy with the other. Choose the source you want to keep.")}</p>
          <div className="storage-source-choices">
            <button type="button" className={`storage-source-choice ${switchSource === "local" ? "selected" : ""}`} onClick={() => setSwitchSource("local")}>
              <strong>{t("Keep this device's local data")}</strong><small>{t("Replace all cloud library data with this device's library. Your password is required.")}</small>
            </button>
            <button type="button" className={`storage-source-choice ${switchSource === "cloud" ? "selected" : ""}`} onClick={() => setSwitchSource("cloud")}>
              <strong>{t("Keep the cloud data")}</strong><small>{t("Replace this device's local library and pending changes with your cloud library. Your password is required.")}</small>
            </button>
          </div>
          {switchSource && <label className="storage-password-field">{t("Account password")}<input type="password" autoComplete="current-password" value={switchPassword} onChange={(event) => setSwitchPassword(event.target.value)} /></label>}
          {switchError && <ErrorAlert className="form-error settings-message" message={switchError} />}
          <footer className="dialog-footer">
            <button type="button" className="button button-outline" disabled={busy} onClick={() => setSwitchMode(null)}>{t("Cancel")}</button>
            <button type="button" className="button button-danger" disabled={busy || !switchSource || !switchPassword} onClick={() => void applyStorageChoice()}>{busy ? t("Applying...") : t("Replace and switch")}</button>
          </footer>
        </section>
      </div>}
      {deleteAccountOpen && <div className="dialog-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) setDeleteAccountOpen(false);
      }}>
        <section className="dialog confirm-dialog storage-switch-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title">
          <div className="confirm-dialog-icon"><Trash2 size={19} /></div>
          <h2 id="delete-account-title">{t("Delete your Shelve account?")}</h2>
          <p>{t("This permanently deletes your account, all cloud library and writing data, and uploaded files. You will be signed out on this device. This cannot be undone.")}</p>
          <label className="storage-password-field">{t("Account password")}<input type="password" autoComplete="current-password" value={deleteAccountPassword} onChange={(event) => setDeleteAccountPassword(event.target.value)} /></label>
          {deleteAccountError && <ErrorAlert className="form-error settings-message" message={deleteAccountError} />}
          <footer className="dialog-footer">
            <button type="button" className="button button-outline" disabled={busy} onClick={() => setDeleteAccountOpen(false)}>{t("Cancel")}</button>
            <button type="button" className="button button-danger" disabled={busy || !deleteAccountPassword} onClick={() => void deleteAccount()}>{busy ? t("Deleting...") : t("Delete account permanently")}</button>
          </footer>
        </section>
      </div>}
    </div>
  );
}
