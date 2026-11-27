import type { Dispatch, SetStateAction } from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Popover as BasePopover } from "@base-ui/react/popover";
import {
  DndContext, DragOverlay, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  BookOpen, BookPlus, ChevronDown, ChevronRight, ChevronsDownUp, FilePlus, FolderPlus, MoreHorizontal,
  MoveDown, MoveUp, PenLine, Plus, Search, Trash2,
} from "lucide-react";
import { Button } from "../ui/button";
import { SortableExplorerItem, explorerSortableId, type ExplorerDragType } from "./SortableExplorerItem";
import { useLanguage } from "../language-provider";
import {
  EXPLORER_CATEGORIES, EXPLORER_CATEGORY_ORDER, EXPLORER_FILE_PICKER_LABELS, EXPLORER_FOLDER_MENU_LABELS,
  EXPLORER_FOLDER_PICKER_LABELS, EXPLORER_MENU_ITEM_CLASS, explorerFilePresentation,
  explorerFolderDisplayTitle, explorerPageSearchText, normalizeExplorerCategory, parseExplorerFileTitle,
} from "../../studio/logic/explorer";
import type { WritingChapter, WritingExplorerCategory, WritingPage, WritingPageKind, WritingProject } from "../../types";

type RenameTarget = { type: "project" | "chapter" | "page"; id: string; projectId: string; chapterId?: string };
type ExplorerDragItem = { type: ExplorerDragType; category?: WritingExplorerCategory; title: string };
type CategorySetter = Dispatch<SetStateAction<WritingExplorerCategory>>;

