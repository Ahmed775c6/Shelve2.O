const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function apiRequest(path: string, options: RequestInit = {}, token?: string): Promise<unknown> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const body = await response.text();
  let payload: unknown;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    throw new Error("The Shelve server returned an invalid response.");
  }
  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : payload;
    const message = isRecord(error) && typeof error.message === "string"
      ? error.message
      : isRecord(error) && typeof error.error === "string"
        ? error.error
        : `The Shelve server returned HTTP ${response.status}.`;
    throw new ApiError(message, response.status, isRecord(error) && typeof error.code === "string" ? error.code : undefined);
  }
  return payload;
}

const uploadTypes = {
  books: new Map([
    [".pdf", ["application/pdf"]],
    [".epub", ["application/epub+zip", "application/zip"]],
    [".mobi", ["application/x-mobipocket-ebook", "application/octet-stream"]],
    [".txt", ["text/plain"]],
  ]),
  covers: new Map([
    [".png", ["image/png"]],
    [".jpg", ["image/jpeg"]],
    [".jpeg", ["image/jpeg"]],
    [".webp", ["image/webp"]],
  ]),
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function normalizeUploadId(kind: "books" | "covers", stableKey: string): Promise<string> {
  if (UUID_PATTERN.test(stableKey)) return stableKey.toLowerCase();
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`shelve-upload:${kind}:${stableKey}`),
  ));
  digest[6] = (digest[6] & 0x0f) | 0x80;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function uploadApiFile(
  token: string,
  kind: "books" | "covers",
  file: File,
  uploadId: string,
): Promise<string> {
  if (!token) throw new Error("Sign in before uploading files.");
  if (file.size === 0) throw new Error("Files must be larger than 0 bytes.");
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const acceptedTypes = uploadTypes[kind].get(extension);
  if (!acceptedTypes || (file.type && !acceptedTypes.includes(file.type))) {
    throw new Error("The file extension and MIME type are not supported for this upload.");
  }
  const stableUploadId = await normalizeUploadId(kind, uploadId);
  const form = new FormData();
  form.set("type", kind);
  form.set("uploadId", stableUploadId);
  form.set("file", file);
  const payload = await apiRequest("/api/upload", { method: "POST", body: form }, token);
  if (!isRecord(payload) || typeof payload.filename !== "string") {
    throw new Error("The Shelve server did not return a valid uploaded file.");
  }
  return payload.filename;
}

export async function downloadApiFile(token: string, kind: "books" | "covers", filename: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/files/${kind}/${encodeURIComponent(filename)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let message = `The Shelve server returned HTTP ${response.status} while downloading a book file.`;
    try {
      const payload: unknown = await response.json();
      const error = isRecord(payload) && isRecord(payload.error) ? payload.error : payload;
      if (isRecord(error) && typeof error.message === "string") message = error.message;
    } catch {
      // The response body may not contain JSON.
    }
    throw new ApiError(message, response.status);
  }
  return response.blob();
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
