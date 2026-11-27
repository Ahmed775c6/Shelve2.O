import { invoke, isTauri } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { BaseDirectory, documentDir, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, readFile as readAppFile, readTextFile, remove, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { AuthSession, Book, StorageMode, WritingProject } from "../../types";
import { apiRequest, downloadApiFile, uploadApiFile } from "../api";

const FILES_DIRECTORY = "files";
const MODE_KEY = "shelve-storage-mode-v1";
const AUTH_KEY = "shelve-auth-session-v1";
const PENDING_SYNC_KEY = "cloud-sync-pending";
const LOCAL_WRITING_PROJECTS_KEY = "shelve-studio-local-project-paths-v1";
const LOCAL_WRITING_PROJECTS_DIRECTORY = "ShelveStudio";
const LOCAL_WRITING_PROJECT_MANIFEST = ".shelve/project.json";
const LOCAL_WRITING_SESSIONS_FILE = ".shelve/writing-sessions.json";
const WRITING_ID = "00000000-0000-4000-8000-000000000001";

const collectionPaths = {
  notes: "/api/notes",
  writings: "/api/writings",
  readingPlans: "/api/reading-plans",
  readingSessions: "/api/reading-sessions",
  writingSessions: "/api/writing-sessions",
} as const;

const localCommands = {
  notes: { get: "db_get_notes", save: "db_save_note", remove: "db_delete_note" },
  writings: { get: "db_get_writings", save: "db_save_writing", remove: "db_delete_writing" },
  readingPlans: { get: "db_get_reading_plans", save: "db_save_reading_plan", remove: "db_delete_reading_plan" },
  readingSessions: {
    get: "db_get_reading_sessions",
    save: "db_save_reading_session",
    remove: "db_delete_reading_session",
  },
  writingSessions: {
    get: "db_get_writing_sessions",
    save: "db_save_writing_session",
    remove: "db_delete_writing_session",
  },
} as const;

export type StorageCollection = keyof typeof collectionPaths;
type LocalWritingProject = WritingProject & StoredRecord & { localPath: string };

export interface StorageProvider {
  configure(mode: StorageMode, token: string | null): void;
  loadBooks(): Promise<Book[]>;
  saveBooks(books: Book[]): Promise<void>;
  deleteBook(id: string): Promise<void>;
  loadRecords<T extends StoredRecord>(collection: StorageCollection): Promise<T[]>;
  saveRecords<T extends StoredRecord>(collection: StorageCollection, records: T[]): Promise<void>;
  removeRecord(collection: StorageCollection, id: string): Promise<void>;
  loadText(key: string, fallback: string): Promise<string>;
  saveText(key: string, value: string): Promise<void>;
}

export interface StoredRecord {
  id: string;
  updatedAt?: string;
  deletedAt?: string;
  [key: string]: unknown;
}

export interface ReadingSessionRecord extends StoredRecord {
  bookId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  pagesRead: number;
  firstPage: number;
  lastPage: number;
}

export interface ResolvedFileUrl {
  url: string;
  revoke: boolean;
}

export const storageKeys = {
  writing: "shelve-writing-v1",
  profileAvatar: "shelve-profile-avatar-v1",
  notificationsDoNotDisturb: "shelve-notifications-dnd-v1",
};

let activeMode: StorageMode | null = null;
let activeToken: string | null = null;
const cachedBooks = new Map<string, Book>();
const cachedRecords = new Map<StorageCollection, Map<string, StoredRecord>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalWritingProject(value: unknown): value is LocalWritingProject {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.localPath === "string" &&
    isSafeLocalWritingPath(value.localPath) &&
    Array.isArray(value.chapters);
}

function isSafeLocalWritingPath(path: string): boolean {
  const segments = path.replace(/\\/g, "/").split("/");
  return segments.length >= 2 &&
    segments[0] === LOCAL_WRITING_PROJECTS_DIRECTORY &&
    segments.every((segment) => Boolean(segment) && segment !== "." && segment !== ".." &&
      !/[<>:"|?*\u0000-\u001f]/.test(segment) && !/[. ]$/.test(segment));
}

function safeProjectPathSegment(value: string): string {
  const segment = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "");
  if (!segment || segment === "." || segment === "..") return "Untitled project";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(segment) ? `${segment}-item` : segment;
}

function projectChapterPaths(project: LocalWritingProject): string[] {
  const usedFolderNames = new Set<string>();
  return project.chapters.map((chapter) => {
    const baseName = safeProjectPathSegment(chapter.title || "Untitled folder");
    let folderName = baseName;
    for (let suffix = 2; usedFolderNames.has(folderName.toLocaleLowerCase()); suffix += 1) folderName = `${baseName} (${suffix})`;
    usedFolderNames.add(folderName.toLocaleLowerCase());
    return `${project.localPath}/${folderName}`;
  });
}

function projectFiles(project: LocalWritingProject): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const chapterPaths = projectChapterPaths(project);
  const addPages = (parent: string, pages: WritingProject["pages"]) => {
    const usedNames = new Set<string>();
    for (const page of pages ?? []) {
      const baseName = safeProjectPathSegment(page.title || "Untitled page");
      let fileName = baseName;
      for (let suffix = 2; usedNames.has(fileName.toLocaleLowerCase()); suffix += 1) {
        const extensionStart = baseName.lastIndexOf(".");
        fileName = extensionStart > 0
          ? `${baseName.slice(0, extensionStart)} (${suffix})${baseName.slice(extensionStart)}`
          : `${baseName} (${suffix})`;
      }
      usedNames.add(fileName.toLocaleLowerCase());
      files.push({ path: `${parent}/${fileName}`, content: page.content ?? "" });
    }
  };
  addPages(project.localPath, project.pages);
  for (const [index, chapter] of project.chapters.entries()) {
    const chapterPath = chapterPaths[index];
    if (chapter.content) files.push({ path: `${chapterPath}/.chapter-content.md`, content: chapter.content });
    addPages(chapterPath, chapter.pages);
  }
  return files;
}

async function loadLocalWritingProjects(): Promise<LocalWritingProject[]> {
  if (!isTauri()) return [];
  const storedPaths = await getSetting(LOCAL_WRITING_PROJECTS_KEY);
  if (!storedPaths) return [];
  const paths = parseJson<unknown>(storedPaths, "The local Writing Studio project index");
  if (!Array.isArray(paths) || !paths.every((path) => typeof path === "string" && isSafeLocalWritingPath(path))) {
    throw new Error("The local Writing Studio project index is invalid.");
  }
  const projects = await Promise.all(paths.map(async (path) => {
    const manifestPath = `${path}/${LOCAL_WRITING_PROJECT_MANIFEST}`;
    const manifest = parseJson<unknown>(
      await readTextFile(manifestPath, { baseDir: BaseDirectory.Document }),
      `The local project file at ${manifestPath}`,
    );
    if (!isLocalWritingProject(manifest) || manifest.localPath !== path) {
      throw new Error(`The local project file at ${manifestPath} is invalid.`);
    }
    return manifest;
  }));
  return projects;
}

async function saveLocalWritingProjects(records: StoredRecord[]): Promise<void> {
  if (!isTauri()) {
    if (records.some((record) => typeof record.localPath === "string")) {
      throw new Error("Local Writing Studio project folders are available only in the desktop app.");
    }
    return;
  }
  const localProjects = records.filter(isLocalWritingProject);
  for (const project of localProjects) {
    await mkdir(project.localPath, { baseDir: BaseDirectory.Document, recursive: true });
    await mkdir(`${project.localPath}/.shelve`, { baseDir: BaseDirectory.Document, recursive: true });
    const manifestPath = `${project.localPath}/${LOCAL_WRITING_PROJECT_MANIFEST}`;
    let previousFiles: Array<{ path: string; content: string }> = [];
    if (await exists(manifestPath, { baseDir: BaseDirectory.Document })) {
      const previousProject = parseJson<unknown>(
        await readTextFile(manifestPath, { baseDir: BaseDirectory.Document }),
        `The local project file at ${manifestPath}`,
      );
      if (!isLocalWritingProject(previousProject)) {
        throw new Error(`The local project file at ${manifestPath} is invalid.`);
      }
      previousFiles = projectFiles(previousProject);
    }
    const nextFiles = projectFiles(project);
    const nextPaths = new Set(nextFiles.map((file) => file.path));
    for (const file of previousFiles) {
      if (!nextPaths.has(file.path) && await exists(file.path, { baseDir: BaseDirectory.Document })) {
        await remove(file.path, { baseDir: BaseDirectory.Document });
      }
    }
    for (const file of nextFiles) {
      const parent = file.path.slice(0, file.path.lastIndexOf("/"));
      await mkdir(parent, { baseDir: BaseDirectory.Document, recursive: true });
      await writeTextFile(file.path, file.content, { baseDir: BaseDirectory.Document });
    }
    for (const chapterPath of projectChapterPaths(project)) {
      await mkdir(chapterPath, { baseDir: BaseDirectory.Document, recursive: true });
    }
    await writeTextFile(
      manifestPath,
      JSON.stringify(project, null, 2),
      { baseDir: BaseDirectory.Document },
    );
  }
  await setSetting(LOCAL_WRITING_PROJECTS_KEY, JSON.stringify(localProjects.map((project) => project.localPath)));
}

async function loadLocalWritingSessions(projects: LocalWritingProject[]): Promise<StoredRecord[]> {
  const projectSessions = await Promise.all(projects.map(async (project) => {
    const path = `${project.localPath}/${LOCAL_WRITING_SESSIONS_FILE}`;
    if (!(await exists(path, { baseDir: BaseDirectory.Document }))) return [];
    const sessions = parseJson<unknown>(
      await readTextFile(path, { baseDir: BaseDirectory.Document }),
      `The local project file at ${path}`,
    );
    if (!Array.isArray(sessions) || !sessions.every((session) =>
      isRecord(session) && typeof session.id === "string" && session.projectId === project.id,
    )) {
      throw new Error(`The local project file at ${path} is invalid.`);
    }
    return sessions as StoredRecord[];
  }));
  return projectSessions.flat();
}

async function saveLocalWritingSessions(records: StoredRecord[], projects: LocalWritingProject[]): Promise<void> {
  const sessionsByProject = new Map<string, StoredRecord[]>();
  for (const record of records) {
    if (typeof record.projectId !== "string") continue;
    const sessions = sessionsByProject.get(record.projectId) ?? [];
    sessions.push(record);
    sessionsByProject.set(record.projectId, sessions);
  }
  for (const project of projects) {
    const path = `${project.localPath}/${LOCAL_WRITING_SESSIONS_FILE}`;
    await mkdir(`${project.localPath}/.shelve`, { baseDir: BaseDirectory.Document, recursive: true });
    await writeTextFile(path, JSON.stringify(sessionsByProject.get(project.id) ?? [], null, 2), {
      baseDir: BaseDirectory.Document,
    });
  }
}

function projectForOnlineStorage(record: StoredRecord): StoredRecord {
  const { localPath: _localPath, syncOnline: _syncOnline, ...onlineRecord } = record;
  return onlineRecord;
}

export async function chooseLocalWritingProjectFolder(): Promise<string | null> {
  if (!isTauri()) throw new Error("Local Writing Studio project folders are available only in the desktop app.");
  await mkdir(LOCAL_WRITING_PROJECTS_DIRECTORY, { baseDir: BaseDirectory.Document, recursive: true });
  const documentsPath = await documentDir();
  const defaultPath = await join(documentsPath, LOCAL_WRITING_PROJECTS_DIRECTORY);
  const selectedPath = await openDialog({ directory: true, multiple: false, defaultPath });
  if (!selectedPath || Array.isArray(selectedPath)) return null;
  const normalizePath = (path: string) => path.replace(/[\\/]+/g, "\\").replace(/\\+$/g, "");
  const documentsRoot = normalizePath(documentsPath);
  const selected = normalizePath(selectedPath);
  if (!selected.toLowerCase().startsWith(`${documentsRoot}\\`.toLowerCase())) {
    throw new Error(`Choose a folder inside Documents\\${LOCAL_WRITING_PROJECTS_DIRECTORY}.`);
  }
  const relativePath = selected.slice(documentsRoot.length + 1).replace(/\\/g, "/");
  if (relativePath !== LOCAL_WRITING_PROJECTS_DIRECTORY &&
    !relativePath.startsWith(`${LOCAL_WRITING_PROJECTS_DIRECTORY}/`)) {
    throw new Error(`Choose a folder inside Documents\\${LOCAL_WRITING_PROJECTS_DIRECTORY}.`);
  }
  if (!isSafeLocalWritingPath(`${relativePath}/placeholder`)) {
    throw new Error("The selected folder path is not supported.");
  }
  return relativePath;
}

export async function createLocalWritingProjectPath(title: string, parentPath = LOCAL_WRITING_PROJECTS_DIRECTORY): Promise<string> {
  if (!isTauri()) throw new Error("Local Writing Studio project folders are available only in the desktop app.");
  if (!isSafeLocalWritingPath(`${parentPath}/placeholder`)) {
    throw new Error("Choose a folder inside Documents\\ShelveStudio.");
  }
  await mkdir(parentPath, { baseDir: BaseDirectory.Document, recursive: true });
  let baseName = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled-story";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(baseName)) baseName = `${baseName}-project`;
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const folderName = suffix === 1 ? baseName : `${baseName} (${suffix})`;
    const path = `${parentPath}/${folderName}`;
    if (!(await exists(path, { baseDir: BaseDirectory.Document }))) return path;
  }
  throw new Error("Could not find an available folder name for this project.");
}

