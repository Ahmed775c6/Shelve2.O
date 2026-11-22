import { useEffect } from "react";
import {
  Archive, BarChart3, BookOpen, CalendarDays,
  Compass, Globe, LayoutDashboard, Library, MessageSquare, PenLine, Settings,
  Sparkles, UploadCloud, UserRound,
} from "lucide-react";
import type { AppView, Book } from "../types";
import { shortcutDisplay } from "../lib/keyboard-shortcuts";
import { useLanguage } from "./language-provider";

interface SidebarProps {
  activeView: AppView;
  books: Book[];
  collapsed: boolean;
  userName?: string;
  userEmail?: string;
  profileAvatar?: string | null;
  mobileOpen: boolean;
  onClose: () => void;
  onNavigate: (view: AppView) => void;
  onOpenStudio: () => void;
}

const links: { label: string; view: AppView; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", view: "overview", icon: LayoutDashboard },
  { label: "My library", view: "library", icon: Library },
  { label: "Public Library", view: "public-library", icon: Globe },
  { label: "Reading now", view: "reading", icon: BookOpen },
  { label: "Archived", view: "archive", icon: Archive },
  { label: "Analytics", view: "analytics", icon: BarChart3 },
  { label: "Upload book", view: "upload", icon: UploadCloud },
  { label: "Discover", view: "recommendations", icon: Compass },
  { label: "Ask about a book", view: "ask", icon: MessageSquare },
];

const mobileLinks: { label: string; view: AppView; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", view: "overview", icon: LayoutDashboard },
  { label: "Library", view: "library", icon: Library },
  { label: "Reading", view: "reading", icon: BookOpen },
  { label: "Profile", view: "profile", icon: UserRound },
];

export default function Sidebar({ activeView, books, collapsed, mobileOpen, onClose, profileAvatar, userName, userEmail, onNavigate, onOpenStudio }: SidebarProps) {
  const { t } = useLanguage();
  const studioShortcut = shortcutDisplay("openStudio");
  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen, onClose]);

  const counts: Partial<Record<AppView, number>> = {
    library: books.length,
    reading: books.filter((book) => book.status === "reading").length,
    archive: books.filter((book) => book.status === "archived").length,
  };
  const isCollapsed = collapsed && !mobileOpen;

  return (
    <>
    {mobileOpen && <button type="button" className="sidebar-backdrop" aria-label={t("Close navigation menu")} onClick={onClose} />}
    <aside id="primary-navigation" className={`sidebar ${isCollapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-brand">
        <img src="/icon.png" alt="" />
        {!isCollapsed && <div><strong>Shelve</strong><span>{t("Personal Library")}</span></div>}
     
      </div>
      <div className="sidebar-label">{!isCollapsed && t("YOUR LIBRARY")}</div>
      <nav className="sidebar-nav" aria-label={t("Main navigation")}>
        {links.map(({ label, view, icon: Icon }) => (
          <button key={view} className={`nav-link ${activeView === view ? "active" : ""}`} onClick={() => onNavigate(view)} title={t(label)} aria-label={t(label)}>
            <Icon size={17} />
            {!isCollapsed && <><span>{t(label)}</span>{counts[view] !== undefined && <small>{counts[view]}</small>}</>}
          </button>
        ))}
      </nav>
      <div className="sidebar-label sidebar-tools-label">{!isCollapsed && t("TOOLS")}</div>
      <nav className="sidebar-nav" aria-label={t("Tools")}>
        <button className="nav-link" onClick={onOpenStudio} title={`${t("Studio")} (${studioShortcut})`} aria-label={`${t("Open Shelve Studio")} (${studioShortcut})`}>
          <PenLine size={17} />{!isCollapsed && <><span>{t("Studio")}</span><small>{studioShortcut}</small></>}
        </button>
        <button className={`nav-link ${activeView === "planner" ? "active" : ""}`} onClick={() => onNavigate("planner")} title={t("Reading plan")} aria-label={t("Reading plan")}>
          <CalendarDays size={17} />{!isCollapsed && <span>{t("Reading plan")}</span>}
        </button>
        <button className={`nav-link ${activeView === "settings" ? "active" : ""}`} onClick={() => onNavigate("settings")} title={t("Settings")} aria-label={t("Settings")}>
          <Settings size={17} />{!isCollapsed && <span>{t("Settings")}</span>}
        </button>
      </nav>
      <button className={`sidebar-profile ${activeView === "profile" ? "active" : ""}`} onClick={() => onNavigate("profile")} title={t("Profile")} aria-label={t("Open profile settings")}>
        <div className="profile-avatar">{profileAvatar ? <img src={profileAvatar} alt="" /> : <UserRound size={17} />}</div>
        {!isCollapsed && <div className="profile-text"><strong>{userName || t("Reader")}</strong><span>{userEmail || t("Local library")}</span></div>}
      </button>
      <div className="sidebar-footer"><Sparkles size={13} />{!isCollapsed && <span>{t("Make room for a good story.")}</span>}</div>
    </aside>
    <nav className="mobile-bottom-nav" aria-label={t("Quick navigation")}>
      {mobileLinks.map(({ label, view, icon: Icon }) => (
        <button
          key={view}
          type="button"
          className={`mobile-nav-link ${activeView === view ? "active" : ""}`}
          aria-current={activeView === view ? "page" : undefined}
          onClick={() => onNavigate(view)}
        >
          {view === "profile"
            ? <span className="mobile-profile-avatar">{profileAvatar ? <img src={profileAvatar} alt="" /> : <UserRound size={18} />}</span>
            : <Icon size={18} />}
          <span>{t(label)}</span>
        </button>
      ))}
    </nav>
    </>
  );
}
