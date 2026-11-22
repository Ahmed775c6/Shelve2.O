import { useEffect, useState } from "react";
import { WritingAnalyticsPage as AnalyticsView } from "../components/writing/WritingAnalyticsPage";
import { calculateWritingAnalytics } from "../studio/logic/writingAnalytics";
import { loadRecords } from "../lib/storage";
import type { WritingProject, WritingSession } from "../types";

export default function WritingAnalyticsRoutePage() {
  const [project, setProject] = useState<WritingProject | null>(null);
  const [sessions, setSessions] = useState<WritingSession[]>([]);

  useEffect(() => {
    void Promise.all([loadRecords("writings"), loadRecords("writingSessions")]).then(([projects, sessions]) => {
      setProject((projects as WritingProject[])[0] ?? null);
      setSessions(sessions as WritingSession[]);
    });
  }, []);

  if (!project) return <section className="writing-analytics"><header><h2>Writing analytics</h2><p>Create or open a project in Shelve Studio to view analytics.</p></header></section>;
  const analytics = calculateWritingAnalytics(sessions, project.id, project.dailyWordGoal ?? 500, document.documentElement.lang || "en");
  return <AnalyticsView project={project} analytics={analytics} />;
}