interface ExplorerSidebarProps {
  activeChapter: WritingChapter | WritingPage | null;
  activeChapterId: string;
  activeExplorerDrag: ExplorerDragItem | null;
  activePageId: string;
  activeProject: WritingProject | null;
  activeProjectId: string;
  expandedChapters: Set<string>;
  expandedProjects: Set<string>;
  explorerCollisionDetection: CollisionDetection;
  explorerSensors: ReturnType<typeof useSensors>;
  fileNameEdited: boolean;
  filePickerOpen: boolean;
  folderNameEdited: boolean;
  folderPickerOpen: boolean;
  newFileCategory: WritingExplorerCategory;
  newFileName: string;
  newFolderCategory: WritingExplorerCategory;
  newFolderName: string;
  renameDraft: string;
  renameTarget: RenameTarget | null;
  search: string;
  selectedExplorerChapter: WritingChapter | null;
  visibleProjects: WritingProject[];
  onBeginRename: (target: RenameTarget, title: string) => void;
  onCreateChapter: (projectId: string, title?: string, category?: WritingExplorerCategory) => void;
  onCreatePage: (projectId: string, chapterId: string | null, kind?: WritingPageKind, title?: string, content?: string, category?: WritingExplorerCategory) => void;
  onCreateProject: () => void;
  onDefaultFileTitle: (project: WritingProject, chapter: WritingChapter | null, category: WritingExplorerCategory) => string;
  onDefaultFolderTitle: (project: WritingProject, category: WritingExplorerCategory) => string;
  onDragEnd: (event: DragEndEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDuplicateChapter: (projectId: string, chapterId: string) => void;
  onDuplicatePage: (projectId: string, pageId: string, chapterId: string | null) => void;
  onDuplicateProject: (projectId: string) => void;
  onFinishRename: () => void;
  onMoveChapter: (projectId: string, chapterId: string, offset: -1 | 1) => void;
  onOpenFilePicker: () => void;
  onOpenFolderPicker: () => void;
  onRemoveChapter: (projectId: string, chapterId: string) => void;
  onRemovePage: (projectId: string, pageId: string, chapterId: string | null) => void;
  onRemoveProject: (projectId: string) => void;
  onSelectDocument: (projectId: string, chapterId: string, pageId?: string) => void;
  onToggleChapter: (id: string) => void;
  onToggleProject: (id: string) => void;
  setActiveExplorerDrag: Dispatch<SetStateAction<ExplorerDragItem | null>>;
  setExpandedChapters: Dispatch<SetStateAction<Set<string>>>;
  setExpandedProjects: Dispatch<SetStateAction<Set<string>>>;
  setFileNameEdited: Dispatch<SetStateAction<boolean>>;
  setFilePickerOpen: Dispatch<SetStateAction<boolean>>;
  setFolderNameEdited: Dispatch<SetStateAction<boolean>>;
  setFolderPickerOpen: Dispatch<SetStateAction<boolean>>;
  setNewFileCategory: CategorySetter;
  setNewFileName: Dispatch<SetStateAction<string>>;
  setNewFolderCategory: CategorySetter;
  setNewFolderName: Dispatch<SetStateAction<string>>;
  setRenameDraft: Dispatch<SetStateAction<string>>;
  setRenameTarget: Dispatch<SetStateAction<RenameTarget | null>>;
  setSearch: Dispatch<SetStateAction<string>>;
}

const PopoverContent = BasePopover.Popup;
const DropdownMenuContent = BaseMenu.Popup;
const DropdownMenuItem = BaseMenu.Item;

export function ExplorerSidebar({
  activeChapter,
  activeChapterId,
  activeExplorerDrag,
  activePageId,
  activeProject,
  activeProjectId,
  expandedChapters,
  expandedProjects,
  explorerCollisionDetection,
  explorerSensors,
  fileNameEdited,
  filePickerOpen,
  folderNameEdited,
  folderPickerOpen,
  newFileCategory,
  newFileName,
  newFolderCategory,
  newFolderName,
  renameDraft,
  renameTarget,
  search,
  selectedExplorerChapter,
  visibleProjects,
  onBeginRename,
  onCreateChapter,
  onCreatePage,
  onCreateProject,
  onDefaultFileTitle,
  onDefaultFolderTitle,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDuplicateChapter,
  onDuplicatePage,
  onDuplicateProject,
  onFinishRename,
  onMoveChapter,
  onOpenFilePicker,
  onOpenFolderPicker,
  onRemoveChapter,
  onRemovePage,
  onRemoveProject,
  onSelectDocument,
  onToggleChapter,
  onToggleProject,
  setActiveExplorerDrag,
  setExpandedChapters,
  setExpandedProjects,
  setFileNameEdited,
  setFilePickerOpen,
  setFolderNameEdited,
  setFolderPickerOpen,
  setNewFileCategory,
  setNewFileName,
  setNewFolderCategory,
  setNewFolderName,
  setRenameDraft,
  setRenameTarget,
  setSearch,
}: ExplorerSidebarProps) {
  const { t, locale } = useLanguage();
  const activeDragCategory = activeExplorerDrag?.category ?? "writing";
  const ActiveDragIcon = !activeExplorerDrag ? null : activeExplorerDrag.type === "book"
    ? BookOpen
    : activeExplorerDrag.type === "chapter"
      ? EXPLORER_CATEGORIES[activeDragCategory].folderIcon
      : EXPLORER_CATEGORIES[activeDragCategory].fileIcon;
  const activeDragIconClass = activeExplorerDrag?.type === "book" ? "" : activeExplorerDrag?.type === "chapter"
    ? EXPLORER_CATEGORIES[activeDragCategory].folderClass
    : EXPLORER_CATEGORIES[activeDragCategory].fileClass;

  return (
    <aside className="studio-drafts-panel studio-explorer">
      <header className="studio-explorer-header">
        <strong>{t("EXPLORER")}</strong>
        <div className="studio-explorer-actions">
          <BasePopover.Root open={filePickerOpen} onOpenChange={(open) => {
            if (open) onOpenFilePicker();
            else setFilePickerOpen(false);
          }}>
            <BasePopover.Trigger type="button" title={t("New Page / File")} aria-label={t("New Page / File")}><FilePlus size={15} /></BasePopover.Trigger>
            {filePickerOpen && activeProject && <BasePopover.Portal>
              <BasePopover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-50">
                <PopoverContent className="w-72 p-3.5 z-50 bg-popover border border-border shadow-xl rounded-xl space-y-3 max-h-[calc(100dvh-24px)] overflow-y-auto" role="dialog" aria-label={t("New Page / File")}>
                  <form className="grid gap-3" onSubmit={(event) => {
                    event.preventDefault();
                    const title = newFileName.trim();
                    if (!title) return;
                    const category = parseExplorerFileTitle(title, newFileCategory).category;
                    onCreatePage(activeProject.id, selectedExplorerChapter?.id ?? null, EXPLORER_CATEGORIES[category].fileKind, title, "", newFileCategory);
                    setFilePickerOpen(false);
                  }}>
                    <strong className="text-sm font-semibold">{t("New File")}</strong>
                    <span className="text-xs font-medium text-foreground">{t("File Type")}</span>
                    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t("File Type")}>
                      {EXPLORER_CATEGORY_ORDER.map((category) => {
                        const definition = EXPLORER_CATEGORIES[category];
                        const Icon = definition.fileIcon;
                        return <button key={category} type="button" title={`${t(EXPLORER_FILE_PICKER_LABELS[category])} (${definition.extension})`} aria-pressed={newFileCategory === category} className={`flex flex-row items-center gap-2 px-2.5 py-1.5 text-xs rounded-md border text-left truncate ${newFileCategory === category ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50"}`} onClick={() => {
                          setNewFileCategory(category);
                          if (!fileNameEdited && activeProject) setNewFileName(onDefaultFileTitle(activeProject, selectedExplorerChapter, category));
                        }}>
                          <Icon className={`shrink-0 ${definition.fileClass}`} size={14} />
                          <span className="min-w-0 flex-1 truncate">{t(EXPLORER_FILE_PICKER_LABELS[category])}</span>
                          <code className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px]">{definition.extension}</code>
                        </button>;
                      })}
                    </div>
                    <label className="grid gap-1.5 text-xs font-medium text-foreground">{t("File Name")}
                      <input autoFocus className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" value={newFileName} onChange={(event) => {
                        const value = event.target.value;
                        setNewFileName(value);
                        setFileNameEdited(true);
                        const extension = value.trim().match(/\.([wcsnlor])$/i)?.[1]?.toLowerCase();
                        const detectedCategory = extension
                          ? EXPLORER_CATEGORY_ORDER.find((category) => EXPLORER_CATEGORIES[category].extension === `.${extension}`)
                          : undefined;
                        if (detectedCategory) setNewFileCategory(detectedCategory);
                      }} aria-label={t("File Name")} />
                    </label>
                    <Button type="submit" className="w-full" disabled={!newFileName.trim()}>{t("Create File")}</Button>
                  </form>
                </PopoverContent>
              </BasePopover.Positioner>
            </BasePopover.Portal>}
          </BasePopover.Root>
          <BasePopover.Root open={folderPickerOpen} onOpenChange={(open) => {
            if (open) onOpenFolderPicker();
            else setFolderPickerOpen(false);
          }}>
            <BasePopover.Trigger type="button" title={t("New Chapter / Folder")} aria-label={t("New Chapter / Folder")}><FolderPlus size={15} /></BasePopover.Trigger>
            {folderPickerOpen && activeProject && <BasePopover.Portal>
              <BasePopover.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-50">
                <PopoverContent className="w-72 p-3.5 z-50 bg-popover border border-border shadow-xl rounded-xl space-y-3 max-h-[calc(100dvh-24px)] overflow-y-auto" role="dialog" aria-label={t("New Chapter / Folder")}>
                  <form className="grid gap-3" onSubmit={(event) => {
                    event.preventDefault();
                    const title = newFolderName.trim();
                    if (!title) return;
                    onCreateChapter(activeProject.id, title, newFolderCategory);
                    setFolderPickerOpen(false);
                  }}>
                    <strong className="text-sm font-semibold">{t("New Folder")}</strong>
                    <span className="text-xs font-medium text-foreground">{t("Folder Type")}</span>
                    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t("Folder Type")}>
                      {EXPLORER_CATEGORY_ORDER.map((category) => {
                        const definition = EXPLORER_CATEGORIES[category];
                        const Icon = definition.folderIcon;
                        return <button key={category} type="button" title={t(EXPLORER_FOLDER_PICKER_LABELS[category])} aria-pressed={newFolderCategory === category} className={`flex flex-row items-center gap-2 px-2.5 py-1.5 text-xs rounded-md border text-left truncate ${newFolderCategory === category ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50"}`} onClick={() => {
                          setNewFolderCategory(category);
                          if (!folderNameEdited && activeProject) setNewFolderName(onDefaultFolderTitle(activeProject, category));
                        }}>
                          <Icon className={`shrink-0 ${definition.folderClass}`} size={14} />
                          <span className="min-w-0 flex-1 truncate">{t(EXPLORER_FOLDER_PICKER_LABELS[category])}</span>
                        </button>;
                      })}
                    </div>
                    <label className="grid gap-1.5 text-xs font-medium text-foreground">{t("Folder Name")}
                      <input autoFocus className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" value={newFolderName} onChange={(event) => { setNewFolderName(event.target.value); setFolderNameEdited(true); }} aria-label={t("Folder Name")} />
                    </label>
                    <Button type="submit" className="w-full" disabled={!newFolderName.trim()}>{t("Create Folder")}</Button>
                  </form>
                </PopoverContent>
              </BasePopover.Positioner>
            </BasePopover.Portal>}
          </BasePopover.Root>
          <button type="button" title={t("New Book / Project")} aria-label={t("New Book / Project")} onClick={onCreateProject}><BookPlus size={15} /></button>
          <button type="button" title={t("Collapse All")} aria-label={t("Collapse All")} onClick={() => { setExpandedProjects(new Set()); setExpandedChapters(new Set()); }}><ChevronsDownUp size={15} /></button>
        </div>
      </header>
      <label className="studio-explorer-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Filter files...")} aria-label={t("Filter files...")} /></label>
      <DndContext
        sensors={explorerSensors}
        collisionDetection={explorerCollisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveExplorerDrag(null)}
      >
        <SortableContext items={visibleProjects.map((project) => explorerSortableId("book", project.id))} strategy={verticalListSortingStrategy}>
          <div className="studio-project-list studio-explorer-tree" role="tree" aria-label={t("Project files")}>
            {visibleProjects.map((project) => {
              const query = search.trim().toLowerCase();
              const projectMatches = project.title.toLowerCase().includes(query);
              const matchingChapters = project.chapters.filter((chapter) => !query || projectMatches ||
                chapter.title.toLowerCase().includes(query) ||
                EXPLORER_CATEGORIES[normalizeExplorerCategory(chapter.category)].label.toLowerCase().includes(query) ||
                (chapter.pages ?? []).some((page) => explorerPageSearchText(page).includes(query)));
              const matchingProjectPages = (project.pages ?? []).filter((page) => !query || projectMatches || explorerPageSearchText(page).includes(query));
              const expanded = Boolean(query) || expandedProjects.has(project.id);
              return <SortableExplorerItem key={project.id} id={project.id} type="book" projectId={project.id} title={project.title || t("Untitled story")} className="studio-tree-project studio-sortable-project" expanded={expanded} selected={project.id === activeProjectId}>
                <div className={`studio-tree-row studio-tree-project-row ${project.id === activeProjectId && !activeChapter ? "active" : ""}`}>
                  <button type="button" className="studio-tree-disclosure" aria-label={expanded ? t("Collapse project") : t("Expand project")} aria-expanded={expanded} onClick={() => onToggleProject(project.id)}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                  {renameTarget?.type === "project" && renameTarget.id === project.id
                    ? <input autoFocus className="studio-tree-rename-input" aria-label={t("Rename book")} value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} onBlur={onFinishRename} onKeyDown={(event) => { if (event.key === "Enter") onFinishRename(); if (event.key === "Escape") setRenameTarget(null); }} />
                    : <button type="button" className="studio-tree-select" onDoubleClick={() => onBeginRename({ type: "project", id: project.id, projectId: project.id }, project.title)} onClick={() => onSelectDocument(project.id, project.chapters[0]?.id ?? "", project.chapters.length ? "" : project.pages?.[0]?.id ?? "")}><BookOpen size={14} style={{ color: project.coverColor }} /><span>{project.title || t("Untitled story")}</span><small>{project.wordCount.toLocaleString(locale)}</small></button>}
                  <div className="studio-tree-inline-actions">
                    <button type="button" title={t("New chapter")} aria-label={t("New chapter")} onClick={() => onCreateChapter(project.id)}><Plus size={13} /></button>
                    <button type="button" title={t("Rename")} aria-label={t("Rename")} onClick={() => onBeginRename({ type: "project", id: project.id, projectId: project.id }, project.title)}><PenLine size={12} /></button>
                    <button type="button" title={t("Delete")} aria-label={t("Delete")} onClick={() => onRemoveProject(project.id)}><Trash2 size={12} /></button>
                    <BaseMenu.Root>
                      <BaseMenu.Trigger type="button" title={t("More project actions")} aria-label={t("More project actions")} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><MoreHorizontal size={13} /></BaseMenu.Trigger>
                      <BaseMenu.Portal>
                        <BaseMenu.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-50">
                          <DropdownMenuContent className="w-56 p-1.5 z-50 bg-popover border border-border shadow-lg rounded-lg max-h-[min(60vh,360px)] overflow-y-auto">
                            <DropdownMenuItem className={EXPLORER_MENU_ITEM_CLASS} onClick={() => onCreatePage(project.id, null, "scene")}>{t("New Book Scene")}</DropdownMenuItem>
                            <DropdownMenuItem className={EXPLORER_MENU_ITEM_CLASS} onClick={() => onCreatePage(project.id, null, "note")}>{t("New Book Note")}</DropdownMenuItem>
                            {EXPLORER_CATEGORY_ORDER.map((category) => {
                              const definition = EXPLORER_CATEGORIES[category];
                              const Icon = definition.folderIcon;
                              return <DropdownMenuItem key={`folder-${category}`} className={EXPLORER_MENU_ITEM_CLASS} onClick={() => onCreateChapter(project.id, undefined, category)}><Icon className={`shrink-0 ${definition.folderClass}`} size={13} />{t(EXPLORER_FOLDER_MENU_LABELS[category])}</DropdownMenuItem>;
                            })}
                            {EXPLORER_CATEGORY_ORDER.map((category) => {
                              const definition = EXPLORER_CATEGORIES[category];
                              const Icon = definition.fileIcon;
                              return <DropdownMenuItem key={`file-${category}`} className={EXPLORER_MENU_ITEM_CLASS} onClick={() => onCreatePage(project.id, null, definition.fileKind, undefined, "", category)}><Icon className={`shrink-0 ${definition.fileClass}`} size={13} />{t(EXPLORER_FILE_PICKER_LABELS[category])} {t("File")} ({definition.extension})</DropdownMenuItem>;
                            })}
                            <DropdownMenuItem className={EXPLORER_MENU_ITEM_CLASS} onClick={() => onDuplicateProject(project.id)}>{t("Duplicate project")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </BaseMenu.Positioner>
                      </BaseMenu.Portal>
                    </BaseMenu.Root>
                  </div>
                </div>
                {expanded && <div className="studio-tree-children" role="group">
                  <SortableContext items={matchingChapters.map((chapter) => explorerSortableId("chapter", chapter.id))} strategy={verticalListSortingStrategy}>
                    {matchingChapters.map((chapter, index) => {
                      const chapterMatches = chapter.title.toLowerCase().includes(query);
                      const folderCategory = normalizeExplorerCategory(chapter.category);
                      const chapterExpanded = Boolean(query && (
                        projectMatches || chapterMatches ||
                        EXPLORER_CATEGORIES[folderCategory].label.toLowerCase().includes(query) ||
                        (chapter.pages ?? []).some((page) => explorerPageSearchText(page).includes(query))
                      )) || expandedChapters.has(chapter.id);
                      const matchingChapterPages = (chapter.pages ?? []).filter((page) => !query || projectMatches || chapterMatches || explorerPageSearchText(page).includes(query));
                      const FolderIcon = EXPLORER_CATEGORIES[folderCategory].folderIcon;
                      return <SortableExplorerItem key={chapter.id} id={chapter.id} type="chapter" projectId={project.id} category={folderCategory} title={explorerFolderDisplayTitle(chapter) || t("Untitled section")} className="studio-tree-branch studio-sortable-chapter" expanded={chapterExpanded} selected={project.id === activeProjectId && chapter.id === activeChapterId && !activePageId}>
                        <div className={`studio-tree-row studio-tree-chapter-row ${project.id === activeProjectId && chapter.id === activeChapterId && !activePageId ? "active" : ""}`}>
                          <button type="button" className="studio-tree-disclosure" aria-label={chapterExpanded ? t("Collapse chapter") : t("Expand chapter")} aria-expanded={chapterExpanded} onClick={() => onToggleChapter(chapter.id)}>{chapterExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
                          {renameTarget?.type === "chapter" && renameTarget.id === chapter.id
                            ? <input autoFocus className="studio-tree-rename-input" aria-label={t("Rename chapter")} value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} onBlur={onFinishRename} onKeyDown={(event) => { if (event.key === "Enter") onFinishRename(); if (event.key === "Escape") setRenameTarget(null); }} />
                            : <button type="button" className="studio-tree-select" onDoubleClick={() => onBeginRename({ type: "chapter", id: chapter.id, projectId: project.id }, chapter.title)} onClick={() => onSelectDocument(project.id, chapter.id)}><FolderIcon className={EXPLORER_CATEGORIES[folderCategory].folderClass} size={13} /><span>{explorerFolderDisplayTitle(chapter) || t("Untitled section")}</span></button>}
                          <div className="studio-tree-inline-actions">
                            <button type="button" title={t("New page")} aria-label={t("New page")} onClick={() => onCreatePage(project.id, chapter.id, "page")}><Plus size={13} /></button>
                            <button type="button" title={t("Rename")} aria-label={t("Rename")} onClick={() => onBeginRename({ type: "chapter", id: chapter.id, projectId: project.id }, chapter.title)}><PenLine size={12} /></button>
                            <button type="button" title={t("Delete")} aria-label={t("Delete")} disabled={project.chapters.length < 2} onClick={() => onRemoveChapter(project.id, chapter.id)}><Trash2 size={12} /></button>
                            <BaseMenu.Root>
                              <BaseMenu.Trigger type="button" title={t("More chapter actions")} aria-label={t("More chapter actions")} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><MoreHorizontal size={13} /></BaseMenu.Trigger>
                              <BaseMenu.Portal>
                                <BaseMenu.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-50">
                                  <DropdownMenuContent className="w-56 p-1.5 z-50 bg-popover border border-border shadow-lg rounded-lg max-h-[min(60vh,360px)] overflow-y-auto">
                                    <DropdownMenuItem className={EXPLORER_MENU_ITEM_CLASS} onClick={() => onDuplicateChapter(project.id, chapter.id)}>{t("Duplicate chapter")}</DropdownMenuItem>
                                    <DropdownMenuItem className={EXPLORER_MENU_ITEM_CLASS} onClick={() => onCreatePage(project.id, chapter.id, "scene", undefined, "", "scenes")}>{t("New Scene")} (.s)</DropdownMenuItem>
                                    <DropdownMenuItem className={EXPLORER_MENU_ITEM_CLASS} onClick={() => onCreatePage(project.id, chapter.id, "note", undefined, "", "notes")}>{t("New Note")} (.n)</DropdownMenuItem>
                                    {EXPLORER_CATEGORY_ORDER.map((category) => {
                                      const definition = EXPLORER_CATEGORIES[category];
                                      const Icon = definition.fileIcon;
                                      return <DropdownMenuItem key={`chapter-file-${category}`} className={EXPLORER_MENU_ITEM_CLASS} onClick={() => onCreatePage(project.id, chapter.id, definition.fileKind, undefined, "", category)}><Icon className={`shrink-0 ${definition.fileClass}`} size={13} />{t(EXPLORER_FILE_PICKER_LABELS[category])} {t("File")} ({definition.extension})</DropdownMenuItem>;
                                    })}
                                    <DropdownMenuItem className={EXPLORER_MENU_ITEM_CLASS} disabled={index === 0} onClick={() => onMoveChapter(project.id, chapter.id, -1)}><MoveUp size={12} />{t("Move up")}</DropdownMenuItem>
                                    <DropdownMenuItem className={EXPLORER_MENU_ITEM_CLASS} disabled={index === project.chapters.length - 1} onClick={() => onMoveChapter(project.id, chapter.id, 1)}><MoveDown size={12} />{t("Move down")}</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </BaseMenu.Positioner>
                              </BaseMenu.Portal>
                            </BaseMenu.Root>
                          </div>
                        </div>
                        {chapterExpanded && <SortableContext items={matchingChapterPages.map((page) => explorerSortableId("page", page.id))} strategy={verticalListSortingStrategy}>
                          {matchingChapterPages.map((page) => {
                            const presentation = explorerFilePresentation(page);
                            const FileIcon = EXPLORER_CATEGORIES[presentation.category].fileIcon;
                            return <SortableExplorerItem key={page.id} id={page.id} type="page" projectId={project.id} chapterId={chapter.id} category={presentation.category} title={presentation.title || t("Untitled page")} className={`studio-tree-row studio-tree-page-row studio-sortable-page ${activePageId === page.id && activeProjectId === project.id ? "active" : ""}`}>
                              {renameTarget?.type === "page" && renameTarget.id === page.id
                                ? <input autoFocus className="studio-tree-rename-input" aria-label={t("Rename page")} value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} onBlur={onFinishRename} onKeyDown={(event) => { if (event.key === "Enter") onFinishRename(); if (event.key === "Escape") setRenameTarget(null); }} />
                                : <button type="button" className="studio-tree-select" onDoubleClick={() => onBeginRename({ type: "page", id: page.id, projectId: project.id, chapterId: chapter.id }, page.title)} onClick={() => onSelectDocument(project.id, chapter.id, page.id)}><FileIcon className={EXPLORER_CATEGORIES[presentation.category].fileClass} size={13} /><span>{presentation.title || t("Untitled page")}</span><small className="studio-file-extension">{presentation.extension}</small></button>}
                              <div className="studio-tree-inline-actions">
                                <button type="button" title={t("Rename")} aria-label={t("Rename")} onClick={() => onBeginRename({ type: "page", id: page.id, projectId: project.id, chapterId: chapter.id }, page.title)}><PenLine size={12} /></button>
                                <button type="button" title={t("Delete")} aria-label={t("Delete")} onClick={() => onRemovePage(project.id, page.id, chapter.id)}><Trash2 size={12} /></button>
                                <BaseMenu.Root>
                                  <BaseMenu.Trigger type="button" title={t("More page actions")} aria-label={t("More page actions")} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><MoreHorizontal size={13} /></BaseMenu.Trigger>
                                  <BaseMenu.Portal><BaseMenu.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-50"><DropdownMenuContent className="w-56 p-1.5 z-50 bg-popover border border-border shadow-lg rounded-lg"><DropdownMenuItem className={EXPLORER_MENU_ITEM_CLASS} onClick={() => onDuplicatePage(project.id, page.id, chapter.id)}>{t("Duplicate page")}</DropdownMenuItem></DropdownMenuContent></BaseMenu.Positioner></BaseMenu.Portal>
                                </BaseMenu.Root>
                              </div>
                            </SortableExplorerItem>;
                          })}
                        </SortableContext>}
                      </SortableExplorerItem>;
                    })}
                  </SortableContext>
                  {matchingProjectPages.map((page) => {
                    const presentation = explorerFilePresentation(page);
                    const FileIcon = EXPLORER_CATEGORIES[presentation.category].fileIcon;
                    return <div className={`studio-tree-row studio-tree-page-row ${activePageId === page.id && activeProjectId === project.id ? "active" : ""}`} key={page.id} role="treeitem" aria-selected={activePageId === page.id && activeProjectId === project.id}>
                      <span className="studio-tree-disclosure-spacer" />
                      {renameTarget?.type === "page" && renameTarget.id === page.id
                        ? <input autoFocus className="studio-tree-rename-input" aria-label={t("Rename page")} value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} onBlur={onFinishRename} onKeyDown={(event) => { if (event.key === "Enter") onFinishRename(); if (event.key === "Escape") setRenameTarget(null); }} />
                        : <button type="button" className="studio-tree-select" onDoubleClick={() => onBeginRename({ type: "page", id: page.id, projectId: project.id }, page.title)} onClick={() => onSelectDocument(project.id, "", page.id)}><FileIcon className={EXPLORER_CATEGORIES[presentation.category].fileClass} size={13} /><span>{presentation.title || t("Untitled page")}</span><small className="studio-file-extension">{presentation.extension}</small></button>}
                      <div className="studio-tree-inline-actions">
                        <button type="button" title={t("Rename")} aria-label={t("Rename")} onClick={() => onBeginRename({ type: "page", id: page.id, projectId: project.id }, page.title)}><PenLine size={12} /></button>
                        <button type="button" title={t("Delete")} aria-label={t("Delete")} onClick={() => onRemovePage(project.id, page.id, null)}><Trash2 size={12} /></button>
                        <BaseMenu.Root>
                          <BaseMenu.Trigger type="button" title={t("More page actions")} aria-label={t("More page actions")} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><MoreHorizontal size={13} /></BaseMenu.Trigger>
                          <BaseMenu.Portal><BaseMenu.Positioner side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-50"><DropdownMenuContent className="w-56 p-1.5 z-50 bg-popover border border-border shadow-lg rounded-lg"><DropdownMenuItem className={EXPLORER_MENU_ITEM_CLASS} onClick={() => onDuplicatePage(project.id, page.id, null)}>{t("Duplicate page")}</DropdownMenuItem></DropdownMenuContent></BaseMenu.Positioner></BaseMenu.Portal>
                        </BaseMenu.Root>
                      </div>
                    </div>;
                  })}
                </div>}
              </SortableExplorerItem>;
            })}
            {visibleProjects.length === 0 && <p className="studio-empty-list">{t("No files match this filter.")}</p>}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeExplorerDrag && <div className="studio-tree-drag-overlay">{ActiveDragIcon && <ActiveDragIcon className={activeDragIconClass} size={14} />}<span>{activeExplorerDrag.title}</span></div>}
        </DragOverlay>
      </DndContext>
    </aside>
  );
}
