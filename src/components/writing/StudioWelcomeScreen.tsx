import { BookOpen, FilePlus2, FolderOpen, GraduationCap, PenLine, ScrollText, Theater } from "lucide-react";
import { useLanguage } from "../language-provider";
import type { WritingFormatType, WritingProject } from "../../types";

interface StudioWelcomeScreenProps {
  recentProjects: WritingProject[];
  onNewProject: (formatType?: WritingFormatType) => void;
  onOpenProject: (projectId: string) => void;
  onOpenFolder: () => void;
  onImportManuscript: () => void;
}

const templates: { format: WritingFormatType; title: string; description: string; icon: typeof BookOpen }[] = [
  { format: "Book / Novel", title: "Book / Novel", description: "Build a manuscript with chapters, characters, and lore.", icon: BookOpen },
  { format: "Short Story", title: "Short Story", description: "Shape a focused story from first beat to final line.", icon: PenLine },
  { format: "Play / Screenplay", title: "Play / Screenplay", description: "Develop a cast, beats, and scene-by-scene action.", icon: Theater },
  { format: "Course", title: "Course", description: "Organize a syllabus, lessons, exercises, and resources.", icon: GraduationCap },
];

export function StudioWelcomeScreen({
  recentProjects,
  onNewProject,
  onOpenProject,
  onOpenFolder,
  onImportManuscript,
}: StudioWelcomeScreenProps) {
  const { t, locale } = useLanguage();

  return (
    <section className="studio-welcome-screen">
      <header className="studio-welcome-heading">
        <span className="studio-welcome-mark"><BookOpen size={22} /></span>
        <div>
          <span className="studio-eyebrow">{t("YOUR CREATIVE WORKSPACE")}</span>
          <h1>{t("Shelve Studio")}</h1>
          <p>{t("Write, organize, and direct your stories from page to screen.")}</p>
        </div>
      </header>

      <div className="studio-welcome-columns">
        <div className="studio-welcome-start">
          <section className="studio-welcome-section">
            <h2>{t("Start")}</h2>
            <button type="button" className="studio-welcome-action" onClick={() => onNewProject()}>
              <span><FilePlus2 size={16} /></span>{t("New Project...")}
            </button>
            <button type="button" className="studio-welcome-action" onClick={onOpenFolder}>
              <span><FolderOpen size={16} /></span>{t("Open Folder...")}
            </button>
            <button type="button" className="studio-welcome-action" onClick={onImportManuscript}>
              <span><ScrollText size={16} /></span>{t("Import Manuscript (.md / .txt)")}
            </button>
          </section>

          <section className="studio-welcome-section studio-recent-projects">
            <h2>{t("Recent")}</h2>
            {recentProjects.length
              ? recentProjects.map((project) => {
                const lastOpenedAt = project.lastOpenedAt ?? project.updatedAt;
                const date = new Date(lastOpenedAt);
                const dateLabel = Number.isNaN(date.getTime())
                  ? ""
                  : date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
                return <button type="button" className="studio-recent-project" key={project.id} onClick={() => onOpenProject(project.id)}>
                  <span className="studio-recent-project-icon"><BookOpen size={16} /></span>
                  <span className="studio-recent-project-copy">
                    <strong>{project.title || t("Untitled story")}</strong>
                    <small>{t(project.formatType ?? "Book")} · {t(project.genre || "Literary Fiction")}</small>
                  </span>
                  <time dateTime={lastOpenedAt}>{dateLabel}</time>
                </button>;
              })
              : <p className="studio-welcome-empty-recent">{t("Your recent projects will appear here.")}</p>}
          </section>
        </div>

        <section className="studio-welcome-section studio-quick-start">
          <h2>{t("Quick Start Templates")}</h2>
          <div className="studio-template-grid">
            {templates.map(({ format, title, description, icon: Icon }) => <button
              type="button"
              className="studio-template-card"
              key={format}
              onClick={() => onNewProject(format)}
            >
              <span className="studio-template-icon"><Icon size={18} /></span>
              <strong>{t(title)}</strong>
              <small>{t(description)}</small>
            </button>)}
          </div>
        </section>
      </div>
    </section>
  );
}
