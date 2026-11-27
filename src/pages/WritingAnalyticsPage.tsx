import { useEffect, useState } from "react";
import { WritingAnalyticsPage as AnalyticsView } from "../components/writing/WritingAnalyticsPage";
import { calculateWritingAnalytics } from "../studio/logic/writingAnalytics";
import { getActiveStudioProject } from "../studio/logic/routes";
import { loadRecords } from "../lib/storage";
import { useLanguage } from "../components/language-provider";
import type { WritingProject, WritingSession } from "../types";

export default function WritingAnalyticsRoutePage() {
  const { t, language } = useLanguage();
  const [projects, setProjects] = useState<WritingProject[]>([]);
  const project = getActiveStudioProject(projects);
  const [sessions, setSessions] = useState<WritingSession[]>([]);

  useEffect(() => {
    void Promise.all([loadRecords("writings"), loadRecords("writingSessions")]).then(([projects, sessions]) => {
      setProjects(projects as WritingProject[]);
      setSessions(sessions as WritingSession[]);
    });
  }, []);

  if (!project) return <section className="writing-analytics"><header><h2>{t("Writing analytics")}</h2><p>{t("Create or open a project in Shelve Studio to view analytics.")}</p></header></section>;
  const analytics = calculateWritingAnalytics(sessions, project.id, project.dailyWordGoal ?? 500, language);
  return <AnalyticsView project={project} analytics={analytics} />;
}
