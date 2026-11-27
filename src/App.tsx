import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { toBlob } from "html-to-image";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AccountMenu from "./components/AccountMenu";
import AddBookDialog from "./components/AddBookDialog";
import NotificationCenter from "./components/NotificationCenter";
import Sidebar from "./components/Sidebar";
import TitleBar from "./components/TitleBar";
import type { StudioTitlebarActions, StudioTitlebarUpdate, StudioTitlebarView } from "./components/TitleBar";
import WindowResizeHandles from "./components/WindowResizeHandles";
import NewProjectWindow from "./components/writing/NewProjectWindow";
import { useLanguage } from "./components/language-provider";
import { useTheme } from "./components/theme-provider";
import { ErrorAlert, useErrorFeedback } from "./components/error-feedback";
import { useConfirmationDialog } from "./components/confirmation-dialog";
import {
  AiPage,
  OnboardingPage,
  SignInPage,
  SignUpPage,
  VerifyEmailPage,
  EditBookPage,
  UploadBookPage,
  AnalyticsPage,
  ArchivePage,
  BookDetailsPage,
  LibraryPage,
  OverviewPage,
  PublicLibraryPage,
  ProfilePage,
  ReaderPage,
  ReadingPage,
  ReadingPlannerPage,
  RecommendationsPage,
  ResetPasswordPage,
  SettingsPage,
  WritePage,
  WritingGoalsPage,
  WritingCoverPage,
  WritingAnalyticsPage,
  NotificationsPage,
  FeedbackPage,
} from "./pages";
import { deleteAccountOnline, resendVerificationEmail, signInOnline, signOutOnline, signUpOnline, syncOfflineDataToCloud, updateProfileOnline, updateSessionPreferenceOnline, uploadBookAssets, verifyAccountPasswordOnline } from "./lib/cloud";
import { ApiError, apiRequest, uploadApiFile } from "./lib/api";
import { openAuxiliaryWindow, toggleAuxiliaryWindow } from "./lib/windows";
import { matchesShortcut } from "./lib/keyboard-shortcuts";
import { getSyncHealth, syncEngine } from "./lib/sync/SyncEngine";
import {
  exportBackup,
  clearAuthSession,
  configureStorage,
  deleteBookRecord,
  deleteLocalData as clearLocalData,
  cacheCoverFile,
  importBackup,
  loadAuthSession,
  loadBooks,
  loadProfileAvatar,
  loadStorageMode,
  loadText,
  removeFile,
  saveCoverFile,
  saveAuthSession,
  saveBooks,
  saveProfileAvatar,
  saveStorageMode,
  saveFile,
  saveText,
  storageKeys,
} from "./lib/storage";
import type { LocalDataResetScope } from "./lib/storage";
import type { AppView, AuthSession, Book, BookStatus, StorageMode } from "./types";
import "./index.css";
import "./App.css";

const viewPaths: Record<AppView, string> = {
  overview: "/overview",
  onboarding: "/onboarding",
  signin: "/signin",
  "reset-password": "/reset-password",
  signup: "/signup",
  library: "/library",
  reading: "/reading",
  archive: "/archive",
  analytics: "/analytics",
  writings: "/writings",
  "public-library": "/public-library",
  recommendations: "/recommendations",
  ask: "/ask",
  upload: "/upload",
  settings: "/settings",
  profile: "/profile",
  notifications: "/notifications",
  feedback: "/feedback",
  planner: "/planner",
  "edit-book": "/library",
  details: "/library",
  reader: "/library",
};

function routeForView(view: AppView, bookId?: string | null): string {
  if (bookId && view === "details") return `/books/${encodeURIComponent(bookId)}`;
  if (bookId && view === "reader") return `/books/${encodeURIComponent(bookId)}/reader`;
  if (bookId && view === "edit-book") return `/books/${encodeURIComponent(bookId)}/edit`;
  return viewPaths[view];
}

