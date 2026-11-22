import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { NewProjectWizard, type NewProjectDraft } from "./NewProjectWizard";
import { loadRecords, saveRecords, type StoredRecord } from "../../lib/storage";
import { newProject } from "../../studio/logic/writingProject";
import { scaffoldWritingProject } from "../../lib/writing-scaffolds";
import { countProjectWords } from "../../studio/logic/writingDocument";
import type { WritingProject } from "../../types";

interface NewProjectWindowProps {
  userId: string;
  t: (value: string) => string;
}

export default function NewProjectWindow({ userId, t }: NewProjectWindowProps) {
  const [draft, setDraft] = useState<NewProjectDraft>({
    title: "untitled-story",
    formatType: "Book / Novel",
    genre: "Literary Fiction",
    targetWordGoal: "50000",
    starterEnabled: true,
    aiTemplatesEnabled: true,
  });
  const [error, setError] = useState("");

  const closeWindow = () => {
    if (isTauri()) {
      void getCurrentWindow().close();
    } else {
      window.close();
    }
  };

  const createProject = async () => {
    setError("");
    const target = draft.targetWordGoal.trim() ? Number(draft.targetWordGoal) : null;
    if (target !== null && (!Number.isFinite(target) || target <= 0)) {
      setError("Enter a positive word goal, or leave it blank.");
      return;
    }

    try {
      const existing = await loadRecords<WritingProject & StoredRecord>("writings");
      const project = scaffoldWritingProject(
        newProject(userId, { ...draft, targetWordGoal: target }),
        draft.formatType,
        { starterEnabled: draft.starterEnabled, aiTemplatesEnabled: draft.aiTemplatesEnabled },
      );
      project.wordCount = countProjectWords(project);
      await saveRecords("writings", [project, ...existing] as (WritingProject & StoredRecord)[]);
      closeWindow();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the project.");
    }
  };

  return (
    <main className="h-full w-full overflow-hidden bg-[color-mix(in_srgb,var(--bg-canvas)_72%,transparent)] backdrop-blur-xl">
      <div className="h-full w-full">
        {error && <p className="mb-2 border border-[var(--red)] bg-[color-mix(in_srgb,var(--red)_8%,var(--surface))] px-3 py-2 text-[11px] text-[var(--red)]">{error}</p>}
        <NewProjectWizard
          draft={draft}
          onChange={setDraft}
          onCancel={closeWindow}
          onCreate={() => void createProject()}
          t={t}
        />
      </div>
    </main>
  );
}
