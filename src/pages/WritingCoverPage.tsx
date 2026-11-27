import { useEffect, useState } from "react";
import { FabricCoverCanvas } from "../components/FabricCoverCanvas";
import { loadRecords, saveRecords, type StoredRecord } from "../lib/storage";
import { getActiveStudioProject } from "../studio/logic/routes";
import { normalizeCoverDesign } from "../studio/logic/coverDesign";
import { COVER_TEMPLATES } from "../studio/logic/catalog";
import { useLanguage } from "../components/language-provider";
import type { WritingCoverDesign, WritingProject } from "../types";

export default function WritingCoverPage() {
  const { t } = useLanguage();
  const [projects, setProjects] = useState<WritingProject[]>([]);
  const project = getActiveStudioProject(projects);

  useEffect(() => {
    void loadRecords("writings").then((records) => setProjects(records as WritingProject[]));
  }, []);

  if (!project) return <section className="writing-analytics"><header><h2>{t("Cover Designer")}</h2><p>{t("Create or open a project in Shelve Studio to design its cover.")}</p></header></section>;
  const design = normalizeCoverDesign(project.coverDesign, project.title, project.subtitle, "", project.coverColor);

  const updateDesign = (patch: Partial<WritingCoverDesign>) => {
    const next = { ...project, coverDesign: { ...design, ...patch }, updatedAt: new Date().toISOString() };
    const updatedProjects = projects.map((item) => item.id === next.id ? next : item);
    setProjects(updatedProjects);
    void saveRecords("writings", updatedProjects as (WritingProject & StoredRecord)[])
      .catch((error: unknown) => console.error("Could not save the cover design:", error));
  };

  return (
    <section className="cover-studio-layout writing-cover-page">
      <aside className="cover-tool-panel">
        <header className="cover-tool-panel-header"><div><span className="studio-eyebrow">{t("COVER STUDIO")}</span><h2>{t("Templates")}</h2></div></header>
        <label className="studio-field">{t("Cover title")}<input value={design.title} onChange={(event) => updateDesign({ title: event.target.value })} /></label>
        <label className="studio-field">{t("Subtitle")}<input value={design.subtitle} onChange={(event) => updateDesign({ subtitle: event.target.value })} /></label>
        <div className="cover-template-grid">{COVER_TEMPLATES.slice(0, 12).map((template) => <button type="button" key={template.value} className={design.template === template.value ? "selected" : ""} aria-pressed={design.template === template.value} onClick={() => updateDesign({ template: template.value })}><span className="cover-template-card-label"><strong>{t(template.label)}</strong><small>{t(template.category)}</small></span></button>)}</div>
      </aside>
      <section className="cover-canvas-workspace">
        <div className="cover-stage"><FabricCoverCanvas
          projectId={project.id}
          side="front"
          design={design}
          title={design.title || project.title}
          synopsis={project.synopsis}
          author={design.author}
          backMockupUrl=""
          genre={project.genre}
          imageUrl=""
          mockupUrl=""
          mockupAutoRotate={true}
          onMockupAutoRotateChange={() => undefined}
          mockupAngleResetKey={0}
          onStateChange={() => undefined}
          onSelectionChange={() => undefined}
          onLayersChange={() => undefined}
          onHistoryChange={() => undefined}
          onPreviewChange={() => undefined}
          onBackPreviewChange={() => undefined}
          onError={() => undefined}
        /></div>
      </section>
    </section>
  );
}
