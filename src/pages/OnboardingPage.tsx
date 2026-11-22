import { BookOpen, Cloud, HardDrive } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { LanguagePicker, useLanguage } from "../components/language-provider";

interface OnboardingPageProps {
  onChooseOffline: () => void;
  onChooseCloud: () => void;
}

export default function OnboardingPage({ onChooseOffline, onChooseCloud }: OnboardingPageProps) {
  const { t } = useLanguage();
  return (
    <main className="onboarding-screen">
      <section className="onboarding-card">
        <div className="onboarding-brand"><BookOpen size={23} /></div>
        <span className="eyebrow">{t("Welcome to Shelve")}</span>
        <h1>{t("Your reading life, in one place.")}</h1>
        <p>{t("Choose how you want to keep your library. You can change this later in Settings.")}</p>
        <p className="language-setup-copy">{t("Choose a language for Shelve. You can change it later in Settings.")}</p>
        <LanguagePicker />
        <button className="onboarding-option" disabled={!isTauri()} onClick={onChooseOffline}>
          <HardDrive size={19} /><span><strong>{t("Use offline")}</strong><small>{isTauri() ? t("Store your books and progress in this device's SQLite database.") : t("Offline mode is available in the Shelve desktop app.")}</small></span><span className="onboarding-arrow">→</span>
        </button>
        <button className="onboarding-option" onClick={onChooseCloud}>
          <Cloud size={19} /><span><strong>{t("Use cloud sync")}</strong><small>{t("Sign in or create an account to sync your library.")}</small></span><span className="onboarding-arrow">→</span>
        </button>
      </section>
    </main>
  );
}
