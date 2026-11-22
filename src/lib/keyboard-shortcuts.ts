export type ShortcutId =
  | "openStudio"
  | "focusSearch"
  | "saveScreenshot"
  | "toggleReaderFocus"
  | "cycleColorTheme"
  | "toggleDoNotDisturb"
  | "switchLanguage"
  | "toggleMenu"
  | "toggleMaximize"
  | "openPlanner"
  | "addBook"
  | "reload"
  | "quit"
  | "studioNewProject"
  | "studioOpenProject"
  | "studioToggleExplorer"
  | "studioToggleAssistant"
  | "studioToggleAssistantAlt"
  | "studioTogglePreview"
  | "studioRedoShift"
  | "studioFindReplace"
  | "studioJumpChapter"
  | "studioFocus"
  | "studioSave"
  | "studioUndo"
  | "studioRedo"
  | "studioShortcuts"
  | "closeDialog"
  | "readerToggleFocus"
  | "readerToggleTheme"
  | "readerToggleDirection"
  | "readerOpenSelection"
  | "readerExitFocus"
  | "readerToggleFocusF11"
  | "readerToggleFocusF"
  | "readerFirstPage"
  | "readerLastPage"
  | "readerNextSpread"
  | "readerPreviousSpread"
  | "readerPreviousPage"
  | "readerNextPage"
  | "pdfNextPage"
  | "pdfPreviousPage"
  | "coverUndo"
  | "coverRedo"
  | "coverRedoShift"
  | "coverDelete"
  | "coverMove"
  | "coverMoveFast";

type ShortcutDefinition = {
  label: string;
  display: string;
  key: string;
  code?: string;
  control?: "either" | "none";
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
};

const shortcutDefinitions: Record<ShortcutId, ShortcutDefinition> = {
  openStudio: { label: "Toggle Shelve Studio", display: "Ctrl + W", key: "w", control: "either" },
  focusSearch: { label: "Focus search", display: "Ctrl + S", key: "s", control: "either" },
  saveScreenshot: { label: "Save screenshot", display: "Ctrl + C", key: "c", control: "either" },
  toggleReaderFocus: { label: "Toggle reading focus mode", display: "Ctrl + F", key: "f", control: "either" },
  cycleColorTheme: { label: "Cycle color theme", display: "Ctrl + T", key: "t", control: "either" },
  toggleDoNotDisturb: { label: "Toggle Do Not Disturb", display: "Shift + A", key: "a", control: "none", shift: true },
  switchLanguage: { label: "Switch language", display: "Ctrl + Space", key: " ", code: "Space", control: "either" },
  toggleMenu: { label: "Toggle menu", display: "Ctrl + B", key: "b", control: "either" },
  toggleMaximize: { label: "Toggle maximize / restore", display: "Ctrl + M", key: "m", control: "either" },
  openPlanner: { label: "Toggle reading planner", display: "Ctrl + P", key: "p", control: "either" },
  addBook: { label: "Toggle upload window", display: "Ctrl + N", key: "n", control: "either" },
  reload: { label: "Reload", display: "Ctrl + R", key: "r", control: "either" },
  quit: { label: "Quit application", display: "Ctrl + Q", key: "q", control: "either" },
  studioNewProject: { label: "Toggle New Project window", display: "Ctrl + N", key: "n", control: "either" },
  studioOpenProject: { label: "Toggle project picker", display: "Ctrl + O", key: "o", control: "either" },
  studioToggleExplorer: { label: "Toggle Explorer", display: "Ctrl + B", key: "b", control: "either" },
  studioToggleAssistant: { label: "Toggle AI Co-Worker", display: "Ctrl + I / Ctrl + M", key: "i", control: "either" },
  studioToggleAssistantAlt: { label: "Toggle AI Co-Worker", display: "Ctrl + M", key: "m", control: "either" },
  studioTogglePreview: { label: "Toggle Book Preview", display: "Ctrl + Shift + P", key: "p", control: "either", shift: true },
  studioRedoShift: { label: "Redo", display: "Ctrl + Shift + Z", key: "z", control: "either", shift: true },
  studioFindReplace: { label: "Toggle Find & Replace in chapter", display: "Ctrl + F", key: "f", control: "either" },
  studioJumpChapter: { label: "Toggle chapter picker", display: "Ctrl + G", key: "g", control: "either" },
  studioFocus: { label: "Zen Focus Mode", display: "Ctrl + \\", key: "\\", control: "either" },
  studioSave: { label: "Force Save", display: "Ctrl + S", key: "s", control: "either" },
  studioUndo: { label: "Undo", display: "Ctrl + Z", key: "z", control: "either" },
  studioRedo: { label: "Redo", display: "Ctrl + Y / Ctrl + Shift + Z", key: "y", control: "either" },
  studioShortcuts: { label: "Toggle keyboard shortcuts", display: "?", key: "?", shift: true },
  closeDialog: { label: "Close dialogs / modals", display: "Esc", key: "Escape" },
  readerToggleFocus: { label: "Toggle reading focus mode", display: "Ctrl + F", key: "f", control: "either" },
  readerToggleTheme: { label: "Toggle reader theme", display: "Ctrl + T", key: "t", control: "either" },
  readerToggleDirection: { label: "Toggle reading direction", display: "Alt + A", key: "a", code: "KeyA", alt: true },
  readerOpenSelection: { label: "Open selection actions", display: "Ctrl + J", key: "j", control: "either" },
  readerExitFocus: { label: "Exit focus mode", display: "Esc", key: "Escape" },
  readerToggleFocusF11: { label: "Toggle reading focus mode", display: "F11", key: "F11" },
  readerToggleFocusF: { label: "Toggle reading focus mode", display: "F", key: "f" },
  readerFirstPage: { label: "Go to first page", display: "Home", key: "Home" },
  readerLastPage: { label: "Go to last page", display: "End", key: "End" },
  readerNextSpread: { label: "Turn forward two pages", display: "Space", key: " ", code: "Space" },
  readerPreviousSpread: { label: "Turn back two pages", display: "Shift + Space", key: " ", code: "Space", shift: true },
  readerPreviousPage: { label: "Previous page", display: "←", key: "ArrowLeft" },
  readerNextPage: { label: "Next page", display: "→", key: "ArrowRight" },
  pdfNextPage: { label: "Next page", display: "↓ / Page Down", key: "ArrowDown" },
  pdfPreviousPage: { label: "Previous page", display: "↑ / Page Up", key: "ArrowUp" },
  coverUndo: { label: "Undo", display: "Ctrl + Z", key: "z", control: "either" },
  coverRedo: { label: "Redo", display: "Ctrl + Y", key: "y", control: "either" },
  coverRedoShift: { label: "Redo", display: "Ctrl + Shift + Z", key: "z", control: "either", shift: true },
  coverDelete: { label: "Delete selected object", display: "Delete / Backspace", key: "Delete" },
  coverMove: { label: "Move selected object", display: "Arrow keys", key: "ArrowUp" },
  coverMoveFast: { label: "Move selected object faster", display: "Shift + Arrow keys", key: "ArrowUp", shift: true },
};

