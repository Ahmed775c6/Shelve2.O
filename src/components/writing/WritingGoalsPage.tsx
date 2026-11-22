import { useLanguage } from "../language-provider";
import type { WritingProject } from "../../types";

interface WritingGoalsPageProps {
  project: WritingProject;
  todayWords: number;
  dailyGoal: number;
  dailyProgress: number;
  onUpdateProject: (projectId: string, patch: Partial<WritingProject>) => void;
}

export function WritingGoalsPage({
  project,
  todayWords,
  dailyGoal,
  dailyProgress,
  onUpdateProject,
}: WritingGoalsPageProps) {
  const { t, locale } = useLanguage();
  const wordLabel = (count: number) => t(count === 1 ? "word" : "words");
  const projectWordGoal = project.targetWordGoal ?? 0;
  const projectProgress = projectWordGoal
    ? Math.round((project.wordCount / projectWordGoal) * 100)
    : 0;

  return (
    <section className="writing-analytics writing-goals">
      <header>
        <span className="studio-eyebrow">{t("YOUR WRITING PRACTICE")}</span>
        <h2>{t("Writing goals")}</h2>
        <p>{t("Small daily sessions add up to a finished book.")}</p>
      </header>
      <div className="analytics-summary-grid">
        <article className="analytics-goal-card">
          <div className="analytics-progress-ring" style={{ background: `conic-gradient(var(--gold) ${dailyProgress}%, var(--line) 0)` }}><span>{dailyProgress}%</span></div>
          <div>
            <strong>{t("Words added today")}</strong>
            <p>{todayWords.toLocaleString(locale)} / {dailyGoal.toLocaleString(locale)} {wordLabel(dailyGoal)}</p>
            <label>{t("Daily target")}<input type="number" min="1" value={dailyGoal} onChange={(event) => onUpdateProject(project.id, { dailyWordGoal: Math.max(1, Number(event.target.value) || 1) })} /> {wordLabel(dailyGoal)}</label>
          </div>
        </article>
      </div>
      <article className="analytics-project-progress">
        <div>
          <h3>{project.title || t("No project selected")}</h3>
          <span>{project.wordCount.toLocaleString(locale)} {wordLabel(project.wordCount)} · {Math.ceil(project.wordCount / 250)} {t("estimated pages")}</span>
        </div>
        <label className="analytics-project-target">{t("Project word goal")}<input type="number" min="1" value={project.targetWordGoal ?? ""} placeholder={t("Set a target")} onChange={(event) => onUpdateProject(project.id, { targetWordGoal: event.target.value ? Math.max(1, Number(event.target.value) || 1) : undefined })} /> {wordLabel(project.targetWordGoal ?? 0)}</label>
        <progress max={project.targetWordGoal || 1} value={Math.min(project.wordCount, project.targetWordGoal ?? 0)} />
        <p>{project.targetWordGoal ? `${projectProgress}% ${t("complete")}` : t("Set a project word goal to track progress.")}</p>
      </article>
    </section>
  );
}
