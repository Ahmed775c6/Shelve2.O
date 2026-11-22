import {
  BookOpen, Clapperboard, FilePenLine, FileText, Film, Globe, LayoutList, Library, ListTree,
  MapPin, StickyNote, UserRound, Users, FolderKanban,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WritingChapter, WritingExplorerCategory, WritingPage, WritingPageKind } from "../../types";

export const EXPLORER_CATEGORY_ORDER: WritingExplorerCategory[] = ["outline", "writing", "characters", "world", "notes", "scenes", "research"];
export const EXPLORER_FOLDER_PICKER_LABELS: Record<WritingExplorerCategory, string> = {
  outline: "Outline",
  writing: "Manuscript",
  characters: "Characters",
  world: "World & Lore",
  notes: "Notes",
  scenes: "Scenes",
  research: "Research",
};
export const EXPLORER_FOLDER_MENU_LABELS: Record<WritingExplorerCategory, string> = {
  outline: "Outline Folder",
  writing: "Manuscript / Chapters",
  characters: "Characters Folder",
  world: "World & Lore Folder",
  notes: "Notes Folder",
  scenes: "Scenes / Script Folder",
  research: "Research Folder",
};
export const EXPLORER_FILE_PICKER_LABELS: Record<WritingExplorerCategory, string> = {
  outline: "Outline",
  writing: "Manuscript",
  characters: "Character",
  world: "Lore",
  notes: "Note",
  scenes: "Scene",
  research: "Research",
};
export const EXPLORER_MENU_ITEM_CLASS = "flex flex-row items-center gap-2.5 px-3 py-2 text-xs whitespace-nowrap cursor-pointer rounded-md";

export const EXPLORER_CATEGORIES: Record<WritingExplorerCategory, {
  label: string;
  folderTitle: string;
  fileTitlePrefix: string;
  extension: string;
  folderClass: string;
  fileClass: string;
  folderIcon: LucideIcon;
  fileIcon: LucideIcon;
  fileKind: WritingPageKind;
  starter: string;
}> = {
  writing: {
    label: "Manuscript / Chapters", folderTitle: "Chapter", fileTitlePrefix: "Page", extension: ".w", folderClass: "text-emerald-600 dark:text-emerald-400", fileClass: "text-blue-600 dark:text-blue-400",
    folderIcon: FolderKanban, fileIcon: FileText, fileKind: "page", starter: "",
  },
  characters: {
    label: "Characters", folderTitle: "Characters", fileTitlePrefix: "Character", extension: ".c", folderClass: "text-rose-600 dark:text-rose-400", fileClass: "text-rose-600 dark:text-rose-400",
    folderIcon: Users, fileIcon: UserRound, fileKind: "page",
    starter: "**Name:**\n**Role:**\n**Appearance:**\n**Personality:**\n**Motivation:**\n**Relationships:**\n",
  },
  scenes: {
    label: "Scenes / Script", folderTitle: "Scenes", fileTitlePrefix: "Scene", extension: ".s", folderClass: "text-purple-600 dark:text-purple-400", fileClass: "text-purple-600 dark:text-purple-400",
    folderIcon: Clapperboard, fileIcon: Film, fileKind: "scene",
    starter: "**INT./EXT. LOCATION - TIME**\n\n**Action:**\n\n**Dialogue:**\n",
  },
  notes: {
    label: "Notes", folderTitle: "Notes", fileTitlePrefix: "Note", extension: ".n", folderClass: "text-amber-600 dark:text-amber-400", fileClass: "text-amber-600 dark:text-amber-400",
    folderIcon: StickyNote, fileIcon: FilePenLine, fileKind: "note",
    starter: "**Note:**\n\n",
  },
  world: {
    label: "World & Lore", folderTitle: "World & Lore", fileTitlePrefix: "Lore", extension: ".l", folderClass: "text-teal-600 dark:text-teal-400", fileClass: "text-teal-600 dark:text-teal-400",
    folderIcon: Globe, fileIcon: MapPin, fileKind: "note",
    starter: "Name:\nOverview:\nRules:\nConnections:\n",
  },
  outline: {
    label: "Outline", folderTitle: "Outline", fileTitlePrefix: "Outline", extension: ".o", folderClass: "text-orange-600 dark:text-orange-400", fileClass: "text-orange-600 dark:text-orange-400",
    folderIcon: ListTree, fileIcon: LayoutList, fileKind: "note",
    starter: "Act I:\n- \n\nAct II:\n- \n\nAct III:\n- \n",
  },
  research: {
    label: "Research", folderTitle: "Research", fileTitlePrefix: "Research", extension: ".r", folderClass: "text-indigo-600 dark:text-indigo-400", fileClass: "text-indigo-600 dark:text-indigo-400",
    folderIcon: Library, fileIcon: BookOpen, fileKind: "note",
    starter: "Source:\nURL:\nNotes:\n\n",
  },
};

