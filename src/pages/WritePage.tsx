import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter, KeyboardSensor, PointerSensor, pointerWithin,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  BookOpen, Check, ChevronRight, CircleHelp,
  Download, FileDown, FileText, FolderPlus, Globe2, Lock,
  Printer, Sparkles,
  WandSparkles, X,
  Eye,
} from "lucide-react";
import { PlainMarkdown } from "../components/writing/MarkdownContent";
import { AssistantSidebar } from "../components/writing/AssistantSidebar";
import { ExplorerSidebar } from "../components/writing/ExplorerSidebar";
import type { ExplorerDragData, ExplorerDragType } from "../components/writing/SortableExplorerItem";
import { StudioWelcomeScreen } from "../components/writing/StudioWelcomeScreen";
import { WritingEditorToolbar } from "../components/writing/WritingEditorToolbar";
import { NewProjectWizard, type NewProjectDraft } from "../components/writing/NewProjectWizard";
import { ErrorAlert } from "../components/error-feedback";
import { SyncStatusControl } from "../components/writing/SyncStatusControl";
import { DEFAULT_BACK_BLURB } from "../components/FabricCoverCanvas";
import { BookReaderPreview } from "./ReaderPage";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import type { PanelImperativeHandle } from "react-resizable-panels";
import type { StudioRecentProject, StudioTitlebarActions, StudioTitlebarUpdate } from "../components/TitleBar";
import { useLanguage } from "../components/language-provider";
import { loadRecords, saveRecords, type StoredRecord } from "../lib/storage";
import { sendAiRequest } from "../lib/cloud";
import {
  countProjectWords, countWords, editorHtmlForDocument, escapeHtml, estimatePages, markdownToRichHtml,
  paginateWritingText, plainTextToRichHtml, richHtmlToText, safeFilename, sanitizeRichHtml,
} from "../studio/logic/writingDocument";
import {
  EXPLORER_CATEGORIES, defaultExplorerCategory, explorerPageSearchText, isWritingChapter, isWritingPage, newChapter, newWritingPage,
  normalizeExplorerCategory, normalizeWritingPages, parseExplorerFileTitle,
} from "../studio/logic/explorer";
import { useStudioKeyboardShortcuts, type StudioMode } from "../studio/logic/keyboardShortcuts";
import { STUDIO_SHORTCUTS, shortcutDisplay, shortcutLabel } from "../lib/keyboard-shortcuts";
import {
  FONT_FAMILIES, FORMATS, LEGACY_WRITING_ID,
  PAPER_COLORS, PAPER_STYLES, WRITING_COLORS,
} from "../studio/logic/catalog";
import {
  isWritingCoverDesign, normalizeCoverDesign,
} from "../studio/logic/coverDesign";
import { isWritingSession, newProject } from "../studio/logic/writingProject";
import { getAiText } from "../studio/logic/aiResponse";
import type { AssistantConversation, AssistantMessage, AssistantTool } from "../studio/logic/assistant";
import { scaffoldWritingProject } from "../lib/writing-scaffolds";
import { openStudioPage } from "../studio/logic/routes";
import { openAuxiliaryWindow, toggleAuxiliaryWindow } from "../lib/windows";
import type { Book, StorageMode, WritingChapter, WritingExplorerCategory, WritingFontFamily, WritingFormatType, WritingPage, WritingPageKind, WritingPageSize, WritingPaperStyle, WritingProject, WritingSession } from "../types";

type TextSelection = { start: number; end: number; text: string };
type RenameTarget = { type: "project" | "chapter" | "page"; id: string; projectId: string; chapterId?: string };
type ExplorerDragItem = { type: ExplorerDragType; category?: WritingExplorerCategory; title: string };

const parseExplorerSortableId = (id: string | number): { type: ExplorerDragType; itemId: string } | null => {
  const value = String(id);
  const separator = value.indexOf("-");
  if (separator <= 0) return null;
  const type = value.slice(0, separator);
  const itemId = value.slice(separator + 1);
  if (!itemId || (type !== "book" && type !== "chapter" && type !== "page")) return null;
  return { type, itemId };
};

const explorerCollisionDetection: CollisionDetection = (args) => {
  const active = args.active.data.current as ExplorerDragData | undefined;
  if (!active) return [];
  const candidates = args.droppableContainers.filter((container) => {
    const target = container.data.current as ExplorerDragData | undefined;
    if (!target) return false;
    if (active.type === "book") return target.type === "book";
    if (active.type === "chapter") return target.type === "chapter" && target.projectId === active.projectId;
    return target.projectId === active.projectId &&
      (target.type === "chapter" || (target.type === "page" && Boolean(target.chapterId)));
  });
  const pointerCollisions = pointerWithin({ ...args, droppableContainers: candidates });
  if (active.type === "page") {
    const pageCollisions = pointerCollisions.filter((collision) =>
      (args.droppableContainers.find((container) => container.id === collision.id)?.data.current as ExplorerDragData | undefined)?.type === "page",
    );
    if (pageCollisions.length) return pageCollisions;
  }
  return pointerCollisions.length ? pointerCollisions : closestCenter({ ...args, droppableContainers: candidates });
};

const isCompactStudioViewport = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;

export interface WritePageProps {
  value: string;
  onChange: (value: string) => void;
  token?: string | null;
  userId?: string;
  authorName?: string;
  storageMode?: StorageMode;
  onAddBook?: (book: Book) => void | Promise<void>;
  onBeforeWorkspaceChange?: () => Promise<boolean>;
  onStudioToolbarChange?: (update: StudioTitlebarUpdate) => void;
}

