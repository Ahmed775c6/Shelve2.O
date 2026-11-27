import { useCallback, useEffect, useState } from "react";
import { Bell, Check, Clock3, Inbox, LoaderCircle, Trash2, X } from "lucide-react";
import { apiRequest } from "../lib/api";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import { SectionTitle } from "./shared";

type UserNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

const PAGE_SIZE = 100;

export default function NotificationsPage({ token, onSignIn }: { token: string | null; onSignIn: () => void }) {
  const { locale, t } = useLanguage();
  const [items, setItems] = useState<UserNotification[]>([]);
  const [selected, setSelected] = useState<UserNotification | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    if (!token) return;
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const payload = await apiRequest(`/api/notifications?limit=${PAGE_SIZE}&offset=${offset}`, {}, token);
      if (!Array.isArray(payload) || !payload.every((item) =>
        typeof item === "object" && item !== null &&
        "id" in item && typeof item.id === "string" &&
        "title" in item && typeof item.title === "string" &&
        "body" in item && typeof item.body === "string" &&
        "createdAt" in item && typeof item.createdAt === "string",
      )) throw new Error(t("The Shelve server returned invalid notifications."));
      const page = payload as UserNotification[];
      setItems((current) => append
        ? [...current.filter((item) => !page.some((entry) => entry.id === item.id)), ...page]
        : page);
      setNextOffset(offset + page.length);
      setHasMore(page.length === PAGE_SIZE);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("Could not load notifications."));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, t]);

  useEffect(() => {
    setItems([]);
    setNextOffset(0);
    setHasMore(false);
    if (token) void loadPage(0, false);
  }, [loadPage, token]);

  const openNotification = async (item: UserNotification) => {
    setSelected(item);
    if (item.readAt || !token) return;
    try {
      await apiRequest(`/api/notifications/${encodeURIComponent(item.id)}/read`, { method: "POST" }, token);
      const readAt = new Date().toISOString();
      const updated = { ...item, readAt };
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      setSelected(updated);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : t("Could not mark notification as read."));
    }
  };

  const deleteNotification = async (item: UserNotification) => {
    if (!token || deletingId) return;
    setDeletingId(item.id);
    setError("");
    try {
      await apiRequest(`/api/notifications/${encodeURIComponent(item.id)}`, { method: "DELETE" }, token);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelected((current) => current?.id === item.id ? null : current);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("Could not delete notification."));
    } finally {
      setDeletingId("");
    }
  };

  const deleteAllNotifications = async () => {
    if (!token || deletingId) return;
    setDeletingId("all");
    setError("");
    try {
      await apiRequest("/api/notifications", { method: "DELETE" }, token);
      setItems([]);
      setSelected(null);
      setHasMore(false);
      setNextOffset(0);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("Could not delete notifications."));
    } finally {
      setDeletingId("");
    }
  };

  return <div className="page-shell notification-archive-page">
    <SectionTitle eyebrow={t("YOUR ACCOUNT")} title={t("Notifications")} detail={t("Your account updates and messages from Shelve.")} />
    {!token ? <section className="notification-archive-empty">
      <Inbox size={24} /><h2>{t("Sign in to view your notifications")}</h2>
      <button className="button button-primary" type="button" onClick={onSignIn}>{t("Sign in")}</button>
    </section> : <>
      {error && <ErrorAlert className="settings-message" message={error} onDismiss={() => setError("")} />}
      {items.length > 0 && <div className="notification-archive-actions">
        <span>{t("Notification history")}</span>
        <button type="button" className="button button-outline" disabled={Boolean(deletingId)} onClick={() => void deleteAllNotifications()}><Trash2 size={13} />{deletingId === "all" ? t("Deleting…") : t("Delete all")}</button>
      </div>}
      {loading ? <div className="notification-archive-loading"><LoaderCircle size={18} className="spin" />{t("Loading notifications…")}</div>
        : items.length === 0 ? <section className="notification-archive-empty">
          <Inbox size={24} /><h2>{t("You're all caught up.")}</h2><p>{t("New account notifications will appear here.")}</p>
        </section> : <div className="notification-archive-list" aria-live="polite">
          {items.map((item) => <article className={`notification-archive-item ${item.readAt ? "read" : "unread"}`} key={item.id}>
            <button type="button" className="notification-archive-open" onClick={() => void openNotification(item)}>
              <span className="notification-archive-icon"><Bell size={17} /></span>
              <span className="notification-archive-copy">
                <strong>{item.title}</strong><span>{item.body}</span>
                <small><Clock3 size={12} />{new Date(item.createdAt).toLocaleString(locale)}</small>
              </span>
              {!item.readAt && <span className="notification-unread-dot" aria-label={t("Unread")} />}
            </button>
            <button type="button" className="notification-archive-delete" aria-label={`${t("Delete notification")} ${item.title}`} disabled={Boolean(deletingId)} onClick={() => void deleteNotification(item)}><Trash2 size={15} /></button>
          </article>)}
        </div>}
      {hasMore && <div className="notification-load-more">
        <button type="button" className="button button-outline" disabled={loadingMore} onClick={() => void loadPage(nextOffset, true)}>
          {loadingMore ? <><LoaderCircle size={14} className="spin" />{t("Loading…")}</> : t("Load older notifications")}
        </button>
      </div>}
    </>}
    {selected && <div className="dialog-backdrop notification-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setSelected(null);
    }}>
      <section className="dialog notification-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="notification-detail-title">
        <header><span className="notification-detail-icon"><Bell size={18} /></span><button type="button" className="icon-button" aria-label={t("Close")} onClick={() => setSelected(null)}><X size={17} /></button></header>
        <p className="eyebrow">{t("ACCOUNT NOTIFICATION")}</p>
        <h2 id="notification-detail-title">{selected.title}</h2>
        <p className="notification-detail-body">{selected.body}</p>
        <footer><time dateTime={selected.createdAt}>{new Date(selected.createdAt).toLocaleString(locale)}</time>
          <div className="notification-detail-actions">
            {selected.readAt && <span><Check size={13} />{t("Read")}</span>}
            <button type="button" className="button button-outline" disabled={Boolean(deletingId)} onClick={() => void deleteNotification(selected)}><Trash2 size={13} />{t("Delete")}</button>
          </div>
        </footer>
      </section>
    </div>}
  </div>;
}