const FILE_EXTENSION_CATEGORIES: Record<string, WritingExplorerCategory> = {
  w: "writing",
  c: "characters",
  s: "scenes",
  n: "notes",
  l: "world",
  o: "outline",
  r: "research",
};

export function defaultExplorerCategory(kind: WritingPageKind): WritingExplorerCategory {
  return kind === "scene" ? "scenes" : kind === "note" ? "notes" : "writing";
}

export function normalizeExplorerCategory(value: unknown, fallback: WritingExplorerCategory = "writing"): WritingExplorerCategory {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EXPLORER_CATEGORIES, value)
    ? value as WritingExplorerCategory
    : fallback;
}

export function explorerFolderDisplayTitle(chapter: Pick<WritingChapter, "title" | "category">) {
  const category = normalizeExplorerCategory(chapter.category);
  const definition = EXPLORER_CATEGORIES[category];
  const normalizedTitle = chapter.title.trim().toLocaleLowerCase();
  const canonicalNames = [category, definition.folderTitle, definition.label].map((name) => name.toLocaleLowerCase());
  return canonicalNames.includes(normalizedTitle) ? definition.folderTitle : chapter.title;
}

export function parseExplorerFileTitle(title: string, fallbackCategory: WritingExplorerCategory) {
  const trimmedTitle = title.trim();
  const extension = trimmedTitle.match(/\.([wcsnlor])$/i)?.[1]?.toLowerCase();
  if (!extension) return { title: trimmedTitle, category: fallbackCategory };
  return {
    title: trimmedTitle.slice(0, -2).trimEnd(),
    category: FILE_EXTENSION_CATEGORIES[extension],
  };
}

export function explorerFilePresentation(page: Pick<WritingPage, "title" | "kind" | "category">) {
  const fallbackCategory = normalizeExplorerCategory(page.category, defaultExplorerCategory(page.kind));
  const parsed = parseExplorerFileTitle(page.title, fallbackCategory);
  const category = parsed.category;
  return {
    title: parsed.title || page.title,
    category,
    extension: EXPLORER_CATEGORIES[category].extension,
  };
}

export function explorerPageSearchText(page: Pick<WritingPage, "title" | "kind" | "category">) {
  const presentation = explorerFilePresentation(page);
  return `${presentation.title} ${presentation.extension} ${EXPLORER_CATEGORIES[presentation.category].label}`.toLowerCase();
}

export function isWritingChapter(value: unknown): value is WritingChapter {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string" &&
    "title" in value && typeof value.title === "string" &&
    "content" in value && typeof value.content === "string";
}

export function isWritingPage(value: unknown): value is WritingPage {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string" &&
    "title" in value && typeof value.title === "string" &&
    "content" in value && typeof value.content === "string" &&
    "kind" in value && (value.kind === "page" || value.kind === "scene" || value.kind === "note");
}

export function newChapter(index: number, category: WritingExplorerCategory = "writing"): WritingChapter {
  const folderTitle = EXPLORER_CATEGORIES[category].folderTitle;
  return {
    id: crypto.randomUUID(),
    title: category === "writing" || index > 1 ? `${folderTitle} ${index}` : folderTitle,
    category,
    content: "",
    updatedAt: new Date().toISOString(),
    pages: [],
  };
}

export function newWritingPage(kind: WritingPageKind, index = 1, category = defaultExplorerCategory(kind)): WritingPage {
  return {
    id: crypto.randomUUID(),
    title: `${EXPLORER_CATEGORIES[category].fileTitlePrefix} ${index}`,
    content: EXPLORER_CATEGORIES[category].starter,
    kind,
    category,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeWritingPages(values: unknown, fallbackUpdatedAt: string): WritingPage[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value): WritingPage[] => {
    if (isWritingPage(value)) {
      const fallbackCategory = normalizeExplorerCategory(value.category, defaultExplorerCategory(value.kind));
      const parsed = parseExplorerFileTitle(value.title, fallbackCategory);
      return [{
        ...value,
        title: parsed.title || value.title,
        category: parsed.category,
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : fallbackUpdatedAt,
      }];
    }
    if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "string" ||
      !("title" in value) || typeof value.title !== "string" || !("content" in value) || typeof value.content !== "string") return [];
    const updatedAt = "updatedAt" in value && typeof value.updatedAt === "string" ? value.updatedAt : fallbackUpdatedAt;
    const parsed = parseExplorerFileTitle(value.title, "writing");
    return [{ id: value.id, title: parsed.title || value.title, content: value.content, kind: "page", category: parsed.category, updatedAt }];
  });
}