function isBook(value: unknown): value is Book {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" &&
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

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} contains invalid JSON.`);
  }
}

function setCache<T extends { id: string }>(cache: Map<string, T>, records: T[]): void {
  cache.clear();
  for (const record of records) cache.set(record.id, record);
}

function requireMode(): StorageMode {
  if (!activeMode) throw new Error("Choose a storage mode before accessing your library.");
  if (activeMode === "offline" && !isTauri()) {
    throw new Error("Offline storage is available only in the Shelve desktop app.");
  }
  return activeMode;
}

function requireToken(): string {
  if (activeMode !== "cloud" || !activeToken) {
    throw new Error("Sign in to your Shelve account to access online data.");
  }
  return activeToken;
}

export async function hasPendingOfflineSync(): Promise<boolean> {
  if (!isTauri()) return false;
  return (await invoke<string | null>("db_get_setting", { key: PENDING_SYNC_KEY })) === "true";
}

async function markOfflineDataPending(): Promise<void> {
  if (activeMode === "offline" && isTauri()) {
    await invoke("db_save_setting", { key: PENDING_SYNC_KEY, value: "true" });
  }
}

export async function clearPendingOfflineSync(): Promise<void> {
  if (isTauri()) await invoke("db_save_setting", { key: PENDING_SYNC_KEY, value: "false" });
}

export function configureStorage(mode: StorageMode, token: string | null): void {
  if (mode === "offline" && !isTauri()) {
    throw new Error("Offline storage is available only in the Shelve desktop app.");
  }
  if (activeMode !== mode || activeToken !== token) {
    cachedBooks.clear();
    cachedRecords.clear();
  }
  activeMode = mode;
  activeToken = token;
}

export async function loadBooks(): Promise<Book[]> {
  const mode = requireMode();
  const values = mode === "cloud"
    ? await apiRequest("/api/books", { method: "GET" }, requireToken())
    : await invoke<unknown>("db_get_books");
  if (!Array.isArray(values) || !values.every(isBook)) {
    throw new Error("The storage provider returned invalid book data.");
  }
  const books = values.filter((book) => !book.deletedAt);
  setCache(cachedBooks, books);
  if (mode === "offline" && books.length > 0) await markOfflineDataPending();
  return books;
}

function changedFields<T extends object>(previous: T, next: T): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (key === "id" || key === "updatedAt" || key === "deletedAt" || key === "createdAt" || key === "ownerId" || key === "userId") {
      continue;
    }
    if (JSON.stringify(value) !== JSON.stringify(Reflect.get(previous, key))) updates[key] = value;
  }
  return updates;
}

async function saveBook(book: Book, mode: StorageMode): Promise<void> {
  const previous = cachedBooks.get(book.id);
  if (mode === "offline") {
    if (previous && JSON.stringify(previous) === JSON.stringify(book)) return;
    if (previous && previous.currentPage !== book.currentPage) {
      await invoke("db_update_progress", {
        bookId: book.id,
        currentPage: book.currentPage,
        updatedAt: book.updatedAt ?? new Date().toISOString(),
      });
    }
    await invoke(previous ? "db_update_book" : "db_save_book", { book });
    cachedBooks.set(book.id, book);
    await markOfflineDataPending();
    return;
  }

  const token = requireToken();
  if (!previous) {
    const saved = await apiRequest("/api/books", {
      method: "POST",
      body: JSON.stringify(book),
    }, token);
    if (!isBook(saved)) throw new Error("The Shelve server returned an invalid saved book.");
    cachedBooks.set(book.id, saved);
    if (book.currentPage > 0) {
      await apiRequest(`/api/progress/${encodeURIComponent(book.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ currentPage: book.currentPage }),
      }, token);
    }
    return;
  }

  const updates = changedFields(previous, book);
  if (previous.currentPage !== book.currentPage) {
    await apiRequest(`/api/progress/${encodeURIComponent(book.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ currentPage: book.currentPage }),
    }, token);
    delete updates.currentPage;
  }
  if (Object.keys(updates).length > 0) {
    const saved = await apiRequest(`/api/books/${encodeURIComponent(book.id)}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }, token);
    if (!isBook(saved)) throw new Error("The Shelve server returned an invalid updated book.");
    cachedBooks.set(book.id, saved);
  } else {
    cachedBooks.set(book.id, { ...book });
  }
}

