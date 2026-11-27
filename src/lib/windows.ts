import { isTauri } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export type AuxiliaryWindow = "planner" | "edit-book" | "upload-book" | "studio" | "new-project";

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export async function openAuxiliaryWindow(kind: AuxiliaryWindow, bookId?: string): Promise<boolean> {
  if (!isTauri() || isMobile()) return false;
  if (kind === "edit-book" && !bookId) throw new Error("A book ID is required to open the editor.");

  const suffix = kind === "edit-book" ? `-${bookId!.replace(/[^a-zA-Z0-9_-]/g, "-")}` : "";
  const label = `${kind}${suffix}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    if (kind === "planner") await existing.setSize(new LogicalSize(700, 640));
    await existing.show();
    if (kind === "upload-book") await existing.center();
    await existing.setFocus();
    return true;
  }

  const query = new URLSearchParams({ window: kind });
  if (bookId) query.set("bookId", bookId);
  const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue("--bg-canvas").trim() || "#0B0C0E";
  const dimensions = kind === "studio"
    ? { width: 1000, height: 600, minWidth: 820, minHeight: 520, resizable: true, title: "Shelve Studio" }
    : kind === "new-project"
    ? { width: 780, height: 540, minWidth: 780, minHeight: 540, resizable: true, title: "Shelve — New Project" }
    : kind === "planner"
    ? { width: 900, height: 450, minWidth: 620, minHeight: 500, title: "Shelve — Reading planner" }
    : kind === "edit-book"
      ? { width: 600, height: 500, minWidth: 560, minHeight: 500, title: "Shelve — Edit book" }
      : { width: 800, height: 700, minWidth: 560, minHeight: 500, title: "Shelve — Add book" };

  const webview = new WebviewWindow(label, {
    url: kind === "studio" ? "/studio" : `/?${query.toString()}`,
    ...dimensions,
    center: true,
    visible: kind !== "upload-book",
    decorations: false,
    backgroundColor,
  });

  await new Promise<void>((resolve, reject) => {
    void webview.once("tauri://created", () => resolve()).catch(reject);
    void webview.once("tauri://error", (event) => {
      reject(new Error(`Could not open the ${kind.replace("-", " ")} window: ${String(event.payload ?? "unknown error")}`));
    }).catch(reject);
  });
  if (kind === "upload-book") {
    await webview.show();
    await webview.center();
  }
  await webview.setFocus();
  return true;
}

export async function toggleAuxiliaryWindow(kind: AuxiliaryWindow, bookId?: string): Promise<boolean> {
  if (!isTauri() || isMobile()) return false;
  if (kind === "edit-book" && !bookId) throw new Error("A book ID is required to open the editor.");
  const suffix = kind === "edit-book" ? `-${bookId!.replace(/[^a-zA-Z0-9_-]/g, "-")}` : "";
  const existing = await WebviewWindow.getByLabel(`${kind}${suffix}`);
  if (!existing) return openAuxiliaryWindow(kind, bookId);

  if (await existing.isVisible()) {
    await existing.close();
  } else {
    if (kind === "planner") await existing.setSize(new LogicalSize(700, 640));
    await existing.show();
    if (kind === "upload-book") await existing.center();
    await existing.setFocus();
  }
  return true;
}