export default function WritePage({
  value,
  token = null,
  userId = "local",
  authorName = "Shelve reader",
  storageMode = "offline",
  onAddBook,
  onBeforeWorkspaceChange,
  onStudioToolbarChange,
}: WritePageProps) {
  const { t, locale, language } = useLanguage();
  const previewDirection = language === "ar" ? "rtl" : "ltr";
  const [projects, setProjects] = useState<WritingProject[]>([]);
  const projectsRef = useRef<WritingProject[]>([]);
  const saveTimer = useRef<number | null>(null);
  const sessionSaveTimer = useRef<number | null>(null);
  const sessionHeartbeatTimer = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const editorRef = useRef<HTMLDivElement>(null);
  const editorRangeRef = useRef<Range | null>(null);
  const editorDocumentIdRef = useRef("");
  const manuscriptInputRef = useRef<HTMLInputElement>(null);
  const activeSessionRef = useRef<WritingSession | null>(null);
  const writingSessionsRef = useRef<WritingSession[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [activeChapterId, setActiveChapterId] = useState("");
  const [activePageId, setActivePageId] = useState("");
  const [studioMode, setStudioMode] = useState<StudioMode>("write");
  const [search, setSearch] = useState("");
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [newFolderCategory, setNewFolderCategory] = useState<WritingExplorerCategory>("writing");
  const [newFileCategory, setNewFileCategory] = useState<WritingExplorerCategory>("writing");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [folderNameEdited, setFolderNameEdited] = useState(false);
  const [fileNameEdited, setFileNameEdited] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [activeExplorerDrag, setActiveExplorerDrag] = useState<ExplorerDragItem | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [leftOpen, setLeftOpen] = useState(() => !isCompactStudioViewport());
  const [rightOpen, setRightOpen] = useState(() => !isCompactStudioViewport());
  const [welcomeLeftOpen, setWelcomeLeftOpen] = useState(false);
  const [welcomeRightOpen, setWelcomeRightOpen] = useState(false);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [readerPreviewOpen, setReaderPreviewOpen] = useState(false);
  const [paperSettingsOpen, setPaperSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [creationDraft, setCreationDraft] = useState<NewProjectDraft>({
    title: "untitled-story",
    formatType: "Book / Novel",
    genre: "Literary Fiction",
    targetWordGoal: "50000",
    starterEnabled: true,
    aiTemplatesEnabled: true,
  });
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [jumpOpen, setJumpOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"assistant" | "settings">("assistant");
  const [assistantTool, setAssistantTool] = useState<AssistantTool>("continue");
  const [assistantContextScope, setAssistantContextScope] = useState<"selection" | "page" | "chapter" | "book">("page");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const assistantMessagesRef = useRef<AssistantMessage[]>([]);
  const assistantRangesRef = useRef(new Map<string, Range>());
  const [assistantChatId, setAssistantChatId] = useState<string>(() => crypto.randomUUID());
  const [assistantHistory, setAssistantHistory] = useState<AssistantConversation[]>([]);
  const [assistantHistoryOpen, setAssistantHistoryOpen] = useState(false);
  const skipProjectChatResetRef = useRef(false);
  const assistantThreadRef = useRef<HTMLDivElement>(null);
  const assistantComposerRef = useRef<HTMLTextAreaElement>(null);
  const [assistantDraft, setAssistantDraft] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [editorZoom, setEditorZoom] = useState(100);
  const [rulerVisible, setRulerVisible] = useState(false);
  const [printLayout, setPrintLayout] = useState(true);
  const [editorStatsOpen, setEditorStatsOpen] = useState(false);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [saveState, setSaveState] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [savedAt, setSavedAt] = useState("");
  const [storageError, setStorageError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [loadingError, setLoadingError] = useState("");
  const initialValue = useRef(value);
  const compactViewportRef = useRef(isCompactStudioViewport());
  const explorerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const handleViewportChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const enteringCompact = event.matches;
      if (enteringCompact === compactViewportRef.current) return;

      compactViewportRef.current = enteringCompact;
      if (enteringCompact) {
        setLeftOpen(false);
        setRightOpen(false);
        setWelcomeLeftOpen(false);
        setWelcomeRightOpen(false);
      } else {
        setLeftOpen(true);
        setRightOpen(true);
      }
    };

    handleViewportChange(mediaQuery);
    mediaQuery.addEventListener("change", handleViewportChange);
    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const explorerPanelRequested = activeProject ? leftOpen : welcomeLeftOpen;
  const assistantPanelRequested = activeProject ? rightOpen : welcomeRightOpen;
  const explorerSidebarOpen = activeProject
    ? leftOpen && !isLeftCollapsed
    : welcomeLeftOpen && !isLeftCollapsed;
  const assistantSidebarOpen = activeProject
    ? rightOpen && !isRightCollapsed
    : welcomeRightOpen && !isRightCollapsed;
  const toggleExplorerSidebar = useCallback(() => {
    if (!activeProjectId) {
      if (welcomeLeftOpen && !isLeftCollapsed) setWelcomeLeftOpen(false);
      else {
        setIsLeftCollapsed(false);
        setWelcomeLeftOpen(true);
      }
      return;
    }
    if (!leftOpen) {
      setIsLeftCollapsed(false);
      setLeftOpen(true);
    } else if (isLeftCollapsed) {
      leftPanelRef.current?.expand();
    } else {
      setLeftOpen(false);
    }
  }, [activeProjectId, isLeftCollapsed, leftOpen, welcomeLeftOpen]);
  const toggleAssistantSidebar = useCallback(() => {
    if (!activeProjectId) {
      if (welcomeRightOpen && !isRightCollapsed) setWelcomeRightOpen(false);
      else {
        setIsRightCollapsed(false);
        setWelcomeRightOpen(true);
      }
      return;
    }
    if (!rightOpen) {
      setIsRightCollapsed(false);
      setRightOpen(true);
    } else if (isRightCollapsed) {
      rightPanelRef.current?.expand();
    } else {
      setRightOpen(false);
    }
  }, [activeProjectId, isRightCollapsed, rightOpen, welcomeRightOpen]);
  const orderedProjects = [...projects]
    .sort((left, right) =>
      (Date.parse(right.lastOpenedAt ?? right.updatedAt) || 0) - (Date.parse(left.lastOpenedAt ?? left.updatedAt) || 0),
    );
  const recentProjects: StudioRecentProject[] = orderedProjects
    .slice(0, 8)
    .map(({ id, title, formatType, genre }) => ({ id, title, formatType, genre }));
  const activePage = activeProject
    ? activeProject.pages?.find((page) => page.id === activePageId)
      ?? activeProject.chapters.flatMap((chapter) => chapter.pages ?? []).find((page) => page.id === activePageId)
      ?? null
    : null;
  const activePageParentChapter = activePage
    ? activeProject?.chapters.find((chapter) => chapter.pages?.some((page) => page.id === activePage.id)) ?? null
    : null;
  const activeChapter = activePage
    ?? activeProject?.chapters.find((chapter) => chapter.id === activeChapterId)
    ?? activeProject?.chapters[0]
    ?? null;
  const activeDocumentParentChapter = activePageParentChapter
    ?? (activePage ? null : activeProject?.chapters.find((chapter) => chapter.id === activeChapter?.id) ?? null);
  const selectedExplorerChapter = activePage
    ? activePageParentChapter
    : activeProject?.chapters.find((chapter) => chapter.id === activeChapterId) ?? null;
  const words = activeProject ? countProjectWords(activeProject) : 0;
  const activeDocumentWords = countWords(activeChapter?.content ?? "");
  const activeDocumentCharacters = (activeChapter?.content ?? "").length;
  useEffect(() => {
    if (skipProjectChatResetRef.current) {
      skipProjectChatResetRef.current = false;
      return;
    }
    assistantMessagesRef.current = [];
    setAssistantMessages([]);
  }, [activeProjectId]);

  useEffect(() => {
    if (activePage && !activePageParentChapter && assistantContextScope === "chapter") setAssistantContextScope("page");
    if (assistantContextScope === "selection" && !selection) setAssistantContextScope("page");
  }, [activePage, activePageParentChapter, assistantContextScope, selection]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeChapter) return;
    const html = editorHtmlForDocument(activeChapter);
    if (editor.innerHTML !== html) editor.innerHTML = html;
    editorDocumentIdRef.current = activeChapter.id;
  }, [activeChapter?.id]);

  useEffect(() => {
    if (!assistantMessages.length || !activeProject) return;
    const existing = assistantMessages.find((message) => message.role === "user");
    const conversationProjectId = existing?.projectId ?? activeProject.id;
    const conversationProject = projects.find((project) => project.id === conversationProjectId);
    const conversation: AssistantConversation = {
      id: assistantChatId,
      projectId: conversationProjectId,
      projectTitle: conversationProject?.title ?? activeProject.title,
      title: (existing?.text || t("New chat")).slice(0, 64),
      messages: assistantMessages,
    };
    setAssistantHistory((current) => [conversation, ...current.filter((item) => item.id !== assistantChatId)].slice(0, 30));
  }, [assistantChatId, assistantMessages, activeProject?.id, activeProject?.title, projects, t]);

  useEffect(() => {
    assistantThreadRef.current?.scrollTo({ top: assistantThreadRef.current.scrollHeight, behavior: "smooth" });
  }, [assistantMessages, assistantBusy]);

  const persistSnapshot = useCallback((snapshot: WritingProject[]): Promise<boolean> => {
    setSaveState("saving");
    setStorageError("");
    const save = saveQueue.current.then(async () => {
      await saveRecords("writings", snapshot as (WritingProject & StoredRecord)[]);
      setSavedAt(new Date().toISOString());
      setSaveState("saved");
      return true;
    }).catch((error: unknown) => {
      console.error("Could not save writing projects:", error);
      setStorageError(error instanceof Error ? error.message : "Could not save your writing.");
      setSaveState("error");
      return false;
    });
    saveQueue.current = save.then(() => undefined);
    return save;
  }, []);

  const commitProjects = useCallback((next: WritingProject[], immediate = false): Promise<boolean> | undefined => {
    projectsRef.current = next;
    setProjects(next);
    setSaveState("saving");
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    if (immediate) {
      return persistSnapshot(next);
    } else {
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        void persistSnapshot(next);
      }, 1500);
    }
  }, [persistSnapshot]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      setLoadingError("");
      try {
        const records = await loadRecords<StoredRecord & Partial<WritingProject> & { content?: string; title?: string }>("writings");
        const [sessionRecords] = await Promise.all([loadRecords<StoredRecord & Partial<WritingSession>>("writingSessions")]);
        const needsNormalization = records.some((record) =>
          !Array.isArray(record.chapters) || !record.chapters.every(isWritingChapter) ||
          record.pages !== undefined && (!Array.isArray(record.pages) || !record.pages.every(isWritingPage)) ||
          Array.isArray(record.chapters) && record.chapters.some((chapter) =>
            !isWritingChapter(chapter) || chapter.pages !== undefined && (!Array.isArray(chapter.pages) || !chapter.pages.every(isWritingPage)),
          ) ||
          !record.formatType || !record.paperStyle || !record.paperColor || !record.fontFamily ||
          !isWritingCoverDesign(record.coverDesign) || !record.coverDesign.layers?.length,
        );
        const restored = records.map((record) => {
          const { content: legacyContent, ...recordFields } = record;
          const legacyRecord = !Array.isArray(record.chapters) || !record.chapters.every(isWritingChapter);
          const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString();
          const chapters = Array.isArray(record.chapters)
            ? record.chapters.filter(isWritingChapter).map((chapter) => ({
              ...chapter,
              category: normalizeExplorerCategory(chapter.category),
              updatedAt: typeof chapter.updatedAt === "string" ? chapter.updatedAt : updatedAt,
              pages: normalizeWritingPages(chapter.pages, updatedAt),
            }))
            : [];
          const normalizedChapters = chapters.length ? chapters : [{
              id: crypto.randomUUID(),
              title: "Untitled section",
              content: typeof legacyContent === "string" ? legacyContent : "",
              category: "writing" as const,
              updatedAt,
              pages: [],
            }];
          const pages = normalizeWritingPages(record.pages, updatedAt);
          return {
            ...recordFields,
            ...(legacyRecord ? { content: "" } : {}),
            id: record.id,
            userId: typeof record.userId === "string" ? record.userId : userId,
            title: typeof record.title === "string" ? record.title : "Untitled story",
            subtitle: typeof record.subtitle === "string" ? record.subtitle : "",
            synopsis: typeof record.synopsis === "string" ? record.synopsis : "",
            genre: typeof record.genre === "string" ? record.genre : "Literary fiction",
            coverColor: typeof record.coverColor === "string" ? record.coverColor : WRITING_COLORS[0],
            formatType: FORMATS.find((format) => format === record.formatType) ?? "Book",
            targetWordGoal: typeof record.targetWordGoal === "number" ? record.targetWordGoal : undefined,
            dailyWordGoal: typeof record.dailyWordGoal === "number" ? record.dailyWordGoal : 500,
            paperStyle: PAPER_STYLES.find((style) => style.value === record.paperStyle)?.value ?? "editorial",
            paperColor: PAPER_COLORS.find((paper) => paper.value === record.paperColor)?.value ?? "#FDF6E3",
            fontFamily: FONT_FAMILIES.find((font) => font.value === record.fontFamily)?.value ?? "editorial",
            fontSize: typeof record.fontSize === "number" ? Math.min(22, Math.max(14, record.fontSize)) : 18,
            lineSpacing: typeof record.lineSpacing === "number" ? Math.min(2.4, Math.max(1.2, record.lineSpacing)) : 1.8,
            coverDesign: normalizeCoverDesign(
              record.coverDesign,
              typeof record.title === "string" ? record.title : "Untitled story",
              typeof record.subtitle === "string" ? record.subtitle : "",
              authorName,
              typeof record.coverColor === "string" ? record.coverColor : "#0D3B44",
            ),
            visibility: record.visibility === "public" ? "public" as const : "personal" as const,
            chapters: normalizedChapters,
            pages,
            wordCount: countProjectWords({ chapters: normalizedChapters, pages }),
            updatedAt,
            lastOpenedAt: typeof record.lastOpenedAt === "string" ? record.lastOpenedAt : undefined,
          } as WritingProject;
        });
        const wordCountsNeedSync = restored.some((project, index) => records[index]?.wordCount !== project.wordCount);

        if (restored.length === 0) {
          if (initialValue.current.trim()) {
            const project = newProject(userId, { title: "Untitled story", formatType: "Short Story", genre: "Literary Fiction", targetWordGoal: null });
            project.id = LEGACY_WRITING_ID;
            project.chapters[0].content = initialValue.current;
            project.wordCount = countWords(initialValue.current);
            restored.push(project);
            await saveRecords("writings", restored as (WritingProject & StoredRecord)[]);
          }
        } else if (needsNormalization || wordCountsNeedSync) {
          await saveRecords("writings", restored as (WritingProject & StoredRecord)[]);
        }
        if (!active) return;
        const sessions = sessionRecords.filter(isWritingSession);
        writingSessionsRef.current = sessions;
        activeSessionRef.current = sessions.find((session) => session.date === new Date().toISOString().slice(0, 10)) ?? null;
        projectsRef.current = restored;
        setProjects(restored);
        setActiveProjectId(restored[0]?.id ?? "");
        setActiveChapterId(restored[0]?.chapters[0]?.id ?? "");
        setActivePageId("");
        setExpandedProjects(new Set(restored.map((project) => project.id)));
        setExpandedChapters(new Set(restored.flatMap((project) => project.chapters.map((chapter) => chapter.id))));
        setSavedAt(new Date().toISOString());
        setSaveState("saved");
      } catch (error) {
        console.error("Could not load writing projects:", error);
        if (active) {
          setLoadingError(error instanceof Error ? error.message : "Could not load your writing.");
          setSaveState("error");
        }
      }
    };
    void initialize();
    const refreshProjects = () => { void initialize(); };
    window.addEventListener("shelve:cloud-refresh", refreshProjects);
    return () => {
      window.removeEventListener("shelve:cloud-refresh", refreshProjects);
      active = false;
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (projectsRef.current.length) void persistSnapshot(projectsRef.current);
      }
      if (sessionSaveTimer.current !== null) window.clearTimeout(sessionSaveTimer.current);
      if (sessionHeartbeatTimer.current !== null) window.clearInterval(sessionHeartbeatTimer.current);
      if (writingSessionsRef.current.length) {
        void saveRecords("writingSessions", writingSessionsRef.current as (WritingSession & StoredRecord)[]).catch((error: unknown) => {
          console.error("Could not save writing analytics before closing:", error);
        });
      }
    };
  }, [persistSnapshot, userId]);

  useEffect(() => {
    document.documentElement.classList.toggle("writing-focus-mode", focusMode);
    return () => document.documentElement.classList.remove("writing-focus-mode");
  }, [focusMode]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useStudioKeyboardShortcuts({
    studioMode,
    hasOpenDialogs: projectDialogOpen || projectPickerOpen || findReplaceOpen || jumpOpen || shortcutsOpen || publishOpen || exportOpen || readerPreviewOpen,
    closeDialogs: () => {
      setProjectDialogOpen(false);
      setProjectPickerOpen(false);
      setFindReplaceOpen(false);
      setJumpOpen(false);
      setShortcutsOpen(false);
      setPublishOpen(false);
      setExportOpen(false);
      setReaderPreviewOpen(false);
    },
    showShortcuts: () => setShortcutsOpen((open) => !open),
    newProject: () => {
      setCreationDraft({
        title: "untitled-story",
        formatType: "Book / Novel",
        genre: "Literary Fiction",
        targetWordGoal: "50000",
        starterEnabled: true,
        aiTemplatesEnabled: true,
      });
      void toggleAuxiliaryWindow("new-project").then((opened) => {
        if (!opened) setProjectDialogOpen((open) => !open);
      }).catch(() => setProjectDialogOpen((open) => !open));
    },
    openProjectPicker: () => setProjectPickerOpen((open) => !open),
    toggleExplorer: toggleExplorerSidebar,
    toggleAssistant: toggleAssistantSidebar,
    togglePreview: () => {
      setStudioMode(previewMode ? "write" : "preview");
      setPreviewMode((current) => !current);
    },
    toggleFocus: () => setFocusMode((focused) => !focused),
    forceSave: () => { void persistSnapshot(projectsRef.current); },
    undo: () => {
      editorRef.current?.focus();
      document.execCommand("undo");
    },
    redo: () => {
      editorRef.current?.focus();
      document.execCommand("redo");
    },
    openFindReplace: () => setFindReplaceOpen((open) => !open),
    openJumpToChapter: () => setJumpOpen((open) => !open),
    undoCover: () => undefined,
    redoCover: () => undefined,
  });

  const updateProject = (projectId: string, patch: Partial<WritingProject>) => {
    const next = projectsRef.current.map((project) => project.id === projectId ? {
      ...project,
      ...patch,
      wordCount: countProjectWords({ ...project, ...patch }),
      updatedAt: new Date().toISOString(),
    } : project);
    commitProjects(next);
  };

  const updateDocument = (projectId: string, documentId: string, patch: Partial<WritingChapter & WritingPage>) => {
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) return;
    const now = new Date().toISOString();
    const documentPatch = typeof patch.content === "string" && !("richContent" in patch)
      ? { ...patch, richContent: markdownToRichHtml(patch.content) }
      : patch;
    const previousDocument = project.chapters.find((chapter) => chapter.id === documentId)
      ?? project.chapters.flatMap((chapter) => chapter.pages ?? []).find((page) => page.id === documentId)
      ?? project.pages?.find((page) => page.id === documentId);
    const chapters = project.chapters.map((chapter) => {
      if (chapter.id === documentId) return { ...chapter, ...documentPatch, updatedAt: now };
      return {
        ...chapter,
        pages: chapter.pages?.map((page) => page.id === documentId ? { ...page, ...documentPatch, updatedAt: now } : page),
      };
    });
    const pages = project.pages?.map((page) => page.id === documentId ? { ...page, ...documentPatch, updatedAt: now } : page);
    updateProject(projectId, { chapters, ...(pages ? { pages } : {}) });
    if (previousDocument && typeof patch.content === "string") {
      const wordDelta = Math.max(0, countWords(patch.content) - countWords(previousDocument.content));
      trackWritingSession(projectId, wordDelta);
    }
  };

  const updateChapter = (chapterId: string, patch: Partial<WritingChapter & WritingPage>) => {
    if (activeProject) updateDocument(activeProject.id, chapterId, patch);
  };

  const scheduleSessionSave = () => {
    if (sessionSaveTimer.current !== null) window.clearTimeout(sessionSaveTimer.current);
    sessionSaveTimer.current = window.setTimeout(() => {
      sessionSaveTimer.current = null;
      void saveRecords("writingSessions", writingSessionsRef.current as (WritingSession & StoredRecord)[]).catch((error: unknown) => {
        console.error("Could not save writing analytics:", error);
        setStorageError(error instanceof Error ? error.message : t("Could not save writing analytics."));
      });
    }, 1500);
  };

  const trackWritingSession = (projectId: string, wordsWritten: number) => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const previous = activeSessionRef.current?.date === date && activeSessionRef.current.projectId === projectId
      ? activeSessionRef.current
      : writingSessionsRef.current.find((session) => session.date === date && session.projectId === projectId) ?? null;
    const session: WritingSession = {
      id: previous?.id ?? crypto.randomUUID(),
      projectId,
      startedAt: previous?.startedAt ?? now.toISOString(),
      lastActivityAt: now.toISOString(),
      date,
      wordsWritten: (previous?.wordsWritten ?? 0) + wordsWritten,
      durationSeconds: previous?.durationSeconds ?? 0,
      updatedAt: now.toISOString(),
    };
    activeSessionRef.current = session;
    const next = [...writingSessionsRef.current.filter((item) => item.id !== session.id), session];
    writingSessionsRef.current = next;
    scheduleSessionSave();
    if (sessionHeartbeatTimer.current === null) {
      sessionHeartbeatTimer.current = window.setInterval(() => {
        const current = activeSessionRef.current;
        if (!current || Date.now() - Date.parse(current.lastActivityAt) > 30_000) {
          if (sessionHeartbeatTimer.current !== null) window.clearInterval(sessionHeartbeatTimer.current);
          sessionHeartbeatTimer.current = null;
          return;
        }
        const heartbeat = { ...current, durationSeconds: current.durationSeconds + 15, updatedAt: new Date().toISOString() };
        activeSessionRef.current = heartbeat;
        const updatedSessions = [...writingSessionsRef.current.filter((item) => item.id !== heartbeat.id), heartbeat];
        writingSessionsRef.current = updatedSessions;
        scheduleSessionSave();
      }, 15_000);
    }
  };

  const createProject = (formatType: WritingFormatType = "Book / Novel") => {
    setCreationDraft({
      title: "untitled-story",
      formatType,
      genre: formatType === "Course" || formatType === "Non-Fiction"
        ? "Technical / Education"
        : formatType === "Play / Screenplay" ? "Drama" : "Literary Fiction",
      targetWordGoal: "50000",
      starterEnabled: true,
      aiTemplatesEnabled: true,
    });
    void openAuxiliaryWindow("new-project").then((opened) => {
      if (!opened) setProjectDialogOpen(true);
    }).catch(() => setProjectDialogOpen(true));
  };

  const approveWorkspaceSwitch = async (projectId: string) => {
    if (!activeProjectId || activeProjectId === projectId || !onBeforeWorkspaceChange) return true;
    try {
      return await onBeforeWorkspaceChange();
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : t("Could not check sync state before switching workspaces."));
      return false;
    }
  };

  const activateProject = async (project: WritingProject) => {
    if (!(await approveWorkspaceSwitch(project.id))) return false;
    const firstProjectPageId = project.pages?.[0]?.id ?? "";
    const firstChapter = project.chapters[0];
    const firstPageId = firstProjectPageId || firstChapter?.pages?.[0]?.id || "";
    if (welcomeLeftOpen) {
      setIsLeftCollapsed(false);
      setLeftOpen(true);
    }
    if (welcomeRightOpen) {
      setIsRightCollapsed(false);
      setRightOpen(true);
    }
    setWelcomeLeftOpen(false);
    setWelcomeRightOpen(false);
    setActiveProjectId(project.id);
    setActiveChapterId(firstProjectPageId ? "" : firstChapter?.id ?? "");
    setActivePageId(firstPageId);
    setSelection(null);
    editorRangeRef.current = null;
    editorDocumentIdRef.current = "";
    setExpandedProjects((current) => new Set(current).add(project.id));
    setExpandedChapters((current) => new Set([...current, ...project.chapters.map((chapter) => chapter.id)]));
    setPreviewMode(false);
    setStudioMode("write");
    setFocusMode(false);
    setProjectDialogOpen(false);
    setProjectPickerOpen(false);
    return true;
  };

  const addAndOpenProject = async (project: WritingProject) => {
    const openedProject = { ...project, lastOpenedAt: new Date().toISOString() };
    if (!(await activateProject(openedProject))) return;
    const next = [openedProject, ...projectsRef.current.filter((item) => item.id !== openedProject.id)];
    commitProjects(next, true);
  };

  const openSavedProject = (projectId: string) => {
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) {
      setStorageError(t("This project is no longer available."));
      return;
    }
    addAndOpenProject(project);
  };

  const openProjectPicker = () => setProjectPickerOpen(true);

  const closeCurrentProject = async () => {
    if (!(await approveWorkspaceSwitch(""))) return;
    setActiveProjectId("");
    setActiveChapterId("");
    setActivePageId("");
    setWelcomeLeftOpen(false);
    setWelcomeRightOpen(false);
    setIsLeftCollapsed(false);
    setIsRightCollapsed(false);
    setSelection(null);
    editorRangeRef.current = null;
    editorDocumentIdRef.current = "";
    setPreviewMode(false);
    setStudioMode("write");
    setFocusMode(false);
  };

  const openLocalFolder = async () => {
    type LocalFileHandle = { kind: "file"; name: string; getFile: () => Promise<File> };
    type LocalDirectoryHandle = {
      kind: "directory";
      name: string;
      values: () => AsyncIterable<LocalFileHandle | LocalDirectoryHandle>;
    };
    type DirectoryPickerWindow = Window & {
      showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<LocalDirectoryHandle>;
    };
    const showDirectoryPicker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!showDirectoryPicker) {
      setProjectPickerOpen(true);
      setFeedback(t("Folder access is not available here. Choose a saved project instead."));
      return;
    }
    try {
      const directory = await showDirectoryPicker.call(window, { mode: "read" });
      const existingProject = projectsRef.current.find((project) =>
        project.title.trim().toLocaleLowerCase() === directory.name.trim().toLocaleLowerCase(),
      );
      if (existingProject) {
        openSavedProject(existingProject.id);
        return;
      }

      const importedFiles: Array<{ folder: string; name: string; content: string }> = [];
      const readDirectory = async (currentDirectory: LocalDirectoryHandle, folderPath = ""): Promise<void> => {
        const entries: Array<LocalFileHandle | LocalDirectoryHandle> = [];
        for await (const entry of currentDirectory.values()) entries.push(entry);
        entries.sort((left, right) => left.name.localeCompare(right.name));

        for (const entry of entries) {
          if (entry.name.startsWith(".")) continue;
          const entryPath = folderPath ? `${folderPath}/${entry.name}` : entry.name;
          if (entry.kind === "directory") {
            await readDirectory(entry, entryPath);
          } else if (/\.(md|txt)$/i.test(entry.name)) {
            const file = await entry.getFile();
            importedFiles.push({
              folder: folderPath,
              name: entry.name.replace(/\.(md|txt)$/i, ""),
              content: await file.text(),
            });
          }
        }
      };
      await readDirectory(directory);

      const project = scaffoldWritingProject(newProject(userId, {
        title: directory.name,
        formatType: "Book / Novel",
        genre: "Literary Fiction",
        targetWordGoal: null,
      }), "Book / Novel");
      if (importedFiles.length) {
        const now = new Date().toISOString();
        const groupedPages = new Map<string, WritingPage[]>();
        importedFiles.forEach((file) => {
          const folderTitle = file.folder || t("Imported Files");
          const pages = groupedPages.get(folderTitle) ?? [];
          pages.push({
            id: crypto.randomUUID(),
            title: `${file.name}.w`,
            content: file.content,
            kind: "page",
            category: "writing",
            updatedAt: now,
          });
          groupedPages.set(folderTitle, pages);
        });
        project.chapters = [...groupedPages].map(([title, pages]) => ({
          id: crypto.randomUUID(),
          title,
          content: "",
          category: "writing",
          updatedAt: now,
          pages,
        }));
        project.pages = [];
      }
      project.wordCount = countProjectWords(project);
      addAndOpenProject(project);
      setFeedback(importedFiles.length
        ? t("Opened the folder and imported its Markdown and text files.")
        : t("Created a project for this folder. No .md or .txt files were found."));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Could not open the selected folder:", error);
      setProjectPickerOpen(false);
      setStorageError(error instanceof Error ? error.message : t("Could not open the selected folder."));
    }
  };

  const importManuscript = async (file: File) => {
    if (!/\.(md|txt)$/i.test(file.name)) {
      setStorageError(t("Choose a Markdown (.md) or text (.txt) manuscript."));
      return;
    }
    try {
      const content = await file.text();
      const title = file.name.replace(/\.(md|txt)$/i, "").trim() || t("Imported manuscript");
      const project = scaffoldWritingProject(newProject(userId, {
        title,
        formatType: "Short Story",
        genre: "Literary Fiction",
        targetWordGoal: null,
      }), "Short Story");
      if (project.pages?.[0]) {
        project.pages = [{ ...project.pages[0], content }, ...project.pages.slice(1)];
      }
      project.wordCount = countProjectWords(project);
      addAndOpenProject(project);
      setFeedback(t("Manuscript imported."));
    } catch (error) {
      console.error("Could not import the manuscript:", error);
      setStorageError(error instanceof Error ? error.message : t("Could not import this manuscript."));
    }
  };

  const confirmCreateProject = () => {
    const target = creationDraft.targetWordGoal.trim() ? Number(creationDraft.targetWordGoal) : null;
    if (target !== null && (!Number.isFinite(target) || target <= 0)) {
      setFeedback(t("Enter a positive word goal, or leave it blank."));
      return;
    }
    const project = scaffoldWritingProject(
      newProject(userId, { ...creationDraft, targetWordGoal: target }),
      creationDraft.formatType,
      {
        starterEnabled: creationDraft.starterEnabled,
        aiTemplatesEnabled: creationDraft.aiTemplatesEnabled,
      },
    );
    project.wordCount = countProjectWords(project);
    addAndOpenProject(project);
  };

  const removeProject = async (projectId: string) => {
    const next = projectsRef.current.filter((project) => project.id !== projectId);
    if (activeProjectId === projectId && !(await approveWorkspaceSwitch(next[0]?.id ?? ""))) return;
    if (next.length === 0) {
      setActiveProjectId("");
      setActiveChapterId("");
      setActivePageId("");
      setSelection(null);
      editorRangeRef.current = null;
      editorDocumentIdRef.current = "";
    } else if (activeProjectId === projectId) {
      setActiveProjectId(next[0].id);
      setActiveChapterId(next[0].chapters[0]?.id ?? "");
      setActivePageId("");
      setSelection(null);
      editorRangeRef.current = null;
      editorDocumentIdRef.current = "";
    }
    commitProjects(next, true);
  };

  const removeChapter = (projectId: string, chapterId: string) => {
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project || project.chapters.length < 2) return;
    const nextChapters = project.chapters.filter((chapter) => chapter.id !== chapterId);
    updateProject(projectId, { chapters: nextChapters });
    if (activeChapterId === chapterId || project.chapters.find((chapter) => chapter.id === chapterId)?.pages?.some((page) => page.id === activePageId)) {
      setActiveChapterId(nextChapters[0].id);
      setActivePageId("");
      setSelection(null);
      editorRangeRef.current = null;
      editorDocumentIdRef.current = "";
    }
  };

  const selectDocument = async (projectId: string, chapterId: string, pageId = "") => {
    if (!(await approveWorkspaceSwitch(projectId))) return;
    if (projectId !== activeProjectId) {
      updateProject(projectId, { lastOpenedAt: new Date().toISOString() });
    }
    setActiveProjectId(projectId);
    setActiveChapterId(chapterId);
    setActivePageId(pageId);
    setSelection(null);
    editorRangeRef.current = null;
    editorDocumentIdRef.current = "";
    if (studioMode !== "write") setStudioMode("write");
    else setPreviewMode(false);
  };

  const createChapter = (projectId: string, title?: string, category: WritingExplorerCategory = "writing") => {
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) return;
    const categoryCount = project.chapters.filter((chapter) => normalizeExplorerCategory(chapter.category) === category).length;
    const chapter = { ...newChapter(categoryCount + 1, category), ...(title ? { title } : {}) };
    updateProject(projectId, { chapters: [...project.chapters, chapter] });
    selectDocument(projectId, chapter.id);
    setExpandedProjects((current) => new Set(current).add(projectId));
    setExpandedChapters((current) => new Set(current).add(chapter.id));
  };

  const createPage = (
    projectId: string,
    chapterId: string | null,
    kind: WritingPageKind = "page",
    title?: string,
    content = "",
    requestedCategory?: WritingExplorerCategory,
  ) => {
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) return;
    const chapter = chapterId ? project.chapters.find((item) => item.id === chapterId) : undefined;
    if (chapterId && !chapter) return;
    const fallbackCategory = chapter
      ? normalizeExplorerCategory(chapter.category, defaultExplorerCategory(kind))
      : defaultExplorerCategory(kind);
    const parsedTitle = title ? parseExplorerFileTitle(title, requestedCategory ?? fallbackCategory) : null;
    const category = parsedTitle?.category ?? requestedCategory ?? fallbackCategory;
    if (chapter) {
      const pageDraft = newWritingPage(kind, (chapter.pages?.length ?? 0) + 1, category);
      const page = { ...pageDraft, ...(parsedTitle?.title ? { title: parsedTitle.title } : {}), content: content || pageDraft.content };
      updateProject(projectId, {
        chapters: project.chapters.map((item) => item.id === chapter.id ? { ...item, pages: [...(item.pages ?? []), page] } : item),
      });
      selectDocument(projectId, chapter.id, page.id);
      setExpandedProjects((current) => new Set(current).add(projectId));
      setExpandedChapters((current) => new Set(current).add(chapter.id));
      return;
    }
    const pageDraft = newWritingPage(kind, (project.pages?.length ?? 0) + 1, category);
    const page = { ...pageDraft, ...(parsedTitle?.title ? { title: parsedTitle.title } : {}), content: content || pageDraft.content };
    updateProject(projectId, { pages: [...(project.pages ?? []), page] });
    selectDocument(projectId, "", page.id);
    setExpandedProjects((current) => new Set(current).add(projectId));
  };

  const defaultFolderTitle = (project: WritingProject, category: WritingExplorerCategory) => {
   const categoryCount = project.chapters.filter((chapter) => normalizeExplorerCategory(chapter.category) === category).length;
   if (category === "writing") return `Chapter ${categoryCount + 1}`;
   const folderTitle = EXPLORER_CATEGORIES[category].folderTitle;
   return categoryCount ? `${folderTitle} ${categoryCount + 1}` : folderTitle;
  };

  const defaultFileTitle = (
   project: WritingProject,
   chapter: WritingChapter | null,
   category: WritingExplorerCategory,
  ) => {
   const pages = chapter ? chapter.pages ?? [] : project.pages ?? [];
   const categoryCount = pages.filter((page) =>
     normalizeExplorerCategory(page.category, defaultExplorerCategory(page.kind)) === category,
   ).length;
   return `${EXPLORER_CATEGORIES[category].fileTitlePrefix} ${categoryCount + 1}`;
  };

  const openFolderPicker = () => {
   if (!activeProject) {
     createProject();
     return;
   }
   const category = normalizeExplorerCategory(selectedExplorerChapter?.category, "writing");
   setNewFolderCategory(category);
   setNewFolderName(defaultFolderTitle(activeProject, category));
   setFolderNameEdited(false);
   setFilePickerOpen(false);
   setFolderPickerOpen(true);
  };

  const openFilePicker = () => {
   if (!activeProject) {
     createProject();
     return;
   }
   const category = normalizeExplorerCategory(selectedExplorerChapter?.category, "writing");
   setNewFileCategory(category);
   setNewFileName(defaultFileTitle(activeProject, selectedExplorerChapter, category));
   setFileNameEdited(false);
   setFolderPickerOpen(false);
   setFilePickerOpen(true);
  };

  const beginRename = (target: RenameTarget, title: string) => {
    setRenameTarget(target);
    setRenameDraft(title);
  };

  const finishRename = () => {
    if (!renameTarget) return;
    const title = renameDraft.trim();
    if (title) {
      if (renameTarget.type === "project") updateProject(renameTarget.projectId, { title });
      else if (renameTarget.type === "page") {
        const project = projectsRef.current.find((item) => item.id === renameTarget.projectId);
        const page = project?.pages?.find((item) => item.id === renameTarget.id)
          ?? project?.chapters.flatMap((chapter) => chapter.pages ?? []).find((item) => item.id === renameTarget.id);
        const fallbackCategory = page
          ? normalizeExplorerCategory(page.category, defaultExplorerCategory(page.kind))
          : "writing";
        const parsed = parseExplorerFileTitle(title, fallbackCategory);
        if (parsed.title) updateDocument(renameTarget.projectId, renameTarget.id, { title: parsed.title, category: parsed.category });
      } else {
        updateDocument(renameTarget.projectId, renameTarget.id, { title });
      }
    }
    setRenameTarget(null);
  };

  const duplicateProject = (projectId: string) => {
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) return;
    const duplicate: WritingProject = {
      ...project,
      id: crypto.randomUUID(),
      title: `${project.title || t("Untitled story")} copy`,
      visibility: "personal",
      publishedAt: undefined,
      chapters: project.chapters.map((chapter) => ({
        ...chapter,
        id: crypto.randomUUID(),
        pages: chapter.pages?.map((page) => ({ ...page, id: crypto.randomUUID() })),
      })),
      pages: project.pages?.map((page) => ({ ...page, id: crypto.randomUUID() })),
      updatedAt: new Date().toISOString(),
    };
    const next = [duplicate, ...projectsRef.current];
    commitProjects(next, true);
    selectDocument(duplicate.id, duplicate.chapters[0]?.id ?? "");
    setExpandedProjects((current) => new Set(current).add(duplicate.id));
    setExpandedChapters((current) => new Set([...current, ...duplicate.chapters.map((chapter) => chapter.id)]));
  };

  const duplicateChapter = (projectId: string, chapterId: string) => {
    const project = projectsRef.current.find((item) => item.id === projectId);
    const index = project?.chapters.findIndex((chapter) => chapter.id === chapterId) ?? -1;
    if (!project || index < 0) return;
    const source = project.chapters[index];
    const duplicate: WritingChapter = {
      ...source,
      id: crypto.randomUUID(),
      title: `${source.title || t("Untitled section")} copy`,
      pages: source.pages?.map((page) => ({ ...page, id: crypto.randomUUID() })),
      updatedAt: new Date().toISOString(),
    };
    const chapters = [...project.chapters];
    chapters.splice(index + 1, 0, duplicate);
    updateProject(projectId, { chapters });
    selectDocument(projectId, duplicate.id);
    setExpandedChapters((current) => new Set(current).add(duplicate.id));
  };

  const duplicatePage = (projectId: string, pageId: string, chapterId: string | null) => {
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) return;
    const duplicateFrom = (page: WritingPage): WritingPage => ({
      ...page,
      id: crypto.randomUUID(),
      title: `${page.title || t("Untitled page")} copy`,
      updatedAt: new Date().toISOString(),
    });
    if (chapterId) {
      const chapter = project.chapters.find((item) => item.id === chapterId);
      const source = chapter?.pages?.find((page) => page.id === pageId);
      if (!chapter || !source) return;
      const duplicate = duplicateFrom(source);
      updateProject(projectId, {
        chapters: project.chapters.map((item) => item.id === chapterId ? { ...item, pages: [...(item.pages ?? []), duplicate] } : item),
      });
      selectDocument(projectId, chapterId, duplicate.id);
    } else {
      const source = project.pages?.find((page) => page.id === pageId);
      if (!source) return;
      const duplicate = duplicateFrom(source);
      updateProject(projectId, { pages: [...(project.pages ?? []), duplicate] });
      selectDocument(projectId, "", duplicate.id);
    }
  };

  const removePage = (projectId: string, pageId: string, chapterId: string | null) => {
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) return;
    if (chapterId) {
      updateProject(projectId, {
        chapters: project.chapters.map((chapter) => chapter.id === chapterId
          ? { ...chapter, pages: (chapter.pages ?? []).filter((page) => page.id !== pageId) }
          : chapter),
      });
    } else {
      updateProject(projectId, { pages: (project.pages ?? []).filter((page) => page.id !== pageId) });
    }
    if (activePageId === pageId) {
      setActivePageId("");
      setActiveChapterId(chapterId ?? project.chapters[0]?.id ?? "");
      setSelection(null);
      editorRangeRef.current = null;
      editorDocumentIdRef.current = "";
    }
  };

  const replaceInChapter = () => {
    if (!activeChapter || !findText) return;
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = activeChapter.content.match(new RegExp(escaped, "g"))?.length ?? 0;
    if (!matches) {
      setFeedback(t("No matches found."));
      return;
    }
    const content = activeChapter.content.replace(new RegExp(escaped, "g"), replaceText);
    const richContent = markdownToRichHtml(content);
    updateChapter(activeChapter.id, { content, richContent });
    if (editorRef.current && editorDocumentIdRef.current === activeChapter.id) editorRef.current.innerHTML = richContent;
    setFeedback(t(`Replaced ${matches} matches.`));
    setFindReplaceOpen(false);
  };

  const moveChapter = (projectId: string, chapterId: string, offset: -1 | 1) => {
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) return;
    const index = project.chapters.findIndex((chapter) => chapter.id === chapterId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= project.chapters.length) return;
    const chapters = [...project.chapters];
    [chapters[index], chapters[target]] = [chapters[target], chapters[index]];
    updateProject(projectId, { chapters });
  };

  const addPersonalBook = async () => {
    if (!activeProject) return;
    const story = activeProject.chapters.map((chapter) => `# ${chapter.title}\n\n${chapter.content}`).join("\n\n");
    const book: Book = {
      id: crypto.randomUUID(),
      title: activeProject.title.trim() || "Untitled story",
      author: authorName,
      category: activeProject.genre || "Writing",
      description: activeProject.synopsis,
      story,
      coverImage: activeProject.coverImage || "",
      coverColor: activeProject.coverColor,
      ...(activeProject.coverDesign?.appliedRemoteCoverName
        ? { remoteCoverFileName: activeProject.coverDesign.appliedRemoteCoverName, coverFileName: `${safeFilename(activeProject.title)}-cover.png`, coverMimeType: "image/png" }
        : {}),
      ...(activeProject.coverDesign?.appliedCoverKey
        ? { coverFileName: `${safeFilename(activeProject.title)}-cover.png`, coverMimeType: "image/png" }
        : {}),
      totalPages: Math.max(1, Math.ceil(words / 300)),
      currentPage: 0,
      status: "unread",
      uploadedAt: new Date().toISOString(),
    };
    try {
      await onAddBook?.(book);
      setPublishOpen(false);
      setFeedback(t("Added to your personal shelf."));
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : t("Could not add this writing to your shelf."));
    }
  };

  const publishProject = async () => {
    if (!activeProject) return;
    if (storageMode !== "cloud" || !token) {
      setStorageError(t("Connect to your Shelve account and switch to Cloud mode to publish."));
      return;
    }
    const next = projectsRef.current.map((project) => project.id === activeProject.id
      ? { ...project, visibility: "public" as const, publishedAt: new Date().toISOString(), authorName, updatedAt: new Date().toISOString() }
      : project);
    const saved = await commitProjects(next, true);
    if (saved) {
      setPublishOpen(false);
      setFeedback(t("Published to the Public Library."));
    }
  };

  const unpublishProject = async () => {
    if (!activeProject) return;
    const next = projectsRef.current.map((project) => {
      if (project.id !== activeProject.id) return project;
      const { publishedAt: _publishedAt, ...personal } = project;
      return { ...personal, visibility: "personal" as const, updatedAt: new Date().toISOString() };
    });
    const saved = await commitProjects(next, true);
    if (saved) setFeedback(t("Moved back to your personal drafts."));
  };

  const saveRichEditor = (editor = editorRef.current) => {
    if (!editor || !activeChapter) return;
    const richContent = sanitizeRichHtml(editor.innerHTML);
    const content = richHtmlToText(richContent);
    editorDocumentIdRef.current = activeChapter.id;
    updateChapter(activeChapter.id, { content, richContent });
    captureSelection();
  };

  const runEditorCommand = (command: string, value?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const savedRange = editorRangeRef.current;
    if (savedRange && editor.contains(savedRange.startContainer) && editor.contains(savedRange.endContainer)) {
      const currentSelection = window.getSelection();
      currentSelection?.removeAllRanges();
      currentSelection?.addRange(savedRange);
    }
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    saveRichEditor(editor);
  };

  const applyDocumentStyle = (styleName: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const savedRange = editorRangeRef.current;
    if (savedRange && editor.contains(savedRange.startContainer) && editor.contains(savedRange.endContainer)) {
      const currentSelection = window.getSelection();
      currentSelection?.removeAllRanges();
      currentSelection?.addRange(savedRange);
    }
    const styleMap: Record<string, { tag: string; size?: string; weight?: string; italic?: boolean }> = {
      normal: { tag: "p" },
      title: { tag: "h1", size: "32px", weight: "600" },
      subtitle: { tag: "p", size: "18px", italic: true },
      heading1: { tag: "h1", size: "28px", weight: "600" },
      heading2: { tag: "h2", size: "23px", weight: "600" },
      heading3: { tag: "h3", size: "19px", weight: "600" },
      quote: { tag: "blockquote", italic: true },
    };
    const formatting = styleMap[styleName] ?? styleMap.normal;
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("formatBlock", false, formatting.tag);
    const currentSelection = window.getSelection();
    const selectionNode = currentSelection?.anchorNode;
    const block = selectionNode instanceof HTMLElement
      ? selectionNode.closest("p,h1,h2,h3,blockquote,li")
      : selectionNode?.parentElement?.closest("p,h1,h2,h3,blockquote,li");
    if (block instanceof HTMLElement && editor.contains(block)) {
      block.style.fontSize = formatting.size ?? "";
      block.style.fontWeight = formatting.weight ?? "";
      block.style.fontStyle = formatting.italic ? "italic" : "";
    }
    saveRichEditor(editor);
  };

  const insertEditorHtml = (html: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand("insertHTML", false, sanitizeRichHtml(html));
    saveRichEditor(editor);
  };

  const applyFontSize = (size: number) => {
    const editor = editorRef.current;
    if (!editor || !activeProject) return;
    editor.focus();
    const savedRange = editorRangeRef.current;
    const currentSelection = window.getSelection();
    if (savedRange && editor.contains(savedRange.startContainer) && editor.contains(savedRange.endContainer)) {
      currentSelection?.removeAllRanges();
      currentSelection?.addRange(savedRange);
    }
    if (!currentSelection?.rangeCount || !editor.contains(currentSelection.anchorNode)) {
      updateProject(activeProject.id, { fontSize: size });
      editor.style.fontSize = `${size}px`;
      editor.focus();
      return;
    }
    const range = currentSelection.getRangeAt(0);
    if (range.collapsed) {
      editor.style.fontSize = `${size}px`;
      updateProject(activeProject.id, { fontSize: size });
      return;
    }
    const span = document.createElement("span");
    span.style.fontSize = `${size}px`;
    span.append(range.extractContents());
    range.insertNode(span);
    currentSelection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    currentSelection.addRange(nextRange);
    saveRichEditor(editor);
  };

  const applyFontFamily = (family: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const currentSelection = window.getSelection();
    const savedRange = editorRangeRef.current;
    if (savedRange && editor.contains(savedRange.startContainer) && editor.contains(savedRange.endContainer)) {
      currentSelection?.removeAllRanges();
      currentSelection?.addRange(savedRange);
    }
    if (!currentSelection?.rangeCount || !editor.contains(currentSelection.anchorNode)) {
      editor.style.fontFamily = family;
      return;
    }
    const range = currentSelection.getRangeAt(0);
    if (range.collapsed) {
      editor.style.fontFamily = family;
      return;
    }
    const span = document.createElement("span");
    span.style.fontFamily = family;
    span.append(range.extractContents());
    range.insertNode(span);
    currentSelection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    currentSelection.addRange(nextRange);
    saveRichEditor(editor);
  };

  const applyLineSpacing = (spacing: number) => {
    if (!activeProject) return;
    updateProject(activeProject.id, { lineSpacing: spacing });
    if (editorRef.current) {
      editorRef.current.style.lineHeight = String(spacing);
      saveRichEditor(editorRef.current);
    }
  };

  const insertDivider = (pageBreak = false) => {
    insertEditorHtml(pageBreak
      ? '<hr class="editor-page-break"><p><br></p>'
      : "<hr><p><br></p>");
  };

  const insertLink = () => {
    const url = window.prompt(t("Enter a link URL"));
    if (!url) return;
    if (!/^(https?:|mailto:)/i.test(url.trim())) {
      setStorageError(t("Use a valid https or email link."));
      return;
    }
    const currentSelection = editorRangeRef.current;
    if (!currentSelection || currentSelection.collapsed) {
      insertEditorHtml(`<a href="${escapeHtml(url.trim())}">${escapeHtml(url.trim())}</a>`);
    } else {
      runEditorCommand("createLink", url.trim());
    }
  };

  const insertImage = () => {
    const url = window.prompt(t("Enter an image URL"));
    if (!url) return;
    if (!/^https?:\/\//i.test(url.trim())) {
      setStorageError(t("Use a valid https image URL."));
      return;
    }
    insertEditorHtml(`<p><img src="${escapeHtml(url.trim())}" alt="${t("Inserted image")}" /></p>`);
  };

  const insertChecklist = () => insertEditorHtml("<ul><li>☐ &nbsp;</li></ul>");

  const startNewAssistantChat = () => {
    if (assistantMessages.length && activeProject) {
      const firstUserMessage = assistantMessages.find((message) => message.role === "user");
      const conversation: AssistantConversation = {
        id: assistantChatId,
        projectId: activeProject.id,
        projectTitle: activeProject.title,
        title: (firstUserMessage?.text || t("New chat")).slice(0, 64),
        messages: assistantMessages,
      };
      setAssistantHistory((current) => [conversation, ...current.filter((item) => item.id !== assistantChatId)].slice(0, 30));
    }
    const nextId = crypto.randomUUID();
    assistantMessagesRef.current = [];
    setAssistantMessages([]);
    setAssistantChatId(nextId);
    setAssistantDraft("");
    setAssistantHistoryOpen(false);
  };

  const openAssistantConversation = (conversation: AssistantConversation) => {
    assistantMessagesRef.current = conversation.messages;
    setAssistantMessages(conversation.messages);
    setAssistantChatId(conversation.id);
    setAssistantHistoryOpen(false);
    if (conversation.projectId !== activeProjectId) {
      const lastMessage = [...conversation.messages].reverse().find((message) => message.documentId);
      const project = projectsRef.current.find((item) => item.id === conversation.projectId);
      if (project) {
        const document = [...project.chapters, ...project.chapters.flatMap((chapter) => chapter.pages ?? []), ...(project.pages ?? [])]
          .find((item) => item.id === lastMessage?.documentId);
        const parent = project.chapters.find((chapter) => chapter.pages?.some((page) => page.id === document?.id));
        const pageId = document && "kind" in document ? document.id : "";
        skipProjectChatResetRef.current = true;
        selectDocument(project.id, pageId ? parent?.id ?? "" : document?.id ?? "", pageId);
      }
    }
  };

  const submitAssistantDraft = () => {
    const slash = assistantDraft.match(/^\/(write|edit|critique|outline|video-scene)\b(?:\s+([\s\S]*))?$/i);
    const slashTools: Record<string, AssistantTool> = {
      write: "continue",
      edit: "polish",
      critique: "critique",
      outline: "outline",
      "video-scene": "video",
    };
    const selectedTool = slash ? slashTools[slash[1].toLowerCase()] : assistantTool === "continue" ? "chat" : assistantTool;
    const request = slash ? slash[2]?.trim() ?? "" : assistantDraft;
    setAssistantTool(selectedTool);
    void runAssistant(selectedTool, selection, request);
  };

  const captureSelection = () => {
    const editor = editorRef.current;
    const currentSelection = window.getSelection();
    if (!editor || !currentSelection?.rangeCount) return;
    const range = currentSelection.getRangeAt(0);
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return;
    editorRangeRef.current = range.cloneRange();
    const prefix = range.cloneRange();
    prefix.selectNodeContents(editor);
    prefix.setEnd(range.startContainer, range.startOffset);
    const selectedText = range.toString();
    const prefixContainer = document.createElement("div");
    prefixContainer.append(prefix.cloneContents());
    const start = richHtmlToText(prefixContainer.innerHTML).length;
    setSelection(selectedText && !range.collapsed
      ? { start, end: start + selectedText.length, text: selectedText }
      : null);
  };

  const runAssistant = async (tool = assistantTool, selected = selection, requestText?: string) => {
    if (!activeProject || !activeChapter) return;
    const requestEditorRange = editorDocumentIdRef.current === activeChapter.id
      ? editorRangeRef.current?.cloneRange()
      : undefined;
    if (!token) {
      setStorageError(t("Sign in to a connected account to use the AI writing assistant."));
      return;
    }
    const selectedText = selected?.text ?? "";
    const prompts: Record<AssistantTool, string> = {
      continue: "Continue writing from the active page. Match the manuscript's voice, language, and tone. Return only the next passage.",
      polish: "Edit and polish the active page or selected passage. Improve clarity, flow, and line-level prose while preserving meaning and voice. Return the revised text only.",
      tone: "Rewrite the selected passage or active page in the manuscript's voice and language. Preserve its meaning and return only the rewritten passage.",
      critique: "Give constructive feedback on pacing, dialogue, character motivation, continuity, and potential plot holes. Be specific and cite brief examples from the manuscript.",
      outline: "Create a clear, actionable outline for the next chapter or scene, with beats, turning points, and character arcs.",
      video: "Turn the active chapter or scene into a cinematic video prompt and storyboard breakdown. Include a concise premise, visual style, shot list, camera angles and movement, lighting, audio and ambience, and dialogue cues. Clearly distinguish each shot.",
      chat: "Answer the writer's question using the manuscript context. Be conversational, specific, and do not invent facts that contradict the text.",
    };
    const userText = requestText?.trim() || ({
      continue: "Continue / Write",
      polish: selectedText ? "Edit & Polish the selected passage" : "Edit & Polish the active page",
      tone: "Rewrite the active passage",
      critique: "Feedback & Critique",
      outline: "Plan & Outline",
      video: "Generate Video Scene",
      chat: assistantDraft.trim(),
    } satisfies Record<AssistantTool, string>)[tool];
    if (!userText) return;
    const previousConversation = assistantMessagesRef.current.slice(-12).map((message) =>
      `${message.role === "user" ? "Writer" : "Co-worker"}: ${message.text}`,
    ).join("\n\n");
    const prompt = tool === "chat"
      ? `${prompts.chat}\n\nWriter's question: ${userText}`
      : `${prompts[tool]}${requestText?.trim() ? `\n\nWriter's request: ${requestText.trim()}` : ""}`;
    const chapterForContext = activePageParentChapter ?? (activePage ? null : activeProject.chapters.find((chapter) => chapter.id === activeChapter.id) ?? null);
    const scopedText = assistantContextScope === "selection" && selectedText
      ? `Selected passage:\n${selectedText}`
      : assistantContextScope === "book"
      ? [
        ...activeProject.chapters.flatMap((chapter) => [
          `Chapter: ${chapter.title}\n${chapter.content}`,
          ...(chapter.pages ?? []).map((page) => `${page.kind}: ${page.title}\n${page.content}`),
        ]),
        ...(activeProject.pages ?? []).map((page) => `${page.kind}: ${page.title}\n${page.content}`),
      ].join("\n\n")
      : assistantContextScope === "chapter" && chapterForContext
        ? [
          `Chapter: ${chapterForContext.title}\n${chapterForContext.content}`,
          ...(chapterForContext.pages ?? []).map((page) => `${page.kind}: ${page.title}\n${page.content}`),
        ].join("\n\n")
        : `${activePage ? `${activePage.kind}: ` : "Chapter: "}${activeChapter.title}\n${activeChapter.content}`;
    const context = [
      `Title: ${activeProject.title}`,
      `Genre: ${activeProject.genre}`,
      `Synopsis: ${activeProject.synopsis || "Not provided"}`,
      `Selected context scope: ${assistantContextScope === "selection" ? "Selection" : assistantContextScope === "page" ? "Current Page" : assistantContextScope === "chapter" ? "Chapter" : "Entire Book"}`,
      `Manuscript text:\n${scopedText}`,
      selectedText ? `Selected passage:\n${selectedText}` : "",
      previousConversation ? `Conversation so far:\n${previousConversation}` : "",
    ].filter(Boolean).join("\n\n");
    if (context.length > 20000) {
      setStorageError(t("This manuscript context is too long to send in full. Choose a narrower context scope."));
      return;
    }
    const requestProjectId = activeProject.id;
    const contextLabel = assistantContextScope === "selection" ? "Selection" : assistantContextScope === "page" ? "Current Page" : assistantContextScope === "chapter" ? "Chapter" : "Entire Book";
    const userMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: userText,
      documentTitle: activeChapter.title,
      contextScope: contextLabel,
      projectId: activeProject.id,
      documentId: activeChapter.id,
    };
    const withUserMessage = [...assistantMessagesRef.current, userMessage];
    assistantMessagesRef.current = withUserMessage;
    setAssistantMessages(withUserMessage);
    setAssistantBusy(true);
    setStorageError("");
    setAssistantTool(tool);
    setRightTab("assistant");
    setAssistantDraft("");
    try {
      const response = await sendAiRequest("/api/ai/writing-assist", token, { prompt, context });
      if (activeProjectId !== requestProjectId) return;
      const assistantMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: getAiText(response),
        tool,
        documentTitle: activeChapter.title,
        contextScope: contextLabel,
        projectId: activeProject.id,
        documentId: activeChapter.id,
        parentChapterId: chapterForContext?.id ?? null,
        hasSelection: Boolean(selected?.text),
        start: selected?.start ?? activeChapter.content.length,
        end: selected?.end ?? activeChapter.content.length,
      };
      if (requestEditorRange) assistantRangesRef.current.set(assistantMessage.id, requestEditorRange);
      const nextMessages = [...assistantMessagesRef.current, assistantMessage];
      assistantMessagesRef.current = nextMessages;
      setAssistantMessages(nextMessages);
    } catch (error) {
      console.error("Could not run the AI writing assistant:", error);
      if (activeProjectId !== requestProjectId) return;
      const message = error instanceof Error ? error.message : t("The AI writing assistant is unavailable.");
      setStorageError(message.toLowerCase().includes("credit")
        ? t("Your AI credits are unavailable. Check your account plan and try again.")
        : message);
    } finally {
      setAssistantBusy(false);
    }
  };

  const insertAssistantMessage = (message: AssistantMessage, replaceSelection = false) => {
    if (!message.projectId || !message.documentId) return;
    const project = projectsRef.current.find((item) => item.id === message.projectId);
    const targetDocument = project?.chapters.find((chapter) => chapter.id === message.documentId)
      ?? project?.chapters.flatMap((chapter) => chapter.pages ?? []).find((page) => page.id === message.documentId)
      ?? project?.pages?.find((page) => page.id === message.documentId);
    if (!project || !targetDocument) return;
    const isCurrentDocument = project.id === activeProjectId && targetDocument.id === activeChapter?.id;
    const editor = editorRef.current;
    const responseRange = assistantRangesRef.current.get(message.id);
    const range = replaceSelection ? responseRange : editorRangeRef.current;
    if (isCurrentDocument && editor && editorDocumentIdRef.current === targetDocument.id && range &&
      editor.contains(range.startContainer) && editor.contains(range.endContainer)) {
      editor.focus();
      const currentSelection = window.getSelection();
      currentSelection?.removeAllRanges();
      const insertionRange = range.cloneRange();
      if (!replaceSelection) insertionRange.collapse(false);
      currentSelection?.addRange(insertionRange);
      if (replaceSelection && message.hasSelection) {
        document.execCommand("insertText", false, message.text);
      } else {
        const textHtml = `<span>${escapeHtml(message.text).replace(/\n/g, "<br>")}</span>`;
        document.execCommand("insertHTML", false, textHtml);
      }
      saveRichEditor(editor);
      assistantRangesRef.current.delete(message.id);
      setSelection(null);
      return;
    }

    const start = replaceSelection && message.hasSelection ? message.start ?? targetDocument.content.length : targetDocument.content.length;
    const end = replaceSelection && message.hasSelection ? message.end ?? start : start;
    const prefix = targetDocument.content.slice(0, start);
    const suffix = targetDocument.content.slice(end);
    const insertion = replaceSelection && message.hasSelection
      ? message.text
      : `${prefix && !prefix.endsWith("\n") ? "\n\n" : ""}${message.text}${suffix && !suffix.startsWith("\n") ? "\n\n" : ""}`;
    const content = `${prefix}${insertion}${suffix}`;
    const richContent = plainTextToRichHtml(content);
    updateDocument(project.id, targetDocument.id, { content, richContent });
    if (isCurrentDocument && editor) editor.innerHTML = richContent;
    if (isCurrentDocument) setSelection(null);
    requestAnimationFrame(() => editor?.focus());
  };

  const copyAssistantMessage = async (message: AssistantMessage) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setFeedback(t("Copied to clipboard."));
    } catch (error) {
      console.error("Could not copy the AI response:", error);
      setStorageError(error instanceof Error ? error.message : t("Could not copy the AI response."));
    }
  };

  const exportBookPdf = () => {
    if (!activeProject) return;
    const coverImage = activeProject.coverImage || "";
    const title = escapeHtml(activeProject.title || t("Untitled story"));
    const author = escapeHtml(authorName);
    const exportDocuments = [
      ...activeProject.chapters.flatMap((chapter) => [
        { title: chapter.title || t("Untitled section"), document: chapter, depth: 2 },
        ...(chapter.pages ?? []).map((page) => ({ title: page.title || t("Untitled page"), document: page, depth: 3 })),
      ]),
      ...(activeProject.pages ?? []).map((page) => ({ title: page.title || t("Untitled page"), document: page, depth: 2 })),
    ];
    const chapters = exportDocuments.map(({ title: chapterTitle, document: chapter, depth }) => `
      <section class="chapter">
        <h${depth}>${escapeHtml(chapterTitle)}</h${depth}>
        ${editorHtmlForDocument(chapter)}
      </section>`).join("");
    const tableOfContents = exportDocuments.map(({ title: chapterTitle }, index) =>
      `<li>${String(index + 1).padStart(2, "0")} &nbsp; ${escapeHtml(chapterTitle)}</li>`,
    ).join("");
    const cover = coverImage
      ? `<img src="${escapeHtml(coverImage)}" alt="">`
      : `<div class="cover-title">${title}</div><div class="cover-author">${author}</div>`;
    const rawCoverColor = activeProject.coverDesign?.background || activeProject.coverColor;
    const coverColor = /^#[0-9a-f]{6}$/i.test(rawCoverColor) ? rawCoverColor : "#FFFFFF";
    const html = `<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
      <title>${title}</title><style>
        @page{size:6in 9in;margin:.7in}
        *{box-sizing:border-box}body{margin:0;color:#29251e;font:11pt/1.65 Georgia,"Times New Roman",serif}
        .cover,.title-page,.contents,.chapter,.back-cover{page-break-after:always;break-after:page}
        .cover{position:relative;display:grid;height:7.6in;place-items:center;overflow:hidden;padding:.6in;background:${escapeHtml(coverColor)};color:#fff;text-align:center}
        .cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.cover-title,.cover-author{position:relative;z-index:1}
        .cover-title{font-size:30pt}.cover-author{align-self:end;font:9pt Arial,sans-serif;letter-spacing:.15em;text-transform:uppercase}
        .title-page{display:flex;height:7.6in;flex-direction:column;justify-content:center;text-align:center}.title-page h1{font-size:28pt}
        .title-page p{font-style:italic}.title-page small{margin-top:2in;letter-spacing:.12em;text-transform:uppercase}
        .contents h2,.chapter h2{font-size:19pt;line-height:1.2}.contents li{margin:.16in 0;list-style:none}
        .chapter{page-break-before:always;break-before:page}.chapter p{margin:0 0 .16in;white-space:pre-wrap}
        .back-cover{display:grid;height:7.6in;align-content:center;padding:.5in;text-align:center}
        .back-cover p{white-space:pre-wrap}
        @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
      </style><body>
        <section class="cover">${cover}</section>
        <section class="title-page"><h1>${title}</h1>${activeProject.subtitle ? `<p>${escapeHtml(activeProject.subtitle)}</p>` : ""}<small>${author}</small></section>
        <section class="contents"><h2>${t("Table of Contents")}</h2><ol>${tableOfContents}</ol></section>
        ${chapters}
        <section class="back-cover"><h2>${title}</h2><p>${escapeHtml(activeProject.synopsis || DEFAULT_BACK_BLURB)}</p></section>
      </body></html>`;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStorageError(t("The PDF print window could not be opened. Allow pop-ups and try again."));
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    window.setTimeout(() => {
      if (printWindow.closed) return;
      printWindow.focus();
      printWindow.print();
    }, 350);
    setExportOpen(false);
  };

  const exportProject = async (format: "markdown" | "html" | "print" | "docx") => {
    if (!activeProject) return;
    if (format === "print") {
      exportBookPdf();
      return;
    }
    const projectDocuments = [
      ...activeProject.chapters.flatMap((chapter) => [
        { title: chapter.title, document: chapter, depth: 2 },
        ...(chapter.pages ?? []).map((page) => ({ title: page.title, document: page, depth: 3 })),
      ]),
      ...(activeProject.pages ?? []).map((page) => ({ title: page.title, document: page, depth: 2 })),
    ];
    const markdown = `# ${activeProject.title}\n${activeProject.subtitle ? `\n_${activeProject.subtitle}_\n` : ""}\n${projectDocuments.map(({ title, document, depth }) => `${"#".repeat(depth)} ${title}\n\n${document.content}`).join("\n\n")}`;
    const html = `<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(activeProject.title)}</title><style>body{max-width:760px;margin:4rem auto;padding:0 2rem;color:#28241e;font:18px/1.8 Georgia,serif}h1,h2,h3{line-height:1.2}p{white-space:pre-wrap}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px}img{max-width:100%}</style><article><h1>${escapeHtml(activeProject.title)}</h1>${activeProject.subtitle ? `<p><em>${escapeHtml(activeProject.subtitle)}</em></p>` : ""}${projectDocuments.map(({ title, document, depth }) => `<section><h${depth}>${escapeHtml(title)}</h${depth}>${editorHtmlForDocument(document)}</section>`).join("")}</article></html>`;
    let blob: Blob;
    let extension: string;
    if (format === "docx") {
      try {
        const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
        const paragraphs = [
          new Paragraph({ text: activeProject.title, heading: HeadingLevel.TITLE }),
          ...(activeProject.subtitle ? [new Paragraph({ children: [new TextRun({ text: activeProject.subtitle, italics: true })] })] : []),
        ];
        for (const { title, document: contentDocument, depth } of projectDocuments) {
          paragraphs.push(new Paragraph({
            text: title,
            heading: depth === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
            pageBreakBefore: depth === 2,
          }));
          const container = window.document.createElement("div");
          container.innerHTML = editorHtmlForDocument(contentDocument);
          const createRuns = (node: Node, style: { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean; color?: string; font?: string; size?: number } = {}): InstanceType<typeof TextRun>[] => {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent ?? "";
              return text ? [new TextRun({
                text,
                bold: style.bold,
                italics: style.italics,
                underline: style.underline ? {} : undefined,
                strike: style.strike,
                color: style.color,
                font: style.font,
                size: style.size,
              })] : [];
            }
            if (!(node instanceof HTMLElement)) return [];
            const nextStyle = { ...style };
            if (node.tagName === "STRONG" || node.tagName === "B") nextStyle.bold = true;
            if (node.tagName === "EM" || node.tagName === "I") nextStyle.italics = true;
            if (node.tagName === "U") nextStyle.underline = true;
            if (node.tagName === "S" || node.tagName === "DEL") nextStyle.strike = true;
            if (node.tagName === "CODE" || node.tagName === "PRE") nextStyle.font = "Courier New";
            if (node.style.color) {
              const hexColor = node.style.color.match(/^#([\da-f]{6})$/i)?.[1];
              const rgbColor = node.style.color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
              if (hexColor) nextStyle.color = hexColor;
              else if (rgbColor) nextStyle.color = rgbColor.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, "0")).join("");
            }
            if (node.style.fontFamily) nextStyle.font = node.style.fontFamily.replace(/["']/g, "").split(",")[0];
            if (node.style.fontSize) nextStyle.size = Math.round(Number.parseFloat(node.style.fontSize) * 1.5);
            if (node.tagName === "BR") return [new TextRun({ break: 1 })];
            return Array.from(node.childNodes).flatMap((child) => createRuns(child, nextStyle));
          };
          const appendBlocks = (node: Node, listPrefix = "") => {
            if (!(node instanceof HTMLElement)) {
              if (node.textContent?.trim()) paragraphs.push(new Paragraph({ children: createRuns(node) }));
              return;
            }
            if (node.tagName === "UL" || node.tagName === "OL") {
              Array.from(node.children).filter((child) => child.tagName === "LI").forEach((item, index) => {
                const runs = createRuns(item);
                paragraphs.push(new Paragraph({
                  children: node.tagName === "OL" ? [new TextRun({ text: `${index + 1}. ` }), ...runs] : runs,
                  indent: { left: 360 },
                  ...(node.tagName === "UL" ? { bullet: { level: 0 } } : {}),
                }));
              });
              return;
            }
            if (node.tagName === "TABLE") {
              Array.from(node.querySelectorAll("tr")).forEach((row) => {
                paragraphs.push(new Paragraph({ text: Array.from(row.querySelectorAll("th,td")).map((cell) => cell.textContent ?? "").join("  |  ") }));
              });
              return;
            }
            if (node.tagName === "HR") {
              paragraphs.push(new Paragraph({ text: "", pageBreakBefore: node.classList.contains("editor-page-break") }));
              return;
            }
            if (node.tagName === "DIV" && !node.classList.contains("editor-callout")) {
              Array.from(node.childNodes).forEach((child) => appendBlocks(child, listPrefix));
              return;
            }
            const heading = node.tagName === "H1" ? HeadingLevel.HEADING_1
              : node.tagName === "H2" ? HeadingLevel.HEADING_2
                : node.tagName === "H3" ? HeadingLevel.HEADING_3
                  : undefined;
            const quotePrefix = node.tagName === "BLOCKQUOTE" ? "“" : listPrefix;
            const runs = createRuns(node);
            paragraphs.push(new Paragraph({
              children: quotePrefix ? [new TextRun({ text: quotePrefix }), ...runs, ...(node.tagName === "BLOCKQUOTE" ? [new TextRun({ text: "”" })] : [])] : runs,
              ...(heading ? { heading } : {}),
            }));
          };
          Array.from(container.childNodes).forEach((node) => appendBlocks(node));
        }
        const doc = new Document({ sections: [{ children: paragraphs }] });
        blob = await Packer.toBlob(doc);
        extension = "docx";
      } catch (error) {
        console.error("Could not export a Word document:", error);
        setStorageError(error instanceof Error ? error.message : t("Could not export the Word document."));
        return;
      }
    } else {
      blob = new Blob([format === "markdown" ? markdown : html], { type: format === "markdown" ? "text/markdown" : "text/html" });
      extension = format === "markdown" ? "md" : "html";
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(activeProject.title)}.${extension}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    setExportOpen(false);
    setFeedback(t("Your writing was exported."));
  };

  const visibleProjects = useMemo(() => projects.filter((project) => {
    const query = search.trim().toLowerCase();
    const searchableText = [
      project.title,
      project.genre,
      ...project.chapters.flatMap((chapter) => [
        chapter.title,
        EXPLORER_CATEGORIES[normalizeExplorerCategory(chapter.category)].label,
        ...(chapter.pages ?? []).map(explorerPageSearchText),
      ]),
      ...(project.pages ?? []).map(explorerPageSearchText),
    ].join(" ").toLowerCase();
    const searchMatches = searchableText.includes(query);
    return searchMatches;
  }), [projects, search]);

  const toggleProject = (id: string) => setExpandedProjects((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleChapter = (id: string) => setExpandedChapters((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const handleExplorerDragStart = ({ active }: DragStartEvent) => {
    const data = active.data.current as ExplorerDragData | undefined;
    console.log("[DnD]", { activeId: active.id, overId: undefined });
    const parsedId = parseExplorerSortableId(active.id);
    if (data && parsedId && data.type === parsedId.type && data.itemId === parsedId.itemId) {
      setActiveExplorerDrag({ type: parsedId.type, category: data.category, title: data.title });
    }
  };
  const handleExplorerDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const activeData = active.data.current as ExplorerDragData | undefined;
    const overData = over.data.current as ExplorerDragData | undefined;
    const activeId = parseExplorerSortableId(active.id);
    const overId = parseExplorerSortableId(over.id);
    if (activeData?.type !== "page" || !overData || activeId?.type !== "page" ||
      activeId.itemId !== activeData.itemId || overId?.type !== overData.type || overId.itemId !== overData.itemId) return;
    const targetChapterId = overId.type === "chapter" ? overId.itemId : overData.chapterId;
    if (!targetChapterId) return;
    setExpandedProjects((current) => current.has(overData.projectId) ? current : new Set(current).add(overData.projectId));
    setExpandedChapters((current) => current.has(targetChapterId) ? current : new Set(current).add(targetChapterId));
  };
  const handleExplorerDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveExplorerDrag(null);
    console.log("[DnD]", { activeId: active.id, overId: over?.id });
    if (!over || active.id === over.id) return;
    const source = active.data.current as ExplorerDragData | undefined;
    const target = over.data.current as ExplorerDragData | undefined;
    const sourceId = parseExplorerSortableId(active.id);
    const targetId = parseExplorerSortableId(over.id);
    if (!source || !target || !sourceId || !targetId || source.type !== sourceId.type ||
      source.itemId !== sourceId.itemId || target.type !== targetId.type || target.itemId !== targetId.itemId) return;

    if (sourceId.type === "book") {
      if (targetId.type !== "book") return;
      const currentProjects = projectsRef.current;
      const fromIndex = currentProjects.findIndex((project) => project.id === sourceId.itemId);
      const toIndex = currentProjects.findIndex((project) => project.id === targetId.itemId);
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) commitProjects(arrayMove(currentProjects, fromIndex, toIndex));
      return;
    }

    const project = projectsRef.current.find((item) => item.id === source.projectId);
    if (!project) return;

    if (sourceId.type === "chapter") {
      if (targetId.type !== "chapter" || source.projectId !== target.projectId) return;
      const fromIndex = project.chapters.findIndex((chapter) => chapter.id === sourceId.itemId);
      const toIndex = project.chapters.findIndex((chapter) => chapter.id === targetId.itemId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      updateProject(project.id, { chapters: arrayMove(project.chapters, fromIndex, toIndex) });
      return;
    }

    if (target.projectId !== source.projectId || !source.chapterId) return;
    const destinationChapterId = targetId.type === "chapter" ? targetId.itemId : target.chapterId;
    if (!destinationChapterId) return;
    const sourceChapter = project.chapters.find((chapter) => chapter.id === source.chapterId);
    const destinationChapter = project.chapters.find((chapter) => chapter.id === destinationChapterId);
    if (!sourceChapter || !destinationChapter) return;
    const sourcePages = sourceChapter.pages ?? [];
    const fromIndex = sourcePages.findIndex((page) => page.id === sourceId.itemId);
    if (fromIndex < 0) return;

    if (sourceChapter.id === destinationChapter.id) {
      const toIndex = targetId.type === "page"
        ? sourcePages.findIndex((page) => page.id === targetId.itemId)
        : sourcePages.length - 1;
      if (toIndex < 0 || fromIndex === toIndex) return;
      updateProject(project.id, {
        chapters: project.chapters.map((chapter) => chapter.id === sourceChapter.id
          ? { ...chapter, pages: arrayMove(sourcePages, fromIndex, toIndex) }
          : chapter),
      });
      return;
    }

    const movedPage = sourcePages[fromIndex];
    const remainingSourcePages = sourcePages.filter((page) => page.id !== movedPage.id);
    const destinationPages = destinationChapter.pages ?? [];
    const targetIndex = targetId.type === "page"
      ? destinationPages.findIndex((page) => page.id === targetId.itemId)
      : destinationPages.length;
    if (targetId.type === "page" && targetIndex < 0) return;
    const translatedRect = active.rect.current.translated;
    const overRect = over.rect;
    const insertAfter = targetId.type === "page" && translatedRect
      ? translatedRect.top + translatedRect.height / 2 > overRect.top + overRect.height / 2
      : false;
    const insertAt = Math.max(0, targetIndex + Number(insertAfter));
    const nextDestinationPages = [...destinationPages];
    nextDestinationPages.splice(insertAt, 0, movedPage);
    updateProject(project.id, {
      chapters: project.chapters.map((chapter) => {
        if (chapter.id === sourceChapter.id) return { ...chapter, pages: remainingSourcePages };
        if (chapter.id === destinationChapter.id) return { ...chapter, pages: nextDestinationPages };
        return chapter;
      }),
    });
  };

  const saveLabel = saveState === "loading" ? t("Loading drafts…")
    : saveState === "saving" ? t("Saving…")
      : saveState === "error" ? t("Save failed")
        : storageMode === "cloud" ? t("Synced to cloud")
          : savedAt ? `${t("Saved on device")} ${new Date(savedAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}` : t("Saved on device");
  const [leftPage, rightPage] = estimatePages(activeChapter?.content ?? "");
  const paperSize = activeProject?.paperSize ?? "trade";
  const writingPages = activeChapter && activeProject
    ? paginateWritingText(activeChapter.content, paperSize, activeProject.fontSize ?? 18, activeProject.lineSpacing ?? 1.8)
    : [""];
  const activeChapterIndex = Math.max(0, activeProject?.chapters.findIndex((chapter) =>
    chapter.id === (activePage ? activePageParentChapter?.id : activeChapter?.id),
  ) ?? 0);
  const paper = PAPER_COLORS.find((option) => option.value === activeProject?.paperColor) ?? PAPER_COLORS[0];
  const font = FONT_FAMILIES.find((option) => option.value === activeProject?.fontFamily) ?? FONT_FAMILIES[0];
  useEffect(() => {
    if (!onStudioToolbarChange) return;
    const actions: StudioTitlebarActions = {
      onOpenWritePage: () => setStudioMode("write"),
      onOpenCoverDesigner: () => openStudioPage("/writings/cover"),
      onOpenGoalsPage: () => openStudioPage("/writings/goals"),
      onOpenAnalyticsPage: () => openStudioPage("/writings/analytics"),
      onNewProject: createProject,
      onOpenProjectPicker: openProjectPicker,
      onSelectRecentProject: openSavedProject,
      onCloseProject: closeCurrentProject,
      onToggleSidebar: toggleExplorerSidebar,
      onUndo: () => { editorRef.current?.focus(); document.execCommand("undo"); },
      onRedo: () => { editorRef.current?.focus(); document.execCommand("redo"); },
      onTogglePaperSettings: () => setPaperSettingsOpen((open) => !open),
      onPreviewBook: () => setReaderPreviewOpen(true),
      onExportPdf: exportBookPdf,
      onOpenShortcuts: () => setShortcutsOpen(true),
      onToggleAssistant: toggleAssistantSidebar,
      onToggleFocus: () => setFocusMode((open) => !open),
      onToggleBookPreview: () => {
        const nextPreviewMode = !previewMode;
        setPreviewMode(nextPreviewMode);
        setStudioMode(nextPreviewMode ? "preview" : "write");
      },
      onFindReplace: () => setFindReplaceOpen(true),
      onJumpToChapter: () => setJumpOpen(true),
    };
    onStudioToolbarChange({
      activeProjectId,
      recentProjects,
      projectTitle: activeProject?.title ?? "",
      chapterTitle: activePage
        ? `${activeDocumentParentChapter ? `${activeDocumentParentChapter.title} > ` : `${t("Book pages")} > `}${activePage.title}`
        : activeChapter?.title ?? "",
      sidebarOpen: explorerSidebarOpen,
      paperSettingsOpen,
      hasProject: Boolean(activeProject),
      assistantOpen: assistantSidebarOpen,
      focusMode,
      actions,
    });
  });

  return (
    <div className={`page-shell  writing-screen writing-studio mode-${studioMode} ${focusMode ? "is-focus" : ""} ${explorerSidebarOpen ? "" : "left-collapsed"} ${assistantSidebarOpen ? "" : "right-collapsed"}`}>
      <input
        ref={manuscriptInputRef}
        className="hidden"
        type="file"
        accept=".md,.txt,text/markdown,text/plain"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importManuscript(file);
          event.currentTarget.value = "";
        }}
      />
      <ResizablePanelGroup orientation="horizontal" className="studio-panel-group flex-1 min-h-0">
      {!focusMode && (explorerSidebarOpen || assistantSidebarOpen) && <button type="button" className="studio-mobile-panel-backdrop" aria-label={t("Close")} onClick={() => {
        setLeftOpen(false);
        setRightOpen(false);
        setWelcomeLeftOpen(false);
        setWelcomeRightOpen(false);
      }} />}
      {explorerPanelRequested && !focusMode && <>
      <ResizablePanel id="studio-drafts" panelRef={leftPanelRef} defaultSize="22%" collapsible={true} collapsedSize={0} minSize="15%" maxSize="30%" onResize={(size) => setIsLeftCollapsed(size.inPixels <= 1)} className="studio-resizable-panel overflow-hidden">
      {!isLeftCollapsed && <ExplorerSidebar
        activeChapter={activeChapter}
        activeChapterId={activeChapterId}
        activeExplorerDrag={activeExplorerDrag}
        activePageId={activePageId}
        activeProject={activeProject}
        activeProjectId={activeProjectId}
        expandedChapters={expandedChapters}
        expandedProjects={expandedProjects}
        explorerCollisionDetection={explorerCollisionDetection}
        explorerSensors={explorerSensors}
        fileNameEdited={fileNameEdited}
        filePickerOpen={filePickerOpen}
        folderNameEdited={folderNameEdited}
        folderPickerOpen={folderPickerOpen}
        newFileCategory={newFileCategory}
        newFileName={newFileName}
        newFolderCategory={newFolderCategory}
        newFolderName={newFolderName}
        renameDraft={renameDraft}
        renameTarget={renameTarget}
        search={search}
        selectedExplorerChapter={selectedExplorerChapter}
        visibleProjects={visibleProjects}
        onBeginRename={beginRename}
        onCreateChapter={createChapter}
        onCreatePage={createPage}
        onCreateProject={() => createProject()}
        onDefaultFileTitle={defaultFileTitle}
        onDefaultFolderTitle={defaultFolderTitle}
        onDragEnd={handleExplorerDragEnd}
        onDragOver={handleExplorerDragOver}
        onDragStart={handleExplorerDragStart}
        onDuplicateChapter={duplicateChapter}
        onDuplicatePage={duplicatePage}
        onDuplicateProject={duplicateProject}
        onFinishRename={finishRename}
        onMoveChapter={moveChapter}
        onOpenFilePicker={openFilePicker}
        onOpenFolderPicker={openFolderPicker}
        onRemoveChapter={removeChapter}
        onRemovePage={removePage}
        onRemoveProject={removeProject}
        onSelectDocument={selectDocument}
        onToggleChapter={toggleChapter}
        onToggleProject={toggleProject}
        setActiveExplorerDrag={setActiveExplorerDrag}
        setExpandedChapters={setExpandedChapters}
        setExpandedProjects={setExpandedProjects}
        setFileNameEdited={setFileNameEdited}
        setFilePickerOpen={setFilePickerOpen}
        setFolderNameEdited={setFolderNameEdited}
        setFolderPickerOpen={setFolderPickerOpen}
        setNewFileCategory={setNewFileCategory}
        setNewFileName={setNewFileName}
        setNewFolderCategory={setNewFolderCategory}
        setNewFolderName={setNewFolderName}
        setRenameDraft={setRenameDraft}
        setRenameTarget={setRenameTarget}
        setSearch={setSearch}
      />}

      </ResizablePanel>
      <ResizableHandle withHandle className={`studio-resize-handle ${isLeftCollapsed ? "is-collapsed" : ""}`} />
      </>}

      <ResizablePanel id="studio-editor" defaultSize={focusMode || (!explorerSidebarOpen && !assistantSidebarOpen) ? "100%" : explorerSidebarOpen && assistantSidebarOpen ? "56%" : "78%"} minSize="30%" className="studio-resizable-panel studio-center-panel flex-1 min-h-0">
      <main className="studio-editor">
        {loadingError && <ErrorAlert className="studio-error" message={loadingError} />}
        {storageError && <ErrorAlert className="studio-error" message={storageError} onDismiss={() => setStorageError("")} />}

        {paperSettingsOpen && activeProject && studioMode === "write" && <section className="paper-settings-popover" aria-label={t("Paper and typography settings")}>
          <div className="paper-settings-heading"><strong>{t("Paper & Typography")}</strong><button type="button" onClick={() => setPaperSettingsOpen(false)} aria-label={t("Close")}><X size={14} /></button></div>
          <label>{t("Paper style")}<select value={activeProject.paperStyle ?? "editorial"} onChange={(event) => updateProject(activeProject.id, { paperStyle: event.target.value as WritingPaperStyle })}>{PAPER_STYLES.map((style) => <option key={style.value} value={style.value}>{t(style.label)}</option>)}</select></label>
          <label>{t("Page size")}<select value={paperSize} onChange={(event) => updateProject(activeProject.id, { paperSize: event.target.value as WritingPageSize })}><option value="trade">{t("Trade Book (6 × 9 in)")}</option><option value="a4">{t("A4")}</option></select></label>
          <div className="paper-color-options"><span>{t("Paper color")}</span><div>{PAPER_COLORS.map((option) => <button type="button" key={option.value} title={t(option.name)} aria-label={t(option.name)} aria-pressed={paper.value === option.value} style={{ backgroundColor: option.value }} onClick={() => updateProject(activeProject.id, { paperColor: option.value })} />)}</div></div>
          <label>{t("Font family")}<select value={activeProject.fontFamily ?? "editorial"} onChange={(event) => updateProject(activeProject.id, { fontFamily: event.target.value as WritingFontFamily })}>{FONT_FAMILIES.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select></label>
          <label>{t("Font size")} <small>{activeProject.fontSize ?? 18}px</small><input type="range" min="14" max="24" value={activeProject.fontSize ?? 18} onChange={(event) => updateProject(activeProject.id, { fontSize: Number(event.target.value) })} /></label>
          <label>{t("Line spacing")} <small>{(activeProject.lineSpacing ?? 1.8).toFixed(1)}</small><input type="range" min="1.2" max="2.4" step="0.1" value={activeProject.lineSpacing ?? 1.8} onChange={(event) => updateProject(activeProject.id, { lineSpacing: Number(event.target.value) })} /></label>
        </section>}

        {activeProject && activeChapter ? <>
          {!previewMode ? <>
            <WritingEditorToolbar
              fontSize={activeProject.fontSize ?? 18}
              lineSpacing={activeProject.lineSpacing ?? 1.8}
              rulerVisible={rulerVisible}
              onCommand={runEditorCommand}
              onFontFamily={applyFontFamily}
              onFontSize={applyFontSize}
              onDocumentStyle={applyDocumentStyle}
              onLineSpacing={applyLineSpacing}
              onInsertChecklist={insertChecklist}
              onInsertHtml={insertEditorHtml}
              onInsertImage={insertImage}
              onInsertDivider={insertDivider}
              onInsertLink={insertLink}
              onOpenFindReplace={() => setFindReplaceOpen(true)}
              onToggleRuler={() => setRulerVisible((visible) => !visible)}
            />
            {rulerVisible && <div className="studio-ruler" aria-label={t("Document ruler")}><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>}
            <div className={`studio-editor-scroll ${printLayout ? "print-layout" : "web-layout"}`}>
              <div className="studio-paper-zoom" style={{ transform: `scale(${editorZoom / 100})` }}>
                <article className="writing-document-page studio-rich-paper" style={{ backgroundColor: paper.value, color: paper.ink, fontFamily: font.css, "--paper-ink": paper.ink } as CSSProperties}>
                  <div className="writing-sheet-coverline"><span className="writing-sheet-kicker">{activeProject.genre || t("A work in progress")}</span><span className={activeProject.visibility === "public" ? "writing-status published" : "writing-status"}>{activeProject.visibility === "public" ? <Globe2 size={11} /> : <Lock size={11} />}{activeProject.visibility === "public" ? t("Published") : t("Private draft")}</span></div>
                  <input className="writing-title-input" style={{ color: paper.ink, fontFamily: font.css }} aria-label={t("Story title")} value={activeProject.title} onChange={(event) => updateProject(activeProject.id, { title: event.target.value })} placeholder={t("The title of your story")} />
                  <input className="writing-subtitle-input" style={{ color: paper.ink, fontFamily: font.css }} aria-label={t("Subtitle")} value={activeProject.subtitle} onChange={(event) => updateProject(activeProject.id, { subtitle: event.target.value })} placeholder={t("A subtitle, if you have one")} />
                  <div className="writing-chapter-heading">
                    <input aria-label={t(activePage ? "Page title" : "Chapter title")} value={activeChapter.title} onChange={(event) => updateChapter(activeChapter.id, { title: event.target.value })} placeholder={t(activePage ? "Page title" : "Section title")} />
                    <span>{activePage ? activePageParentChapter ? t(activePage.kind) : t("Book page") : `${activeChapterIndex + 1} / ${activeProject.chapters.length}`}</span>
                  </div>
                  <div className="writing-editor-wrap">
                    <div
                      ref={editorRef}
                      className="writing-editor studio-rich-editor"
                      role="textbox"
                      aria-label={t("Write your document")}
                      aria-multiline="true"
                      contentEditable
                      suppressContentEditableWarning
                      dir="auto"
                      spellCheck
                      data-placeholder={t("Start writing...")}
                      style={{ color: paper.ink, fontFamily: font.css, fontSize: `${activeProject.fontSize ?? 18}px`, lineHeight: activeProject.lineSpacing ?? 1.8 }}
                      onFocus={() => { editorDocumentIdRef.current = activeChapter.id; captureSelection(); }}
                      onInput={() => saveRichEditor()}
                      onMouseUp={captureSelection}
                      onKeyUp={captureSelection}
                      onBlur={() => saveRichEditor()}
                      onPaste={(event) => {
                        event.preventDefault();
                        const text = event.clipboardData.getData("text/plain");
                        document.execCommand("insertText", false, text);
                        saveRichEditor(event.currentTarget);
                      }}
                    />
                    {selection && <div className="writing-selection-tools">
                      <span>{t("Selected text")}</span>
                      <button type="button" disabled={assistantBusy} onMouseDown={(event) => event.preventDefault()} onClick={() => { setAssistantTool("polish"); void runAssistant("polish", selection); }}><WandSparkles size={13} /> {t("Polish")}</button>
                      <button type="button" disabled={assistantBusy} onMouseDown={(event) => event.preventDefault()} onClick={() => { setAssistantTool("tone"); void runAssistant("tone", selection); }}><Sparkles size={13} /> {t("Rewrite")}</button>
                    </div>}
                  </div>
                  <footer className="writing-page-footer"><span>{t("Page")} 1 {t("of")} {writingPages.length}</span><span>{activeChapter.title || t("Untitled section")}</span></footer>
                </article>
              </div>
            </div>
          </> : <section className="book-preview-stage">
            <div className="book-preview-topline"><span><BookOpen size={14} /> {t("PREVIEW AS BOOK")}</span></div>
            <div className={`book-preview-spread ${previewDirection}`} dir={previewDirection}>
              {[leftPage, rightPage].map((page, index) => <article className="book-preview-page" key={index}>
                {index === 0 && <><span className="preview-chapter-label">{activeChapter.title}</span><h1>{activeProject.title}</h1>{activeProject.subtitle && <p className="preview-subtitle">{activeProject.subtitle}</p>}</>}
                <PlainMarkdown value={page} />
                <footer>{index === 0 ? "— 1 —" : "— 2 —"}</footer>
              </article>)}
            </div>
            <p className="book-preview-note"><CircleHelp size={13} /> {t("A live layout preview. Final pagination may vary by reader settings.")}</p>
          </section>}
          <footer className="studio-statusbar studio-word-statusbar">
            {editorStatsOpen && <div className="studio-document-stats"><strong>{t("Document statistics")}</strong><span>{activeDocumentWords.toLocaleString(locale)} {t("words")}</span><span>{activeDocumentCharacters.toLocaleString(locale)} {t("characters")}</span><span>{t("About")} {Math.max(1, Math.ceil(activeDocumentWords / 220))} {t("minutes")}</span></div>}
            <div className="studio-statusbar-left">
              <span>Page 1 of {writingPages.length}</span><i />
              <button type="button" onClick={() => setEditorStatsOpen((open) => !open)} aria-expanded={editorStatsOpen}>{activeDocumentWords.toLocaleString(locale)} {t("words")} · {activeDocumentCharacters.toLocaleString(locale)} {t("characters")}</button><i />
              <SyncStatusControl token={token} />
              <i />
              <span className="studio-status-language">English</span><i className="studio-status-language-separator" />
              <span className="studio-status-saved"><span className={`studio-save-dot ${saveState}`} />{saveState === "saved" ? t("Saved") : saveLabel}</span>
            </div>
            <div className="studio-statusbar-actions">
              <button type="button" className={focusMode ? "selected" : ""} onClick={() => setFocusMode((enabled) => !enabled)} title={t("Focus Mode")}><Eye size={13} />{t("Focus Mode")}</button>
              <button type="button" className={printLayout ? "selected" : ""} onClick={() => setPrintLayout((enabled) => !enabled)} title={t("Print Layout")}><Printer size={13} />{t("Print Layout")}</button>
              <div className="studio-zoom-control"><button type="button" title={t("Zoom out")} aria-label={t("Zoom out")} onClick={() => setEditorZoom((zoom) => Math.max(50, zoom - 10))}>−</button><input type="range" min="50" max="150" step="5" value={editorZoom} aria-label={t("Zoom")} onChange={(event) => setEditorZoom(Number(event.target.value))} /><button type="button" title={t("Zoom in")} aria-label={t("Zoom in")} onClick={() => setEditorZoom((zoom) => Math.min(150, zoom + 10))}>+</button><button type="button" onClick={() => setEditorZoom(100)}>{editorZoom}%</button></div>
              <button type="button" className="studio-publish-button" onClick={() => setPublishOpen(true)}><Globe2 size={13} />{t("Publish")}</button>
              <button type="button" className="studio-export-status-button" onClick={() => setExportOpen((open) => !open)}><Download size={13} />{t("Export")}</button>
            </div>
          </footer>
        </> : <StudioWelcomeScreen
          recentProjects={orderedProjects}
          onNewProject={createProject}
          onOpenProject={openSavedProject}
          onOpenFolder={openProjectPicker}
          onImportManuscript={() => manuscriptInputRef.current?.click()}
        />}
      </main>
      </ResizablePanel>

      {assistantPanelRequested && !focusMode && <>
      <ResizableHandle withHandle className={`studio-resize-handle ${isRightCollapsed ? "is-collapsed" : ""}`} />
      <ResizablePanel id="studio-assistant" panelRef={rightPanelRef} defaultSize="22%" collapsible={true} collapsedSize={0} minSize="14%" maxSize="34%" onResize={(size) => setIsRightCollapsed(size.inPixels <= 1)} className="studio-resizable-panel overflow-hidden">
      {!isRightCollapsed && <AssistantSidebar
        activeProject={activeProject}
        activeChapter={activeChapter}
        activePage={activePage}
        activePageParentChapter={activePageParentChapter}
        assistantBusy={assistantBusy}
        assistantChatId={assistantChatId}
        assistantContextScope={assistantContextScope}
        assistantDraft={assistantDraft}
        assistantHistory={assistantHistory}
        assistantHistoryOpen={assistantHistoryOpen}
        assistantMessages={assistantMessages}
        assistantTool={assistantTool}
        assistantThreadRef={assistantThreadRef}
        assistantComposerRef={assistantComposerRef}
        rightTab={rightTab}
        selection={selection}
        token={token}
        onCopyAssistantMessage={copyAssistantMessage}
        onCreatePage={createPage}
        onInsertAssistantMessage={insertAssistantMessage}
        onOpenConversation={openAssistantConversation}
        onStartNewChat={startNewAssistantChat}
        onSubmitDraft={submitAssistantDraft}
        onUnpublishProject={unpublishProject}
        onUpdateProject={updateProject}
        setAssistantContextScope={setAssistantContextScope}
        setAssistantDraft={setAssistantDraft}
        setAssistantHistoryOpen={setAssistantHistoryOpen}
        setAssistantTool={setAssistantTool}
        setRightTab={setRightTab}
      />}
      </ResizablePanel>
      </>}
      </ResizablePanelGroup>

      {projectPickerOpen && createPortal(
        <div className="studio-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProjectPickerOpen(false); }}>
          <section className="studio-publish-modal studio-project-picker-modal" role="dialog" aria-modal="true" aria-labelledby="open-project-title">
            <button type="button" className="studio-modal-close" onClick={() => setProjectPickerOpen(false)} aria-label={t("Close")}><X size={16} /></button>
            <span className="studio-eyebrow">{t("WORKSPACE")}</span><h2 id="open-project-title">{t("Open Folder / Project")}</h2>
            <p>{t("Choose a saved project or open a local folder.")}</p>
            <div className="studio-project-picker-list">
              {orderedProjects.map((project) => <button type="button" key={project.id} onClick={() => openSavedProject(project.id)}>
                <BookOpen size={16} />
                <span><strong>{project.title || t("Untitled story")}</strong><small>{t(project.formatType ?? "Book")} · {t(project.genre || "Literary Fiction")}</small></span>
                <ChevronRight size={14} />
              </button>)}
              {projects.length === 0 && <p className="studio-welcome-empty-recent">{t("No saved projects yet.")}</p>}
            </div>
            <div className="studio-modal-actions">
              <button type="button" className="button button-secondary" onClick={() => void openLocalFolder()}><FolderPlus size={14} />{t("Choose Local Folder...")}</button>
              <button type="button" className="button button-secondary" onClick={() => setProjectPickerOpen(false)}>{t("Cancel")}</button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {projectDialogOpen && createPortal(
        <div className="studio-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProjectDialogOpen(false); }}>
          <NewProjectWizard
            draft={creationDraft}
            onChange={setCreationDraft}
            onCancel={() => setProjectDialogOpen(false)}
            onCreate={confirmCreateProject}
            t={t}
          />
        </div>,
        document.body,
      )}

      {shortcutsOpen && <div className="studio-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShortcutsOpen(false); }}>
        <section className="studio-publish-modal studio-shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="studio-shortcuts-title">
          <button type="button" className="studio-modal-close" onClick={() => setShortcutsOpen(false)} aria-label={t("Close")}><X size={16} /></button>
          <span className="studio-eyebrow">{t("WORK FASTER")}</span><h2 id="studio-shortcuts-title">{t("Studio shortcuts")}</h2>
          <dl className="shortcuts-list">
            {STUDIO_SHORTCUTS.map((id) =>
              <div key={id}><dt>{t(shortcutLabel(id))}</dt><dd><kbd>{shortcutDisplay(id)}</kbd></dd></div>)}
          </dl>
        </section>
      </div>}

      {findReplaceOpen && activeChapter && <div className="studio-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFindReplaceOpen(false); }}>
        <section className="studio-publish-modal studio-find-modal" role="dialog" aria-modal="true" aria-labelledby="find-replace-title">
          <button type="button" className="studio-modal-close" onClick={() => setFindReplaceOpen(false)} aria-label={t("Close")}><X size={16} /></button>
          <span className="studio-eyebrow">{t("CURRENT CHAPTER")}</span><h2 id="find-replace-title">{t("Find & Replace")}</h2>
          <label className="studio-field">{t("Find")}<input autoFocus value={findText} onChange={(event) => setFindText(event.target.value)} /></label>
          <label className="studio-field">{t("Replace with")}<input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} /></label>
          <div className="studio-modal-actions"><button type="button" className="button button-secondary" onClick={() => setFindReplaceOpen(false)}>{t("Cancel")}</button><button type="button" className="button button-primary" disabled={!findText} onClick={replaceInChapter}>{t("Replace all")}</button></div>
        </section>
      </div>}

      {jumpOpen && activeProject && <div className="studio-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setJumpOpen(false); }}>
        <section className="studio-publish-modal studio-jump-modal" role="dialog" aria-modal="true" aria-labelledby="jump-chapter-title">
          <button type="button" className="studio-modal-close" onClick={() => setJumpOpen(false)} aria-label={t("Close")}><X size={16} /></button>
          <span className="studio-eyebrow">{t("PROJECT CHAPTERS")}</span><h2 id="jump-chapter-title">{t("Jump to Chapter")}</h2>
          <div className="studio-jump-list">{activeProject.chapters.map((chapter, index) => <button type="button" key={chapter.id} onClick={() => { selectDocument(activeProject.id, chapter.id); setJumpOpen(false); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{chapter.title || t("Untitled section")}</strong><ChevronRight size={14} /></button>)}</div>
        </section>
      </div>}

      {publishOpen && activeProject && <div className="studio-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPublishOpen(false); }}>
        <section className="studio-publish-modal" role="dialog" aria-modal="true" aria-labelledby="publish-title">
          <button type="button" className="studio-modal-close" onClick={() => setPublishOpen(false)} aria-label={t("Close")}><X size={16} /></button>
          <span className="studio-eyebrow">{t("SHARE YOUR WORK")}</span><h2 id="publish-title">{t("Where should this story go?")}</h2><p>{t("Choose how you would like to keep or share your writing.")}</p>
          <button type="button" className="publish-option" onClick={() => void addPersonalBook()}><div><BookOpen size={17} /></div><span><strong>{t("Add to my personal shelf")}</strong><small>{t("Compile chapters as a book you can read anytime.")}</small></span><ChevronRight size={15} /></button>
          <button type="button" className="publish-option" onClick={() => void publishProject()}><div><Globe2 size={17} /></div><span><strong>{t("Publish to Public Library")}</strong><small>{t("Share this story with Shelve readers online.")}</small></span><ChevronRight size={15} /></button>
          {storageMode !== "cloud" || !token ? <p className="publish-offline-note"><Lock size={13} /> {t("Public publishing requires an online Shelve account.")}</p> : null}
          <button type="button" className="publish-option" onClick={() => { setPublishOpen(false); setExportOpen(true); }}><div><FileDown size={17} /></div><span><strong>{t("Export a file")}</strong><small>{t("Download a Word document, Markdown, or save as PDF.")}</small></span><ChevronRight size={15} /></button>
        </section>
      </div>}

      {exportOpen && <div className="studio-export-menu">
        <strong>{t("Export writing")}</strong>
        <button type="button" onClick={() => void exportProject("docx")}><FileDown size={14} /> {t("Word document (.docx)")}</button>
        <button type="button" onClick={() => exportProject("markdown")}><FileText size={14} /> {t("Markdown (.md)")}</button>
        <button type="button" onClick={() => exportProject("html")}><FileDown size={14} /> {t("HTML (.html)")}</button>
        <button type="button" onClick={() => exportProject("print")}><Printer size={14} /> {t("PDF (.pdf)")}</button>
        <button type="button" className="studio-export-dismiss" onClick={() => setExportOpen(false)}>{t("Cancel")}</button>
      </div>}
      {readerPreviewOpen && activeProject && <BookReaderPreview
        project={activeProject}
        coverImage={activeProject.coverImage || ""}
        authorName={authorName}
        onClose={() => setReaderPreviewOpen(false)}
      />}
      {feedback && <div className="studio-toast" role="status"><Check size={14} /> {feedback}</div>}
      <span className="studio-accessible-status" aria-live="polite">{saveLabel}</span>
    </div>
  );
}