export async function saveBooks(books: Book[]): Promise<void> {
  const mode = requireMode();
  for (const book of books) {
    if (!isBook(book)) throw new Error("Cannot save an invalid book record.");
    await saveBook(book, mode);
  }
  if (mode === "offline" && getCurrentWindow().label !== "main") {
    await emit("shelve:books-updated");
  }
}

export async function deleteBookRecord(id: string): Promise<void> {
  const mode = requireMode();
  const updatedAt = new Date().toISOString();
  if (mode === "cloud") {
    await apiRequest(`/api/books/${encodeURIComponent(id)}`, { method: "DELETE" }, requireToken());
  } else {
    await invoke("db_delete_book", { bookId: id, updatedAt });
    await markOfflineDataPending();
  }
  cachedBooks.delete(id);
}

function validateFileKey(key: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(key) || key === "." || key === "..") {
    throw new Error("The local file identifier is invalid.");
  }
}

export async function saveFile(key: string, file: Blob): Promise<void> {
  requireMode();
  validateFileKey(key);
  if (!isTauri()) throw new Error("Local file storage is available only in the Shelve desktop app.");
  if (activeMode !== "offline") throw new Error("Online mode uploads files directly to your account.");
  await saveLocalFile(key, file);
  await markOfflineDataPending();
}

