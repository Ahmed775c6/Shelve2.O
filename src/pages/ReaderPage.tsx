import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Share2,
  Sparkles,
  StickyNote,
  Trash2,
  Maximize2,
  ListTree,
  Menu,
  Minimize2,
  Minus,
  Plus,
  Search,
  Settings,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { sendAiRequest } from "../lib/cloud";
import { loadRecords, resolveFileUrl, saveRecords } from "../lib/storage";
import type { ReadingSessionRecord, StoredRecord } from "../lib/storage";
import PdfReader from "../components/reader/PdfReader";
import { useLanguage } from "../components/language-provider";
import { matchesShortcut, shortcutDisplay } from "../lib/keyboard-shortcuts";
import { ErrorAlert } from "../components/error-feedback";
import type { Book, WritingProject } from "../types";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface ReaderPageProps {
  book: Book;
  books: Book[];
  authToken?: string | null;
  onOpenBook: (book: Book) => void;
  onUpdate: (book: Book) => void;
}

type ReaderTheme = "light" | "dark" | "sepia";

interface SelectedPassage {
  text: string;
  page: number;
  startOffset?: number;
  endOffset?: number;
}

interface SelectionMenuState {
  x: number;
  y: number;
  passage: SelectedPassage | null;
  highlightId?: string;
}

interface ReaderAnnotation extends StoredRecord {
  bookId: string;
  content: string;
  page?: number;
  isPrivate: boolean;
  kind?: "reader-note" | "reader-highlight";
  quote?: string;
  color?: string;
  startOffset?: number;
  endOffset?: number;
}

interface ReaderBookmark extends StoredRecord {
  bookId: string;
  pageIndex: number;
  title: string;
}

interface ReaderOutlineEntry {
  title: string;
  pageIndex: number;
}

const READER_HIGHLIGHT_PREFIX = "shelve-reader-highlight-";
const READER_HIGHLIGHT_STYLE_ID = "shelve-reader-highlight-styles";
const READER_SEARCH_HIGHLIGHT = "shelve-reader-search";
const DEFAULT_HIGHLIGHT_COLOR = "#b4d5ff";
const LEGACY_DEFAULT_HIGHLIGHT_COLOR = "#fff200";
const HIGHLIGHT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const HIGHLIGHT_PALETTE = [
  "#e5c07b",
  "#b4d5ff",
  "#a9c8a4",
  "#e6a3a3",
  "#c3b4e8",
  "#8fcdb7",
  "#efb58a",
  "#8ac9d6",
] as const;

function normalizePassage(text: string): string {
  return text.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
}

function isRtlLanguage(language: string | undefined): boolean {
  const normalized = language?.trim().toLowerCase();
  return Boolean(normalized && (
    /^(ar|he|iw|fa|ur)([-_]|$)/.test(normalized) ||
    /arabic|hebrew|persian|urdu/.test(normalized)
  ));
}

function containsRtlText(text: string): boolean {
  return /[\u0600-\u06FF\u0590-\u05FF]/.test(text);
}

function captureSelectedPassage(root: HTMLElement, fallbackPage: number): SelectedPassage | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const text = normalizePassage(range.toString());
  if (!text) return null;

  const startElement = range.startContainer instanceof Element
    ? range.startContainer
    : range.startContainer.parentElement;
  const pageRoot = startElement?.closest<HTMLElement>("[data-reader-page], .react-pdf__Page");
  const pageValue = pageRoot?.dataset.readerPage ?? pageRoot?.dataset.pageNumber;
  const parsedPage = Number(pageValue);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : fallbackPage;
  const textRoot = pageRoot?.querySelector<HTMLElement>(".reader-spread-text, .react-pdf__Page__textContent, .textLayer");

  if (!textRoot || !textRoot.contains(range.startContainer) || !textRoot.contains(range.endContainer)) {
    return { text, page };
  }

  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(textRoot);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  const startOffset = prefixRange.toString().length;
  const selectedLength = range.toString().length;

  return {
    text,
    page,
    startOffset,
    endOffset: startOffset + selectedLength,
  };
}

function selectedTextOffsetAtPoint(root: HTMLElement, x: number, y: number): { page: number; offset: number } | null {
  const range = document.caretRangeFromPoint(x, y);
  if (!range || !root.contains(range.startContainer)) return null;
  const element = range.startContainer instanceof Element
    ? range.startContainer
    : range.startContainer.parentElement;
  const pageRoot = element?.closest<HTMLElement>("[data-reader-page], .react-pdf__Page");
  if (!pageRoot) return null;
  const page = Number(pageRoot.dataset.readerPage ?? pageRoot.dataset.pageNumber);
  if (!Number.isInteger(page) || page < 1) return null;
  const textRoot = pageRoot.querySelector<HTMLElement>(".reader-spread-text, .react-pdf__Page__textContent, .textLayer");
  if (!textRoot?.contains(range.startContainer)) return null;
  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(textRoot);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  return { page, offset: prefixRange.toString().length };
}

function clampSelectionMenuPosition(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - 280)),
    y: Math.max(8, Math.min(y, window.innerHeight - 360)),
  };
}

function rangeAtOffsets(root: HTMLElement, startOffset: number, endOffset: number): Range | null {
  let consumed = 0;
  let start: { node: Text; offset: number } | null = null;
  let end: { node: Text; offset: number } | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof Text)) continue;
    const next = consumed + node.length;
    if (!start && startOffset <= next) start = { node, offset: Math.max(0, startOffset - consumed) };
    if (!end && endOffset <= next) end = { node, offset: Math.max(0, endOffset - consumed) };
    consumed = next;
  }

  if (!start || !end || startOffset >= endOffset) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

function findTextRanges(root: HTMLElement, query: string): Range[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node instanceof Text) text += node.data;
  }
  const ranges: Range[] = [];
  const normalizedText = text.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  let index = 0;
  while (normalizedQuery && (index = normalizedText.indexOf(normalizedQuery, index)) !== -1) {
    const range = rangeAtOffsets(root, index, index + normalizedQuery.length);
    if (range) ranges.push(range);
    index += normalizedQuery.length;
  }
  return ranges;
}

function applyReaderSearchHighlights(root: HTMLElement, query: string): void {
  if (!("highlights" in CSS) || typeof Highlight === "undefined") return;
  const ranges: Range[] = [];
  if (query.trim()) {
    for (const pageRoot of root.querySelectorAll<HTMLElement>(".react-pdf__Page, [data-reader-page]")) {
      const textRoot = pageRoot.querySelector<HTMLElement>(".reader-spread-text, .react-pdf__Page__textContent, .textLayer");
      if (textRoot) ranges.push(...findTextRanges(textRoot, query.trim()));
    }
  }
  if (ranges.length) CSS.highlights.set(READER_SEARCH_HIGHLIGHT, new Highlight(...ranges));
  else CSS.highlights.delete(READER_SEARCH_HIGHLIGHT);
}

function applyReaderHighlights(root: HTMLElement, annotations: ReaderAnnotation[]): void {
  if (!("highlights" in CSS) || typeof Highlight === "undefined") return;
  const pageRoots = Array.from(root.querySelectorAll<HTMLElement>("[data-reader-page], .react-pdf__Page"));
  const rangesByName = new Map<string, Range[]>();
  const colorsByName = new Map<string, string>();
  for (const annotation of annotations) {
    if (
      annotation.kind !== "reader-highlight" ||
      typeof annotation.page !== "number" ||
      typeof annotation.startOffset !== "number" ||
      typeof annotation.endOffset !== "number"
    ) continue;

    const pageRoot = pageRoots.find((candidate) => {
      const page = Number(candidate.dataset.readerPage ?? candidate.dataset.pageNumber);
      return page === annotation.page;
    });
    const textRoot = pageRoot?.querySelector<HTMLElement>(".reader-spread-text, .react-pdf__Page__textContent, .textLayer");
    const range = textRoot
      ? rangeAtOffsets(textRoot, annotation.startOffset, annotation.endOffset)
      : null;
    if (!range || normalizePassage(range.toString()) !== annotation.quote) continue;

    const savedColor = annotation.color?.toLowerCase();
    const color = savedColor && HIGHLIGHT_COLOR_PATTERN.test(savedColor) && savedColor !== LEGACY_DEFAULT_HIGHLIGHT_COLOR
      ? savedColor
      : DEFAULT_HIGHLIGHT_COLOR;
    const name = `${READER_HIGHLIGHT_PREFIX}${color.slice(1)}`;
    rangesByName.set(name, [...(rangesByName.get(name) ?? []), range]);
    colorsByName.set(name, color);
  }

  for (const name of Array.from(CSS.highlights.keys())) {
    if (name.startsWith(READER_HIGHLIGHT_PREFIX) && !rangesByName.has(name)) CSS.highlights.delete(name);
  }
  for (const [name, ranges] of rangesByName) {
    CSS.highlights.set(name, new Highlight(...ranges));
  }

  const existingStyle = document.getElementById(READER_HIGHLIGHT_STYLE_ID);
  const styleElement = existingStyle instanceof HTMLStyleElement ? existingStyle : document.createElement("style");
  styleElement.id = READER_HIGHLIGHT_STYLE_ID;
  styleElement.textContent = Array.from(colorsByName, ([name, color]) =>
    `::highlight(${name}) { background-color: ${color}; color: #1a1b1f; }`,
  ).join("\n") + `\n::highlight(${READER_SEARCH_HIGHLIGHT}) { background-color: rgba(229, 192, 123, .45); color: inherit; }`;
  if (!styleElement.isConnected) document.head.append(styleElement);
}

