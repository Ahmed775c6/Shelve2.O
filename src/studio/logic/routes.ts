export function getStudioPageUrl(path: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = path.startsWith("/") ? path : `/${path}`;
  return url.toString();
}

export function openStudioPage(path: string): void {
  window.open(getStudioPageUrl(path), "_blank", "noopener,noreferrer");
}