export const APP_SHORTCUTS: ShortcutId[] = [
  "openStudio", "focusSearch", "saveScreenshot", "toggleReaderFocus", "cycleColorTheme",
  "toggleDoNotDisturb", "switchLanguage", "toggleMenu", "toggleMaximize", "openPlanner",
  "addBook", "reload", "quit",
];

export const STUDIO_SHORTCUTS: ShortcutId[] = [
  "studioNewProject", "studioOpenProject", "studioToggleExplorer", "studioToggleAssistant",
  "studioUndo", "studioRedo",
  "studioFindReplace", "studioJumpChapter", "studioTogglePreview", "studioFocus",
  "studioSave", "closeDialog", "studioShortcuts",
];

export const READER_SHORTCUTS: ShortcutId[] = [
  "readerToggleFocus", "readerToggleTheme", "readerToggleDirection", "readerOpenSelection",
  "readerExitFocus", "readerToggleFocusF11", "readerToggleFocusF", "readerFirstPage",
  "readerLastPage", "readerNextSpread", "readerPreviousSpread", "readerPreviousPage",
  "readerNextPage", "pdfNextPage", "pdfPreviousPage",
];

export function shortcutLabel(id: ShortcutId): string {
  return shortcutDefinitions[id].label;
}

export function shortcutDisplay(id: ShortcutId): string {
  if (id === "switchLanguage" && /Linux/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent)) {
    return "Ctrl + L";
  }
  return shortcutDefinitions[id].display;
}

export function matchesShortcut(
  event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey">,
  id: ShortcutId,
): boolean {
  if (id === "switchLanguage" && /Linux/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent)) {
    return event.code !== "Space" && event.key.toLowerCase() === "l" &&
      event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
  }
  const definition = shortcutDefinitions[id];
  const keyMatches = definition.code
    ? event.code === definition.code
    : id === "pdfNextPage"
      ? event.key === "ArrowDown" || event.key === "PageDown"
    : id === "pdfPreviousPage"
      ? event.key === "ArrowUp" || event.key === "PageUp"
      : id === "coverDelete"
        ? event.key === "Delete" || event.key === "Backspace"
        : id === "coverMove" || id === "coverMoveFast"
          ? ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
          : definition.key === event.key || definition.key === event.key.toLowerCase();
  if (!keyMatches) return false;
  if (definition.control === "either" && !(event.ctrlKey || event.metaKey)) return false;
  if (definition.control !== "either" && (event.ctrlKey || event.metaKey)) return false;
  if (event.shiftKey !== (definition.shift ?? false)) return false;
  if (event.altKey !== (definition.alt ?? false)) return false;
  if (definition.meta !== undefined && event.metaKey !== definition.meta) return false;
  return true;
}