export async function saveLocalFile(key: string, file: Blob): Promise<void> {
  validateFileKey(key);
  if (!isTauri()) throw new Error("Local file storage is available only in the Shelve desktop app.");
  await mkdir(FILES_DIRECTORY, { baseDir: BaseDirectory.AppData, recursive: true });
  await writeFile(`${FILES_DIRECTORY}/${key}`, new Uint8Array(await file.arrayBuffer()), { baseDir: BaseDirectory.AppData });
  await invoke("db_register_local_file", { fileKey: key, category: "files" });
}

export async function saveCoverFile(key: string, file: Blob): Promise<void> {
  requireMode();
  validateFileKey(key);
  if (!isTauri()) throw new Error("Local cover storage is available only in the Shelve desktop app.");
  if (activeMode !== "offline") throw new Error("Online covers must be uploaded to your account.");
  await writeCoverFile(key, file);
  await markOfflineDataPending();
}

export async function cacheCoverFile(key: string, file: Blob): Promise<void> {
  validateFileKey(key);
  if (!isTauri()) throw new Error("Local cover storage is available only in the Shelve desktop app.");
  await writeCoverFile(key, file);
}

async function writeCoverFile(key: string, file: Blob): Promise<void> {
  const directory = `${FILES_DIRECTORY}/covers`;
  await mkdir(directory, { baseDir: BaseDirectory.AppData, recursive: true });
  await writeFile(`${directory}/${key}`, new Uint8Array(await file.arrayBuffer()), { baseDir: BaseDirectory.AppData });
  await invoke("db_register_local_file", { fileKey: key, category: "covers" });
}

export async function readCoverFile(key: string, mimeType?: string, fileName?: string): Promise<Blob | null> {
  validateFileKey(key);
  if (!isTauri()) throw new Error("Offline cover storage is available only in the Shelve desktop app.");
  const path = `${FILES_DIRECTORY}/covers/${key}`;
  if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return null;
  const data = await readAppFile(path, { baseDir: BaseDirectory.AppData });
  return withMimeType(new Blob([data]), mimeType, fileName);
}

