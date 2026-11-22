import { useEffect, useRef } from "react";
import { matchesShortcut } from "../../lib/keyboard-shortcuts";

export type StudioMode = "write" | "preview";

interface StudioKeyboardShortcutOptions {
  studioMode: StudioMode;
  hasOpenDialogs: boolean;
  closeDialogs: () => void;
  showShortcuts: () => void;
  newProject: () => void;
  openProjectPicker: () => void;
  toggleExplorer: () => void;
  toggleAssistant: () => void;
  togglePreview: () => void;
  toggleFocus: () => void;
  forceSave: () => void;
  undo: () => void;
  redo: () => void;
  openFindReplace: () => void;
  openJumpToChapter: () => void;
  undoCover: () => void;
  redoCover: () => void;
}

export function useStudioKeyboardShortcuts(options: StudioKeyboardShortcutOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleStudioShortcut = (event: KeyboardEvent) => {
      const current = optionsRef.current;
      const target = event.target;
      const editing = target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
      if (matchesShortcut(event, "closeDialog")) {
        if (current.hasOpenDialogs) {
          event.preventDefault();
          current.closeDialogs();
        }
        return;
      }
      if (matchesShortcut(event, "studioShortcuts") && !editing) {
        event.preventDefault();
        current.showShortcuts();
        return;
      }
      if (matchesShortcut(event, "studioNewProject")) {
        event.preventDefault();
        current.newProject();
        return;
      }
      if (matchesShortcut(event, "studioOpenProject")) {
        event.preventDefault();
        current.openProjectPicker();
        return;
      }
      if (matchesShortcut(event, "studioToggleExplorer")) {
        event.preventDefault();
        current.toggleExplorer();
        return;
      }
      if (matchesShortcut(event, "studioToggleAssistant")) {
        event.preventDefault();
        current.toggleAssistant();
        return;
      }
      if (matchesShortcut(event, "studioToggleAssistantAlt") && current.studioMode === "write") {
        event.preventDefault();
        current.toggleAssistant();
        return;
      }
      if (matchesShortcut(event, "studioTogglePreview")) {
        event.preventDefault();
        current.togglePreview();
        return;
      }
      if (matchesShortcut(event, "studioRedoShift")) {
        event.preventDefault();
        current.redo();
        return;
      }
      if (matchesShortcut(event, "studioFindReplace")) {
        event.preventDefault();
        current.openFindReplace();
        return;
      }
      if (matchesShortcut(event, "studioJumpChapter")) {
        event.preventDefault();
        current.openJumpToChapter();
        return;
      }
      if (matchesShortcut(event, "studioFocus")) {
        event.preventDefault();
        current.toggleFocus();
        return;
      }
      if (matchesShortcut(event, "studioSave")) {
        event.preventDefault();
        current.forceSave();
        return;
      }
      if (matchesShortcut(event, "studioUndo")) {
        event.preventDefault();
        current.undo();
      } else if (matchesShortcut(event, "studioRedo")) {
        event.preventDefault();
        current.redo();
      }
    };

    window.addEventListener("keydown", handleStudioShortcut);
    return () => window.removeEventListener("keydown", handleStudioShortcut);
  }, []);
}
