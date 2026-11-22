import { MessageSquare } from "lucide-react";
import { useLanguage } from "../components/language-provider";
import { SectionTitle } from "./shared";

export default function AiPage() {
  const { t } = useLanguage();
  return (
    <div className="page-shell">
      <SectionTitle eyebrow="YOUR READING COMPANION" title="Ask about a book" detail="Explore ideas and questions from the books on your shelf." />
      <section className="ai-unavailable-card">
        <div className="ai-unavailable-icon"><MessageSquare size={20} /></div>
        <h2>{t("AI companion needs a connected service")}</h2>
        <p>{t("The cloud AI service is available when you choose Cloud mode and configure the Go API. Your local library and reading progress continue to work offline.")}</p>
      </section>
    </div>
  );
}
