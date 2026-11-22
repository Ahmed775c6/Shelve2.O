import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Bell, BellOff, Check, Info, Trash2 } from "lucide-react";
import { loadNotificationsDoNotDisturb, saveNotificationsDoNotDisturb } from "../lib/storage";
import { useLanguage } from "./language-provider";
import { ErrorAlert } from "./error-feedback";

interface NotificationItem {
  id: string;
  message: string;
  createdAt: string;
  kind: "status" | "warning";
}

interface ReadingPlanNotification {
  id: string;
  planId: string;
  title: string;
  createdAt: string;
  lastNotifiedAt: string;
  acknowledgedAt: string | null;
}

interface NotificationCenterProps {
  appMessage: string;
  authWarning: string;
}

function formatTime(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Just now"
    : date.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function NotificationCenter({ appMessage, authWarning }: NotificationCenterProps) {
  const { locale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readingNotifications, setReadingNotifications] = useState<ReadingPlanNotification[]>([]);
  const [readingNotificationError, setReadingNotificationError] = useState("");
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const doNotDisturbRef = useRef(false);
  const previousMessages = useRef({ appMessage: "", authWarning: "" });
  const loadReadingNotifications = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const saved = await invoke<ReadingPlanNotification[]>("get_reading_plan_notifications");
      setReadingNotifications(saved);
      setReadingNotificationError("");
    } catch (error) {
      console.error("Could not load saved reading notifications:", error);
      setReadingNotificationError(error instanceof Error ? error.message : t("Could not load saved reading notifications."));
    }
  }, [t]);

  useEffect(() => {
    if (!isTauri()) return;
    void loadReadingNotifications();
    const interval = window.setInterval(() => void loadReadingNotifications(), 15_000);
    window.addEventListener("focus", loadReadingNotifications);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", loadReadingNotifications);
    };
  }, [loadReadingNotifications]);

  const notificationCount = notifications.length + readingNotifications.filter((item) => !item.acknowledgedAt).length;

  useEffect(() => {
    let active = true;
    loadNotificationsDoNotDisturb().then((enabled) => {
      if (!active) return;
      doNotDisturbRef.current = enabled;
      setDoNotDisturb(enabled);
      setPreferenceReady(true);
    }).catch((error: unknown) => {
      console.error("Could not load the Do Not Disturb setting:", error);
      if (!active) return;
      setPreferenceError(error instanceof Error ? error.message : "Could not load notification preferences.");
      setPreferenceReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!preferenceReady) return;
    const next: NotificationItem[] = [];
    if (appMessage !== previousMessages.current.appMessage) {
      previousMessages.current.appMessage = appMessage;
      if (appMessage) next.push({ id: crypto.randomUUID(), message: appMessage, createdAt: new Date().toISOString(), kind: "status" });
    }
    if (authWarning !== previousMessages.current.authWarning) {
      previousMessages.current.authWarning = authWarning;
      if (authWarning) next.push({ id: crypto.randomUUID(), message: authWarning, createdAt: new Date().toISOString(), kind: "warning" });
    }
    if (next.length > 0 && !doNotDisturbRef.current) {
      setNotifications((current) => [...next.reverse(), ...current].slice(0, 40));
    }
  }, [appMessage, authWarning, preferenceReady]);

  const toggleDoNotDisturb = async () => {
    if (!preferenceReady || preferenceSaving) return;
    const next = !doNotDisturb;
    setPreferenceError("");
    setPreferenceSaving(true);
    doNotDisturbRef.current = next;
    setDoNotDisturb(next);
    try {
      await saveNotificationsDoNotDisturb(next);
    } catch (error) {
      console.error("Could not save the Do Not Disturb setting:", error);
      doNotDisturbRef.current = !next;
      setDoNotDisturb(!next);
      setPreferenceError(error instanceof Error ? error.message : "Could not save notification preferences.");
    } finally {
      setPreferenceSaving(false);
    }
  };

  const acknowledgeReadingNotification = async (id: string) => {
    setReadingNotificationError("");
    try {
      await invoke("acknowledge_reading_plan_notification", { notificationId: id });
      await loadReadingNotifications();
    } catch (error) {
      console.error("Could not acknowledge the reading notification:", error);
      setReadingNotificationError(error instanceof Error ? error.message : t("Could not acknowledge the reading notification."));
    }
  };

  const deleteReadingNotification = async (id: string) => {
    setReadingNotificationError("");
    try {
      await invoke("delete_reading_plan_notification", { notificationId: id });
      await loadReadingNotifications();
    } catch (error) {
      console.error("Could not delete the reading notification:", error);
      setReadingNotificationError(error instanceof Error ? error.message : t("Could not delete the reading notification."));
    }
  };

  const clearAllNotifications = async () => {
    setPreferenceError("");
    setReadingNotificationError("");
    try {
      if (isTauri()) {
        await invoke("clear_reading_plan_notifications");
        setReadingNotifications([]);
      }
      setNotifications([]);
    } catch (error) {
      console.error("Could not clear saved reading notifications:", error);
      setReadingNotificationError(error instanceof Error ? error.message : t("Could not clear saved reading notifications."));
    }
  };

  useEffect(() => {
    const toggleFromShortcut = () => {
      setOpen(true);
      void toggleDoNotDisturb();
    };
    window.addEventListener("shelve:toggle-do-not-disturb", toggleFromShortcut);
    return () => window.removeEventListener("shelve:toggle-do-not-disturb", toggleFromShortcut);
  }, [doNotDisturb, preferenceReady, preferenceSaving]);

  return (
    <div className="notification-center" ref={menuRef}>
      <button
        type="button"
        className="notification-trigger"
        aria-label={notificationCount ? `${t("Notifications")}, ${notificationCount} ${t("items")}` : t("Notifications")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-popover"
        title={t("Notifications")}
        onClick={() => setOpen((value) => !value)}
      >
        {doNotDisturb ? <BellOff size={17} /> : <Bell size={17} />}
        {notificationCount > 0 && <span className="notification-count">{notificationCount > 99 ? "99+" : notificationCount}</span>}
      </button>
      {open && (
        <section id="notification-popover" className="notification-popover" role="dialog" aria-label={t("Notifications")}>
          <div className="notification-header">
            <h2>{t("Notifications")}</h2>
            {(notifications.length > 0 || readingNotifications.length > 0) && (
              <button type="button" className="notification-clear" onClick={() => void clearAllNotifications()}>
                <Trash2 size={12} /> {t("Clear all")}
              </button>
            )}
          </div>
          <div className="notification-dnd-row">
            <div>
              <strong>{t("Do Not Disturb")}</strong>
              <span>{doNotDisturb ? t("New notifications are paused") : t("Show app notifications")}</span>
            </div>
            <button
              type="button"
              className={`notification-switch ${doNotDisturb ? "enabled" : ""}`}
              role="switch"
              aria-checked={doNotDisturb}
              aria-label={t("Do Not Disturb")}
              disabled={!preferenceReady || preferenceSaving}
              onClick={() => void toggleDoNotDisturb()}
            >
              <span />
            </button>
          </div>
          {preferenceError && <ErrorAlert className="notification-error" message={preferenceError} />}
          {readingNotificationError && <ErrorAlert className="notification-error" message={readingNotificationError} />}
          <div className="notification-list" aria-live="polite">
            {notifications.length === 0 && readingNotifications.length === 0
              ? <p className="notification-empty">{doNotDisturb ? t("Do Not Disturb is on. New notifications are paused.") : t("You're all caught up.")}</p>
              : <>
              {readingNotifications.map((notification) => (
                <article className={`notification-item reading-reminder-notification ${notification.acknowledgedAt ? "acknowledged" : "pending"}`} key={notification.id}>
                  <Bell size={15} />
                  <div className="reading-reminder-content">
                    <p><strong>{t("Reading reminder")}</strong> — {notification.title}</p>
                    <time dateTime={notification.lastNotifiedAt}>
                      {notification.acknowledgedAt
                        ? `${t("Received")} · ${formatTime(notification.acknowledgedAt, locale)}`
                        : `${t("Waiting for confirmation")} · ${formatTime(notification.lastNotifiedAt, locale)}`}
                    </time>
                    <div className="reading-reminder-actions">
                      {!notification.acknowledgedAt && <button type="button" onClick={() => void acknowledgeReadingNotification(notification.id)}><Check size={12} />{t("I received this")}</button>}
                      <button type="button" aria-label={`${t("Delete")} ${notification.title}`} onClick={() => void deleteReadingNotification(notification.id)}><Trash2 size={12} />{t("Delete")}</button>
                    </div>
                  </div>
                </article>
              ))}
              {notifications.map((notification) => (
                <article className={`notification-item ${notification.kind}`} key={notification.id}>
                  {notification.kind !== "warning" && <Info size={15} />}
                  <div>
                    {notification.kind === "warning"
                      ? <ErrorAlert className="notification-error-message" message={notification.message} />
                      : <p>{t(notification.message)}</p>}
                    <time dateTime={notification.createdAt}>{formatTime(notification.createdAt, locale)}</time>
                  </div>
                </article>
              ))}
              </>}
          </div>
        </section>
      )}
    </div>
  );
}
