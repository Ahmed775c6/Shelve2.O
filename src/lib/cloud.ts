import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AuthSession, AuthUser, Book } from "../types";
import { apiRequest, downloadApiFile, uploadApiFile } from "./api";
import {
  clearAuthSession,
  clearPendingOfflineSync,
  cleanupOrphanLocalFiles,
  hasPendingOfflineSync,
  cacheCoverFile,
  readCoverFile,
  readLocalFile,
  saveLocalFile,
} from "./storage";

const SESSION_LENGTH_MS = 30 * 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function userAccountMetadata(user: Record<string, unknown>): Pick<AuthUser, "createdAt" | "updatedAt" | "plan"> {
  const metadata: Pick<AuthUser, "createdAt" | "updatedAt" | "plan"> = {};
  const createdAt = typeof user.createdAt === "string" ? user.createdAt : user.created_at;
  const updatedAt = typeof user.updatedAt === "string" ? user.updatedAt : user.updated_at;
  if (typeof createdAt === "string") metadata.createdAt = createdAt;
  if (typeof updatedAt === "string") metadata.updatedAt = updatedAt;
  if (user.plan === "free" || user.plan === "standard" || user.plan === "premium") {
    metadata.plan = user.plan;
  }
  return metadata;
}

function isBook(value: unknown): value is Book {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.author === "string" &&
    typeof value.category === "string" &&
    typeof value.coverImage === "string" &&
    typeof value.coverColor === "string" &&
    typeof value.totalPages === "number" &&
    typeof value.currentPage === "number" &&
    (value.status === "unread" || value.status === "reading" || value.status === "archived") &&
    typeof value.uploadedAt === "string";
}

function sessionFromResponse(payload: unknown): AuthSession {
  if (!isRecord(payload) || typeof payload.token !== "string" || !isRecord(payload.user)) {
    throw new Error("The Shelve server did not return a valid sign-in session.");
  }
  const rawUser = payload.user;
  const id = typeof rawUser.id === "string" ? rawUser.id : typeof rawUser._id === "string" ? rawUser._id : "";
  const user: AuthUser = {
    id,
    name: typeof rawUser.name === "string" ? rawUser.name : "",
    email: typeof rawUser.email === "string" ? rawUser.email : "",
    ...userAccountMetadata(rawUser),
  };
  if (!user.id || !user.email) throw new Error("The Shelve server returned an incomplete user profile.");
  return {
    token: payload.token,
    expiresAt: new Date(Date.now() + SESSION_LENGTH_MS).toISOString(),
    user,
  };
}

