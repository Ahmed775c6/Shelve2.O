import { useEffect, useRef, useState } from "react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Expand, FileDown, FilePlus2, FolderOpen, Keyboard, Menu, Minimize2, Minus, Moon, MoreHorizontal, PanelLeft, PanelRight, Redo2, RotateCw, Search, Sun, Type, Undo2, X } from "lucide-react";
import type { Theme } from "./theme-provider";
import type { Book, WritingFormatType } from "../types";
import { useLanguage } from "./language-provider";
import { APP_SHORTCUTS, READER_SHORTCUTS, shortcutDisplay, shortcutLabel } from "../lib/keyboard-shortcuts";

export interface StudioRecentProject {
  id: string;
  title: string;
  formatType?: WritingFormatType;
  genre: string;
}

export interface StudioTitlebarActions {
  onOpenWritePage: () => void;
  onOpenCoverDesigner: () => void;
  onOpenGoalsPage: () => void;
  onOpenAnalyticsPage: () => void;
  onNewProject: (formatType?: WritingFormatType) => void;
  onOpenProjectPicker: () => void;
  onSelectRecentProject: (projectId: string) => void;
  onCloseProject: () => void;
  onToggleSidebar: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePaperSettings: () => void;
  onPreviewBook: () => void;
  onExportPdf: () => void;
  onOpenShortcuts: () => void;
  onToggleAssistant: () => void;
  onToggleFocus: () => void;
  onToggleBookPreview: () => void;
  onFindReplace: () => void;
  onJumpToChapter: () => void;
}

export interface StudioTitlebarView {
  activeProjectId: string;
  recentProjects: StudioRecentProject[];
  projectTitle: string;
  chapterTitle: string;
  sidebarOpen: boolean;
  paperSettingsOpen: boolean;
  hasProject: boolean;
  assistantOpen: boolean;
  focusMode: boolean;
}

export interface StudioTitlebarUpdate extends StudioTitlebarView {
  actions: StudioTitlebarActions;
}

interface TitleBarProps {
  search: string;
  onSearch: (value: string) => void;
  onPlan: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onOpenBook: (book: Book) => void;
  books: Book[];
  windowTitle?: string;
  studioToolbar?: StudioTitlebarView | null;
  studioActions?: StudioTitlebarActions;
  mobileMenuOpen?: boolean;
  onMobileMenuToggle?: () => void;
}

function getHistoryIndex(): number {
  const index = window.history.state?.idx;
  return typeof index === "number" ? index : 0;
}