function withMimeType(file: Blob, mimeType?: string, fileName?: string): Blob {
  const fileMimeTypes: Record<string, string> = {
    avif: "image/avif",
    bmp: "image/bmp",
    epub: "application/epub+zip",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    ico: "image/x-icon",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    mobi: "application/x-mobipocket-ebook",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    tif: "image/tiff",
    tiff: "image/tiff",
    webp: "image/webp",
  };
  const extension = fileName?.split(".").pop()?.toLowerCase();
  const type = fileMimeTypes[extension ?? ""] || mimeType?.trim() || file.type;
  return type && file.type !== type ? file.slice(0, file.size, type) : file;
}

export async function readLocalFile(key: string, mimeType?: string, fileName?: string): Promise<Blob | null> {
  validateFileKey(key);
  if (!isTauri()) throw new Error("Offline file storage is available only in the Shelve desktop app.");
  const path = `${FILES_DIRECTORY}/${key}`;
  if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return null;
  const data = await readAppFile(path, { baseDir: BaseDirectory.AppData });
  return withMimeType(new Blob([data]), mimeType, fileName);
}

export async function readFile(key: string, mimeType?: string, fileName?: string): Promise<Blob | null> {
  if (requireMode() !== "offline") {
    throw new Error("Online files must be read by their server filename.");
  }
  return readLocalFile(key, mimeType, fileName);
}

export async function resolveFileUrl(
  key: string,
  mimeType?: string,
  fileName?: string,
  remoteFileName?: string,
  kind: "books" | "covers" = "books",
): Promise<ResolvedFileUrl | null> {
  const mode = requireMode();
  const file = mode === "cloud"
    ? remoteFileName
      ? await downloadApiFile(requireToken(), kind, remoteFileName)
      : null
    : kind === "covers"
      ? (await readCoverFile(key, mimeType, fileName)) ?? await readLocalFile(key, mimeType, fileName)
      : await readLocalFile(key, mimeType, fileName);
  if (!file) return null;
  const typedFile = withMimeType(file, mimeType, fileName);
  return { url: URL.createObjectURL(typedFile), revoke: true };
}

export async function removeFile(key: string): Promise<void> {
  if (requireMode() === "cloud") return;
  validateFileKey(key);
  for (const path of [`${FILES_DIRECTORY}/${key}`, `${FILES_DIRECTORY}/covers/${key}`]) {
    if (await exists(path, { baseDir: BaseDirectory.AppData })) {
      await remove(path, { baseDir: BaseDirectory.AppData });
    }
  }
  await invoke("db_unregister_local_file", { fileKey: key });
}

export async function cleanupOrphanLocalFiles(): Promise<number> {
  if (!isTauri()) return 0;
  const files = await invoke<Array<{ key: string; category: "files" | "covers" }>>("db_get_orphan_local_files");
  let removed = 0;
  for (const file of files) {
    validateFileKey(file.key);
    const path = file.category === "covers"
      ? `${FILES_DIRECTORY}/covers/${file.key}`
      : `${FILES_DIRECTORY}/${file.key}`;
    if (await exists(path, { baseDir: BaseDirectory.AppData })) {
      await remove(path, { baseDir: BaseDirectory.AppData });
    }
    await invoke("db_unregister_local_file", { fileKey: file.key });
    removed++;
  }
  return removed;
}

export type LocalDataResetScope = "library" | "all";