function viewForPath(pathname: string): AppView {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "books") {
    if (segments[2] === "reader") return "reader";
    if (segments[2] === "edit") return "edit-book";
    return "details";
  }
  const pathViews: Record<string, AppView> = {
    onboarding: "onboarding",
    signin: "signin",
    "reset-password": "reset-password",
    signup: "signup",
    overview: "overview",
    library: "library",
    reading: "reading",
    archive: "archive",
    analytics: "analytics",
    writings: "writings",
    "public-library": "public-library",
    recommendations: "recommendations",
    ask: "ask",
    upload: "upload",
    settings: "settings",
    profile: "profile",
    notifications: "notifications",
    feedback: "feedback",
    planner: "planner",
  };
  return pathViews[segments[0] ?? "overview"] ?? "overview";
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { cycleLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { configureReporter } = useErrorFeedback();
  const { confirm, dialog: confirmationDialog } = useConfirmationDialog();
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAddBook, setShowAddBook] = useState(false);
  const [writing, setWriting] = useState("");
  const [storageMode, setStorageMode] = useState<StorageMode>("offline");
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const authSessionRef = useRef<AuthSession | null>(null);
  authSessionRef.current = authSession;
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [appMessage, setAppMessage] = useState("");
  const [appMessageError, setAppMessageError] = useState(false);
  const [authWarning, setAuthWarning] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [studioTitlebar, setStudioTitlebar] = useState<StudioTitlebarView | null>(null);
  const studioTitlebarActions = useRef<StudioTitlebarActions | null>(null);
  const [authReturnView, setAuthReturnView] = useState<AppView>("onboarding");
  const [windowKind] = useState(() => new URLSearchParams(window.location.search).get("window") ??
    (window.location.pathname === "/studio" ? "studio" : null));
  const [windowBookId] = useState(() => new URLSearchParams(window.location.search).get("bookId"));
  const view = viewForPath(location.pathname);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pathBookId = location.pathname.match(/^\/books\/([^/]+)/)?.[1];
  const activeBookId = pathBookId ? decodeURIComponent(pathBookId) : selectedBookId;
  const setView = (nextView: AppView, bookId = activeBookId) => {
    navigate(routeForView(nextView, bookId));
  };
  const showAppMessage = (message: string, isError = false) => {
    setAppMessage(message);
    setAppMessageError(isError);
  };

  useEffect(() => {
    if (!appMessage || appMessageError) return;
    const timeout = window.setTimeout(() => setAppMessage(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [appMessage, appMessageError]);
  const updateStudioTitlebar = useCallback((update: StudioTitlebarUpdate) => {
    studioTitlebarActions.current = update.actions;
    const nextView: StudioTitlebarView = {
      activeProjectId: update.activeProjectId,
      recentProjects: update.recentProjects,
      projectTitle: update.projectTitle,
      chapterTitle: update.chapterTitle,
      sidebarOpen: update.sidebarOpen,
      paperSettingsOpen: update.paperSettingsOpen,
      hasProject: update.hasProject,
      assistantOpen: update.assistantOpen,
      focusMode: update.focusMode,
    };
    setStudioTitlebar((current) => {
      if (!current) return nextView;
      const recentProjectsUnchanged = current.recentProjects.length === nextView.recentProjects.length &&
        current.recentProjects.every((project, index) => {
          const nextProject = nextView.recentProjects[index];
          return project.id === nextProject.id &&
            project.title === nextProject.title &&
            project.formatType === nextProject.formatType &&
            project.genre === nextProject.genre;
        });
      return current.activeProjectId === nextView.activeProjectId &&
        recentProjectsUnchanged &&
        current.projectTitle === nextView.projectTitle &&
        current.chapterTitle === nextView.chapterTitle &&
        current.sidebarOpen === nextView.sidebarOpen &&
        current.paperSettingsOpen === nextView.paperSettingsOpen &&
        current.hasProject === nextView.hasProject &&
        current.assistantOpen === nextView.assistantOpen &&
        current.focusMode === nextView.focusMode
        ? current
        : nextView;
    });
  }, []);
  const studioTitlebarCallbacks = useMemo<StudioTitlebarActions>(() => ({
    onOpenWritePage: () => {
      if (windowKind) window.location.hash = "#/writings";
      else navigate("/writings");
    },
    onOpenCoverDesigner: () => windowKind ? window.location.hash = "#/writings/cover" : navigate("/writings/cover"),
    onOpenGoalsPage: () => windowKind ? window.location.hash = "#/writings/goals" : navigate("/writings/goals"),
    onOpenAnalyticsPage: () => windowKind ? window.location.hash = "#/writings/analytics" : navigate("/writings/analytics"),
    onNewProject: (formatType) => studioTitlebarActions.current?.onNewProject(formatType),
    onOpenProjectPicker: () => studioTitlebarActions.current?.onOpenProjectPicker(),
    onSelectRecentProject: (projectId) => studioTitlebarActions.current?.onSelectRecentProject(projectId),
    onCloseProject: () => studioTitlebarActions.current?.onCloseProject(),
    onToggleSidebar: () => studioTitlebarActions.current?.onToggleSidebar(),
    onUndo: () => studioTitlebarActions.current?.onUndo(),
    onRedo: () => studioTitlebarActions.current?.onRedo(),
    onTogglePaperSettings: () => studioTitlebarActions.current?.onTogglePaperSettings(),
    onPreviewBook: () => studioTitlebarActions.current?.onPreviewBook(),
    onExportPdf: () => studioTitlebarActions.current?.onExportPdf(),
    onOpenShortcuts: () => studioTitlebarActions.current?.onOpenShortcuts(),
    onToggleAssistant: () => studioTitlebarActions.current?.onToggleAssistant(),
    onToggleFocus: () => studioTitlebarActions.current?.onToggleFocus(),
    onToggleBookPreview: () => studioTitlebarActions.current?.onToggleBookPreview(),
    onFindReplace: () => studioTitlebarActions.current?.onFindReplace(),
    onJumpToChapter: () => studioTitlebarActions.current?.onJumpToChapter(),
  }), []);

  useEffect(() => {
    if (!authSession?.token) {
      configureReporter(null);
      return;
    }
    configureReporter(async (message, screenshots) => {
      const form = new FormData();
      form.set("title", "Runtime application error");
      form.set("message", Array.from(message).slice(0, 4000).join(""));
      form.set("screen", "runtime-error");
      form.set("metadata", JSON.stringify({
        platform: navigator.platform,
        userAgent: navigator.userAgent.slice(0, 512),
        route: window.location.pathname,
        appView: viewRef.current,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }));
      screenshots.forEach((file) => form.append("screenshots", file, file.name));
      await apiRequest("/api/error-reports", {
        method: "POST",
        body: form,
      }, authSession.token);
    });
    return () => configureReporter(null);
  }, [authSession?.token, configureReporter]);

  const updateProfileAvatar = async (avatar: string | null) => {
    await saveProfileAvatar(avatar);
    setProfileAvatar(avatar);
  };

  useEffect(() => {
    const desktopBreakpoint = window.matchMedia("(min-width: 768px)");
    const closeMobileMenu = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileMenuOpen(false);
    };
    desktopBreakpoint.addEventListener("change", closeMobileMenu);
    return () => desktopBreakpoint.removeEventListener("change", closeMobileMenu);
  }, []);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === activeBookId) ?? null,
    [books, activeBookId],
  );

  const closeAuxiliaryWindow = () => {
    if (isTauri()) {
      void getCurrentWindow().close().catch((error: unknown) => console.error("Could not close the window:", error));
    } else {
      setView("library");
    }
  };

  const openPlanner = async () => {
    try {
      if (!(await openAuxiliaryWindow("planner"))) setView("planner");
    } catch (error) {
      showAppMessage(error instanceof Error ? error.message : "Could not open the reading planner.", true);
      setView("planner");
    }
  };

  const openStudio = async () => {
    try {
      if (!(await openAuxiliaryWindow("studio"))) setView("writings");
    } catch (error) {
      showAppMessage(error instanceof Error ? error.message : "Could not open Shelve Studio.", true);
      setView("writings");
    }
  };

  const openUpload = async () => {
    try {
      if (!(await openAuxiliaryWindow("upload-book"))) setShowAddBook(true);
    } catch (error) {
      showAppMessage(error instanceof Error ? error.message : "Could not open the upload window.", true);
      setShowAddBook(true);
    }
  };

  const toggleStudioFromShortcut = async () => {
    try {
      if (!(await toggleAuxiliaryWindow("studio"))) setView(view === "writings" ? "library" : "writings");
    } catch (error) {
      showAppMessage(error instanceof Error ? error.message : "Could not toggle Shelve Studio.", true);
    }
  };

  const togglePlannerFromShortcut = async () => {
    try {
      if (!(await toggleAuxiliaryWindow("planner"))) setView(view === "planner" ? "library" : "planner");
    } catch (error) {
      showAppMessage(error instanceof Error ? error.message : "Could not toggle the reading planner.", true);
    }
  };

  const toggleUploadFromShortcut = async () => {
    try {
      if (!(await toggleAuxiliaryWindow("upload-book"))) setShowAddBook((open) => !open);
    } catch (error) {
      showAppMessage(error instanceof Error ? error.message : "Could not toggle the upload window.", true);
    }
  };

  const saveScreenshot = async () => {
    try {
      const target = document.querySelector<HTMLElement>(".main-content") ?? document.body;
      const image = await toBlob(target, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--bg-canvas").trim() || "#0B0C0E",
        pixelRatio: 2,
      });
      if (!image) throw new Error("Could not render the current screen as an image.");
      const url = URL.createObjectURL(image);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `shelve-screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      showAppMessage("Screenshot downloaded.");
    } catch (error) {
      console.error("Could not save a screenshot:", error);
      showAppMessage(error instanceof Error ? error.message : "Could not save a screenshot.", true);
    }
  };

  const revealWindow = async () => {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().show();
      if (!windowKind) {
        const splash = await WebviewWindow.getByLabel("splash");
        if (splash) await splash.close();
      }
    } catch (error) {
      console.error("Could not reveal the Shelve window:", error);
      showAppMessage("The app initialized, but its window could not be shown. Try restarting Shelve.", true);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const mode = await loadStorageMode();
        let savedProfileAvatar: string | null = null;
        try {
          savedProfileAvatar = await loadProfileAvatar();
        } catch (error) {
          console.error("Could not load the saved profile photo:", error);
          if (!cancelled) {
            showAppMessage(error instanceof Error ? `Profile photo unavailable: ${error.message}` : "Profile photo unavailable.", true);
          }
        }
        let session: AuthSession | null = null;
        try {
          session = await loadAuthSession();
        } catch (error) {
          console.error("Could not restore the cloud session:", error);
          if (!cancelled) setAuthWarning("Your saved sign-in could not be restored. Sign in again to use cloud sync.");
        }
        let effectiveMode = mode ?? (isTauri() ? "offline" : "cloud");
        configureStorage(effectiveMode, session?.token ?? null);
        const clearInvalidSession = async (error: unknown): Promise<boolean> => {
          if (effectiveMode !== "cloud" || !session || !(error instanceof ApiError) || error.status !== 401) {
            return false;
          }
          await signOutOnline();
          session = null;
          configureStorage(effectiveMode, null);
          if (!cancelled) {
            setAuthWarning("Your saved sign-in is invalid or expired. Sign in again to sync your cloud library.");
          }
          return true;
        };
        if (effectiveMode === "cloud" && session && isTauri()) {
          try {
            await syncOfflineDataToCloud(session.token, true);
          } catch (error) {
            if (!(await clearInvalidSession(error))) {
              console.error("Could not reconcile local offline data at startup:", error);
              if (!cancelled) showAppMessage(error instanceof Error ? `Offline data sync failed: ${error.message}` : "Offline data sync failed.", true);
            }
          }
        }
        const mayReadLibrary = effectiveMode === "offline" || Boolean(session);
        let loadedBooks: Book[] = [];
        let savedWriting = "";
        if (mayReadLibrary) {
          try {
            [loadedBooks, savedWriting] = await Promise.all([
              loadBooks(),
              loadText(storageKeys.writing, ""),
            ]);
          } catch (error) {
            if (await clearInvalidSession(error)) {
              loadedBooks = [];
              savedWriting = "";
            } else if (effectiveMode === "cloud" && isTauri() && error instanceof TypeError) {
              effectiveMode = "offline";
              configureStorage(effectiveMode, null);
              [loadedBooks, savedWriting] = await Promise.all([
                loadBooks(),
                loadText(storageKeys.writing, ""),
              ]);
              if (!cancelled) {
                showAppMessage("Could not reach the Shelve server. Opened your local offline library; switch to Cloud online mode to sync after reconnecting.", true);
              }
            } else {
              throw error;
            }
          }
        }
        if (cancelled) return;
        setBooks(loadedBooks);
        if (windowKind === "edit-book" && windowBookId) setSelectedBookId(windowBookId);
        setWriting(savedWriting);
        setProfileAvatar(savedProfileAvatar);
        setStorageMode(effectiveMode);
        setAuthSession(session);
        const isAuthRoute = ["/onboarding", "/signin", "/signup", "/verify-email", "/reset-password"].includes(location.pathname);
        if (location.pathname === "/" || (effectiveMode === "cloud" && !session && !isAuthRoute)) {
          const initialView: AppView = mode === null && !session ? "onboarding" : effectiveMode === "cloud" && !session ? "signin" : "overview";
          navigate(routeForView(initialView), { replace: true });
        }
      } catch (error) {
        console.error("Could not initialize Shelve storage:", error);
        if (!cancelled) setStartupError(error instanceof Error ? error.message : "Could not initialize local storage.");
      } finally {
        if (!cancelled) {
          setInitialized(true);
          await revealWindow();
        }
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!initialized || storageMode !== "cloud" || !authSession) return;
    let active = true;
    let refreshing = false;
    let refreshFailureShown = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const [freshBooks, freshWriting] = await Promise.all([
          loadBooks(),
          loadText(storageKeys.writing, ""),
        ]);
        if (!active) return;
        setBooks(freshBooks);
        setWriting(freshWriting);
        window.dispatchEvent(new Event("shelve:cloud-refresh"));
        refreshFailureShown = false;
      } catch (error) {
        if (!active) return;
        console.error("Could not refresh online library data:", error);
        if (!refreshFailureShown) {
          showAppMessage(error instanceof Error ? `Online data refresh failed: ${error.message}` : "Online data refresh failed.", true);
          refreshFailureShown = true;
        }
      } finally {
        refreshing = false;
      }
    };
    const onReconnect = () => void refresh();
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(() => void refresh(), 10_000);
    window.addEventListener("online", onReconnect);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", onReconnect);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [initialized, storageMode, authSession]);

  useEffect(() => {
    if (!initialized || !isTauri() || windowKind || storageMode !== "cloud" || !authSession?.token) {
      syncEngine.stop();
      return;
    }
    return syncEngine.start(authSession.token, (token) => syncOfflineDataToCloud(token, true));
  }, [initialized, windowKind, storageMode, authSession?.token]);

  useEffect(() => {
    if (!initialized || !authSession?.token) return;
    const expiresAt = Date.parse(authSession.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    let warningShown = false;
    let expirationStarted = false;

    const expireSession = async () => {
      if (expirationStarted) return;
      expirationStarted = true;
      try {
        await syncEngine.stopAndWait();
      } catch (error) {
        console.error("Could not stop cloud sync after session expiry:", error);
      }
      if (authSessionRef.current?.token !== authSession.token) return;
      try {
        await clearAuthSession();
      } catch (error) {
        console.error("Could not clear the expired session:", error);
      }
      setAuthSession(null);
      setAuthReturnView("settings");
      setAuthWarning("Your session expired. Please sign in again.");
      if (isTauri()) {
        configureStorage("offline", null);
        setStorageMode("offline");
        try {
          await saveStorageMode("offline");
        } catch (error) {
          console.error("Could not save offline mode after session expiry:", error);
          showAppMessage(error instanceof Error ? error.message : "Could not save offline storage mode.", true);
        }
        try {
          const [localBooks, localWriting] = await Promise.all([
            loadBooks(),
            loadText(storageKeys.writing, ""),
          ]);
          setBooks(localBooks);
          setWriting(localWriting);
        } catch (error) {
          console.error("Could not load the local library after session expiry:", error);
          showAppMessage(error instanceof Error ? error.message : "Could not load the local library.", true);
        }
      } else {
        configureStorage("cloud", null);
        setBooks([]);
        setWriting("");
      }
      const signInNow = await confirm({
        title: t("Session expired"),
        message: t("Your session expired. Sign in again to continue."),
        confirmLabel: t("Sign in"),
      });
      if (signInNow) setView("signin");
    };

    const checkSession = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        void expireSession();
        return;
      }
      if (!warningShown && remaining <= 60 * 60 * 1000) {
        warningShown = true;
        void confirm({
          title: t("Session expires in one hour"),
          message: t("Your session expires in one hour. Turn on Remember me in Profile to stay signed in for 30 days, or sign in again."),
          confirmLabel: t("Open profile"),
        }).then((openProfile) => {
          if (openProfile) setView("profile");
        });
      }
    };

    checkSession();
    const interval = window.setInterval(checkSession, 15_000);
    document.addEventListener("visibilitychange", checkSession);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", checkSession);
    };
  }, [initialized, authSession?.token, authSession?.expiresAt, confirm, t]);

  useEffect(() => {
    if (!initialized || !isTauri()) return;
    const refreshLibrary = () => {
      void Promise.all([loadBooks(), loadText(storageKeys.writing, "")]).then(([freshBooks, freshWriting]) => {
        setBooks(freshBooks);
        setWriting(freshWriting);
      }).catch((error: unknown) => {
        console.error("Could not refresh the library after sync:", error);
        showAppMessage(error instanceof Error ? error.message : "Could not refresh the library after sync.", true);
      });
    };
    window.addEventListener("shelve:library-refresh", refreshLibrary);
    return () => window.removeEventListener("shelve:library-refresh", refreshLibrary);
  }, [initialized]);

  useEffect(() => {
    if (!initialized || !isTauri()) return;
    let allowClose = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (allowClose || windowKind === "upload-book" || windowKind === "planner") return;
      event.preventDefault();
      try {
        const status = await getSyncHealth();
        const unsynced = status.pending + status.failed;
        if (unsynced === 0) {
          allowClose = true;
          await getCurrentWindow().close();
          return;
        }
        const shouldClose = await confirm({
          title: t("Unsynced changes"),
          message: `${unsynced} ${t("changes have not synced. Closing now keeps them on this device for later sync. Continue?")}`,
          confirmLabel: t("Close anyway"),
        });
        if (shouldClose) {
          allowClose = true;
          await getCurrentWindow().close();
        }
      } catch (error) {
        console.error("Could not check pending sync work before closing:", error);
        showAppMessage(error instanceof Error ? error.message : "Could not check sync state before closing.", true);
      }
    }).then((dispose) => { unlisten = dispose; }).catch((error: unknown) => {
      console.error("Could not install the close guard:", error);
    });
    return () => unlisten?.();
  }, [initialized, confirm, t, windowKind]);

  useEffect(() => {
    if (!initialized || startupError) return;
    void saveBooks(books).catch((error: unknown) => {
      console.error("Could not save your library:", error);
      showAppMessage(error instanceof Error ? error.message : "Your changes could not be saved.", true);
    });
  }, [books, initialized, startupError]);

  useEffect(() => {
    if (!isTauri() || windowKind) return;
    let unlisten: (() => void) | undefined;
    let unlistenRecords: (() => void) | undefined;
    void listen("shelve:books-updated", async () => {
      try {
        setBooks(await loadBooks());
      } catch (error) {
        console.error("Could not refresh the library from another window:", error);
        showAppMessage("A book changed in another window, but the library could not be refreshed.", true);
      }
    }).then((dispose) => { unlisten = dispose; }).catch((error: unknown) => {
      console.error("Could not listen for updates from other windows:", error);
    });
    void listen("shelve:records-updated", () => {
    window.dispatchEvent(new Event("shelve:cloud-refresh"));
    }).then((dispose) => { unlistenRecords = dispose; }).catch((error: unknown) => {
    console.error("Could not listen for record updates from other windows:", error);
    });
    return () => {
    unlisten?.();
    unlistenRecords?.();
    };
  }, [windowKind]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const editing = target instanceof HTMLElement &&
        (target.isContentEditable || target.matches("input, textarea, select"));

      if (matchesShortcut(event, "switchLanguage")) {
        event.preventDefault();
        cycleLanguage();
        return;
      }

      if (matchesShortcut(event, "toggleDoNotDisturb") && !windowKind && !editing) {
        event.preventDefault();
        window.dispatchEvent(new Event("shelve:toggle-do-not-disturb"));
        return;
      }

      if (matchesShortcut(event, "openStudio")) {
        event.preventDefault();
        if (windowKind === "studio") closeAuxiliaryWindow();
        else if (!windowKind) void toggleStudioFromShortcut();
        return;
      }
      if (matchesShortcut(event, "openPlanner") && windowKind === "planner") {
        event.preventDefault();
        closeAuxiliaryWindow();
        return;
      }
      if (matchesShortcut(event, "addBook") && (windowKind === "upload-book" || windowKind === "new-project")) {
        event.preventDefault();
        closeAuxiliaryWindow();
        return;
      }
      if (editing && !matchesShortcut(event, "quit") &&
        !matchesShortcut(event, "toggleMaximize") &&
        !matchesShortcut(event, "cycleColorTheme")) return;
      if (view === "writings" && matchesShortcut(event, "focusSearch")) return;

      if (matchesShortcut(event, "cycleColorTheme")) {
        event.preventDefault();
        setTheme(theme === "light" ? "dark" : "light");
        return;
      }

      if (matchesShortcut(event, "openPlanner")) {
        event.preventDefault();
        if (!windowKind) void togglePlannerFromShortcut();
        return;
      }
      if (matchesShortcut(event, "addBook")) {
        if (!windowKind) {
          event.preventDefault();
          void toggleUploadFromShortcut();
          return;
        }
      }
      if (windowKind) return;

      if (matchesShortcut(event, "focusSearch")) {
        event.preventDefault();
        window.dispatchEvent(new Event("shelve:focus-search"));
      } else if (matchesShortcut(event, "saveScreenshot") && !window.getSelection()?.toString()) {
        event.preventDefault();
        void saveScreenshot();
      } else if (matchesShortcut(event, "toggleReaderFocus") && view === "reader") {
        event.preventDefault();
        setFocusMode((value) => !value);
      } else if (matchesShortcut(event, "toggleMenu")) {
        event.preventDefault();
        setCollapsed((value) => !value);
      } else if (matchesShortcut(event, "toggleMaximize") && isTauri()) {
        event.preventDefault();
        void getCurrentWindow().toggleMaximize().catch((error: unknown) => console.error("Could not toggle maximization:", error));
      } else if (matchesShortcut(event, "reload")) {
        event.preventDefault();
        window.location.reload();
      } else if (matchesShortcut(event, "quit") && isTauri()) {
        event.preventDefault();
        void getCurrentWindow().close().catch((error: unknown) => console.error("Could not quit Shelve:", error));
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [view, windowKind, theme, setTheme, cycleLanguage]);

  const updateBook = (updated: Book) => {
    const normalized = { ...updated, updatedAt: new Date().toISOString() };
    setBooks((current) => current.map((book) => book.id === updated.id ? normalized : book));
  };

  const changeStatus = (book: Book, status: BookStatus) => {
    updateBook({
      ...book,
      status,
      ...(status === "reading" ? { startedAt: book.startedAt ?? new Date().toISOString() } : {}),
      ...(status === "archived" ? { currentPage: book.totalPages || book.currentPage, finishedAt: new Date().toISOString() } : {}),
    });
  };

  const openBook = (book: Book) => {
    setSelectedBookId(book.id);
    setView("details", book.id);
  };

  const startReading = (book: Book) => {
    if (book.status === "unread") changeStatus(book, "reading");
    setSelectedBookId(book.id);
    setView("reader", book.id);
  };

  const addBook = async (book: Book, file?: File, cover?: File) => {
    const savedKeys: string[] = [];
    try {
      let storedBook = book;
      if (storageMode === "cloud") {
        storedBook = await uploadBookAssets(book, authSession?.token ?? "", file, cover);
      } else {
        if (file && book.fileKey) {
          await saveFile(book.fileKey, file);
          savedKeys.push(book.fileKey);
        }
        if (cover && book.coverImage.startsWith("asset:")) {
          const key = book.coverImage.slice("asset:".length);
          await saveCoverFile(key, cover);
          savedKeys.push(key);
        }
      }
      const newBook = { ...storedBook, updatedAt: new Date().toISOString() };
      const nextBooks = [newBook, ...await loadBooks()];
      await saveBooks(nextBooks);
      setBooks(nextBooks);
    } catch (error) {
      await Promise.all(savedKeys.map((key) => removeFile(key).catch((removeError: unknown) => {
        console.error("Could not clean up an incomplete book upload:", removeError);
      })));
      throw error;
    }
  };

  const deleteBook = async () => {
    if (!selectedBook) return;
    if (!await confirm({
      title: `${t("Remove book")}: ${selectedBook.title}`,
      message: t("This action cannot be undone."),
      confirmLabel: t("Remove"),
    })) return;
    try {
      await deleteBookRecord(selectedBook.id);
      if (storageMode === "offline") {
        const toRemove = [selectedBook.fileKey, selectedBook.coverImage.startsWith("asset:") ? selectedBook.coverImage.slice("asset:".length) : undefined].filter((key): key is string => Boolean(key));
        await Promise.all(toRemove.map((key) => removeFile(key)));
      }
    } catch (error) {
      console.error("Could not delete the book:", error);
      showAppMessage(error instanceof Error ? error.message : "The book could not be deleted.", true);
      return;
    }
    setBooks((current) => current.filter((book) => book.id !== selectedBook.id));
    setSelectedBookId(null);
    setView("library");
  };

  const addSuggestedBook = async (book: Book, file?: File, cover?: File) => {
    if (books.some((item) => item.title === book.title)) return;
    try {
      await addBook({ ...book, updatedAt: new Date().toISOString() }, file, cover);
    } catch (error) {
      console.error("Could not add a public book to the library:", error);
      showAppMessage(error instanceof Error ? error.message : "Could not add that book to your library.", true);
    }
  };

  const exportLibrary = async () => {
    try {
      const data = await exportBackup(writing);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `shelve-library-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      showAppMessage("Library backup exported.");
    } catch (error) {
      console.error("Could not export the library:", error);
      showAppMessage(error instanceof Error ? error.message : "Could not export the library.", true);
    }
  };

  const importLibrary = async (file: File) => {
    const contents = await file.text();
    await importBackup(contents);
    setBooks(await loadBooks());
    setWriting(await loadText(storageKeys.writing, ""));
    showAppMessage("Library backup merged successfully.");
  };

  const saveWriting = (value: string) => {
    setWriting(value);
    void saveText(storageKeys.writing, value).catch((error: unknown) => {
      console.error("Could not save your writing:", error);
      showAppMessage(error instanceof Error ? error.message : "Could not save your writing.", true);
    });
  };

  const confirmUnsyncedWork = async (action: string): Promise<boolean> => {
    if (!isTauri()) return true;
    const status = await getSyncHealth();
    const unsynced = status.pending + status.failed + status.conflict;
    if (unsynced === 0) return true;
    return confirm({
      title: t("Unsynced changes"),
      message: `${unsynced} ${t(`changes have not synced. ${action} now leaves them on this device for later sync. Continue?`)}`,
      confirmLabel: t("Continue anyway"),
    });
  };

  const changeStorageMode = async (
    mode: StorageMode,
    source?: "local" | "cloud",
    password?: string,
  ) => {
    if (mode === "offline" && !isTauri()) {
      showAppMessage("Offline mode is available only in the Shelve desktop app.", true);
      return;
    }
    if (mode === storageMode) return;
    if (!authSession) {
      setAuthReturnView("settings");
      setView("signin");
      return;
    }
    if (!source) throw new Error("Choose whether to keep the local or cloud library.");
    if (!password) throw new Error("Enter your password to confirm the storage replacement.");

    await syncEngine.stopAndWait();
    try {
      if (source === "local") {
        await syncOfflineDataToCloud(authSession.token, true, password);
      } else {
        if (!isTauri()) throw new Error("Replacing local data requires the Shelve desktop app.");
        await verifyAccountPasswordOnline(authSession.token, password);
        await clearLocalData("library");
        await syncOfflineDataToCloud(authSession.token, true);
      }
      await saveStorageMode(mode);
      configureStorage(mode, mode === "cloud" ? authSession.token : null);
      setStorageMode(mode);
      setBooks(await loadBooks());
      setWriting(await loadText(storageKeys.writing, ""));
      showAppMessage(source === "local" ? "Cloud data was replaced with this device's library." : "This device now has the cloud library.");
    } catch (error) {
      if (storageMode === "cloud" && isTauri()) {
        syncEngine.start(authSession.token, (token) => syncOfflineDataToCloud(token, true));
      }
      throw error;
    }
  };

  const deleteLocalData = async (scope: LocalDataResetScope) => {
    const fullReset = scope === "all";
    const confirmed = await confirm({
      title: t(fullReset ? "Reset all local data?" : "Delete local library data?"),
      message: t(fullReset
        ? "This permanently deletes all Shelve data and sign-in stored on this device. Your cloud account data is not deleted."
        : "This permanently deletes this device's library, local files, and pending sync changes. Your cloud account data is not deleted."),
      confirmLabel: t("Permanently delete"),
    });
    if (!confirmed) return;
    try {
      await syncEngine.stopAndWait();
      await clearLocalData(scope);
      setBooks([]);
      setWriting("");
      setSelectedBookId(null);
      if (fullReset) {
        setAuthSession(null);
        setProfileAvatar(null);
        window.location.assign(routeForView("onboarding"));
        return;
      }
      setView("library", null);
      if (storageMode === "cloud" && authSession?.token) {
        syncEngine.start(authSession.token, (token) => syncOfflineDataToCloud(token, true));
      }
      showAppMessage("Local library data was permanently deleted.");
    } catch (error) {
      if (storageMode === "cloud" && authSession?.token) {
        syncEngine.start(authSession.token, (token) => syncOfflineDataToCloud(token, true));
      }
      console.error("Could not delete local Shelve data:", error);
      throw error;
    }
  };

  const completeSignIn = async (session: AuthSession) => {
    await saveAuthSession(session);
    if (authReturnView === "settings" && storageMode === "offline" && isTauri()) {
      setAuthSession(session);
      setAuthWarning("");
      setView("settings");
      showAppMessage("Signed in. Choose which library to keep in Storage and sync settings.");
      return;
    }
    await saveStorageMode("cloud");
    configureStorage("cloud", session.token);
    setAuthSession(session);
    setStorageMode("cloud");
    setBooks([]);
    setWriting("");
    setAuthWarning("");
    setView(authReturnView === "onboarding" ? "overview" : authReturnView);
    try {
      await syncOfflineDataToCloud(session.token, true);
      setBooks(await loadBooks());
      setWriting(await loadText(storageKeys.writing, ""));
      showAppMessage("Your library is synced.");
    } catch (error) {
      console.error("Cloud sync failed after sign-in:", error);
      showAppMessage(error instanceof Error ? `Signed in, but sync failed: ${error.message}` : "Signed in, but cloud sync failed.", true);
      try {
        setBooks(await loadBooks());
        setWriting(await loadText(storageKeys.writing, ""));
      } catch (loadError) {
        console.error("Could not load the online library after sign-in:", loadError);
        showAppMessage(loadError instanceof Error ? `Could not load your online library: ${loadError.message}` : "Could not load your online library.", true);
      }
    }
  };

  const handleSignIn = async (email: string, password: string, rememberMe: boolean) =>
    completeSignIn(await signInOnline(email, password, rememberMe));
  const handleSignUp = (name: string, email: string, password: string) => signUpOnline(name, email, password);

  const updateAccountProfile = async (
    profile: { name: string; age: number | null; gender: string; country: string },
    password: string,
  ) => {
    if (!authSession) throw new Error("Sign in before updating your profile.");
    const user = await updateProfileOnline(authSession.token, password, profile);
    const updatedSession = { ...authSession, user };
    await saveAuthSession(updatedSession);
    setAuthSession(updatedSession);
  };

  const updateSessionPreference = async (rememberMe: boolean, password: string) => {
    if (!authSession) throw new Error("Sign in before updating your session.");
    const updatedSession = await updateSessionPreferenceOnline(authSession.token, password, rememberMe);
    await saveAuthSession(updatedSession);
    if (storageMode === "cloud") configureStorage("cloud", updatedSession.token);
    setAuthSession(updatedSession);
    setAuthWarning("");
    showAppMessage(rememberMe
      ? "This session will now remain active for 30 days."
      : "This session will now expire after 24 hours.");
  };

  const deleteCloudAccount = async (password: string) => {
    if (!authSession) throw new Error("Sign in before deleting your account.");
    await syncEngine.stopAndWait();
    try {
      await deleteAccountOnline(authSession.token, password);
    } catch (error) {
      if (storageMode === "cloud" && isTauri()) {
        syncEngine.start(authSession.token, (token) => syncOfflineDataToCloud(token, true));
      }
      throw error;
    }
    if (isTauri()) {
      await clearLocalData("all");
    } else {
      await clearAuthSession();
      localStorage.clear();
    }
    setAuthSession(null);
    setBooks([]);
    setWriting("");
    setProfileAvatar(null);
    window.location.assign(routeForView("onboarding"));
  };

  const handleSignOut = async () => {
    if (!(await confirmUnsyncedWork(t("Signing out")))) return;
    if (authSession && isTauri()) {
      try {
        await syncOfflineDataToCloud(authSession.token, true);
      } catch (error) {
        console.error("Could not refresh the offline database before sign-out:", error);
        showAppMessage(error instanceof Error ? `Could not refresh the offline copy before sign-out: ${error.message}` : "Could not refresh the offline copy before sign-out.", true);
      }
    }
    await signOutOnline();
    const nextMode = isTauri() ? "offline" : "cloud";
    await saveStorageMode(nextMode);
    configureStorage(nextMode, null);
    setStorageMode(nextMode);
    setAuthSession(null);
    if (isTauri()) {
      setBooks(await loadBooks());
      setWriting(await loadText(storageKeys.writing, ""));
    } else {
      setBooks([]);
      setWriting("");
    }
    setAuthReturnView("profile");
    setView("profile");
    showAppMessage("You are signed out. Your local library is still available.");
  };

  const saveEditedBook = async (book: Book, cover?: File) => {
    const previousBook = books.find((current) => current.id === book.id);
    const previousCoverKey = previousBook?.coverImage.startsWith("asset:")
      ? previousBook.coverImage.slice("asset:".length)
      : undefined;
    const updated = { ...book, updatedAt: new Date().toISOString() };
    let savedCoverKey: string | undefined;

    if (cover) {
      const coverKey = updated.coverImage.startsWith("asset:")
        ? updated.coverImage.slice("asset:".length)
        : "";
      if (!coverKey) throw new Error("The new cover image is missing its local identifier.");
      if (storageMode === "cloud") {
        if (!authSession?.token) throw new Error("Sign in before uploading a cover image.");
        updated.remoteCoverFileName = await uploadApiFile(authSession.token, "covers", cover, coverKey);
        if (isTauri()) await cacheCoverFile(coverKey, cover);
      } else {
        await saveCoverFile(coverKey, cover);
        savedCoverKey = coverKey;
      }
    }

    const nextBooks = books.map((current) => current.id === updated.id ? updated : current);
    try {
      await saveBooks(nextBooks);
    } catch (error) {
      if (savedCoverKey) {
        await removeFile(savedCoverKey).catch((removeError: unknown) => {
          console.error("Could not clean up an incomplete cover update:", removeError);
        });
      }
      throw error;
    }
    setBooks(nextBooks);

    const nextCoverKey = updated.coverImage.startsWith("asset:")
      ? updated.coverImage.slice("asset:".length)
      : undefined;
    if (storageMode === "offline" && previousCoverKey && previousCoverKey !== nextCoverKey) {
      await removeFile(previousCoverKey).catch((error: unknown) => {
        console.error("Could not remove the previous book cover:", error);
        showAppMessage("The book was saved, but its previous cover file could not be removed.", true);
      });
    }
    if (windowKind) closeAuxiliaryWindow();
    else setView("details");
  };

  const openEditor = async (book: Book) => {
    setSelectedBookId(book.id);
    try {
      if (!(await openAuxiliaryWindow("edit-book", book.id))) setView("edit-book");
    } catch (error) {
      showAppMessage(error instanceof Error ? error.message : "Could not open the editor window.", true);
      setView("edit-book");
    }
  };

  const activeNavigation: AppView = view === "reader"
    ? "reading"
    : view === "details" || view === "edit-book"
      ? "library"
      : view;

  const titleBarProps = {
    search,
    onSearch: setSearch,
    onPlan: () => void openPlanner(),
    theme,
    onThemeChange: setTheme,
    onOpenBook: openBook,
    books,
  };

  if (!initialized) {
    return <main className="splash-screen"><img src="/icon.png" alt="Shelve" /><p>{t("Just a sec ...")}</p></main>;
  }

  if (startupError) {
    return (
      <main className="startup-error-screen">
        <img src="/icon.png" alt="" />
        <h1>{t("Shelve couldn't start")}</h1>
        <ErrorAlert className="startup-error-message" message={startupError} />
        <button className="button button-primary" onClick={() => window.location.reload()}>{t("Retry")}</button>
      </main>
    );
  }

  if (windowKind) {
    const windowTitle = windowKind === "studio"
      ? "Shelve Studio"
      : windowKind === "planner"
        ? `Shelve / ${t("Schedule")}`
        : windowKind === "edit-book"
          ? `Shelve / ${t("Edit Book")}`
          : windowKind === "new-project"
            ? `Shelve / ${t("New Project")}`
            : `Shelve / ${t("Upload Book")}`;
    return (
      <div className="app-window-layout auxiliary-window">
        <TitleBar
          {...titleBarProps}
          windowTitle={windowTitle}
          studioToolbar={windowKind === "studio" ? studioTitlebar : null}
          studioActions={windowKind === "studio" ? studioTitlebarCallbacks : undefined}
        />
        {confirmationDialog}
        <main className={`auxiliary-main ${windowKind === "upload-book" ? "auxiliary-main-upload-book" : ""} ${windowKind === "edit-book" ? "auxiliary-main-edit-book" : ""} ${windowKind === "studio" ? "auxiliary-main-studio" : ""} ${windowKind === "new-project" ? "auxiliary-main-new-project" : ""}`}>
          {windowKind === "planner" && <ReadingPlannerPage books={books} />}
          {windowKind === "upload-book" && <UploadBookPage onSave={addBook} onCancel={closeAuxiliaryWindow} />}
          {windowKind === "edit-book" && (selectedBook
            ? <EditBookPage book={selectedBook} onSave={saveEditedBook} onCancel={closeAuxiliaryWindow} />
            : <ErrorAlert className="auxiliary-error" message="This book is not available in your local library." />)}
          {windowKind === "studio" && <Routes>
            <Route path="/writings" element={<WritePage value={writing} onChange={saveWriting} token={authSession?.token} userId={authSession?.user.id} authorName={authSession?.user.name || authSession?.user.email} storageMode={storageMode} onAddBook={addSuggestedBook} onBeforeWorkspaceChange={() => confirmUnsyncedWork(t("Switching workspaces"))} onStudioToolbarChange={updateStudioTitlebar} />} />
            <Route path="/writings/cover" element={<WritingCoverPage />} />
            <Route path="/writings/goals" element={<WritingGoalsPage />} />
            <Route path="/writings/analytics" element={<WritingAnalyticsPage />} />
            <Route path="*" element={<Navigate to="/writings" replace />} />
          </Routes>}
          {windowKind === "new-project" && <NewProjectWindow userId={authSession?.user.id || "local"} t={t} />}
          {!["planner", "edit-book", "upload-book", "studio", "new-project"].includes(windowKind) && <ErrorAlert className="auxiliary-error" message="This Shelve window is not recognized." />}
        </main>
        <WindowResizeHandles />
      </div>
    );
  }

  if (view === "onboarding" || view === "signin" || view === "signup" || view === "reset-password") {
    const chooseOffline = async () => {
      try {
        await saveStorageMode("offline");
        configureStorage("offline", null);
        setStorageMode("offline");
        setView("overview");
      } catch (error) {
        showAppMessage(error instanceof Error ? error.message : "Could not save your storage choice.", true);
      }
    };
    const chooseCloud = async () => {
      try {
        await saveStorageMode("cloud");
        configureStorage("cloud", null);
        setStorageMode("cloud");
        setAuthReturnView("onboarding");
        setView("signin");
      } catch (error) {
        showAppMessage(error instanceof Error ? error.message : "Could not save your storage choice.", true);
      }
    };
    return (
      <div className="app-window-layout app-auth-layout">
        <TitleBar {...titleBarProps} windowTitle="Shelve" />
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage onChooseOffline={() => void chooseOffline()} onChooseCloud={() => void chooseCloud()} />} />
          <Route path="/signin" element={<SignInPage onSignIn={handleSignIn} onResendVerification={resendVerificationEmail} onSignUp={() => setView("signup")} onBack={() => setView(authReturnView)} />} />
          <Route path="/signup" element={<SignUpPage onSignUp={handleSignUp} onSignIn={() => setView("signin")} onBack={() => setView("signin")} />} />
          <Route path="/verify-email" element={<VerifyEmailPage onSignIn={() => setView("signin")} />} />
          <Route path="/reset-password" element={<ResetPasswordPage onSignIn={() => setView("signin")} />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
        {authWarning
          ? <ErrorAlert className="auth-page-message" message={authWarning} />
          : appMessage && (appMessageError
            ? <ErrorAlert className="auth-page-message" message={appMessage} />
            : <p className="auth-page-message" role="status">{t(appMessage)}</p>)}
        <WindowResizeHandles />
      </div>
    );
  }

  return (
    <div className="app-window-layout">
      <TitleBar
        {...titleBarProps}
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenuToggle={() => setMobileMenuOpen((open) => !open)}
      />
      {confirmationDialog}
      <Sidebar
        activeView={activeNavigation}
        books={books}
        collapsed={collapsed}
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        profileAvatar={profileAvatar}
        userName={authSession?.user.name || authSession?.user.email}
        userEmail={authSession?.user.email}
        onNavigate={(nextView) => {
          setMobileMenuOpen(false);
          if (nextView === "upload") {
            void openUpload();
          } else if (nextView === "planner") {
            void openPlanner();
          } else {
            setSelectedBookId(null);
            setView(nextView);
          }
        }}
        onOpenStudio={() => void openStudio()}
      />
      <main className={`main-content ${view === "reader" ? "main-content-reader" : ""} ${collapsed ? "main-content-collapsed" : ""} ${focusMode && view === "reader" ? "reader-focus-mode" : ""}`}>
        {view !== "reader" && <div className="main-toolbar">
          <div className="breadcrumb"><span>{t("YOUR SPACE")}</span><i>/</i><strong>{view === "details" ? selectedBook?.title ?? t("Book details") : t(({ overview: "Overview", library: "My library", reading: "Reading", archive: "Finished books", analytics: "Analytics", writings: "My writings", "public-library": "Public Library", recommendations: "Recommendations", ask: "Ask about a book", upload: "Upload book", settings: "Settings", profile: "Profile", notifications: "Notifications", feedback: "Insights & bug reports", planner: "Reading plan", reader: "Reading", "edit-book": "Edit book", onboarding: "Welcome to Shelve", signin: "Sign in", signup: "Sign up", details: "Book details" } as Partial<Record<AppView, string>>)[view] ?? view)}</strong></div>
          <div className="main-toolbar-actions">
           
            <button className="button button-primary toolbar-add" onClick={() => void openUpload()}><Plus size={15} /> {t("Add book")}</button>
            <AccountMenu
              user={authSession?.user ?? null}
              avatar={profileAvatar}
              onManageProfile={() => setView("profile")}
              onSignIn={() => { setAuthReturnView("profile"); setView("signin"); }}
              onSignOut={handleSignOut}
            />
           <NotificationCenter appMessage={appMessage} authWarning={authWarning} token={authSession?.token} onViewAll={() => setView("notifications")} />
        </div>
        </div>}
        {appMessage && (appMessageError
          ? <ErrorAlert className="app-message" message={appMessage} onDismiss={() => showAppMessage("")} />
          : <div className={`app-toast ${appMessage === "Your library is synced." ? "app-toast-sync" : ""}`} role="status">
            <CheckCircle2 size={19} aria-hidden="true" />
            <div className="app-toast-copy">
              <strong>{appMessage === "Your library is synced." ? t("Your library is synced") : t("Done")}</strong>
              <span>{appMessage === "Your library is synced." ? t("Your latest changes are safely in the cloud.") : t(appMessage)}</span>
            </div>
            <button type="button" onClick={() => showAppMessage("")} aria-label={t("Dismiss message")}><X size={15} /></button>
          </div>)}
        {authWarning && <ErrorAlert className="app-message" message={authWarning} onDismiss={() => setAuthWarning("")} />}
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage books={books} search={search} userName={authSession?.user.name?.trim() || authSession?.user.email?.split("@")[0]} onNavigate={setView} onOpenBook={openBook} onStartBook={startReading} onFinishBook={(book) => changeStatus(book, "archived")} onUpdateBook={updateBook} onAddBook={() => void openUpload()} />} />
          <Route path="/library" element={<LibraryPage books={books} search={search} onNavigate={setView} onOpenBook={openBook} onStartBook={startReading} onFinishBook={(book) => changeStatus(book, "archived")} onUpdateBook={updateBook} onAddBook={() => void openUpload()} />} />
          <Route path="/reading" element={<ReadingPage books={books} search={search} onNavigate={setView} onOpenBook={startReading} onViewDetails={openBook} onStartBook={startReading} onFinishBook={(book) => changeStatus(book, "archived")} onUpdateBook={updateBook} onAddBook={() => void openUpload()} />} />
          <Route path="/archive" element={<ArchivePage books={books} onOpenBook={openBook} onReadBook={startReading} onUpdateBook={updateBook} onNavigate={setView} />} />
          <Route path="/analytics" element={<AnalyticsPage books={books} />} />
          <Route path="/writings" element={<WritePage value={writing} onChange={saveWriting} token={authSession?.token} userId={authSession?.user.id} authorName={authSession?.user.name || authSession?.user.email} storageMode={storageMode} onAddBook={addSuggestedBook} onBeforeWorkspaceChange={() => confirmUnsyncedWork(t("Switching workspaces"))} />} />
          <Route path="/writings/goals" element={<WritingGoalsPage />} />
          <Route path="/writings/cover" element={<WritingCoverPage />} />
          <Route path="/writings/analytics" element={<WritingAnalyticsPage />} />
          <Route path="/public-library" element={<PublicLibraryPage books={books} onAdd={(book, file, cover) => addBook({ ...book, updatedAt: new Date().toISOString() }, file, cover)} />} />
          <Route path="/recommendations" element={<RecommendationsPage onBrowse={() => setView("public-library")} />} />
          <Route path="/ask" element={<AiPage />} />
          <Route path="/settings" element={<SettingsPage theme={theme} onThemeChange={setTheme} onExport={() => void exportLibrary()} storageMode={storageMode} onStorageModeChange={changeStorageMode} onDeleteLocalData={deleteLocalData} onDeleteAccount={deleteCloudAccount} userName={authSession?.user.name || authSession?.user.email} emailNotificationToken={authSession?.token} syncMessage={appMessageError || authWarning ? "" : appMessage} onSignIn={() => { setAuthReturnView("settings"); setView("signin"); }} onProfile={() => setView("profile")} onImport={importLibrary} />} />
          <Route path="/profile" element={<ProfilePage user={authSession?.user ?? null} token={authSession?.token ?? null} avatar={profileAvatar} sessionExpiresAt={authSession?.expiresAt} rememberMe={authSession?.rememberMe === true} storageMode={storageMode} onAvatarChange={updateProfileAvatar} onProfileChange={updateAccountProfile} onSessionPreferenceChange={updateSessionPreference} onSignIn={() => { setAuthReturnView("profile"); setView("signin"); }} onSignOut={handleSignOut} />} />
          <Route path="/notifications" element={<NotificationsPage token={authSession?.token ?? null} onSignIn={() => { setAuthReturnView("notifications"); setView("signin"); }} />} />
          <Route path="/feedback" element={<FeedbackPage token={authSession?.token ?? null} onSignIn={() => { setAuthReturnView("feedback"); setView("signin"); }} />} />
          <Route path="/planner" element={<ReadingPlannerPage books={books} />} />
          <Route path="/upload" element={<UploadBookPage onSave={addBook} onCancel={() => setView("library")} />} />
          <Route path="/books/:bookId/edit" element={selectedBook ? <EditBookPage book={selectedBook} onSave={saveEditedBook} onCancel={() => setView("details")} /> : <Navigate to="/library" replace />} />
          <Route path="/books/:bookId/reader" element={selectedBook ? <ReaderPage book={selectedBook} books={books} authToken={authSession?.token} onOpenBook={startReading} onUpdate={updateBook} /> : <Navigate to="/library" replace />} />
          <Route path="/books/:bookId" element={selectedBook ? <BookDetailsPage book={selectedBook} onBack={() => setView("library")} onRead={() => setView("reader")} onEdit={() => void openEditor(selectedBook)} onUpdate={updateBook} onDelete={deleteBook} /> : <Navigate to="/library" replace />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>
      {showAddBook && <AddBookDialog onClose={() => setShowAddBook(false)} onSave={addBook} />}
      <WindowResizeHandles />
    </div>
  );
}

export default App;
