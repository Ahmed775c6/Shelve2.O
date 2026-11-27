import type { WritingProject } from "../../types";

export const STUDIO_ACTIVE_PROJECT_KEY = "shelve-studio-active-project-v1";

export function getActiveStudioProject(projects: WritingProject[]): WritingProject | null {
  const activeProjectId = window.sessionStorage.getItem(STUDIO_ACTIVE_PROJECT_KEY);
  if (activeProjectId === "") return null;
  return projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null;
}

export function getStudioPageUrl(path: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = path.startsWith("/") ? path : `/${path}`;
  return url.toString();
}

export function openStudioPage(path: string): void {
  window.open(getStudioPageUrl(path), "_blank", "noopener,noreferrer");
}