export async function deleteLocalData(scope: LocalDataResetScope): Promise<void> {
  if (!isTauri()) throw new Error("Local data deletion is available only in the Shelve desktop app.");
  await invoke("db_clear_local_data", { clearSettings: scope === "all" });
  if (await exists(FILES_DIRECTORY, { baseDir: BaseDirectory.AppData })) {
    await remove(FILES_DIRECTORY, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  if (scope === "all") {
    await clearAuthSession();
    localStorage.clear();
    activeMode = null;
    activeToken = null;
  } else {
    for (const key of Object.keys(localStorage)) {
      if (/^reader-(?:bookmarks|direction|pdf-zoom)-/.test(key)) localStorage.removeItem(key);
    }
  }
  cachedBooks.clear();
  cachedRecords.clear();
  await emit("shelve:library-refresh");
}

async function getSetting(key: string): Promise<string | null> {
  if (isTauri()) return invoke<string | null>("db_get_setting", { key });
  return localStorage.getItem(key);
}

async function setSetting(key: string, value: string): Promise<void> {
  if (isTauri()) {
    await invoke("db_save_setting", { key, value });
  } else {
    localStorage.setItem(key, value);
  }
}

function isProfileAvatar(value: string): boolean {
  return /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export async function loadProfileAvatar(): Promise<string | null> {
  const avatar = await getSetting(storageKeys.profileAvatar);
  if (!avatar) return null;
  if (!isProfileAvatar(avatar)) {
    throw new Error("The saved profile photo is invalid.");
  }
  return avatar;
}

export async function saveProfileAvatar(avatar: string | null): Promise<void> {
  if (avatar !== null && !isProfileAvatar(avatar)) {
    throw new Error("The profile photo must be a supported image.");
  }
  await setSetting(storageKeys.profileAvatar, avatar ?? "");
}

export async function loadNotificationsDoNotDisturb(): Promise<boolean> {
  const value = await getSetting(storageKeys.notificationsDoNotDisturb);
  if (value === null || value === "false") return false;
  if (value === "true") return true;
  throw new Error("The Do Not Disturb setting is invalid.");
}

export async function saveNotificationsDoNotDisturb(enabled: boolean): Promise<void> {
  await setSetting(storageKeys.notificationsDoNotDisturb, String(enabled));
}

export async function loadText(key: string, fallback: string): Promise<string> {
  if (key !== storageKeys.writing) throw new Error("Unsupported local text setting.");
  const writings = await loadRecords<StoredRecord & { content?: string }>("writings");
  return writings.find((writing) => writing.id === WRITING_ID)?.content ?? fallback;
}

export async function saveText(key: string, value: string): Promise<void> {
  if (key !== storageKeys.writing) throw new Error("Unsupported local text setting.");
  const writings = await loadRecords<StoredRecord & { title?: string; content?: string }>("writings");
  const previous = writings.find((writing) => writing.id === WRITING_ID);
  const writing = {
    ...previous,
    id: WRITING_ID,
    title: "Untitled note",
    content: value,
    updatedAt: new Date().toISOString(),
  };
  await saveRecords("writings", [...writings.filter((item) => item.id !== WRITING_ID), writing]);
}

export async function loadStorageMode(): Promise<StorageMode | null> {
  const mode = await getSetting(MODE_KEY);
  if (mode === "offline" && !isTauri()) return "cloud";
  return mode === "offline" || mode === "cloud" ? mode : null;
}

export async function saveStorageMode(mode: StorageMode): Promise<void> {
  if (mode === "offline" && !isTauri()) {
    throw new Error("Offline mode is unavailable in the Web app.");
  }
  await setSetting(MODE_KEY, mode);
}

export async function loadRecords<T extends StoredRecord>(collection: StorageCollection): Promise<T[]> {
  const mode = requireMode();
  const values = mode === "cloud"
    ? await apiRequest(collectionPaths[collection], { method: "GET" }, requireToken())
    : await invoke<unknown>(localCommands[collection].get);
  if (!Array.isArray(values) || !values.every((record) => isRecord(record) && typeof record.id === "string")) {
    throw new Error(`The storage provider returned invalid ${collection} data.`);
  }
  const records = (values as T[]).filter((record) => !record.deletedAt);
  const cache = new Map<string, StoredRecord>();
  for (const record of records) cache.set(record.id, record);
  cachedRecords.set(collection, cache);
  if (mode === "offline" && records.length > 0) await markOfflineDataPending();
  if (!isTauri()) return records;
  if (collection === "writings") {
    const localProjects = await loadLocalWritingProjects();
    const merged = new Map<string, StoredRecord>();
    for (const record of records) merged.set(record.id, record);
    for (const project of localProjects) merged.set(project.id, project);
    return Array.from(merged.values()) as T[];
  }
  if (collection === "writingSessions") {
    const localSessions = await loadLocalWritingSessions(await loadLocalWritingProjects());
    const merged = new Map<string, StoredRecord>();
    for (const record of records) merged.set(record.id, record);
    for (const session of localSessions) merged.set(session.id, session);
    return Array.from(merged.values()) as T[];
  }
  return records;
}

async function saveRecord(collection: StorageCollection, record: StoredRecord, previous?: StoredRecord): Promise<StoredRecord> {
  const mode = requireMode();
  const updated = { ...record, updatedAt: record.updatedAt ?? new Date().toISOString() };
  if (mode === "offline") {
    if (previous && JSON.stringify(previous) === JSON.stringify(updated)) return previous;
    await invoke(localCommands[collection].save, { [recordArgument(collection)]: updated });
    await markOfflineDataPending();
    return updated;
  }

  const token = requireToken();
  const path = collectionPaths[collection];
  if (!previous) {
    const created = await apiRequest(path, { method: "POST", body: JSON.stringify(updated) }, token);
    if (!isRecord(created) || typeof created.id !== "string") {
      throw new Error(`The Shelve server returned an invalid ${collection} record.`);
    }
    return created as StoredRecord;
  }
  const updates = changedFields(previous, updated);
  if (Object.keys(updates).length === 0) return previous;
  const saved = await apiRequest(`${path}/${encodeURIComponent(record.id)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  }, token);
  if (!isRecord(saved) || typeof saved.id !== "string") {
    throw new Error(`The Shelve server returned an invalid ${collection} record.`);
  }
  return saved as StoredRecord;
}

function recordArgument(collection: StorageCollection): string {
  switch (collection) {
    case "notes": return "note";
    case "writings": return "writing";
    case "readingPlans": return "readingPlan";
    case "readingSessions": return "readingSession";
    case "writingSessions": return "writingSession";
  }
}

async function deleteRecord(collection: StorageCollection, id: string): Promise<void> {
  const mode = requireMode();
  const updatedAt = new Date().toISOString();
  if (mode === "offline") {
    const argument = collection === "notes" ? "noteId"
      : collection === "writings" ? "writingId"
        : collection === "readingPlans" ? "readingPlanId"
          : collection === "readingSessions" ? "readingSessionId"
            : "writingSessionId";
    await invoke(localCommands[collection].remove, { [argument]: id, updatedAt });
    await markOfflineDataPending();
  } else {
    await apiRequest(`${collectionPaths[collection]}/${encodeURIComponent(id)}`, { method: "DELETE" }, requireToken());
  }
}

export async function saveRecords<T extends StoredRecord>(collection: StorageCollection, records: T[]): Promise<void> {
  const mode = requireMode();
  if (collection === "writings") await saveLocalWritingProjects(records);
  let localWritingProjects: LocalWritingProject[] = [];
  if (collection === "writingSessions" && isTauri()) {
    localWritingProjects = await loadLocalWritingProjects();
    await saveLocalWritingSessions(records, localWritingProjects);
  }
  const localProjectsById = new Map(localWritingProjects.map((project) => [project.id, project]));
  const shouldSaveOnline = (record: StoredRecord) => {
    if (collection === "writings") return typeof record.localPath !== "string" || record.syncOnline === true;
    if (collection === "writingSessions" && typeof record.projectId === "string") {
      const localProject = localProjectsById.get(record.projectId);
      return !localProject || localProject.syncOnline === true;
    }
    return true;
  };
  const providerRecords = collection === "writings" || collection === "writingSessions"
    ? records.filter(shouldSaveOnline)
      .map((record) => mode === "cloud" ? projectForOnlineStorage(record) as T : record)
    : records;
  let previous = cachedRecords.get(collection);
  if (!previous) {
    await loadRecords(collection);
    previous = cachedRecords.get(collection) ?? new Map();
  }
  const incomingIds = new Set(providerRecords.map((record) => record.id));
  const next = new Map<string, StoredRecord>();
  for (const record of providerRecords) {
    if (!record.id) throw new Error(`Cannot save ${collection} without an id.`);
    const saved = await saveRecord(collection, record, previous.get(record.id));
    next.set(saved.id, saved);
  }
  for (const id of previous.keys()) {
    if (!incomingIds.has(id)) await deleteRecord(collection, id);
  }
  cachedRecords.set(collection, next);
  if (mode === "offline") await emit("shelve:records-updated");
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("The backup contains invalid file data.");
  }
  const binary = atob(value);
  if (binary.length > 50 * 1024 * 1024) throw new Error("A backup file exceeds the 50 MB import limit.");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function exportBackup(writing: string, includeFiles = true): Promise<Record<string, unknown>> {
  const mode = requireMode();
  const [books, notes, writings, readingPlans, readingSessions, writingSessions] = await Promise.all([
    loadBooks(),
    loadRecords("notes"),
    loadRecords("writings"),
    loadRecords("readingPlans"),
    loadRecords("readingSessions"),
    loadRecords("writingSessions"),
  ]);
  const portableWritings = writings.map((project) => ({ ...project }));
  const files: Record<string, string> = {};
  if (includeFiles) {
    const token = mode === "cloud" ? requireToken() : null;
    for (const book of books) {
      if (book.fileKey) {
        const file = mode === "cloud"
          ? book.remoteFileName ? await downloadApiFile(token!, "books", book.remoteFileName) : null
          : await readLocalFile(book.fileKey, book.fileMimeType, book.fileName);
        if (file) files[book.fileKey] = encodeBase64(new Uint8Array(await file.arrayBuffer()));
      }
      if (book.coverImage.startsWith("asset:")) {
        const key = book.coverImage.slice("asset:".length);
        const file = mode === "cloud"
          ? book.remoteCoverFileName ? await downloadApiFile(token!, "covers", book.remoteCoverFileName) : null
          : (await readCoverFile(key, book.coverMimeType, book.coverFileName))
            ?? await readLocalFile(key, book.coverMimeType, book.coverFileName);
        if (file) files[key] = encodeBase64(new Uint8Array(await file.arrayBuffer()));
      }
    }
    for (const project of portableWritings) {
      const design = project.coverDesign;
      if (!isRecord(design)) continue;
      const key = typeof design.imageKey === "string" ? design.imageKey : `writing-cover-${project.id}.png`;
      const image = mode === "cloud"
        ? typeof design.remoteImageName === "string" ? await downloadApiFile(token!, "covers", design.remoteImageName) : null
        : typeof design.imageKey === "string" ? await readCoverFile(design.imageKey) : null;
      if (image) {
        files[key] = encodeBase64(new Uint8Array(await image.arrayBuffer()));
        project.coverDesign = { ...design, imageKey: key };
      }
    }
  }
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), books, notes, writings: portableWritings, readingPlans, readingSessions, writingSessions, writing, files };
}

function isBookArray(value: unknown): value is Book[] {
  return Array.isArray(value) && value.every(isBook);
}

export async function importBackup(input: string): Promise<void> {
  const value = parseJson<unknown>(input, "The selected backup");
  if (!isRecord(value) || !isBookArray(value.books)) {
    throw new Error("The selected file is not a valid Shelve library backup.");
  }
  if (value.files !== undefined && !isRecord(value.files)) throw new Error("The backup contains invalid file data.");
  const files: Record<string, unknown> = isRecord(value.files) ? value.files : {};
  const writingCoverKeys = new Set(
    (Array.isArray(value.writings) ? value.writings : [])
      .filter(isRecord)
      .map((project) => isRecord(project.coverDesign) ? project.coverDesign.imageKey : undefined)
      .filter((key): key is string => typeof key === "string"),
  );
  const bookCoverKeys = new Set(
    value.books
      .filter((book) => book.coverImage.startsWith("asset:"))
      .map((book) => book.coverImage.slice("asset:".length)),
  );

  const mode = requireMode();
  const importedBooks = value.books.map((book) => ({ ...book }));
  const writingRecords = Array.isArray(value.writings) ? value.writings : [];
  if (mode === "offline") {
    for (const [key, encoded] of Object.entries(files)) {
      validateFileKey(key);
      if (typeof encoded !== "string") throw new Error("The backup contains invalid file data.");
      const bytes = decodeBase64(encoded);
      const blob = new Blob([bytesToArrayBuffer(bytes)]);
      if (writingCoverKeys.has(key) || bookCoverKeys.has(key)) await saveCoverFile(key, blob);
      else await saveFile(key, blob);
    }
    const payload = {
      ...value,
      books: importedBooks,
      writings: typeof value.writing === "string" && !writingRecords.some((item) => isRecord(item) && item.id === WRITING_ID)
        ? [...writingRecords, { id: WRITING_ID, title: "Untitled note", content: value.writing, updatedAt: new Date().toISOString() }]
        : writingRecords,
    };
    await invoke("db_import_merge_json", { payload });
    await markOfflineDataPending();
    return;
  }

  const token = requireToken();
  for (const book of importedBooks) {
    const bookFile = book.fileKey ? files[book.fileKey] : undefined;
    if (typeof bookFile === "string") {
      const blob = new Blob([bytesToArrayBuffer(decodeBase64(bookFile))], { type: book.fileMimeType });
      book.remoteFileName = await uploadApiFile(token, "books", new File([blob], book.fileName || "book.pdf", { type: blob.type }), book.fileKey ?? book.id);
    }
    if (book.coverImage.startsWith("asset:")) {
      const key = book.coverImage.slice("asset:".length);
      const coverFile = files[key];
      if (typeof coverFile === "string") {
        const blob = new Blob([bytesToArrayBuffer(decodeBase64(coverFile))], { type: book.coverMimeType });
        book.remoteCoverFileName = await uploadApiFile(token, "covers", new File([blob], book.coverFileName || "cover.jpg", { type: blob.type }), key);
        if (isTauri()) await cacheCoverFile(key, blob);
      }
    }
  }

  const cloudWritings = await Promise.all(writingRecords.map(async (item) => {
    if (!isRecord(item) || !isRecord(item.coverDesign)) return item;
    const design = { ...item.coverDesign };
    if (typeof design.imageKey === "string" && typeof files[design.imageKey] === "string") {
      const mimeType = typeof design.imageMimeType === "string" ? design.imageMimeType : "image/png";
      const fileName = typeof design.imageFileName === "string" ? design.imageFileName : "cover.png";
      const blob = new Blob([bytesToArrayBuffer(decodeBase64(files[design.imageKey] as string))], { type: mimeType });
      design.remoteImageName = await uploadApiFile(token, "covers", new File([blob], fileName, { type: blob.type }), design.imageKey);
    }
    return { ...item, coverDesign: design };
  }));
  const importedWritings = typeof value.writing === "string" && !cloudWritings.some((item) => isRecord(item) && item.id === WRITING_ID)
    ? [...cloudWritings, { id: WRITING_ID, title: "Untitled note", content: value.writing, updatedAt: new Date().toISOString() }]
    : cloudWritings;
  await apiRequest("/api/sync/merge", { method: "POST", body: JSON.stringify({ ...value, books: importedBooks, writings: importedWritings }) }, token);
  cachedBooks.clear();
  cachedRecords.clear();
  await Promise.all([
    loadBooks(),
    loadRecords("notes"),
    loadRecords("writings"),
    loadRecords("readingPlans"),
    loadRecords("readingSessions"),
    loadRecords("writingSessions"),
  ]);
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!isRecord(value) || !isRecord(value.user)) return false;
  return typeof value.token === "string" &&
    typeof value.expiresAt === "string" &&
    typeof value.user.id === "string" &&
    typeof value.user.name === "string" &&
    typeof value.user.email === "string";
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  if (!isAuthSession(session)) throw new Error("The sign-in response did not contain a valid session.");
  const serialized = JSON.stringify(session);
  if (isTauri()) {
    await invoke("store_auth_session", { session: serialized });
  } else {
    localStorage.setItem(AUTH_KEY, serialized);
  }
  window.dispatchEvent(new Event("shelve:jwt-refreshed"));
}

export async function loadAuthSession(): Promise<AuthSession | null> {
  const serialized = isTauri()
    ? await invoke<string | null>("load_auth_session")
    : localStorage.getItem(AUTH_KEY);
  if (!serialized) return null;
  const session = parseJson<unknown>(serialized, "The saved account session");
  if (!isAuthSession(session)) {
    await clearAuthSession();
    throw new Error("The saved account session is invalid. Please sign in again.");
  }
  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    await clearAuthSession();
    throw new Error("The saved account session has an invalid expiry. Please sign in again.");
  }
  if (expiresAt <= Date.now()) {
    await clearAuthSession();
    return null;
  }
  return session;
}

export async function clearAuthSession(): Promise<void> {
  if (isTauri()) {
    await invoke("clear_auth_session");
  } else {
    localStorage.removeItem(AUTH_KEY);
  }
}

export { WRITING_ID };
