import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, Cloud, Eye, EyeOff, Lock, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import type { AuthUser, StorageMode } from "../types";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import { SectionTitle } from "./shared";
import { changePasswordOnline } from "../lib/cloud";

interface ProfilePageProps {
  user: AuthUser | null;
  token: string | null;
  avatar: string | null;
  sessionExpiresAt?: string;
  storageMode: StorageMode;
  onAvatarChange: (avatar: string | null) => Promise<void>;
  onSignIn: () => void;
  onSignOut: () => Promise<void>;
}

async function prepareAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");

  const image = await createImageBitmap(file);
  try {
    const maxDimension = 256;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the profile photo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.84);
  } finally {
    image.close();
  }
}

function formatExpiry(value: string | undefined, locale: string, t: (text: string) => string): string {
  if (!value) return t("Not signed in");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t("Unavailable") : date.toLocaleString(locale);
}

export default function ProfilePage({
  user,
  token,
  avatar,
  sessionExpiresAt,
  storageMode,
  onAvatarChange,
  onSignIn,
  onSignOut,
}: ProfilePageProps) {
  const { locale, t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!token) {
      setError(t("Sign in to change your password."));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("Password must be at least 8 characters."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("Passwords do not match."));
      return;
    }
    setPasswordBusy(true);
    try {
      await changePasswordOnline(token, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice(t("Password changed successfully."));
    } catch (passwordError) {
      setError(t(passwordError instanceof Error ? passwordError.message : "Could not change your password."));
    } finally {
      setPasswordBusy(false);
    }
  };

  const changeAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setAvatarBusy(true);
    setError("");
    setNotice("");
    try {
      await onAvatarChange(await prepareAvatar(file));
      setNotice(t("Profile photo updated."));
    } catch (avatarError) {
      setError(t(avatarError instanceof Error ? avatarError.message : "Could not update the profile photo."));
    } finally {
      setAvatarBusy(false);
      input.value = "";
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    setError("");
    setNotice("");
    try {
      await onAvatarChange(null);
      setNotice(t("Profile photo removed."));
    } catch (avatarError) {
      setError(t(avatarError instanceof Error ? avatarError.message : "Could not remove the profile photo."));
    } finally {
      setAvatarBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError("");
    try {
      await onSignOut();
    } catch (signOutError) {
      setError(t(signOutError instanceof Error ? signOutError.message : "Could not sign out."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <SectionTitle eyebrow={t("ACCOUNT SETTINGS")} title={t("Profile")} detail={t("Manage your Shelve account and sign-in session.")} />
      <section className="profile-card">
        <div className="profile-card-heading">
          <div className="profile-avatar profile-page-avatar">
            {avatar ? <img src={avatar} alt="" /> : <UserRound size={22} />}
          </div>
          <div className="profile-card-identity">
            <h2>{user?.name || t("Local reader")}</h2>
            <p>{user ? t("Shelve account") : t("This library is stored on this device.")}</p>
            <div className="profile-photo-actions">
              <button type="button" className="button button-outline" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
                <Camera size={14} /> {avatarBusy ? t("Saving…") : avatar ? t("Change photo") : t("Add photo")}
              </button>
              {avatar && <button type="button" className="button button-outline" disabled={avatarBusy} onClick={() => void removeAvatar()}>{t("Remove photo")}</button>}
              <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={(event) => void changeAvatar(event)} />
            </div>
            <p className="profile-photo-note">{t("Profile photos are saved on this device.")}</p>
          </div>
        </div>
        <div className="profile-details">
          <div className="profile-detail">
            <span><UserRound size={14} /> {t("Name")}</span>
            <strong>{user?.name || t("Local reader")}</strong>
          </div>
          <div className="profile-detail">
            <span><Mail size={14} /> {t("Email")}</span>
            <strong>{user?.email || t("Not connected")}</strong>
          </div>
          <div className="profile-detail">
            <span><Cloud size={14} /> {t("Storage")}</span>
            <strong>{storageMode === "cloud" ? t("Cloud online") : t("Offline on this device")}</strong>
          </div>
          {user && (
            <div className="profile-detail">
              <span>{t("Session expires")}</span>
              <strong>{formatExpiry(sessionExpiresAt, locale, t)}</strong>
            </div>
          )}
        </div>
        <div className="profile-actions">
          <div>
            <strong>{user ? t("Sign out of Shelve") : t("Connect an account")}</strong>
            <p>{user ? t("Your local books and files will remain on this device.") : t("Sign in to sync your library across devices.")}</p>
          </div>
          {user
            ? <button className="button button-outline" disabled={busy} onClick={() => void signOut()}><LogOut size={14} /> {busy ? t("Signing out…") : t("Sign out")}</button>
            : <button className="button button-outline" onClick={onSignIn}>{t("Sign in")}</button>}
        </div>
      </section>
      {user && token && (
        <section className="security-card">
          <div className="security-card-heading">
            <div className="security-card-icon"><ShieldCheck size={18} /></div>
            <div>
              <h2>{t("Security")}</h2>
              <p>{t("Update the password used to sign in to your Shelve account.")}</p>
            </div>
          </div>
          <form className="security-password-form" onSubmit={(event) => void changePassword(event)}>
            <label>
              {t("Current password")}
              <div className="security-password-input">
                <Lock size={15} />
                <input type={showPassword ? "text" : "password"} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
              </div>
            </label>
            <label>
              {t("New password")}
              <div className="security-password-input">
                <Lock size={15} />
                <input type={showPassword ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={72} placeholder={t("At least 8 characters")} required />
                <button type="button" aria-label={showPassword ? t("Hide password") : t("Show password")} onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
            <label>
              {t("Confirm new password")}
              <div className="security-password-input">
                <Lock size={15} />
                <input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" maxLength={72} required />
              </div>
            </label>
            <button className="button button-primary security-password-button" type="submit" disabled={passwordBusy}>
              {passwordBusy ? t("Changing…") : t("Change password")}
            </button>
          </form>
        </section>
      )}
      {error && <ErrorAlert className="form-error settings-message" message={error} />}
      {notice && <p className="profile-photo-notice" role="status">{notice}</p>}
    </div>
  );
}