export async function signInOnline(email: string, password: string): Promise<AuthSession> {
  const payload = await apiRequest("/api/auth/signin", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return sessionFromResponse(payload);
}

export interface SignUpResult {
  email: string;
  emailVerified: boolean;
  verificationRequired: boolean;
}

export async function signUpOnline(name: string, email: string, password: string): Promise<SignUpResult> {
  const payload = await apiRequest("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  if (!isRecord(payload) || typeof payload.verificationRequired !== "boolean" ||
      typeof payload.emailVerified !== "boolean" || typeof payload.email !== "string") {
    throw new Error("The Shelve server returned an invalid signup response.");
  }
  return {
    email: payload.email,
    emailVerified: payload.emailVerified,
    verificationRequired: payload.verificationRequired,
  };
}

export async function resendVerificationEmail(email: string): Promise<void> {
  await apiRequest("/api/auth/verification/resend", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyEmailOnline(token: string): Promise<void> {
  await apiRequest("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export interface EmailNotificationPreferences {
  emailNotifications: boolean;
  emailVerified: boolean;
  emailDeliveryAvailable: boolean;
}

export async function loadEmailNotificationPreferences(token: string): Promise<EmailNotificationPreferences> {
  const result = await apiRequest("/api/auth/email-notifications", { method: "GET" }, token);
  if (!isRecord(result) || typeof result.emailNotifications !== "boolean" ||
      typeof result.emailVerified !== "boolean" || typeof result.emailDeliveryAvailable !== "boolean") {
    throw new Error("The Shelve server returned invalid email notification preferences.");
  }
  return {
    emailNotifications: result.emailNotifications,
    emailVerified: result.emailVerified,
    emailDeliveryAvailable: result.emailDeliveryAvailable,
  };
}

export async function saveEmailNotificationPreferences(token: string, enabled: boolean): Promise<void> {
  await apiRequest("/api/auth/email-notifications", {
    method: "PATCH",
    body: JSON.stringify({ emailNotifications: enabled }),
  }, token);
}

export async function uploadBookAssets(book: Book, token: string, file?: File, cover?: File): Promise<Book> {
  if (!token) throw new Error("Sign in before uploading book files.");
  const result = { ...book };
  if (file) {
    result.remoteFileName = await uploadApiFile(token, "books", file, book.fileKey ?? book.id);
  }
  if (cover) {
    const coverKey = book.coverImage.startsWith("asset:") ? book.coverImage.slice("asset:".length) : book.id;
    result.remoteCoverFileName = await uploadApiFile(token, "covers", cover, coverKey);
    if (isTauri()) await cacheCoverFile(coverKey, cover);
  }
  return result;
}

export async function syncOfflineDataToCloud(token: string, force = false): Promise<void> {
  if (!isTauri()) return;
  const queue = await invoke<unknown[]>("db_get_sync_queue");
  if (!Array.isArray(queue)) throw new Error("The local sync queue is invalid.");
  const pending = (await hasPendingOfflineSync()) || queue.length > 0;
  if (!pending && !force) return;

  if (pending) {
    const exported = await invoke<unknown>("db_export_all_json");
    if (!isRecord(exported) || !Array.isArray(exported.books)) {
      throw new Error("The local database returned an invalid sync payload.");
    }
    if (!exported.books.every(isBook)) throw new Error("The local database contains an invalid book.");
    const books = exported.books.map((book) => ({ ...book }));

    for (const book of books) {
      let fileReferencesChanged = false;
      if (book.fileKey && !book.remoteFileName) {
        const file = await readLocalFile(book.fileKey, book.fileMimeType, book.fileName);
        if (file) {
          if (file.size > 20 * 1024 * 1024) throw new Error(`"${book.title}" is over the 20 MiB cloud upload limit.`);
          book.remoteFileName = await uploadApiFile(
            token,
            "books",
            new File([file], book.fileName || "book.pdf", { type: file.type }),
            book.fileKey ?? book.id,
          );
          fileReferencesChanged = true;
        } else throw new Error(`The local file for "${book.title}" is missing; the upload remains pending.`);
      }
      if (book.coverImage.startsWith("asset:") && !book.remoteCoverFileName) {
        const key = book.coverImage.slice("asset:".length);
        const file = await readCoverFile(key, book.coverMimeType, book.coverFileName)
          ?? await readLocalFile(key, book.coverMimeType, book.coverFileName);
        if (file) {
          book.remoteCoverFileName = await uploadApiFile(
            token,
            "covers",
            new File([file], book.coverFileName || "cover.jpg", { type: file.type }),
            key,
          );
          fileReferencesChanged = true;
        } else throw new Error(`The local cover for "${book.title}" is missing; the upload remains pending.`);
      }
      if (fileReferencesChanged) book.updatedAt = new Date().toISOString();
    }

    const writings = Array.isArray(exported.writings)
      ? await Promise.all(exported.writings.map(async (value) => {
        if (!isRecord(value) || !isRecord(value.coverDesign)) return value;
        const coverDesign = { ...value.coverDesign };
        if (typeof coverDesign.imageKey === "string" && !coverDesign.remoteImageName) {
          const image = await readCoverFile(
            coverDesign.imageKey,
            typeof coverDesign.imageMimeType === "string" ? coverDesign.imageMimeType : undefined,
            typeof coverDesign.imageFileName === "string" ? coverDesign.imageFileName : undefined,
          );
          if (image) {
            coverDesign.remoteImageName = await uploadApiFile(
              token,
              "covers",
              new File([image], typeof coverDesign.imageFileName === "string" ? coverDesign.imageFileName : "cover.png", { type: image.type || "image/png" }),
              coverDesign.imageKey,
            );
          } else throw new Error(`The local writing cover "${coverDesign.imageFileName ?? "image"}" is missing.`);
        }
        if (typeof coverDesign.appliedCoverKey === "string" && !coverDesign.appliedRemoteCoverName) {
          const appliedCover = await readLocalFile(coverDesign.appliedCoverKey, "image/png", "cover.png");
          if (appliedCover) {
            coverDesign.appliedRemoteCoverName = await uploadApiFile(
              token,
              "covers",
              new File([appliedCover], "cover.png", { type: appliedCover.type || "image/png" }),
              coverDesign.appliedCoverKey,
            );
          } else throw new Error("The applied writing cover file is missing.");
        }
        if (coverDesign.remoteImageName === value.coverDesign.remoteImageName &&
          coverDesign.appliedRemoteCoverName === value.coverDesign.appliedRemoteCoverName) return value;
        return { ...value, coverDesign, updatedAt: new Date().toISOString() };
      }))
      : [];
    const payload = { ...exported, books, writings };
    await invoke("db_mark_sync_assets_synced");
    await apiRequest("/api/sync/merge", { method: "POST", body: JSON.stringify(payload) }, token);
  }

  const remote = await apiRequest("/api/sync/pull", { method: "GET" }, token);
  const merged = isRecord(remote) && isRecord(remote.data) ? remote.data : remote;
  if (!isRecord(merged)) throw new Error("The Shelve server returned invalid sync data.");
  await invoke("db_import_merge_json", { payload: merged });

  const localBooks = await invoke<unknown>("db_get_books");
  if (!Array.isArray(localBooks) || !localBooks.every(isBook)) {
    throw new Error("The local database returned invalid books after sync.");
  }
  for (const book of localBooks) {
    if (book.remoteFileName) {
      const key = book.fileKey ?? crypto.randomUUID();
      if (!(await readLocalFile(key, book.fileMimeType, book.fileName))) {
        await saveLocalFile(key, await downloadApiFile(token, "books", book.remoteFileName));
      }
      if (!book.fileKey) {
        await invoke("db_update_book", { book: { ...book, fileKey: key } });
      }
    }
    if (book.coverImage.startsWith("asset:") && book.remoteCoverFileName) {
      const key = book.coverImage.slice("asset:".length);
      const localCover = await readCoverFile(key, book.coverMimeType, book.coverFileName)
        ?? await readLocalFile(key, book.coverMimeType, book.coverFileName);
      if (!localCover) {
        await cacheCoverFile(key, await downloadApiFile(token, "covers", book.remoteCoverFileName));
      }
    }
  }
  const conflicts = await apiRequest("/api/sync/conflicts", { method: "GET" }, token);
  if (!Array.isArray(conflicts)) throw new Error("The Shelve server returned invalid sync conflicts.");
  await invoke("db_store_sync_conflicts", { conflicts });
  await invoke("db_mark_sync_queue_synced");
  await clearPendingOfflineSync();
  await cleanupOrphanLocalFiles();
  await apiRequest("/api/files/cleanup-orphans", { method: "POST", body: JSON.stringify({}) }, token);
}

export async function verifySession(token: string): Promise<AuthUser> {
  const payload = await apiRequest("/api/auth/me", { method: "GET" }, token);
  const user = isRecord(payload) && isRecord(payload.user) ? payload.user : payload;
  if (!isRecord(user)) throw new Error("The Shelve server returned an invalid account profile.");
  const id = typeof user.id === "string" ? user.id : typeof user._id === "string" ? user._id : "";
  if (!id || typeof user.email !== "string") {
    throw new Error("The Shelve server returned an incomplete account profile.");
  }
  return {
    id,
    email: user.email,
    name: typeof user.name === "string" ? user.name : "",
    ...userAccountMetadata(user),
  };
}

export async function changePasswordOnline(token: string, currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest("/api/auth/password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, newPassword }),
  }, token);
}

export async function signOutOnline(): Promise<void> {
  await clearAuthSession();
}

export async function sendAiRequest(
  path: "/api/ai/chat" | "/api/ai/writing-assist" | "/api/ai/generate-cover",
  token: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest(path, { method: "POST", body: JSON.stringify(data) }, token);
}
