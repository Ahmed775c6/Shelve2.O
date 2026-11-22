import { useEffect, useState } from "react";
import { Bell, Check, Cloud, Download, Languages, Library, Sun, Trash2, Upload } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { LanguagePicker, useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import type { Theme } from "../components/theme-provider";
import type { LocalDataResetScope } from "../lib/storage";
import type { StorageMode } from "../types";
import { loadEmailNotificationPreferences, saveEmailNotificationPreferences } from "../lib/cloud";
import { SectionTitle } from "./shared";

const themeChoices: Theme[] = ["dark", "light"];

interface SettingsPageProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onExport: () => void;
  storageMode: StorageMode;
  onStorageModeChange: (mode: StorageMode) => Promise<void>;
  onDeleteLocalData: (scope: LocalDataResetScope) => Promise<void>;
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
          <div><strong>{userName ? `${t("Signed in as")} ${userName}` : t("Shelve account")}</strong><p>{t(userName ? "Your cloud session expires 30 days after sign-in." : "Use an account to sync across devices.")}</p></div>
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
      {backupError
        ? <ErrorAlert className="form-error settings-message" message={backupError} />
        : syncMessage && <p className="settings-message" role="status">{syncMessage}</p>}
      <div className="local-data-note"><Check size={15} /> {t("Online data is stored in your account; offline data is stored in this device's SQLite database.")}</div>
    </div>
  );
}
