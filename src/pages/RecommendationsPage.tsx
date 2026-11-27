import { ArrowRight, Globe } from "lucide-react";
import { useLanguage } from "../components/language-provider";
import { SectionTitle } from "./shared";

export default function RecommendationsPage({ onBrowse }: { onBrowse: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="page-shell">
      <SectionTitle eyebrow={t("LIVE BOOK CATALOG")} title={t("Discover")} detail={t("Browse real book records from the Open Library catalog.")} />
      <div className="public-empty">
        <Globe size={23} />
        <p>{t("Search the live catalog to find your next read.")}</p>
        <button className="button button-outline" onClick={onBrowse}>{t("Browse Open Library")} <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}
