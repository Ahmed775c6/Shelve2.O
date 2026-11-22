import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { AlertTriangle, Check, ChevronDown, Cloud, LoaderCircle, RotateCw, WifiOff } from "lucide-react";
import { useLanguage } from "../language-provider";
import { apiRequest } from "../../lib/api";
import { getSyncHealth, retryFailedSync, type SyncHealth } from "../../lib/sync/SyncEngine";

interface SyncConflict {
  id: string;
  collection: string;
  recordId: string;
  localData: unknown;
  remoteData: unknown;
  createdAt: string;
}

interface QueueItem {
  id: string;
  collection: string;
  recordId: string;
  status: string;
  recordSyncStatus: string;
  assetSyncStatus: string;
  attemptCount: number;
  nextRetryAt: string;
  lastError?: string | null;
}

interface SyncStatusControlProps {
  token?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function healthLabel(health: SyncHealth, t: (value: string) => string): string {
  if (!health.online && health.pending + health.failed > 0) {
    return `${t("Offline")} · ${health.pending + health.failed} ${t("pending")}`;
  }
  if (health.conflict > 0) return t("Conflict");
  if (health.failed > 0) return t("Failed");
  if (health.syncing) return t("Syncing...");
  if (health.pending > 0) return t("Pending");
  return t("Synced");
}

export function SyncStatusControl({ token = null }: SyncStatusControlProps) {
  const { t } = useLanguage();
  const [health, setHealth] = useState<SyncHealth>({
    pending: 0, failed: 0, conflict: 0, synced: 0, syncing: false, online: navigator.onLine,
  });
  const [open, setOpen] = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busyConflict, setBusyConflict] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [nextHealth, nextQueue, nextConflicts] = await Promise.all([
      getSyncHealth(),
      isTauri() ? invoke<QueueItem[]>("db_get_sync_queue") : Promise.resolve([]),
      isTauri() ? invoke<SyncConflict[]>("db_get_sync_conflicts") : Promise.resolve([]),
    ]);
    setHealth(nextHealth);
    setQueue(nextQueue);
    setConflicts(nextConflicts);
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const update = () => {
      void refresh().catch((cause: unknown) => {
        if (active) {
          console.error("Could not load Shelve sync activity:", cause);
          setError(cause instanceof Error ? cause.message : "Could not load sync activity.");
        }
      });
    };
    update();
    const interval = window.setInterval(update, 2000);
    window.addEventListener("shelve:sync-status", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("shelve:sync-status", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [refresh]);

  const resolveConflict = async (conflict: SyncConflict, resolution: "keep_mine" | "accept_remote" | "keep_both") => {
    if (!token || busyConflict) return;
    setBusyConflict(conflict.id);
    setError("");
    try {
      const result = await apiRequest("/api/sync/conflicts", {
        method: "POST",
        body: JSON.stringify({ id: conflict.id, resolution }),
      }, token);
      if (!isRecord(result) || !isRecord(result.canonicalRecord)) {
        throw new Error("The server returned an invalid conflict resolution.");
      }
      const copy = isRecord(result.conflictCopy) ? result.conflictCopy : null;
      await invoke("db_resolve_sync_conflict", {
        conflictId: conflict.id,
        record: result.canonicalRecord,
        conflictCopy: copy,
      });
      await refresh();
      window.dispatchEvent(new Event("shelve:sync-status"));
      window.dispatchEvent(new Event("shelve:library-refresh"));
    } catch (cause) {
      console.error("Could not resolve Shelve sync conflict:", cause);
      setError(cause instanceof Error ? cause.message : "Could not resolve this conflict.");
    } finally {
      setBusyConflict("");
    }
  };

  if (!isTauri()) return null;
  const label = healthLabel(health, t);
  const icon = !health.online
    ? <WifiOff size={12} />
    : health.conflict > 0 || health.failed > 0
      ? <AlertTriangle size={12} />
      : health.syncing
        ? <LoaderCircle className="studio-sync-spin" size={12} />
        : <Cloud size={12} />;

  return (
    <div className="studio-sync-control">
      <button
        type="button"
        className={`studio-sync-pill status-${health.conflict ? "conflict" : health.failed ? "failed" : health.syncing ? "syncing" : !health.online && health.pending ? "offline" : "synced"}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={t("View sync activity")}
      >
        {icon}<span>{label}</span><ChevronDown size={10} />
      </button>
      {open && <section className="studio-sync-popover" aria-label={t("Sync activity")}>
        <header><strong>{t("Sync activity")}</strong><button type="button" aria-label={t("Close")} onClick={() => setOpen(false)}>×</button></header>
        <p>{health.online ? t("Connected") : t("Offline")} · {health.pending} {t("pending")} · {health.failed} {t("failed")} · {health.conflict} {t("conflicts")}</p>
        {error && <p className="studio-sync-error" role="alert">{error}</p>}
        {(health.failed > 0 || queue.some((item) => item.status === "failed")) && <button
          type="button"
          className="studio-sync-retry"
          disabled={!health.online || health.syncing}
          onClick={() => void retryFailedSync().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not retry sync."))}
        ><RotateCw size={12} />{t("Retry failed items")}</button>}
        {queue.length > 0 && <ul className="studio-sync-queue">
          {queue.slice(0, 5).map((item) => <li key={item.id}>
            <span>{item.collection} · {item.recordId.slice(0, 8)}</span>
            <small>{item.recordSyncStatus}/{item.assetSyncStatus}{item.lastError ? ` · ${item.lastError}` : ""}</small>
          </li>)}
        </ul>}
        {conflicts.length > 0 && <div className="studio-sync-conflicts">
          <strong>{t("Resolve conflicts")}</strong>
          {conflicts.map((conflict) => <article key={conflict.id}>
            <h4>{conflict.collection} · {conflict.recordId.slice(0, 8)}</h4>
            <div className="studio-sync-versions">
              <details><summary>{t("Local version")}</summary><pre>{JSON.stringify(conflict.localData, null, 2)}</pre></details>
              <details><summary>{t("Cloud version")}</summary><pre>{JSON.stringify(conflict.remoteData, null, 2)}</pre></details>
            </div>
            <div className="studio-sync-resolution-actions">
              <button type="button" disabled={!token || Boolean(busyConflict)} onClick={() => void resolveConflict(conflict, "keep_mine")}>{busyConflict === conflict.id ? <LoaderCircle className="studio-sync-spin" size={11} /> : <Check size={11} />}{t("Keep Mine")}</button>
              <button type="button" disabled={!token || Boolean(busyConflict)} onClick={() => void resolveConflict(conflict, "accept_remote")}>{t("Accept Remote")}</button>
              <button type="button" disabled={!token || Boolean(busyConflict)} onClick={() => void resolveConflict(conflict, "keep_both")}>{t("Keep Both")}</button>
            </div>
          </article>)}
        </div>}
        {queue.length === 0 && conflicts.length === 0 && health.failed === 0 && health.pending === 0 && <p className="studio-sync-empty">{t("Everything is up to date.")}</p>}
      </section>}
    </div>
  );
}