function clearReaderHighlights(): void {
  if ("highlights" in CSS) {
    for (const name of Array.from(CSS.highlights.keys())) {
      if (name.startsWith(READER_HIGHLIGHT_PREFIX) || name === READER_SEARCH_HIGHLIGHT) CSS.highlights.delete(name);
    }
  }
  document.getElementById(READER_HIGHLIGHT_STYLE_ID)?.remove();
}

function splitBookText(content: string): [string[], string[]] {
  const paragraphs = content.split(/\n{2,}/).filter((paragraph) => paragraph.trim());
  if (paragraphs.length === 1 && paragraphs[0].length > 250) {
    const midpoint = paragraphs[0].length / 2;
    const splitAt = paragraphs[0].lastIndexOf(" ", midpoint);
    if (splitAt > 0) {
      return [[paragraphs[0].slice(0, splitAt)], [paragraphs[0].slice(splitAt + 1)]];
    }
  }
  if (paragraphs.length < 2) return [paragraphs, []];

  const halfway = paragraphs.reduce((total, paragraph) => total + paragraph.length, 0) / 2;
  let leftLength = 0;
  let splitIndex = 1;
  while (splitIndex < paragraphs.length - 1 && leftLength < halfway) {
    leftLength += paragraphs[splitIndex - 1].length;
    splitIndex += 1;
  }
  return [paragraphs.slice(0, splitIndex), paragraphs.slice(splitIndex)];
}

interface BookReaderPreviewProps {
  project: WritingProject;
  coverImage?: string;
  authorName?: string;
  onClose: () => void;
}

interface WritingPreviewPage {
  kind: "cover" | "title" | "contents" | "chapter" | "back-cover";
  title: string;
  content: string[];
}

function splitPreviewChapter(content: string): string[][] {
  const paragraphs = content.split(/\n{2,}/).filter((paragraph) => paragraph.trim());
  const pages: string[][] = [];
  let page: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    const blocks: string[] = [];
    let block = "";
    for (const token of paragraph.split(/(\s+)/)) {
      const chunks = token.length > 1400
        ? Array.from({ length: Math.ceil(Array.from(token).length / 1400) }, (_, index) =>
          Array.from(token).slice(index * 1400, (index + 1) * 1400).join(""),
        )
        : [token];
      for (const chunk of chunks) {
        if (block && block.length + chunk.length > 1400) {
          blocks.push(block);
          block = "";
        }
        block += chunk;
      }
    }
    if (block) blocks.push(block);
    for (const block of blocks) {
      if (page.length && length + block.length > 1500) {
        pages.push(page);
        page = [];
        length = 0;
      }
      page.push(block);
      length += block.length;
    }
  }
  return pages.length || page.length ? [...pages, page] : [[]];
}

export function BookReaderPreview({ project, coverImage = "", authorName, onClose }: BookReaderPreviewProps) {
  const { language, t } = useLanguage();
  const [spreadIndex, setSpreadIndex] = useState(0);
  const displayAuthor = authorName || project.authorName || t("Author name");
  const pages = useMemo<WritingPreviewPage[]>(() => {
    const chapters = project.chapters.flatMap((chapter) => splitPreviewChapter(chapter.content).map((content, pageIndex) => ({
      kind: "chapter" as const,
      title: pageIndex === 0 ? chapter.title || t("Untitled section") : chapter.title || t("Untitled section"),
      content,
    })));
    return [
      { kind: "cover", title: project.title || t("Untitled story"), content: [] },
      { kind: "title", title: project.title || t("Untitled story"), content: [project.subtitle, displayAuthor] },
      { kind: "contents", title: t("Table of Contents"), content: project.chapters.map((chapter, index) => `${index + 1}. ${chapter.title || t("Untitled section")}`) },
      ...chapters,
      { kind: "back-cover", title: t("Back Cover"), content: [project.synopsis || t("A preview for this book is not available yet.")] },
    ];
  }, [displayAuthor, project, t]);
  const direction = language === "ar" ? "rtl" : "ltr";
  const visiblePages = pages.slice(spreadIndex, spreadIndex + 2);

  return <div className="studio-modal-backdrop studio-reader-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="studio-reader-preview" role="dialog" aria-modal="true" aria-labelledby="studio-reader-title">
      <header className="studio-reader-header">
        <div><span className="studio-eyebrow">{t("PREVIEW AS BOOK")}</span><h2 id="studio-reader-title">{project.title}</h2></div>
        <button type="button" className="studio-modal-close" onClick={onClose} aria-label={t("Close")}><X size={16} /></button>
      </header>
      <div className="studio-reader-spread-scroll">
        <article className="reader-spread reader-spread-light" dir={direction}>
          {visiblePages.map((page, index) => {
            const pageNumber = spreadIndex + index + 1;
            return <section
              className={`reader-spread-page studio-reader-page studio-reader-page-${page.kind}`}
              key={`${page.kind}-${pageNumber}`}
              style={page.kind === "cover" ? { backgroundColor: project.coverDesign?.background ?? project.coverColor, color: "#FFFFFF" } : undefined}
            >
              {page.kind === "cover" ? <>
                {coverImage && <img className="studio-reader-cover-image" src={coverImage} alt="" />}
                <div className="studio-reader-cover-copy">
                  <h1>{page.title}</h1>
                  {project.subtitle && <p>{project.subtitle}</p>}
                  <small>{displayAuthor}</small>
                </div>
              </> : <>
                <header><h2>{page.title}</h2>{page.kind === "chapter" && <p>{project.title}</p>}</header>
                {page.kind === "contents"
                  ? <ol>{page.content.map((entry) => <li key={entry}>{entry}</li>)}</ol>
                  : page.content.map((paragraph, paragraphIndex) => paragraph && <p key={`${paragraphIndex}-${paragraph.slice(0, 24)}`}>{paragraph}</p>)}
              </>}
              <span className="reader-spread-page-number">{pageNumber} / {pages.length}</span>
            </section>;
          })}
        </article>
      </div>
      <footer className="studio-reader-controls">
        <button type="button" className="studio-view-button" disabled={spreadIndex === 0} onClick={() => setSpreadIndex((index) => Math.max(0, index - 2))}><ChevronLeft size={14} />{t("Previous page")}</button>
        <span>{spreadIndex + 1}–{Math.min(spreadIndex + 2, pages.length)} / {pages.length}</span>
        <button type="button" className="studio-view-button" disabled={spreadIndex + 2 >= pages.length} onClick={() => setSpreadIndex((index) => Math.min(pages.length - 1, index + 2))}>{t("Next page")}<ChevronRight size={14} /></button>
      </footer>
    </section>
  </div>;
}