export default function TitleBar({ search, onSearch, onPlan, theme, onThemeChange, onOpenBook, books, windowTitle, studioToolbar, studioActions, mobileMenuOpen = false, onMobileMenuToggle }: TitleBarProps) {
  const { language, t } = useLanguage();
  const [maximized, setMaximized] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [studioToolsOpen, setStudioToolsOpen] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(getHistoryIndex);
  const [furthestHistoryIndex, setFurthestHistoryIndex] = useState(getHistoryIndex);
  const location = useLocation();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const studioToolsRef = useRef<HTMLDivElement>(null);
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < furthestHistoryIndex;
  const suggestions = search.trim()
    ? books.filter((book) => `${book.title} ${book.author} ${book.category}`.toLowerCase().includes(search.toLowerCase())).slice(0, 5)
    : [];

  useEffect(() => {
    const index = getHistoryIndex();
    setHistoryIndex(index);
    setFurthestHistoryIndex((furthest) => Math.max(furthest, index));
  }, [location.key]);

  useEffect(() => {
    setIsDesktop(isTauri());
    if (!isTauri()) return;

    const window = getCurrentWindow();
    window.isMaximized().then(setMaximized).catch((error: unknown) => console.error("Could not read the window state:", error));
    const unlisten = window.onResized(() => {
      window.isMaximized().then(setMaximized).catch((error: unknown) => console.error("Could not read the window state:", error));
    });
    return () => { void unlisten.then((dispose) => dispose()); };
  }, []);

  useEffect(() => {
    const focusSearch = () => searchInputRef.current?.focus();
    const closeShortcuts = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShortcutsOpen(false);
    };
    window.addEventListener("shelve:focus-search", focusSearch);
    window.addEventListener("keydown", closeShortcuts);
    return () => {
      window.removeEventListener("shelve:focus-search", focusSearch);
      window.removeEventListener("keydown", closeShortcuts);
    };
  }, []);

  useEffect(() => {
    if (!themeMenuOpen) return;

    const closeThemeMenu = (event: PointerEvent) => {
      if (event.target instanceof Node && !themeMenuRef.current?.contains(event.target)) {
        setThemeMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setThemeMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeThemeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeThemeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [themeMenuOpen]);

  useEffect(() => {
    if (!studioToolsOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !studioToolsRef.current?.contains(event.target)) setStudioToolsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStudioToolsOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [studioToolsOpen]);

  const withWindow = (operation: "minimize" | "toggleMaximize" | "close") => {
    if (!isDesktop) return;
    const window = getCurrentWindow();
    void window[operation]().catch((error: unknown) => console.error(`Could not ${operation} the window:`, error));
  };

  const navigationButtons = (
    <div className="titlebar-navigation">
      <button
        type="button"
        aria-label={t("Go back")}
        title={t("Go back")}
        className="titlebar-button titlebar-no-drag"
        disabled={!canGoBack}
        onClick={() => navigate(-1)}
      >
        <ChevronLeft size={17} />
      </button>
      <button
        type="button"
        aria-label={t("Go forward")}
        title={t("Go forward")}
        className="titlebar-button titlebar-no-drag"
        disabled={!canGoForward}
        onClick={() => navigate(1)}
      >
        <ChevronRight size={17} />
      </button>
      <button
        type="button"
        aria-label={t("Reload page")}
        title={t("Reload page")}
        className="titlebar-button titlebar-no-drag"
        onClick={() => window.location.reload()}
      >
        <RotateCw size={15} />
      </button>
    </div>
  );

  if (windowTitle) {
    if (windowTitle === "Shelve Studio") {
      const windowControls = isDesktop && <>
        <button type="button" className="window-button titlebar-no-drag" onClick={() => withWindow("minimize")} aria-label={t("Minimize")} title={t("Minimize")}><Minus size={15} /></button>
        <button type="button" className="window-button titlebar-no-drag" onClick={() => withWindow("toggleMaximize")} aria-label={maximized ? t("Restore") : t("Maximize")} title={maximized ? t("Restore") : t("Maximize")}>{maximized ? <span className="restore-icon" /> : <span className="maximize-icon" />}</button>
        <button type="button" className="window-button window-close titlebar-no-drag" onClick={() => withWindow("close")} aria-label={t("Close")} title={t("Close")}><X size={15} /></button>
      </>;

      return (
        <header className="titlebar studio-titlebar" data-tauri-drag-region dir="ltr">
          <div className="studio-titlebar-left">
            <div className="studio-titlebar-brand" data-tauri-drag-region>
              <img src="/icon.png" alt="" />
              <span>{t("Shelve Studio")}</span>
            </div>
            <BaseMenu.Root>
              <BaseMenu.Trigger className="studio-file-menu-trigger titlebar-no-drag" aria-label={t("File menu")} aria-haspopup="menu">
                {t("File")}<ChevronDown size={12} />
              </BaseMenu.Trigger>
              <BaseMenu.Portal>
                <BaseMenu.Positioner side="bottom" align="start" sideOffset={5} collisionPadding={10} className="z-[200]">
                  <BaseMenu.Popup className="studio-file-menu-popup" aria-label={t("File")}>
                    <BaseMenu.Item className="studio-file-menu-item" onClick={() => studioActions?.onNewProject()}>
                      <FilePlus2 size={14} />{t("New Project...")}<kbd>{shortcutDisplay("studioNewProject")}</kbd>
                    </BaseMenu.Item>
                    <BaseMenu.Item className="studio-file-menu-item" onClick={studioActions?.onOpenProjectPicker}>
                      <FolderOpen size={14} />{t("Open Folder / Project...")}<kbd>{shortcutDisplay("studioOpenProject")}</kbd>
                    </BaseMenu.Item>
                    <BaseMenu.SubmenuRoot>
                      <BaseMenu.SubmenuTrigger className="studio-file-menu-item studio-file-menu-submenu">
                        <BookOpen size={14} />{t("Recent Projects")}<ChevronRight size={13} />
                      </BaseMenu.SubmenuTrigger>
                      <BaseMenu.Portal>
                        <BaseMenu.Positioner side="right" align="start" sideOffset={4} collisionPadding={10} className="z-[201]">
                          <BaseMenu.Popup className="studio-file-menu-popup studio-recent-menu-popup" aria-label={t("Recent Projects")}>
                            {studioToolbar?.recentProjects.length
                              ? studioToolbar.recentProjects.map((project) => <BaseMenu.Item
                                key={project.id}
                                className="studio-file-menu-item studio-recent-menu-item"
                                disabled={project.id === studioToolbar.activeProjectId}
                                onClick={() => studioActions?.onSelectRecentProject(project.id)}
                              >
                                <span className="studio-recent-menu-title">{project.title}</span>
                                <small>{t(project.formatType ?? "Book")} · {t(project.genre)}</small>
                              </BaseMenu.Item>)
                              : <BaseMenu.Item disabled className="studio-file-menu-item">{t("No recent projects")}</BaseMenu.Item>}
                          </BaseMenu.Popup>
                        </BaseMenu.Positioner>
                      </BaseMenu.Portal>
                    </BaseMenu.SubmenuRoot>
                    <BaseMenu.Separator className="studio-file-menu-separator" />
                    <BaseMenu.Item className="studio-file-menu-item" disabled={!studioToolbar?.activeProjectId} onClick={studioActions?.onCloseProject}>
                      <X size={14} />{t("Close Current Folder")}
                    </BaseMenu.Item>
                    <BaseMenu.Item className="studio-file-menu-item" onClick={() => window.open(window.location.href, "_blank")}>
                      <Expand size={14} />{t("New Window")}
                    </BaseMenu.Item>
                  </BaseMenu.Popup>
                </BaseMenu.Positioner>
              </BaseMenu.Portal>
            </BaseMenu.Root>
            <div className="studio-titlebar-breadcrumb" data-tauri-drag-region dir={language === "ar" ? "rtl" : "ltr"}>
              {studioToolbar?.projectTitle
                ? <><span title={studioToolbar.projectTitle}>{studioToolbar.projectTitle}</span><ChevronRight size={12} /><span title={studioToolbar.chapterTitle}>{studioToolbar.chapterTitle}</span></>
                : <span>{t("My writings")}</span>}
            </div>
          </div>

          <nav className="studio-titlebar-modes" role="tablist" aria-label={t("Studio modes")}>
            {([
              ["write", "Write", studioActions?.onOpenWritePage],
              ["cover", "Cover Designer", studioActions?.onOpenCoverDesigner],
              ["goals", "Goals", studioActions?.onOpenGoalsPage],
              ["analytics", "Analytics", studioActions?.onOpenAnalyticsPage],
            ] as const).map(([key, label, action]) => <button
              type="button"
              key={key}
              role="tab"
              className={`titlebar-no-drag ${key === "write" ? "selected" : ""}`}
              aria-selected={key === "write"}
              onClick={() => action?.()}
            >{t(label)}</button>)}
          </nav>

          <div className="studio-titlebar-actions">
            <div className="studio-titlebar-tools">
              <button type="button" className="titlebar-button titlebar-no-drag" onClick={() => studioActions?.onUndo()} title={t("Undo")} aria-label={t("Undo")}><Undo2 size={15} /></button>
              <button type="button" className="titlebar-button titlebar-no-drag" onClick={() => studioActions?.onRedo()} title={t("Redo")} aria-label={t("Redo")}><Redo2 size={15} /></button>
              <button type="button" className={`titlebar-button titlebar-no-drag ${studioToolbar?.paperSettingsOpen ? "active" : ""}`} onClick={() => studioActions?.onTogglePaperSettings()} title={t("Paper & Typography")} aria-label={t("Paper & Typography")}><Type size={15} /></button>
              {studioToolbar?.hasProject && <>
                <button type="button" className="studio-titlebar-action titlebar-no-drag" onClick={() => studioActions?.onPreviewBook()} title={t("Preview Book")} aria-label={t("Preview Book")}><BookOpen size={14} /><span>{t("Preview Book")}</span></button>
                <button type="button" className="studio-titlebar-action titlebar-no-drag" onClick={() => studioActions?.onExportPdf()} title={t("Export PDF")} aria-label={t("Export PDF")}><FileDown size={14} /><span>{t("Export PDF")}</span></button>
              </>}
              <div className="studio-titlebar-menu" ref={studioToolsRef}>
                <button type="button" className={`titlebar-button titlebar-no-drag ${studioToolsOpen ? "active" : ""}`} onClick={() => setStudioToolsOpen((open) => !open)} aria-label={t("Studio tools")} aria-haspopup="menu" aria-expanded={studioToolsOpen} title={t("Studio tools")}><MoreHorizontal size={15} /></button>
                {studioToolsOpen && <div className="studio-titlebar-menu-popover" role="menu" aria-label={t("Studio tools")}>
                  <button type="button" role="menuitem" onClick={() => { studioActions?.onToggleBookPreview(); setStudioToolsOpen(false); }}>{t("Preview as book")}</button>
                  <button type="button" role="menuitem" onClick={() => { studioActions?.onFindReplace(); setStudioToolsOpen(false); }}>{t("Find & Replace")}</button>
                  <button type="button" role="menuitem" onClick={() => { studioActions?.onJumpToChapter(); setStudioToolsOpen(false); }}>{t("Jump to Chapter")}</button>
                  <button type="button" role="menuitem" onClick={() => { studioActions?.onToggleAssistant(); setStudioToolsOpen(false); }}>{t(studioToolbar?.assistantOpen ? "Hide assistant panel" : "Show assistant panel")}</button>
                  <button type="button" role="menuitem" onClick={() => { studioActions?.onToggleFocus(); setStudioToolsOpen(false); }}>{t(studioToolbar?.focusMode ? "Exit focus" : "Focus mode")}</button>
                  <button type="button" role="menuitem" onClick={() => { studioActions?.onOpenShortcuts(); setStudioToolsOpen(false); }}>{t("Keyboard shortcuts")}</button>
                </div>}
              </div>
              <button type="button" className="titlebar-button studio-optional-titlebar-action studio-titlebar-focus titlebar-no-drag" onClick={() => studioActions?.onToggleFocus()} title={t(studioToolbar?.focusMode ? "Exit focus" : "Focus mode")} aria-label={t(studioToolbar?.focusMode ? "Exit focus" : "Focus mode")}>{studioToolbar?.focusMode ? <Minimize2 size={15} /> : <Expand size={15} />}</button>
              <button type="button" className="titlebar-button studio-optional-titlebar-action studio-titlebar-shortcuts titlebar-no-drag" onClick={() => studioActions?.onOpenShortcuts()} title={t("Keyboard shortcuts")} aria-label={t("Keyboard shortcuts")}><Keyboard size={15} /></button>
              <button type="button" className={`titlebar-button studio-titlebar-panel-toggle titlebar-no-drag ${studioToolbar?.sidebarOpen ? "active" : ""}`} onClick={() => studioActions?.onToggleSidebar()} title={`${t(studioToolbar?.sidebarOpen ? "Hide drafts sidebar" : "Show drafts sidebar")} (${shortcutDisplay("studioToggleExplorer")})`} aria-label={t(studioToolbar?.sidebarOpen ? "Hide drafts sidebar" : "Show drafts sidebar")} aria-pressed={studioToolbar?.sidebarOpen ?? false}><PanelLeft size={15} /></button>
              <button type="button" className={`titlebar-button studio-titlebar-panel-toggle titlebar-no-drag ${studioToolbar?.assistantOpen ? "active" : ""}`} onClick={() => studioActions?.onToggleAssistant()} title={`${t(studioToolbar?.assistantOpen ? "Hide assistant panel" : "Show assistant panel")} (${shortcutDisplay("studioToggleAssistant")})`} aria-label={t(studioToolbar?.assistantOpen ? "Hide assistant panel" : "Show assistant panel")} aria-pressed={studioToolbar?.assistantOpen ?? false}><PanelRight size={15} /></button>
            </div>
            <span className="studio-titlebar-drag-space" data-tauri-drag-region />
            <div className="titlebar-actions studio-window-controls">{windowControls}</div>
          </div>
        </header>
      );
    }

    return (
      <header className="titlebar titlebar-secondary" data-tauri-drag-region>
        <div className="titlebar-brand" data-tauri-drag-region>
          <img src="/icon.png" alt="logo" className="size-5" />
        <span>{windowTitle}</span></div>
        <div className="titlebar-actions">
    
          {isDesktop && <>
            <button type="button" className="window-button titlebar-no-drag" onClick={() => withWindow("minimize")} aria-label={t("Minimize")}><Minus size={15} /></button>
            <button type="button" className="window-button titlebar-no-drag" onClick={() => withWindow("toggleMaximize")} aria-label={maximized ? t("Restore") : t("Maximize")}>{maximized ? <span className="restore-icon" /> : <span className="maximize-icon" />}</button>
            <button type="button" className="window-button window-close titlebar-no-drag" onClick={() => withWindow("close")} aria-label={t("Close")}><X size={15} /></button>
          </>}
        </div>
      </header>
    );
  }

  return (
    <header className="titlebar" data-tauri-drag-region>
  
      <div className="titlebar-brand" data-tauri-drag-region>
          {onMobileMenuToggle && (
            <button
              type="button"
              className="titlebar-button titlebar-no-drag mobile-menu-button"
              aria-label={mobileMenuOpen ? t("Close navigation menu") : t("Open navigation menu")}
              aria-controls="primary-navigation"
              aria-expanded={mobileMenuOpen}
              title={mobileMenuOpen ? t("Close navigation menu") : t("Open navigation menu")}
              onClick={onMobileMenuToggle}
            >
              {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
          )}
          {navigationButtons}
          <img src="/icon.png" alt="logo" className="size-5" />
        
        <span>Shelve</span></div>
      <div className="titlebar-search-wrap titlebar-no-drag">
        <Search size={14} />
        <input
          ref={searchInputRef}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          onFocus={() => setSuggestionsOpen(true)}
          onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && suggestions[0]) onOpenBook(suggestions[0]);
            if (event.key === "Escape") setSuggestionsOpen(false);
          }}
          placeholder={t("Search books, authors, genres...")}
          aria-label={t("Search your library")}
        />
        {suggestionsOpen && suggestions.length > 0 && (
          <div className="search-suggestions">
            {suggestions.map((book) => (
              <button key={book.id} onMouseDown={(event) => event.preventDefault()} onClick={() => onOpenBook(book)}>
                <BookOpen size={15} /><span><strong>{book.title}</strong><small>{book.author} · {book.category}</small></span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="titlebar-actions">
   
        <button type="button" className="titlebar-button plan-button titlebar-no-drag" onClick={onPlan} title={t("Reading plan")}><CalendarDays size={15} /><span>{t("Plan")}</span></button>
        <div className="theme-menu" ref={themeMenuRef}>
          <button
            className="titlebar-button titlebar-no-drag"
            onClick={() => setThemeMenuOpen((open) => !open)}
            title={t("Change appearance")}
            aria-label={t("Change appearance")}
            aria-haspopup="menu"
            aria-expanded={themeMenuOpen}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          {themeMenuOpen && (
            <div className="theme-menu-popover" role="menu" aria-label={t("Color theme")}>
              {(["light", "dark"] as const).map((choice) => (
                <button
                  key={choice}
                  className="theme-menu-item"
                  role="menuitemradio"
                  aria-checked={theme === choice}
                  onClick={() => {
                    onThemeChange(choice);
                    setThemeMenuOpen(false);
                  }}
                >
                  <span>{t(choice[0].toUpperCase() + choice.slice(1))}</span>
                  {theme === choice && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="shortcuts-wrap">
          <button type="button" className="titlebar-button shortcuts-button titlebar-no-drag" onClick={() => setShortcutsOpen((value) => !value)} aria-label={t("Keyboard shortcuts")} aria-haspopup="dialog" aria-expanded={shortcutsOpen} title={t("Keyboard shortcuts")}><Keyboard size={15} /><span>{t("Shortcuts")}</span></button>
          {shortcutsOpen && (
            <section className="shortcuts-menu" role="dialog" aria-label={t("Keyboard shortcuts")}>
              <header className="shortcuts-menu-header"><h2>{t("Keyboard shortcuts")}</h2><button className="icon-button" onClick={() => setShortcutsOpen(false)} aria-label={t("Close shortcuts")}><X size={14} /></button></header>
              <dl className="shortcuts-list">
                {[...APP_SHORTCUTS, ...(location.pathname.endsWith("/reader") ? READER_SHORTCUTS : [])].map((id) =>
                  <div key={id}><dt>{t(shortcutLabel(id))}</dt><dd><kbd>{shortcutDisplay(id)}</kbd></dd></div>)}
              </dl>
            </section>
          )}
        </div>
        {isDesktop && <>
          <button type="button" className="window-button titlebar-no-drag" onClick={() => withWindow("minimize")} aria-label={t("Minimize")}><Minus size={15} /></button>
          <button type="button" className="window-button titlebar-no-drag" onClick={() => withWindow("toggleMaximize")} aria-label={maximized ? t("Restore") : t("Maximize")}>{maximized ? <span className="restore-icon" /> : <span className="maximize-icon" />}</button>
          <button type="button" className="window-button window-close titlebar-no-drag" onClick={() => withWindow("close")} aria-label={t("Close")}><X size={15} /></button>

        </>}
      </div>
    </header>
  );
}
