import { invoke, isTauri } from "@tauri-apps/api/core";
import { hasPendingOfflineSync } from "../storage";

export type SyncStatusName = "synced" | "pending" | "conflict" | "failed";

export interface SyncHealth {
  pending: number;
  failed: number;
  conflict: number;
  synced: number;
  syncing: boolean;
  online: boolean;
}

const emptyHealth = (): SyncHealth => ({
  pending: 0,
  failed: 0,
  conflict: 0,
  synced: 0,
  syncing: false,
  online: typeof navigator === "undefined" || navigator.onLine,
});

export async function getSyncHealth(): Promise<SyncHealth> {
  if (!isTauri()) return emptyHealth();
  const counts = await invoke<Omit<SyncHealth, "syncing" | "online">>("db_get_sync_status");
  return { ...counts, syncing: syncEngine.isSyncing(), online: navigator.onLine };
}

export async function retryFailedSync(): Promise<void> {
  if (!isTauri()) return;
  await invoke("db_retry_sync_queue");
  window.dispatchEvent(new Event("shelve:sync-retry"));
}

type Flush = (token: string) => Promise<void>;

class SyncEngine {
  private token: string | null = null;
  private flushChanges: Flush | null = null;
  private timer: number | null = null;
  private checking = false;
  private busy = false;
  private listeners: Array<[string, EventListener]> = [];

  isSyncing(): boolean {
    return this.busy;
  }

  start(token: string, flush: Flush): () => void {
    this.stop();
    this.token = token;
    this.flushChanges = flush;
    const reconnect = () => void this.flushNow(true).catch((error: unknown) => {
      console.error("Could not inspect the Shelve sync queue:", error);
    });
    for (const eventName of ["online", "shelve:jwt-refreshed", "shelve:sync-retry"]) {
      window.addEventListener(eventName, reconnect);
      this.listeners.push([eventName, reconnect]);
    }
    this.timer = window.setInterval(() => void this.flushNow().catch((error: unknown) => {
      console.error("Could not check the Shelve sync queue:", error);
    }), 1000);
    void this.flushNow(true).catch((error: unknown) => {
      console.error("Could not start Shelve synchronization:", error);
    });
    return () => this.stop();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const [eventName, listener] of this.listeners) window.removeEventListener(eventName, listener);
    this.listeners = [];
    this.token = null;
    this.flushChanges = null;
  }

  async stopAndWait(): Promise<void> {
    this.stop();
    while (this.checking || this.busy) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
    }
  }

  async flushNow(force = false): Promise<void> {
    const token = this.token;
    const flushChanges = this.flushChanges;
    if (!isTauri() || !token || !flushChanges || this.checking || this.busy || !navigator.onLine) return;
    this.checking = true;
    try {
      const queue = await invoke<Array<{ status: string; nextRetryAt: string }>>("db_get_sync_queue");
      const legacyPending = await hasPendingOfflineSync();
      if (!Array.isArray(queue)) throw new Error("The local sync queue is invalid.");
      const due = force || queue.some((item) => item.status === "pending" ||
        (item.status === "failed" && Date.parse(item.nextRetryAt) <= Date.now()));
      if (!due && !(legacyPending && queue.length === 0)) return;

      this.busy = true;
      this.publish();
      await flushChanges(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The sync operation failed.";
      if (this.busy) await invoke("db_mark_sync_queue_failed", { message });
      console.error("Shelve sync failed; the persistent queue will retry with backoff:", error);
    } finally {
      this.checking = false;
      if (this.busy) {
        this.busy = false;
        this.publish();
      }
    }
  }

  publish(): void {
    window.dispatchEvent(new Event("shelve:sync-status"));
  }
}

export const syncEngine = new SyncEngine();
