import { BarChart3, BookOpen, Target } from "lucide-react";
import { useLanguage } from "../language-provider";
import type { WritingAnalytics } from "../../studio/logic/writingAnalytics";
import type { WritingProject } from "../../types";

interface WritingAnalyticsPageProps {
  project: WritingProject;
  analytics: WritingAnalytics;
}

export function WritingAnalyticsPage({ project, analytics }: WritingAnalyticsPageProps) {
  const { t, locale } = useLanguage();
  const wordLabel = (count: number) => t(count === 1 ? "word" : "words");
  const maxDailyWords = Math.max(1, ...analytics.activityDays.map((day) => day.words));

  return (
    <section className="writing-analytics">
      <header>
        <span className="studio-eyebrow">{t("YOUR WRITING PRACTICE")}</span>
        <h2>{t("Writing analytics")}</h2>
        <p>{t("Small daily sessions add up to a finished book.")}</p>
      </header>
      <div className="analytics-summary-grid">
        <article className="analytics-stat-card"><Target size={18} /><span>{t("Writing streak")}</span><strong>{analytics.writingStreak} {t(analytics.writingStreak === 1 ? "day" : "days")}</strong></article>
        <article className="analytics-stat-card"><BookOpen size={18} /><span>{t("Estimated pages")}</span><strong>{Math.ceil(project.wordCount / 250).toLocaleString(locale)}</strong></article>
      </div>
      <article className="analytics-chart-card">
        <div className="analytics-chart-heading">
          <div>
            <h3>{t("7-day writing activity")}</h3>
            <p>{analytics.weeklyWords.toLocaleString(locale)} {wordLabel(analytics.weeklyWords)} · {Math.round(analytics.weeklySeconds / 60)} {t("minutes")} · {analytics.averageWpm} {t("average WPM")}</p>
          </div>
          <BarChart3 size={18} />
        </div>
        <div className="analytics-bars">{analytics.activityDays.map((day) => <div className="analytics-bar-column" key={day.date} title={`${day.words} ${wordLabel(day.words)}`}>
          <div className="analytics-bar-track"><span style={{ height: `${Math.max(3, day.words / maxDailyWords * 100)}%` }} /></div>
          <small>{day.label}</small>
        </div>)}</div>
      </article>
      <p className="analytics-session-note">{t("7-day activity totals session-added words across drafts. These are session-added words, not current draft counts, and later deletions do not subtract from them.")}</p>
    </section>
  );
}