function isTextLikeFile(fileName: string | undefined, fileType: string | undefined): boolean {
  const type = (fileType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  return ["text", "json", "xml", "markdown", "javascript", "html", "css", "csv"].some((part) =>
    type.includes(part) || name.endsWith(`.${part === "markdown" ? "md" : part === "javascript" ? "js" : part}`),
  ) || name.endsWith(".txt");
}

function ReaderBookCover({ book }: { book: Book }) {
  const [coverUrl, setCoverUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    if (!book.coverImage?.startsWith("asset:")) {
      setCoverUrl(book.coverImage || "");
      return;
    }

    resolveFileUrl(book.coverImage.slice("asset:".length), book.coverMimeType, book.coverFileName, book.remoteCoverFileName, "covers")
      .then((cover) => {
        if (!cover) throw new Error("The saved cover image could not be found.");
        if (cancelled) {
          if (cover.revoke) URL.revokeObjectURL(cover.url);
          return;
        }
        objectUrl = cover.revoke ? cover.url : undefined;
        setCoverUrl(cover.url);
      })
      .catch((error: unknown) => {
        console.error("Could not load a reader sidebar cover:", error);
        if (!cancelled) setCoverUrl("");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [book.coverImage, book.coverMimeType, book.coverFileName, book.remoteCoverFileName]);

  return (
    <span className={`reader-book-list-cover ${book.coverColor}`} aria-hidden="true">
      {coverUrl && <img src={coverUrl} alt="" />}
    </span>
  );
}

export default function ReaderPage({ book, books, authToken, onOpenBook, onUpdate }: ReaderPageProps) {
  const { t } = useLanguage();
  const readerContentRef = useRef<HTMLDivElement>(null);
  const horizontalWheelAt = useRef(0);
  const activeBookIdRef = useRef(book.id);
  activeBookIdRef.current = book.id;
  const readerPageIndexRef = useRef(book.currentPage);
  readerPageIndexRef.current = book.currentPage;
  const readerPagesPerViewRef = useRef(1);
  const readerTotalPagesRef = useRef(book.totalPages);
  const readingSessionPagesRef = useRef(new Set<number>());
  const [fileUrl, setFileUrl] = useState("");
  const [fileError, setFileError] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfPagesPerSpread, setPdfPagesPerSpread] = useState(1);
  const [pdfZoom, setPdfZoom] = useState(100);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [fitMode, setFitMode] = useState<"manual" | "width" | "page">("manual");
  const [pageInput, setPageInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showNavigationDrawer, setShowNavigationDrawer] = useState(false);
  const [outlineEntries, setOutlineEntries] = useState<ReaderOutlineEntry[]>([]);
  const [readerBookmarks, setReaderBookmarks] = useState<ReaderBookmark[]>([]);
  const [textContent, setTextContent] = useState(book.story ?? "");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [fontSize, setFontSize] = useState(20);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>("light");
  const [isRtl, setIsRtl] = useState(false);
  const [highlightColor, setHighlightColor] = useState<string>(HIGHLIGHT_PALETTE[0]);
  const [allAnnotations, setAllAnnotations] = useState<ReaderAnnotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(true);
  const [annotationError, setAnnotationError] = useState("");
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState | null>(null);
  const [savingHighlightAction, setSavingHighlightAction] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const [activePassage, setActivePassage] = useState<SelectedPassage | null>(null);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteError, setNoteError] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiError, setAiError] = useState("");
  const [askingAi, setAskingAi] = useState(false);
  const bookAnnotations = useMemo(
    () => allAnnotations.filter((annotation) => annotation.bookId === book.id),
    [allAnnotations, book.id],
  );
  const selectedPassageHighlightIds = useMemo(() => {
    if (selectionMenu?.highlightId) {
      return bookAnnotations.some((item) => item.id === selectionMenu.highlightId && item.kind === "reader-highlight")
        ? [selectionMenu.highlightId]
        : [];
    }
    const passage = selectionMenu?.passage;
    if (!passage) return [];
    const { startOffset, endOffset } = passage;
    if (typeof startOffset !== "number" || typeof endOffset !== "number") return [];
    return bookAnnotations
      .filter((item) =>
        item.kind === "reader-highlight" &&
        item.page === passage.page &&
        typeof item.startOffset === "number" &&
        typeof item.endOffset === "number" &&
        item.startOffset < endOffset &&
        item.endOffset > startOffset
      )
      .map((item) => item.id);
  }, [bookAnnotations, selectionMenu]);
  const activeHighlightColor = selectionMenu?.highlightId
    ? bookAnnotations.find((item) => item.id === selectionMenu.highlightId)?.color ?? highlightColor
    : highlightColor;

  useEffect(() => {
    setPdfPageCount(0);
    setPdfPagesPerSpread(1);
    setPdfDocument(null);
    setSearchHits([]);
    setSearchIndex(-1);
    setSearchQuery("");
    setSearchError("");
    setOutlineEntries([]);
    setShowNavigationDrawer(false);
  }, [book.id]);

  useEffect(() => {
    let cancelled = false;
    setAnnotationsLoading(true);
    setAnnotationError("");
    loadRecords<ReaderAnnotation>("notes")
      .then((records) => {
        if (!cancelled) setAllAnnotations(records);
      })
      .catch((error: unknown) => {
        console.error("Could not load reader annotations:", error);
        if (!cancelled) setAnnotationError(error instanceof Error ? error.message : "Could not load this book's notes.");
      })
      .finally(() => {
        if (!cancelled) setAnnotationsLoading(false);
      });
    return () => { cancelled = true; };
  }, [book.id]);

  useEffect(() => {
    try {
      const savedZoom = Number(localStorage.getItem(`reader-pdf-zoom-${book.id}`));
      if (Number.isFinite(savedZoom) && savedZoom >= 50 && savedZoom <= 200) setPdfZoom(savedZoom);
      else setPdfZoom(100);
      const savedHighlightColor = localStorage.getItem("reader-highlight-color");
      if (savedHighlightColor && HIGHLIGHT_COLOR_PATTERN.test(savedHighlightColor)) {
        setHighlightColor(savedHighlightColor.toLowerCase() === LEGACY_DEFAULT_HIGHLIGHT_COLOR
          ? DEFAULT_HIGHLIGHT_COLOR
          : savedHighlightColor);
      }
    } catch (error) {
      console.error("Could not load reader zoom and highlight preferences:", error);
    }
  }, [book.id]);

  useEffect(() => {
    const root = readerContentRef.current;
    if (!root) return;
    const applyHighlights = () => {
      applyReaderHighlights(root, bookAnnotations);
      applyReaderSearchHighlights(root, searchQuery);
    };
    const observer = new MutationObserver(applyHighlights);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    applyHighlights();
    return () => {
      observer.disconnect();
      clearReaderHighlights();
    };
  }, [bookAnnotations, book.id, searchQuery]);

  useEffect(() => {
    try {
      const savedFontSize = Number(localStorage.getItem("reader-font-size"));
      if (Number.isFinite(savedFontSize) && savedFontSize >= 12 && savedFontSize <= 40) {
        setFontSize(savedFontSize);
      }
      const savedTheme = localStorage.getItem("reader-theme");
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "sepia") {
        setReaderTheme(savedTheme);
      }
      const savedSidebar = localStorage.getItem("reader-sidebar");
      if (savedSidebar !== null) setShowSidebar(savedSidebar === "true");
    } catch (error) {
      console.error("Could not load reader preferences:", error);
    }
  }, []);

  useEffect(() => {
    try {
      const savedDirection = localStorage.getItem(`reader-direction-${book.id}`);
      setIsRtl(savedDirection === null ? isRtlLanguage(book.language) : savedDirection === "rtl");
    } catch (error) {
      console.error("Could not load the saved reading direction:", error);
      setIsRtl(isRtlLanguage(book.language));
    }
  }, [book.id, book.language]);

  useEffect(() => {
    let url = "";
    let cancelled = false;
    setFileUrl("");
    setFileError("");
    const fileIdentifier = book.fileKey ?? book.remoteFileName;
    if (!fileIdentifier) {
      setFileLoading(false);
      setTextContent(book.story ?? "");
      return;
    }
    setFileLoading(true);
    resolveFileUrl(fileIdentifier, book.fileMimeType, book.fileName, book.remoteFileName, "books").then((file) => {
      if (!file) throw new Error("The book file is not available in local storage.");
      if (cancelled) {
        if (file.revoke) URL.revokeObjectURL(file.url);
        return;
      }
      url = file.revoke ? file.url : "";
      setFileUrl(file.url);
    }).catch((error: unknown) => {
      if (!cancelled) setFileError(error instanceof Error ? error.message : "Could not open the book file.");
    }).finally(() => {
      if (!cancelled) setFileLoading(false);
    });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [book.id, book.fileKey, book.remoteFileName, book.fileMimeType, book.fileName, book.story]);

  useEffect(() => {
    if (!fileUrl || !isTextLikeFile(book.fileName, book.fileMimeType)) return;
    let cancelled = false;
    setTextContent("");
    setFileLoading(true);
    fetch(fileUrl).then(async (response) => {
      if (!response.ok) throw new Error("Could not read the text file.");
      return response.text();
    }).then((content) => {
      if (!cancelled) setTextContent(content);
    }).catch((error: unknown) => {
      if (!cancelled) setFileError(error instanceof Error ? error.message : "Could not read the text file.");
    }).finally(() => {
      if (!cancelled) setFileLoading(false);
    });
    return () => { cancelled = true; };
  }, [fileUrl, book.fileName, book.fileMimeType]);

  const isPdf = book.fileName?.toLowerCase().endsWith(".pdf") || book.fileMimeType?.toLowerCase().includes("pdf");

  const changePage = useCallback((delta: number) => {
    if (isPdf && !pdfPageCount) return;
    const totalPages = pdfPageCount || book.totalPages;
    const lastPageIndex = totalPages > 0 ? totalPages - 1 : Number.MAX_SAFE_INTEGER;
    const page = Math.max(0, Math.min(lastPageIndex, book.currentPage + delta));
    onUpdate({ ...book, currentPage: page, status: page > 0 ? "reading" : book.status, startedAt: book.startedAt ?? new Date().toISOString() });
  }, [book, isPdf, onUpdate, pdfPageCount]);

  const changeFontSize = (delta: number) => {
    const nextSize = Math.max(12, Math.min(40, fontSize + delta));
    setFontSize(nextSize);
    try {
      localStorage.setItem("reader-font-size", String(nextSize));
    } catch (error) {
      console.error("Could not save the reader font size:", error);
    }
  };

  const changeReaderTheme = useCallback((nextTheme: ReaderTheme) => {
    setReaderTheme(nextTheme);
    try {
      localStorage.setItem("reader-theme", nextTheme);
    } catch (error) {
      console.error("Could not save the reader theme:", error);
    }
  }, []);

  const toggleReaderTheme = useCallback(() => {
    const themes: ReaderTheme[] = ["light", "sepia", "dark"];
    const currentThemeIndex = themes.indexOf(readerTheme);
    changeReaderTheme(themes[(currentThemeIndex + 1) % themes.length]);
  }, [changeReaderTheme, readerTheme]);

  const toggleSidebar = () => {
    const nextVisible = !showSidebar;
    setShowSidebar(nextVisible);
    try {
      localStorage.setItem("reader-sidebar", String(nextVisible));
    } catch (error) {
      console.error("Could not save the reader sidebar preference:", error);
    }
  };

  const toggleReadingDirection = useCallback(() => {
    const next = !isRtl;
    setIsRtl(next);
    try {
      localStorage.setItem(`reader-direction-${book.id}`, next ? "rtl" : "ltr");
    } catch (error) {
      console.error("Could not save the reading direction:", error);
    }
  }, [book.id, isRtl]);

  const shareBook = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: book.title,
        text: `${t("Reading")} ${book.title} ${t("by")} ${book.author}`,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Could not share the book:", error);
    }
  };

  const isTextFile = isTextLikeFile(book.fileName, book.fileMimeType);
  const totalPages = pdfPageCount || book.totalPages;
  const currentPageIndex = Math.max(0, Math.min(totalPages > 0 ? totalPages - 1 : Number.MAX_SAFE_INTEGER, book.currentPage));
  const currentPage = currentPageIndex + 1;
  const canMovePrevious = book.currentPage > 0 && (!isPdf || pdfPageCount > 0);
  const canMoveNext = (!isPdf || pdfPageCount > 0) && (totalPages === 0 || book.currentPage < totalPages - 1);
  const pagesPerView = isPdf ? pdfPagesPerSpread : isTextFile || !fileUrl ? 2 : 1;
  readerPagesPerViewRef.current = pagesPerView;
  readerTotalPagesRef.current = totalPages;
  const turnSpread = useCallback((forward: boolean) => changePage((forward ? 1 : -1) * pagesPerView), [changePage, pagesPerView]);
  const goToPageNumber = useCallback((pageNumber: number) => {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > totalPages) return;
    changePage(pageNumber - 1 - book.currentPage);
    setPageInput("");
  }, [book.currentPage, changePage, totalPages]);
  const displayPageEnd = totalPages > 0
    ? Math.min(currentPageIndex + pagesPerView, totalPages)
    : currentPageIndex + pagesPerView;
  const pageRange = displayPageEnd > currentPageIndex + 1
    ? `${currentPage}–${displayPageEnd}`
    : `${currentPage}`;
  const progress = totalPages > 0
    ? Math.min(100, Math.round((book.currentPage / totalPages) * 100))
    : 0;
  const remainingMinutes = totalPages > 0 ? Math.max(0, totalPages - book.currentPage) * 2 : null;
  const remainingTime = remainingMinutes === null
    ? "--"
    : remainingMinutes >= 60
      ? `${Math.floor(remainingMinutes / 60)}h ${remainingMinutes % 60}m`
      : `${remainingMinutes}m`;
  const sessions = Math.round(book.currentPage / 30);
  const readingBooks = books.filter((candidate) => candidate.status === "reading" || candidate.id === book.id);

  useEffect(() => {
    const sessionBookId = book.id;
    const sessionId = crypto.randomUUID();
    const startedAt = new Date();
    const seenPages = new Set<number>();
    readingSessionPagesRef.current = seenPages;
    let activeMilliseconds = 0;
    let lastTickAt = Date.now();
    let lastInteractionAt = lastTickAt;
    let lastSavedSignature = "";
    let saveQueue = Promise.resolve();

    const collectVisibleSpread = () => {
      if (activeBookIdRef.current !== sessionBookId) return;
      const startIndex = readerPageIndexRef.current;
      for (let offset = 0; offset < readerPagesPerViewRef.current; offset += 1) {
        const pageIndex = startIndex + offset;
        if (readerTotalPagesRef.current > 0 && pageIndex >= readerTotalPagesRef.current) break;
        seenPages.add(pageIndex + 1);
      }
    };

    const accountForElapsed = (visible = document.visibilityState === "visible") => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.min(now - lastTickAt, 30_000));
      if (visible && now - lastInteractionAt <= 5 * 60_000) activeMilliseconds += elapsed;
      lastTickAt = now;
      collectVisibleSpread();
    };

    const persistSession = () => {
      const durationSeconds = Math.floor(activeMilliseconds / 1000);
      if (durationSeconds < 15 && seenPages.size <= readerPagesPerViewRef.current) return;
      const pages = [...seenPages].sort((a, b) => a - b);
      const signature = `${durationSeconds}:${pages.length}`;
      if (!pages.length || signature === lastSavedSignature) return;
      lastSavedSignature = signature;
      const record: ReadingSessionRecord = {
        id: sessionId,
        bookId: sessionBookId,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        durationSeconds,
        pagesRead: pages.length,
        firstPage: pages[0] ?? 1,
        lastPage: pages[pages.length - 1] ?? 1,
        updatedAt: new Date().toISOString(),
      };
      saveQueue = saveQueue.then(async () => {
        const records = await loadRecords<ReadingSessionRecord>("readingSessions");
        await saveRecords("readingSessions", [...records.filter((item) => item.id !== sessionId), record]);
      }).catch((error: unknown) => {
        lastSavedSignature = "";
        console.error("Could not save reading activity:", error);
      });
    };

    const markInteraction = () => { lastInteractionAt = Date.now(); };
    const tick = () => {
      accountForElapsed();
      persistSession();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        accountForElapsed(true);
        persistSession();
      } else {
        lastTickAt = Date.now();
        markInteraction();
      }
    };

    collectVisibleSpread();
    const interval = window.setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pointerdown", markInteraction, { passive: true });
    window.addEventListener("mousemove", markInteraction, { passive: true });
    window.addEventListener("keydown", markInteraction);
    window.addEventListener("wheel", markInteraction, { passive: true });
    window.addEventListener("touchstart", markInteraction, { passive: true });
    document.addEventListener("scroll", markInteraction, { capture: true, passive: true });

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointerdown", markInteraction);
      window.removeEventListener("mousemove", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      window.removeEventListener("wheel", markInteraction);
      window.removeEventListener("touchstart", markInteraction);
      document.removeEventListener("scroll", markInteraction, true);
      accountForElapsed();
      persistSession();
    };
  }, [book.id]);

  useEffect(() => {
    if (activeBookIdRef.current !== book.id) return;
    for (let offset = 0; offset < pagesPerView; offset += 1) {
      const pageIndex = book.currentPage + offset;
      if (totalPages > 0 && pageIndex >= totalPages) break;
      readingSessionPagesRef.current.add(pageIndex + 1);
    }
  }, [book.id, book.currentPage, pagesPerView, totalPages]);

  useEffect(() => {
    if (!pdfDocument) return;
    let cancelled = false;
    pdfDocument.getOutline().then(async (outline) => {
      const entries: ReaderOutlineEntry[] = [];
      const visit = async (items: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>) => {
        for (const item of items ?? []) {
          if (item.dest) {
            const destination = typeof item.dest === "string"
              ? await pdfDocument.getDestination(item.dest)
              : item.dest;
            if (destination?.[0]) {
              const pageIndex = await pdfDocument.getPageIndex(destination[0]);
              entries.push({ title: item.title, pageIndex });
            }
          }
          if (item.items?.length) await visit(item.items);
        }
      };
      await visit(outline ?? []);
      if (!cancelled) setOutlineEntries(entries);
    }).catch((error: unknown) => {
      console.error("Could not load the PDF table of contents:", error);
    });
    return () => { cancelled = true; };
  }, [pdfDocument]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`reader-bookmarks-${book.id}`);
      if (!saved) {
        setReaderBookmarks([]);
        return;
      }
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every((item) =>
        typeof item === "object" && item !== null &&
        typeof item.id === "string" && typeof item.pageIndex === "number" &&
        typeof item.title === "string" && item.bookId === book.id
      )) throw new Error("Saved bookmarks have an invalid format.");
      setReaderBookmarks(parsed as ReaderBookmark[]);
    } catch (error) {
      console.error("Could not load reader bookmarks:", error);
      setReaderBookmarks([]);
    }
  }, [book.id]);

  useEffect(() => {
    if (isPdf || fileLoading || !textContent || isRtlLanguage(book.language)) return;
    try {
      if (localStorage.getItem(`reader-direction-${book.id}`) === null) {
        setIsRtl(containsRtlText(textContent.slice(0, 4000)));
      }
    } catch (error) {
      console.error("Could not auto-detect the book's reading direction:", error);
    }
  }, [book.id, book.language, fileLoading, isPdf, textContent]);

  const openSelectionMenu = useCallback((
    x: number,
    y: number,
    selectedPassage?: SelectedPassage | null,
    highlightId?: string
  ) => {
    const root = readerContentRef.current;
    const passage = selectedPassage === undefined
      ? root ? captureSelectedPassage(root, currentPage) : null
      : selectedPassage;
    const position = clampSelectionMenuPosition(x, y);
    setSelectionError(annotationError);
    setSelectionNotice("");
    setSelectionMenu({ ...position, passage, highlightId });
  }, [annotationError, currentPage]);

  const handlePdfDocumentLoad = useCallback((pageCount: number, document: PDFDocumentProxy) => {
    setPdfPageCount(pageCount);
    setPdfDocument(document);
    if (book.currentPage >= pageCount) {
      onUpdate({ ...book, currentPage: Math.max(0, pageCount - 1) });
    }

    try {
      if (localStorage.getItem(`reader-direction-${book.id}`) !== null || isRtlLanguage(book.language)) return;
      void document.getPage(1).then((page) => page.getTextContent()).then((content) => {
        const sample = content.items.map((item) => "str" in item ? item.str : "").join(" ");
        if (
          activeBookIdRef.current === book.id &&
          localStorage.getItem(`reader-direction-${book.id}`) === null
        ) setIsRtl(containsRtlText(sample));
      }).catch((error: unknown) => {
        console.error("Could not detect the PDF reading direction:", error);
      });
    } catch (error) {
      console.error("Could not read the saved reading direction:", error);
    }
  }, [book, onUpdate]);

  const runPdfSearch = async (query = searchQuery) => {
    const term = query.trim();
    if (!term || !pdfDocument) return;
    setSearchBusy(true);
    setSearchError("");
    try {
      const hits: number[] = [];
      const normalizedTerm = term.toLocaleLowerCase();
      for (let pageIndex = 0; pageIndex < pdfDocument.numPages; pageIndex += 1) {
        const pageText = await pdfDocument.getPage(pageIndex + 1).then((page) => page.getTextContent());
        const text = pageText.items.map((item) => "str" in item ? item.str : "").join(" ").toLocaleLowerCase();
        let offset = 0;
        while ((offset = text.indexOf(normalizedTerm, offset)) !== -1) {
          hits.push(pageIndex);
          offset += normalizedTerm.length;
        }
      }
      setSearchQuery(term);
      setSearchHits(hits);
      setSearchIndex(hits.length ? 0 : -1);
      if (hits.length) goToPageNumber(hits[0] + 1);
      else setSearchError(t("No matches found."));
    } catch (error) {
      console.error("Could not search the PDF:", error);
      setSearchError(error instanceof Error ? error.message : t("Could not search this PDF."));
    } finally {
      setSearchBusy(false);
    }
  };

  const moveSearch = (delta: -1 | 1) => {
    if (!searchHits.length) return;
    const nextIndex = (searchIndex + delta + searchHits.length) % searchHits.length;
    setSearchIndex(nextIndex);
    goToPageNumber((searchHits[nextIndex] ?? 0) + 1);
  };

  const toggleBookmark = () => {
    const existing = readerBookmarks.find((bookmark) => bookmark.pageIndex === book.currentPage);
    const nextBookmarks = existing
      ? readerBookmarks.filter((bookmark) => bookmark.id !== existing.id)
      : [{
        id: crypto.randomUUID(),
        bookId: book.id,
        pageIndex: book.currentPage,
        title: `${t("Page")} ${book.currentPage + 1}`,
        updatedAt: new Date().toISOString(),
      }, ...readerBookmarks];
    try {
      localStorage.setItem(`reader-bookmarks-${book.id}`, JSON.stringify(nextBookmarks));
      setReaderBookmarks(nextBookmarks);
      setSelectionNotice(existing ? t("Bookmark removed.") : t("Bookmark saved."));
    } catch (error) {
      console.error("Could not save this bookmark:", error);
      setSelectionError(error instanceof Error ? error.message : t("Could not save this bookmark."));
    }
  };

  const handleReaderWheel = (event: React.WheelEvent<HTMLElement>) => {
    const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    if (Math.abs(delta) < 28 || Date.now() - horizontalWheelAt.current < 450) return;
    event.preventDefault();
    horizontalWheelAt.current = Date.now();
    turnSpread(isRtl ? delta < 0 : delta > 0);
  };

  const handleReaderClick = (event: React.MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("button, a, input")) return;
    if (window.getSelection()?.toString()) return;
    const root = readerContentRef.current;
    const point = root ? selectedTextOffsetAtPoint(root, event.clientX, event.clientY) : null;
    const annotation = point && bookAnnotations.find((item) =>
      item.kind === "reader-highlight" &&
      item.page === point.page &&
      typeof item.startOffset === "number" &&
      typeof item.endOffset === "number" &&
      point.offset >= item.startOffset &&
      point.offset <= item.endOffset
    );
    if (annotation && point && typeof annotation.startOffset === "number" && typeof annotation.endOffset === "number") {
      const passage: SelectedPassage = {
        text: annotation.quote ?? annotation.content,
        page: point.page,
        startOffset: annotation.startOffset,
        endOffset: annotation.endOffset,
      };
      openSelectionMenu(event.clientX - 140, event.clientY + 8, passage, annotation.id);
      return;
    }
    const page = event.target instanceof Element
      ? event.target.closest<HTMLElement>(".react-pdf__Page, .reader-spread-page")
      : null;
    if (!page) return;
    const bounds = page.getBoundingClientRect();
    const edgeWidth = Math.min(64, bounds.width * 0.12);
    const leftEdge = event.clientX <= bounds.left + edgeWidth;
    const rightEdge = event.clientX >= bounds.right - edgeWidth;
    if (leftEdge) turnSpread(isRtl);
    else if (rightEdge) turnSpread(!isRtl);
  };

  const handleSelectionEnd = () => {
    window.requestAnimationFrame(() => {
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!range || selection?.isCollapsed) return;
      const bounds = range.getBoundingClientRect();
      openSelectionMenu(bounds.left + bounds.width / 2, bounds.bottom + 8);
    });
  };

  const changePdfZoom = (delta: number) => {
    const nextZoom = Math.max(50, Math.min(200, pdfZoom + delta));
    setPdfZoom(nextZoom);
    setFitMode("manual");
    try {
      localStorage.setItem(`reader-pdf-zoom-${book.id}`, String(nextZoom));
    } catch (error) {
      console.error("Could not save the PDF zoom level:", error);
    }
  };

  const handleHighlightColorChange = (color: string) => {
    if (!HIGHLIGHT_COLOR_PATTERN.test(color)) return;
    setHighlightColor(color);
    try {
      localStorage.setItem("reader-highlight-color", color);
    } catch (error) {
      console.error("Could not save the highlight color preference:", error);
      setSelectionError(t("The color was selected, but the preference could not be saved."));
    }
  };

  const setPdfFitMode = (mode: "width" | "page") => {
    setFitMode(mode);
    setPdfZoom(100);
  };

  const saveAnnotation = async (annotation: ReaderAnnotation) => {
    const nextAnnotations = [annotation, ...allAnnotations];
    await saveRecords("notes", nextAnnotations);
    setAllAnnotations(nextAnnotations);
  };

  const removeReaderHighlights = async (annotationIds: string[]) => {
    const uniqueIds = [...new Set(annotationIds)];
    if (!uniqueIds.length || savingHighlightAction) return;
    const existingIds = bookAnnotations
      .filter((item) => item.kind === "reader-highlight" && uniqueIds.includes(item.id))
      .map((item) => item.id);
    if (existingIds.length !== uniqueIds.length) {
      const error = new Error(t("This highlight is no longer available."));
      console.error("Could not remove the selected highlight:", error);
      setSelectionNotice("");
      setSelectionError(error.message);
      return;
    }
    setSavingHighlightAction(true);
    setSelectionNotice("");
    setSelectionError("");
    const idsToRemove = new Set(uniqueIds);
    const nextAnnotations = allAnnotations.filter((item) => !idsToRemove.has(item.id));
    try {
      await saveRecords("notes", nextAnnotations);
      setAllAnnotations(nextAnnotations);
      setSelectionMenu(null);
      setSelectionNotice(t("Highlight removed."));
    } catch (error) {
      console.error("Could not remove the selected highlight:", error);
      setSelectionError(error instanceof Error ? error.message : t("Could not remove this highlight."));
    } finally {
      setSavingHighlightAction(false);
    }
  };

  const updateReaderHighlightColor = async (annotationId: string, color: string) => {
    if (!HIGHLIGHT_COLOR_PATTERN.test(color) || savingHighlightAction) return;
    const annotation = bookAnnotations.find((item) => item.id === annotationId && item.kind === "reader-highlight");
    if (!annotation) {
      const error = new Error(t("This highlight is no longer available."));
      console.error("Could not update the selected highlight:", error);
      setSelectionNotice("");
      setSelectionError(error.message);
      return;
    }

    setSavingHighlightAction(true);
    setSelectionNotice("");
    setSelectionError("");
    const nextAnnotations = allAnnotations.map((item) => item.id === annotationId
      ? { ...item, color, updatedAt: new Date().toISOString() }
      : item);
    try {
      await saveRecords("notes", nextAnnotations);
      setAllAnnotations(nextAnnotations);
      setSelectionMenu(null);
      setSelectionNotice(t("Highlight color updated."));
    } catch (error) {
      console.error("Could not update the selected highlight:", error);
      setSelectionError(error instanceof Error ? error.message : t("Could not update this highlight."));
    } finally {
      setSavingHighlightAction(false);
    }
  };

  const highlightPassage = async (passage: SelectedPassage, color = highlightColor) => {
    if (annotationsLoading || annotationError) {
      setSelectionError(annotationError || t("Notes are still loading."));
      return;
    }
    if (typeof passage.startOffset !== "number" || typeof passage.endOffset !== "number") {
      setSelectionError(t("Select text from a single page to highlight it."));
      return;
    }
    if (!("highlights" in CSS) || typeof Highlight === "undefined") {
      setSelectionError(t("Text highlighting is not supported in this viewer."));
      return;
    }

    setSelectionError("");
    const timestamp = new Date().toISOString();
    const annotation: ReaderAnnotation = {
      id: crypto.randomUUID(),
      bookId: book.id,
      content: passage.text,
      quote: passage.text,
      page: passage.page,
      isPrivate: true,
      kind: "reader-highlight",
      color,
      startOffset: passage.startOffset,
      endOffset: passage.endOffset,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    try {
      await saveAnnotation(annotation);
      setSelectionMenu(null);
      setSelectionNotice(t("Passage highlighted."));
      window.getSelection()?.removeAllRanges();
    } catch (error) {
      console.error("Could not save the passage highlight:", error);
      setSelectionError(error instanceof Error ? error.message : t("Could not highlight this passage."));
    }
  };

  const openNoteDialog = (passage: SelectedPassage) => {
    setActivePassage(passage);
    setNoteDraft("");
    setNoteError("");
    setSelectionMenu(null);
    setShowNoteDialog(true);
  };

  const savePassageAsNote = async () => {
    if (!activePassage || annotationsLoading || annotationError) {
      setNoteError(annotationError || t("Notes are still loading."));
      return;
    }
    const note = noteDraft.trim();
    const timestamp = new Date().toISOString();
    const annotation: ReaderAnnotation = {
      id: crypto.randomUUID(),
      bookId: book.id,
      content: note ? `“${activePassage.text}”\n\n${note}` : activePassage.text,
      quote: activePassage.text,
      page: activePassage.page,
      isPrivate: true,
      kind: "reader-note",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setSavingNote(true);
    setNoteError("");
    try {
      await saveAnnotation(annotation);
      setShowNoteDialog(false);
      setActivePassage(null);
      setNoteDraft("");
      setSelectionNotice(t("Note saved to this book."));
      window.getSelection()?.removeAllRanges();
    } catch (error) {
      console.error("Could not save the passage note:", error);
      setNoteError(error instanceof Error ? error.message : t("Could not save this note."));
    } finally {
      setSavingNote(false);
    }
  };

  const askAiAboutPassage = async (passage: SelectedPassage) => {
    setActivePassage(passage);
    setSelectionMenu(null);
    setAiAnswer("");
    setAiError("");
    setAskingAi(true);
    setShowAiDialog(true);
    window.getSelection()?.removeAllRanges();
    if (!authToken) {
      setAiError(t("Sign in to a connected account to ask AI about a passage."));
      setAskingAi(false);
      return;
    }

    try {
      const response = await sendAiRequest("/api/ai/chat", authToken, {
        message: `In "${book.title}" by ${book.author}, explain the meaning and significance of this passage:\n\n“${passage.text}”`,
        history: [],
      });
      if (
        typeof response !== "object" ||
        response === null ||
        !("response" in response) ||
        typeof response.response !== "string"
      ) {
        throw new Error(t("The AI response was invalid."));
      }
      setAiAnswer(response.response);
    } catch (error) {
      console.error("Could not ask AI about the selected passage:", error);
      setAiError(error instanceof Error ? error.message : t("AI could not answer this question."));
    } finally {
      setAskingAi(false);
    }
  };

  const copyPassage = async (passage: SelectedPassage) => {
    try {
      await navigator.clipboard.writeText(passage.text);
      setSelectionMenu(null);
      setSelectionNotice(t("Passage copied."));
    } catch (error) {
      console.error("Could not copy the selected passage:", error);
      setSelectionError(error instanceof Error ? error.message : t("Could not copy this passage."));
    }
  };

  useEffect(() => {
    const handleReaderShortcut = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("input, textarea")) return;
      if (matchesShortcut(event, "readerToggleFocus")) {
        event.preventDefault();
        setFocusMode((active) => !active);
      } else if (matchesShortcut(event, "readerToggleTheme")) {
        event.preventDefault();
        toggleReaderTheme();
      } else if (matchesShortcut(event, "readerToggleDirection")) {
        event.preventDefault();
        toggleReadingDirection();
      } else if (matchesShortcut(event, "readerOpenSelection")) {
        event.preventDefault();
        openSelectionMenu(window.innerWidth / 2, window.innerHeight / 2);
      } else if (matchesShortcut(event, "readerExitFocus")) {
        if (focusMode) {
          event.preventDefault();
          setFocusMode(false);
        }
      } else if (matchesShortcut(event, "readerToggleFocusF11") || matchesShortcut(event, "readerToggleFocusF")) {
        event.preventDefault();
        setFocusMode((active) => !active);
      } else if (matchesShortcut(event, "readerFirstPage") && totalPages > 0) {
        event.preventDefault();
        changePage(-book.currentPage);
      } else if (matchesShortcut(event, "readerLastPage") && totalPages > 0) {
        event.preventDefault();
        changePage(totalPages - 1 - book.currentPage);
      } else if (matchesShortcut(event, "readerNextSpread") || matchesShortcut(event, "readerPreviousSpread")) {
        event.preventDefault();
        changePage(matchesShortcut(event, "readerPreviousSpread") ? -2 : 2);
      } else if (matchesShortcut(event, "readerPreviousPage") || matchesShortcut(event, "readerNextPage")) {
        event.preventDefault();
        const forwardKey = isRtl ? "ArrowLeft" : "ArrowRight";
        turnSpread(event.key === forwardKey);
      }
    };
    window.addEventListener("keydown", handleReaderShortcut);
    return () => window.removeEventListener("keydown", handleReaderShortcut);
  }, [book.currentPage, changePage, focusMode, isRtl, openSelectionMenu, totalPages, toggleReadingDirection, toggleReaderTheme, turnSpread]);

  const renderBookSpread = (content: string, sourceLabel: string) => {
    const [leftPage, rightPage] = splitBookText(content);
    const renderPageText = (paragraphs: string[]) => paragraphs.map((paragraph, index) => (
      <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
    ));

    return (
      <div className="reader-spread-scroll">
        <article className={`reader-spread reader-spread-${readerTheme}`} dir={isRtl ? "rtl" : "ltr"} style={{ fontSize }}>
          <section className="reader-spread-page" data-reader-page={currentPage}>
            <header>
              <h2>{book.title}</h2>
              {book.author && <p>{book.author}</p>}
            </header>
            {fileLoading ? (
              <div className="reader-spread-status"><Loader2 size={28} /><span>{t("Loading book...")}</span></div>
            ) : fileError ? (
              <div className="reader-spread-status"><ErrorAlert className="reader-error-alert" message={fileError} /></div>
            ) : content ? (
              <div className="reader-spread-text">{renderPageText(leftPage)}</div>
            ) : (
              <p className="reader-spread-unavailable">{t("A preview for this book is not available yet.")}</p>
            )}
            <span className="reader-spread-page-number">{currentPage}</span>
          </section>
          <section className="reader-spread-page reader-spread-page-right" data-reader-page={currentPage + 1}>
            <div className="reader-spread-running-title">{book.title}</div>
            {!fileLoading && !fileError && rightPage.length > 0 && (
              <div className="reader-spread-text">{renderPageText(rightPage)}</div>
            )}
            {!fileLoading && content && (
              <div className="reader-spread-source">{t("Source")}: {sourceLabel}</div>
            )}
            <span className="reader-spread-page-number">{totalPages ? Math.min(currentPage + 1, totalPages) : currentPage + 1}</span>
          </section>
        </article>
      </div>
    );
  };

  return (
    <div
      className={`reader-screen reader-screen-${readerTheme} ${focusMode ? "reader-screen-focus" : ""}`}
      dir="ltr"
    >
      {!focusMode && showSidebar && (
        <aside className="reader-book-list" aria-label={t("Reading list")}>
          <div className="reader-book-list-heading">
            <h2>{t("Reading now")}</h2>
            <span>{readingBooks.length} {t("books")}</span>
          </div>
          <div className="reader-book-list-items">
            {readingBooks.map((readingBook) => {
              const bookProgress = readingBook.totalPages > 0
                ? Math.min(100, Math.round((readingBook.currentPage / readingBook.totalPages) * 100))
                : 0;
              return (
                <button
                  type="button"
                  key={readingBook.id}
                  className={`reader-book-list-item ${readingBook.id === book.id ? "active" : ""}`}
                  aria-current={readingBook.id === book.id ? "page" : undefined}
                  onClick={() => onOpenBook(readingBook)}
                >
                  <ReaderBookCover book={readingBook} />
                  <span className="reader-book-list-info">
                    <strong>{readingBook.title}</strong>
                    <small>{readingBook.author}</small>
                    <span className="reader-book-list-progress">
                      <span style={{ width: `${bookProgress}%` }} />
                    </span>
                    <small>{bookProgress}% {t("complete")}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {readingBooks.length === 0 && (
            <p className="reader-book-list-empty">{t("No books currently reading")}</p>
          )}
        </aside>
      )}

      <div className="reader-main">
        {focusMode ? (
          <>
            <div className="reader-focus-header">
              <div className="reader-focus-tools">
                {isPdf ? (
                  <form className="reader-page-jumper" onSubmit={(event) => {
                    event.preventDefault();
                    goToPageNumber(Number(pageInput));
                  }}>
                    <input value={pageInput} onChange={(event) => setPageInput(event.target.value)} aria-label={t("Jump to page")} placeholder={pageRange} inputMode="numeric" />
                    <span>/ {totalPages || "—"}</span>
                  </form>
                ) : <span className="reader-focus-page-range">{pageRange}{totalPages ? ` / ${totalPages}` : ""}</span>}
                <button type="button" className={`reader-direction-button ${isRtl ? "active" : ""}`} onClick={toggleReadingDirection} aria-label={t(isRtl ? "Switch to left-to-right reading" : "Switch to right-to-left reading")} aria-pressed={isRtl} title={t(`Change reading direction (${shortcutDisplay("readerToggleDirection")})`)}>
                  {isRtl ? "RTL" : "LTR"}
                </button>
                {isPdf && (
                  <div className="reader-focus-zoom-controls">
                    <button type="button" className="reader-toolbar-button" onClick={() => changePdfZoom(-10)} disabled={pdfZoom <= 50} aria-label={t("Zoom out")}><ZoomOut size={15} /></button>
                    <span>{fitMode === "manual" ? `${pdfZoom}%` : t("Fit")}</span>
                    <button type="button" className="reader-toolbar-button" onClick={() => changePdfZoom(10)} disabled={pdfZoom >= 200} aria-label={t("Zoom in")}><ZoomIn size={15} /></button>
                    <button
                      type="button"
                      className="reader-fit-button"
                      onClick={() => setPdfFitMode(fitMode === "page" ? "width" : "page")}
                      title={t(fitMode === "page" ? "Fit width" : "Fit page")}
                    >
                      {t("Fit")}
                    </button>
                  </div>
                )}
                {isPdf && (
                  <>
                    <button type="button" className="reader-toolbar-button" onClick={() => setSearchOpen((visible) => !visible)} aria-label={t("Search in book")} aria-expanded={searchOpen}><Search size={16} /></button>
                    <button type="button" className="reader-toolbar-button" onClick={toggleBookmark} aria-label={t("Bookmark this spread")}><Bookmark size={16} /></button>
                    <button type="button" className="reader-toolbar-button" onClick={() => setShowNavigationDrawer((visible) => !visible)} aria-label={t("Table of contents and bookmarks")} aria-expanded={showNavigationDrawer}><ListTree size={16} /></button>
                  </>
                )}
              </div>
              <div className="reader-focus-book-info">
                <strong title={book.title}>{book.title}</strong>
                {book.author && <span title={book.author}>{book.author}</span>}
              </div>
              <button type="button" className="reader-focus-exit" onClick={() => setFocusMode(false)} aria-label={t("Exit focus mode")} title={t("Exit focus mode")}>
                <Minimize2 size={18} />
              </button>
            </div>
            <div className="reader-focus-nav">
              <button type="button" className="reader-toolbar-button" onClick={() => turnSpread(isRtl)} disabled={isRtl ? !canMoveNext : !canMovePrevious} aria-label={t(isRtl ? "Next page" : "Previous page")} title={t(isRtl ? "Next page" : "Previous page")}>
                <ChevronLeft size={22} />
              </button>
              <button type="button" className="reader-toolbar-button" onClick={() => turnSpread(!isRtl)} disabled={isRtl ? !canMovePrevious : !canMoveNext} aria-label={t(isRtl ? "Previous page" : "Next page")} title={t(isRtl ? "Previous page" : "Next page")}>
                <ChevronRight size={22} />
              </button>
            </div>
          </>
        ) : (
          <header className="reader-toolbar">
            <button
              type="button"
              className="reader-toolbar-button"
              onClick={toggleSidebar}
              aria-label={showSidebar ? t("Hide reading list") : t("Show reading list")}
              title={showSidebar ? t("Hide reading list") : t("Show reading list")}
            >
              <Menu size={18} />
            </button>
            <div className="reader-book-title">
              <span>
                <strong>{book.title}</strong>
                <small>{t("by")} {book.author}</small>
              </span>
            </div>
            <div className="reader-controls">
              <button type="button" className={`reader-direction-button ${isRtl ? "active" : ""}`} onClick={toggleReadingDirection} aria-pressed={isRtl} aria-label={t(isRtl ? "Switch to left-to-right reading" : "Switch to right-to-left reading")} title={t(`Change reading direction (${shortcutDisplay("readerToggleDirection")})`)}>
                {isRtl ? "RTL" : "LTR"}
              </button>
              {isPdf && (
                <>
                  <button type="button" className="reader-toolbar-button" onClick={() => changePdfZoom(-10)} disabled={pdfZoom <= 50} aria-label={t("Zoom out")} title={t("Zoom out")}><ZoomOut size={15} /></button>
                  <span className="reader-zoom-value">{fitMode === "manual" ? `${pdfZoom}%` : t(fitMode === "width" ? "Fit width" : "Fit page")}</span>
                  <button type="button" className="reader-toolbar-button" onClick={() => changePdfZoom(10)} disabled={pdfZoom >= 200} aria-label={t("Zoom in")} title={t("Zoom in")}><ZoomIn size={15} /></button>
                  <button type="button" className={`reader-fit-button ${fitMode === "width" ? "active" : ""}`} onClick={() => setPdfFitMode("width")}>{t("Fit width")}</button>
                  <button type="button" className={`reader-fit-button ${fitMode === "page" ? "active" : ""}`} onClick={() => setPdfFitMode("page")}>{t("Fit page")}</button>
                </>
              )}
              <button type="button" className="reader-toolbar-button" onClick={() => turnSpread(isRtl)} disabled={isRtl ? !canMoveNext : !canMovePrevious} title={t(isRtl ? "Next page" : "Previous page")} aria-label={t(isRtl ? "Next page" : "Previous page")}>
                <ChevronLeft size={17} />
              </button>
              {isPdf ? (
                <form className="reader-page-jumper" onSubmit={(event) => {
                  event.preventDefault();
                  goToPageNumber(Number(pageInput));
                }}>
                  <input value={pageInput} onChange={(event) => setPageInput(event.target.value)} aria-label={t("Jump to page")} placeholder={pageRange} inputMode="numeric" />
                  <span>/ {totalPages || "—"}</span>
                </form>
              ) : <span>{pageRange}{totalPages ? ` / ${totalPages}` : ""}</span>}
              <button type="button" className="reader-toolbar-button" onClick={() => turnSpread(!isRtl)} disabled={isRtl ? !canMovePrevious : !canMoveNext} title={t(isRtl ? "Previous page" : "Next page")} aria-label={t(isRtl ? "Previous page" : "Next page")}>
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="reader-toolbar-actions">
              {isPdf && (
                <>
                  <button type="button" className="reader-toolbar-button" onClick={() => setSearchOpen((visible) => !visible)} aria-label={t("Search in book")} aria-expanded={searchOpen} title={t("Search in book")}><Search size={16} /></button>
                  <button type="button" className={`reader-toolbar-button ${readerBookmarks.some((bookmark) => bookmark.pageIndex === book.currentPage) ? "active" : ""}`} onClick={toggleBookmark} aria-label={t("Bookmark this spread")} title={t("Bookmark this spread")}><Bookmark size={16} /></button>
                  <button type="button" className="reader-toolbar-button" onClick={() => setShowNavigationDrawer((visible) => !visible)} aria-label={t("Table of contents and bookmarks")} aria-expanded={showNavigationDrawer} title={t("Table of contents and bookmarks")}><ListTree size={16} /></button>
                </>
              )}
              <button type="button" className="reader-toolbar-button" onClick={() => { setShowSettings(false); setFocusMode(true); }} aria-label={t("Enter focus mode")} title={t("Read in focus mode")}>
                <Maximize2 size={16} />
              </button>
              <button
                type="button"
                className="reader-toolbar-button"
                onClick={() => setShowSettings((visible) => !visible)}
                aria-label={t("Reading settings")}
                aria-expanded={showSettings}
                title={t("Reading settings")}
              >
                <Settings size={16} />
              </button>
              <button type="button" className="reader-toolbar-button" onClick={() => void shareBook()} disabled={!navigator.share} aria-label={t("Share")} title={t("Share")}>
                <Share2 size={16} />
              </button>
            </div>
          </header>
        )}

        {searchOpen && isPdf && (
          <form className="reader-search-bar" onSubmit={(event) => {
            event.preventDefault();
            void runPdfSearch();
          }}>
            <Search size={15} />
            <input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t("Search this book")} aria-label={t("Search this book")} />
            <button type="submit" className="reader-fit-button" disabled={searchBusy || !searchQuery.trim()}>{searchBusy ? t("Searching...") : t("Search")}</button>
            <span>{searchHits.length ? `${searchIndex + 1} / ${searchHits.length}` : ""}</span>
            <button type="button" className="reader-toolbar-button" onClick={() => moveSearch(-1)} disabled={!searchHits.length} aria-label={t("Previous match")}><ChevronLeft size={15} /></button>
            <button type="button" className="reader-toolbar-button" onClick={() => moveSearch(1)} disabled={!searchHits.length} aria-label={t("Next match")}><ChevronRight size={15} /></button>
            <button type="button" className="reader-toolbar-button" onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchHits([]); setSearchIndex(-1); }} aria-label={t("Close search")}><X size={15} /></button>
            {searchError && <span className="reader-search-error" role="status">{searchError}</span>}
          </form>
        )}

        {showNavigationDrawer && isPdf && (
          <section className="reader-navigation-drawer" aria-label={t("Table of contents and bookmarks")}>
            <header><strong>{t("Table of contents")}</strong><button type="button" className="reader-toolbar-button" onClick={() => setShowNavigationDrawer(false)} aria-label={t("Close")}><X size={15} /></button></header>
            {outlineEntries.length ? outlineEntries.map((entry, index) => (
              <button key={`${entry.pageIndex}-${index}`} type="button" className="reader-navigation-item" onClick={() => { goToPageNumber(entry.pageIndex + 1); setShowNavigationDrawer(false); }}>
                <span>{entry.title}</span><small>{entry.pageIndex + 1}</small>
              </button>
            )) : <p>{t("This PDF has no table of contents.")}</p>}
            <header><strong>{t("Bookmarks")}</strong></header>
            {readerBookmarks.length ? readerBookmarks.map((bookmark) => (
              <button key={bookmark.id} type="button" className="reader-navigation-item" onClick={() => { goToPageNumber(bookmark.pageIndex + 1); setShowNavigationDrawer(false); }}>
                <span>{bookmark.title}</span><small>{bookmark.pageIndex + 1}</small>
              </button>
            )) : <p>{t("No bookmarks yet.")}</p>}
          </section>
        )}

        {showSettings && !focusMode && (
          <section className="reader-settings" aria-label={t("Reading settings")}>
            <div className="reader-settings-group">
              <span>{t("Font size")}</span>
              <button type="button" className="reader-toolbar-button" onClick={() => changeFontSize(-1)} aria-label={t("Decrease text size")}>
                <Minus size={14} />
              </button>
              <strong>{fontSize}</strong>
              <button type="button" className="reader-toolbar-button" onClick={() => changeFontSize(1)} aria-label={t("Increase text size")}>
                <Plus size={14} />
              </button>
            </div>
            <div className="reader-settings-group">
              <span>{t("Theme")}</span>
              {(["light", "sepia", "dark"] as const).map((theme) => (
                <button
                  type="button"
                  key={theme}
                  className={`reader-theme-swatch reader-theme-swatch-${theme} ${readerTheme === theme ? "selected" : ""}`}
                  onClick={() => changeReaderTheme(theme)}
                  aria-label={t(theme[0].toUpperCase() + theme.slice(1))}
                  aria-pressed={readerTheme === theme}
                />
              ))}
            </div>
          </section>
        )}

        <div
          ref={readerContentRef}
          className={`reader-content reader-content-${readerTheme}`}
          dir={isRtl ? "rtl" : "ltr"}
          onMouseDown={(event) => {
            if (event.button === 0 && window.getSelection()?.toString()) {
              window.getSelection()?.removeAllRanges();
            }
          }}
          onMouseUp={handleSelectionEnd}
          onTouchEnd={handleSelectionEnd}
          onWheel={handleReaderWheel}
          onClick={handleReaderClick}
          onContextMenu={(event) => {
            event.preventDefault();
            openSelectionMenu(event.clientX, event.clientY);
          }}
        >
          {fileError ? (
            <div className={`reader-message reader-message-${readerTheme}`}><FileText size={28} /><h2>{t("Could not open this book")}</h2><ErrorAlert className="reader-error-alert" message={fileError} /></div>
          ) : fileLoading ? (
            <div className={`reader-message reader-message-${readerTheme} reader-message-loading`}><Loader2 size={30} /><p>{t("Loading book...")}</p></div>
          ) : fileUrl && isPdf ? (
            <PdfReader
              key={fileUrl}
              fileUrl={fileUrl}
              pageIndex={currentPageIndex}
              fitToPage={fitMode === "page"}
              fitWidth={fitMode === "width"}
              zoom={pdfZoom / 100}
              isRtl={isRtl}
              onPageChange={(pageIndex) => changePage(pageIndex - book.currentPage)}
              onSpreadSizeChange={setPdfPagesPerSpread}
              onDocumentLoad={handlePdfDocumentLoad}
            />
          ) : fileUrl && isTextFile ? (
            renderBookSpread(textContent, book.fileName || t("Text file"))
          ) : fileUrl ? (
            <div className={`reader-message reader-message-${readerTheme} reader-message-file`}>
              <FileText size={30} />
              <h2>{book.title}</h2>
              <p>{t("This book is in")} <strong>{book.fileMimeType?.toUpperCase() || t("Unknown")}</strong> {t("format")}.</p>
              <div className="reader-file-actions">
                <a href={fileUrl} download={book.fileName}><Download size={14} />{t("Download file")}</a>
                <a href={fileUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />{t("Open in browser")}</a>
              </div>
            </div>
          ) : (
            renderBookSpread(textContent, t("Shelve library"))
          )}
        </div>

        {!focusMode && <footer className="reader-progress">
          <div className="reader-progress-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="reader-progress-info">
            <span><Clock size={13} /> {remainingTime} {t("remaining")}</span>
            <span>{progress}% {t("complete")} <i>•</i> {t("Page")} {pageRange}{totalPages ? ` ${t("of")} ${totalPages}` : ""}</span>
            <span><BookOpen size={13} /> {sessions} {t("sessions")}</span>
          </div>
        </footer>}
      </div>

      {selectionMenu && (
        <>
          <button
            type="button"
            aria-label={t("Close passage actions")}
            className="reader-selection-dismiss"
            onClick={() => setSelectionMenu(null)}
          />
          <section
            role="menu"
            aria-label={t("Selected passage actions")}
            className="reader-selection-menu"
            style={{ left: selectionMenu.x, top: selectionMenu.y }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <h2>{t("Selected passage")}</h2>
            {selectionMenu.passage ? (
              <blockquote>“{selectionMenu.passage.text}”</blockquote>
            ) : (
              <p>{t("Select text in the book first.")}</p>
            )}
            <div className="reader-highlight-palette" role="group" aria-label={t("Highlight color")}>
              <span>{t("Highlight color")}</span>
              {HIGHLIGHT_PALETTE.map((color) => (
                <button
                  type="button"
                  key={color}
                  className={`reader-highlight-swatch ${activeHighlightColor === color ? "selected" : ""}`}
                  style={{ backgroundColor: color }}
                  aria-label={t("Highlight text")}
                  title={color}
                  disabled={!selectionMenu.passage || typeof selectionMenu.passage.startOffset !== "number" || annotationsLoading || Boolean(annotationError) || savingHighlightAction}
                  onClick={() => {
                    handleHighlightColorChange(color);
                    if (selectionMenu.highlightId) {
                      void updateReaderHighlightColor(selectionMenu.highlightId, color);
                    } else if (selectionMenu.passage) {
                      void highlightPassage(selectionMenu.passage, color);
                    }
                  }}
                />
              ))}
              <button
                type="button"
                className="reader-highlight-clear"
                aria-label={t("Clear / Remove highlight")}
                title={t("Clear / Remove highlight")}
                disabled={!selectedPassageHighlightIds.length || annotationsLoading || Boolean(annotationError) || savingHighlightAction}
                onClick={() => void removeReaderHighlights(selectedPassageHighlightIds)}
              >
                <X size={15} />
              </button>
            </div>
            <button type="button" role="menuitem" disabled={!selectionMenu.passage} onClick={() => selectionMenu.passage && void copyPassage(selectionMenu.passage)}>
              <Copy size={15} />
              {t("Copy")}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!selectionMenu.passage || annotationsLoading || Boolean(annotationError)}
              onClick={() => selectionMenu.passage && openNoteDialog(selectionMenu.passage)}
            >
              <StickyNote size={15} />
              {t("Add note")}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!selectionMenu.passage}
              onClick={() => selectionMenu.passage && void askAiAboutPassage(selectionMenu.passage)}
            >
              <Sparkles size={15} />
              {t("Ask AI about this")}
            </button>
            {selectedPassageHighlightIds.length > 0 && (
              <button
                type="button"
                role="menuitem"
                className="reader-highlight-remove-action"
                onClick={() => void removeReaderHighlights(selectedPassageHighlightIds)}
                disabled={savingHighlightAction || annotationsLoading || Boolean(annotationError)}
              >
                <Trash2 size={15} />
                {t("Remove highlight")}
              </button>
            )}
            {(selectionError || annotationError) && (
              <p className="reader-selection-error" role="alert">{selectionError || annotationError}</p>
            )}
          </section>
        </>
      )}

      {showNoteDialog && activePassage && (
        <div className="reader-dialog-backdrop">
          <section className="reader-annotation-dialog" role="dialog" aria-modal="true" aria-labelledby="reader-note-title">
            <header>
              <h2 id="reader-note-title">{t("Add note")}</h2>
              <button type="button" className="reader-toolbar-button" onClick={() => setShowNoteDialog(false)} aria-label={t("Close note editor")}>
                <X size={17} />
              </button>
            </header>
            <blockquote>{activePassage.text}</blockquote>
            <label htmlFor="reader-note-draft">{t("Add your note (optional)")}</label>
            <textarea
              id="reader-note-draft"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              rows={4}
              placeholder={t("What would you like to remember about this passage?")}
            />
            {noteError && <p className="reader-selection-error" role="alert">{noteError}</p>}
            <footer>
              <button type="button" className="reader-dialog-secondary" onClick={() => setShowNoteDialog(false)}>{t("Cancel")}</button>
              <button type="button" className="reader-dialog-primary" onClick={() => void savePassageAsNote()} disabled={savingNote || annotationsLoading || Boolean(annotationError)}>
                {savingNote ? t("Saving...") : t("Save note")}
              </button>
            </footer>
          </section>
        </div>
      )}

      {showAiDialog && activePassage && (
        <div className="reader-dialog-backdrop">
          <section className="reader-annotation-dialog reader-ai-dialog" role="dialog" aria-modal="true" aria-labelledby="reader-ai-title">
            <header>
              <h2 id="reader-ai-title"><Sparkles size={18} /> {t("Ask AI about this passage")}</h2>
              <button type="button" className="reader-toolbar-button" onClick={() => { setShowAiDialog(false); setActivePassage(null); }} aria-label={t("Close AI response")}>
                <X size={17} />
              </button>
            </header>
            <blockquote>{activePassage.text}</blockquote>
            {askingAi ? (
              <p className="reader-ai-status" role="status">{t("Thinking about the passage...")}</p>
            ) : aiError ? (
              <p className="reader-selection-error" role="alert">{aiError}</p>
            ) : (
              <div className="reader-ai-answer">{aiAnswer}</div>
            )}
          </section>
        </div>
      )}

      {(selectionNotice || (selectionError && !selectionMenu)) && (
        <div className={`reader-selection-toast ${selectionError && !selectionMenu ? "error" : ""}`} role={selectionNotice ? "status" : "alert"}>
          <span>{selectionNotice || selectionError}</span>
          <button type="button" onClick={() => { setSelectionNotice(""); setSelectionError(""); }} aria-label={t("Dismiss message")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
