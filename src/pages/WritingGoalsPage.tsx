import { useEffect, useState } from "react";
import { WritingGoalsPage as GoalsView } from "../components/writing/WritingGoalsPage";
import { calculateWritingAnalytics } from "../studio/logic/writingAnalytics";
import { getActiveStudioProject } from "../studio/logic/routes";
import { loadRecords, saveRecords, type StoredRecord } from "../lib/storage";
import { useLanguage } from "../components/language-provider";
import type { WritingProject, WritingSession } from "../types";

export default function WritingGoalsRoutePage() {
  const { t, language } = useLanguage();
  const [projects, setProjects] = useState<WritingProject[]>([]);
  const project = getActiveStudioProject(projects);
  const [sessions, setSessions] = useState<WritingSession[]>([]);

  useEffect(() => {
    void Promise.all([
      loadRecords("writings"),
      loadRecords("writingSessions"),
    ]).then(([projects, sessions]) => {
      setProjects(projects as WritingProject[]);
      setSessions(sessions as WritingSession[]);
    });
  }, []);

  const updateProject = (projectId: string, patch: Partial<WritingProject>) => {
    const updatedProjects = projects.map((current) =>
      current.id === projectId ? { ...current, ...patch, updatedAt: new Date().toISOString() } : current,
    );
    setProjects(updatedProjects);
    void saveRecords("writings", updatedProjects as (WritingProject & StoredRecord)[])
      .catch((error: unknown) => console.error("Could not save writing goals:", error));
  };

  if (!project) return <section className="writing-analytics"><header><h2>{t("Writing goals")}</h2><p>{t("Create or open a project in Shelve Studio to set goals.")}</p></header></section>;
  const analytics = calculateWritingAnalytics(sessions, project.id, project.dailyWordGoal ?? 500, language);
  return <GoalsView
    project={project}
    todayWords={analytics.todayWords}
    dailyGoal={project.dailyWordGoal ?? 500}
    dailyProgress={analytics.dailyProgress}
    onUpdateProject={updateProject}
  />;
}
