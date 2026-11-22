import { useEffect, useState } from "react";
import { WritingGoalsPage as GoalsView } from "../components/writing/WritingGoalsPage";
import { calculateWritingAnalytics } from "../studio/logic/writingAnalytics";
import { loadRecords, saveRecords, type StoredRecord } from "../lib/storage";
import type { WritingProject, WritingSession } from "../types";

export default function WritingGoalsRoutePage() {
  const [project, setProject] = useState<WritingProject | null>(null);
  const [sessions, setSessions] = useState<WritingSession[]>([]);

  useEffect(() => {
    void Promise.all([
      loadRecords("writings"),
      loadRecords("writingSessions"),
    ]).then(([projects, sessions]) => {
      setProject((projects as WritingProject[])[0] ?? null);
      setSessions(sessions as WritingSession[]);
    });
  }, []);

  const updateProject = (projectId: string, patch: Partial<WritingProject>) => {
    setProject((current) => {
      const next = current?.id === projectId ? { ...current, ...patch, updatedAt: new Date().toISOString() } : current;
      if (next) void saveRecords("writings", [next] as (WritingProject & StoredRecord)[]);
      return next;
    });
  };

  if (!project) return <section className="writing-analytics"><header><h2>Writing goals</h2><p>Create or open a project in Shelve Studio to set goals.</p></header></section>;
  const analytics = calculateWritingAnalytics(sessions, project.id, project.dailyWordGoal ?? 500, document.documentElement.lang || "en");
  return <GoalsView
    project={project}
    todayWords={analytics.todayWords}
    dailyGoal={project.dailyWordGoal ?? 500}
    dailyProgress={analytics.dailyProgress}
    onUpdateProject={updateProject}
  />;
}
