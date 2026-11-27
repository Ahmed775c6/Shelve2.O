import { useEffect, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronUp, ExternalLink, Globe, PenLine, X } from "lucide-react";
import type { Book, WritingChapter } from "../types";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import { SectionTitle } from "./shared";
import { apiRequest, getApiBaseUrl } from "../lib/api";

interface PublicBookResult {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
  edition_count?: number;
  subject?: string[];
  language?: string[];
  first_sentence?: string | string[];
  has_fulltext?: boolean;
  public_scan_b?: boolean;
  ia?: string[];
  ebook_access?: "no_ebook" | "printdisabled" | "borrowable" | "public";
}

function hasPublicPdf(book: PublicBookResult): boolean {
  return book.ebook_access === "public" && Array.isArray(book.ia) && book.ia.length > 0;
}

function hasPublicPreview(book: PublicBookResult): boolean {
  return (book.public_scan_b === true || book.ebook_access === "public") &&
    Array.isArray(book.ia) && book.ia.length > 0;
}

function getPreviewText(book: PublicBookResult): string {
  return Array.isArray(book.first_sentence)
    ? book.first_sentence[0] || ""
    : book.first_sentence || "";
}

interface PublicWriting {
  id: string;
  title: string;
  subtitle?: string;
  genre?: string;
  synopsis?: string;
  coverColor?: string;
  coverImage?: string;
  chapters?: WritingChapter[];
  authorName?: string;
  wordCount?: number;
}

interface ShelvePublicBook {
  id: string;
  title: string;
  author: string;
  category?: string;
  description?: string;
  coverImage?: string;
  coverColor?: string;
  totalPages?: number;
  fileName?: string;
  fileMimeType?: string;
  coverFileName?: string;
  coverMimeType?: string;
  publicFileUrl?: string;
}

export default function PublicLibraryPage({ books, onAdd }: { books: Book[]; onAdd: (book: Book, file?: File, cover?: File) => Promise<void> }) {
  const { locale, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicBookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [publicWritings, setPublicWritings] = useState<PublicWriting[]>([]);
  const [publicWritingError, setPublicWritingError] = useState("");
  const [shelveBooks, setShelveBooks] = useState<ShelvePublicBook[]>([]);
  const [shelveBooksError, setShelveBooksError] = useState("");
  const [expandedWriting, setExpandedWriting] = useState<string | null>(null);
  const [addingPublicBook, setAddingPublicBook] = useState<string | null>(null);
  const [addingBook, setAddingBook] = useState<string | null>(null);
  const [addError, setAddError] = useState("");
  const [selectedResultKey, setSelectedResultKey] = useState<string | null>(null);
  const [readingResult, setReadingResult] = useState<PublicBookResult | null>(null);

  useEffect(() => {
    if (!readingResult) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReadingResult(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [readingResult]);

  useEffect(() => {
    let active = true;
    const loadPublicWritings = async () => {
      try {
        const payload = await apiRequest("/api/public/writings");
        if (!Array.isArray(payload) || !payload.every((item) =>
          typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" &&
          "title" in item && typeof item.title === "string",
        )) throw new Error(t("The Shelve server returned invalid public writings."));
        if (active) setPublicWritings(payload as PublicWriting[]);
      } catch (loadError) {
        console.error("Could not load public Shelve writings:", loadError);
        if (active) setPublicWritingError(loadError instanceof Error ? loadError.message : t("Could not load public writings."));
      }
    };
    const loadShelveBooks = async () => {
      try {
        const payload = await apiRequest("/api/public/books");
        if (!Array.isArray(payload) || !payload.every((item) =>
          typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" &&
          "title" in item && typeof item.title === "string" &&
          "author" in item && typeof item.author === "string",
        )) throw new Error(t("The Shelve server returned invalid public books."));
        if (active) setShelveBooks(payload as ShelvePublicBook[]);
      } catch (loadError) {
        console.error("Could not load Shelve Library books:", loadError);
        if (active) setShelveBooksError(loadError instanceof Error ? loadError.message : t("Could not load public books."));
      }
    };
    void loadPublicWritings();
    void loadShelveBooks();
    return () => { active = false; };
  }, [t]);

  const addPublishedBook = async (published: ShelvePublicBook) => {
    setAddingPublicBook(published.id);
    try {
      const fetchPublicAsset = async (path: string, name: string): Promise<File> => {
        const response = await fetch(`${getApiBaseUrl()}${path}`);
        if (!response.ok) throw new Error(t("Could not download the published book file."));
        const blob = await response.blob();
        if (blob.size === 0) throw new Error(t("The published book file is empty."));
        return new File([blob], name, { type: blob.type || "application/octet-stream" });
      };
      const publicFileUrl = published.publicFileUrl ||
        (published.fileName ? `/api/public/books/${encodeURIComponent(published.id)}/assets/book` : undefined);
      const file = publicFileUrl && published.fileName
        ? await fetchPublicAsset(publicFileUrl, published.fileName)
        : undefined;
      const cover = published.coverImage?.startsWith("/api/public/")
        ? await fetchPublicAsset(published.coverImage, published.coverFileName || "cover.jpg")
        : undefined;
      const coverKey = cover ? crypto.randomUUID() : undefined;
      const book: Book = {
        id: crypto.randomUUID(),
        title: published.title,
        author: published.author,
        category: published.category || t("Public Library"),
        description: published.description || "",
        coverImage: coverKey ? `asset:${coverKey}` : published.coverImage || "",
        coverColor: published.coverColor || "cover-blue",
        totalPages: published.totalPages || 0,
        currentPage: 0,
        status: "unread",
        uploadedAt: new Date().toISOString(),
        fileName: file?.name,
        fileKey: file ? crypto.randomUUID() : undefined,
        fileMimeType: file?.type,
        coverFileName: cover?.name,
        coverMimeType: cover?.type,
      };
      await onAdd(book, file, cover);
    } catch (addError) {
      console.error("Could not add a published book:", addError);
      setAddError(addError instanceof Error ? addError.message : t("Could not add that book to your library."));
    } finally {
      setAddingPublicBook(null);
    }
  };

  const addBookToLibrary = async (key: string, book: Book, publicResult?: PublicBookResult) => {
    setAddingBook(key);
    setAddError("");
    try {
      if (publicResult && hasPublicPdf(publicResult)) {
        const iaId = publicResult.ia?.[0];
        if (!iaId) throw new Error(t("Could not download this public-domain PDF."));
        const response = await fetch(`${getApiBaseUrl()}/api/public/openlibrary-pdf/${encodeURIComponent(iaId)}`);
        if (!response.ok) {
          let reason = `${response.status} ${response.statusText}`.trim();
          try {
            const payload: unknown = await response.json();
            if (
              typeof payload === "object" &&
              payload !== null &&
              "error" in payload &&
              typeof payload.error === "object" &&
              payload.error !== null &&
              "message" in payload.error &&
              typeof payload.error.message === "string"
            ) reason = payload.error.message;
          } catch {
            // Keep the HTTP status when the proxy error is not JSON.
          }
          throw new Error(`${t("Could not download this public-domain PDF.")} ${reason}`);
        }
        const blob = await response.blob();
        if (blob.size === 0 || blob.type.toLowerCase() !== "application/pdf") {
          throw new Error(t("The PDF download returned an empty or invalid file."));
        }
        const fileName = `${publicResult.title}.pdf`;
        const pdfFile = new File([blob], fileName, { type: "application/pdf" });
        await onAdd({
          ...book,
          fileName,
          fileKey: crypto.randomUUID(),
          fileMimeType: "application/pdf",
        }, pdfFile);
      } else {
        await onAdd(book);
      }
    } catch (addError) {
      console.error("Could not add a public book:", addError);
      setAddError(addError instanceof Error ? addError.message : t("Could not add that book to your library."));
    } finally {
      setAddingBook(null);
    }
  };

  const search = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: term,
        limit: "18",
        has_fulltext: "true",
        fields: "key,title,author_name,first_publish_year,cover_i,number_of_pages_median,edition_count,subject,language,first_sentence,ia,has_fulltext,public_scan_b,ebook_access",
      });
      const response = await fetch(`https://openlibrary.org/search.json?${params}`);
      if (!response.ok) throw new Error(t("Open Library search is unavailable. Try again later."));
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || !("docs" in payload) || !Array.isArray(payload.docs)) {
        throw new Error(t("Open Library returned an unexpected response."));
      }
      const nextResults = payload.docs.filter((book): book is PublicBookResult =>
        Boolean(
          book &&
          typeof book === "object" &&
          "key" in book &&
          typeof book.key === "string" &&
          "title" in book &&
          typeof book.title === "string",
        ),
      );
      setResults(nextResults);
      setSelectedResultKey(nextResults[0]?.key ?? null);
    } catch (searchError) {
      console.error("Public book search failed:", searchError);
      setError(t(searchError instanceof Error ? searchError.message : "Could not search Open Library."));
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <SectionTitle eyebrow={t("A WORLD OF STORIES")} title={t("Shelve Library")} detail={t("Discover books published for the community or search the Open Library catalog.")} />
      {shelveBooksError && <ErrorAlert className="public-search-error" message={shelveBooksError} />}
      {addError && <ErrorAlert className="public-search-error" message={addError} />}
      {shelveBooks.length > 0 && <section className="public-writings-section">
        <div className="public-writings-heading"><div><h2><BookOpen size={17} /> {t("Shelve Library")}</h2><p>{t("Books published by Shelve administrators for everyone.")}</p></div><span>{shelveBooks.length} {t("books")}</span></div>
        <div className="public-writings-grid">
          {shelveBooks.map((published) => {
            const alreadyAdded = books.some((book) => book.title.toLowerCase() === published.title.toLowerCase());
            const book: Book = {
              id: crypto.randomUUID(),
              title: published.title,
              author: published.author,
              category: published.category || t("Public Library"),
              description: published.description || "",
              coverImage: published.coverImage?.startsWith("/api/public/")
                ? `${getApiBaseUrl()}${published.coverImage}`
                : published.coverImage || "",
              coverColor: published.coverColor || "cover-blue",
              totalPages: published.totalPages || 0,
              currentPage: 0,
              status: "unread",
              uploadedAt: new Date().toISOString(),
            };
            return <article className="public-writing-card" key={published.id}>
              <div className="public-writing-cover" style={book.coverImage ? { backgroundImage: `url("${book.coverImage}")` } : { backgroundColor: book.coverColor }}>
                {!book.coverImage && <BookOpen size={24} />}
              </div>
              <div className="public-writing-copy">
                <span className="public-writing-genre">{book.category}</span>
                <h3>{book.title}</h3>
                <small>{t("By")} {book.author}{book.totalPages ? ` · ${book.totalPages.toLocaleString(locale)} ${t("pages")}` : ""}</small>
                {book.description && <p className="public-writing-synopsis">{book.description}</p>}
                <div className="public-writing-actions">
                  <button type="button" className={`button ${alreadyAdded ? "button-outline" : "button-primary"}`} disabled={alreadyAdded || addingPublicBook === published.id} onClick={() => { setAddError(""); void addPublishedBook(published); }}>
                    {alreadyAdded ? <><Check size={13} /> {t("Added")}</> : addingPublicBook === published.id ? t("Adding...") : t("Add to library")}
                  </button>
                </div>
              </div>
            </article>;
          })}
        </div>
      </section>}
      {publicWritingError && <ErrorAlert className="public-search-error" message={publicWritingError} />}
      {publicWritings.length > 0 && <section className="public-writings-section">
        <div className="public-writings-heading"><div><h2><PenLine size={17} /> {t("Stories by Shelve writers")}</h2><p>{t("Discover original stories shared by the community.")}</p></div><span>{publicWritings.length} {t("stories")}</span></div>
        <div className="public-writings-grid">
          {publicWritings.map((writing) => {
            const story = writing.chapters?.map((chapter) => `${chapter.title}\n\n${chapter.content}`).join("\n\n") ?? "";
            const expanded = expandedWriting === writing.id;
            const alreadyAdded = books.some((book) => book.title.toLowerCase() === writing.title.toLowerCase());
            const coverClass = writing.coverColor?.startsWith("cover-") ? writing.coverColor : "cover-purple";
            return <article className="public-writing-card" key={writing.id}>
              <div className={`public-writing-cover ${coverClass}`} style={writing.coverImage ? { backgroundImage: `url("${writing.coverImage}")` } : { backgroundColor: writing.coverColor }}>
                {!writing.coverImage && <BookOpen size={24} />}
              </div>
              <div className="public-writing-copy">
                <span className="public-writing-genre">{writing.genre || t("Original story")}</span>
                <h3>{writing.title}</h3>
                {writing.subtitle && <p className="public-writing-subtitle">{writing.subtitle}</p>}
                <small>{t("By")} {writing.authorName || t("Shelve writer")}{writing.wordCount ? ` · ${writing.wordCount.toLocaleString(locale)} ${t("words")}` : ""}</small>
                {writing.synopsis && <p className="public-writing-synopsis">{writing.synopsis}</p>}
                <div className="public-writing-actions">
                  <button type="button" className="button button-outline" onClick={() => setExpandedWriting(expanded ? null : writing.id)}>{expanded ? <><ChevronUp size={13} /> {t("Close story")}</> : <><ChevronDown size={13} /> {t("Read preview")}</>}</button>
                  <button type="button" className={`button ${alreadyAdded ? "button-outline" : "button-primary"}`} disabled={alreadyAdded || addingBook === writing.id} onClick={() => void addBookToLibrary(writing.id, {
                    id: crypto.randomUUID(),
                    title: writing.title,
                    author: writing.authorName || t("Shelve writer"),
                    category: writing.genre || t("Original story"),
                    description: writing.synopsis || "",
                    story,
                    coverImage: writing.coverImage || "",
                    coverColor: coverClass,
                    totalPages: Math.max(1, Math.ceil((writing.wordCount || 0) / 300)),
                    currentPage: 0,
                    status: "unread",
                    uploadedAt: new Date().toISOString(),
                  })}>{alreadyAdded ? <><Check size={13} /> {t("Added")}</> : addingBook === writing.id ? t("Adding...") : t("Add to library")}</button>
                </div>
                {expanded && <div className="public-writing-reader">{writing.chapters?.map((chapter) => <section key={chapter.id}><h4>{chapter.title}</h4><p>{chapter.content}</p></section>)}</div>}
              </div>
            </article>;
          })}
        </div>
      </section>}
      <form className="public-search" onSubmit={(event) => void search(event)}>
        <Globe size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search by title, author or subject")} aria-label={t("Search public library")} />
        <button className="button button-primary" disabled={loading || !query.trim()}>{loading ? t("Searching...") : t("Search")}</button>
      </form>
      {error && <ErrorAlert className="public-search-error" message={error} />}
      {results.length > 0 && (
        <div className="public-library-layout">
          <section className="public-results-section" aria-label={t("Open Library search results")}>
            <div className="public-results-heading">
              <h2>{t("Open Library results")}</h2>
              <span>{results.length} {t("books")}</span>
            </div>
            <div className="public-results">
            {results.map((result) => {
            const title = result.title;
            const author = result.author_name?.[0] ?? t("Unknown author");
            const image = result.cover_i ? `https://covers.openlibrary.org/b/id/${result.cover_i}-M.jpg` : "";
            const readable = hasPublicPreview(result);
            const selected = selectedResultKey === result.key;
            const alreadyAdded = books.some((book) => book.title.toLowerCase() === title.toLowerCase());
            const book: Book = {
              id: crypto.randomUUID(),
              title,
              author,
              category: "Public Library",
              description: `First published${result.first_publish_year ? ` in ${result.first_publish_year}` : ""}. Added from Open Library.`,
              coverImage: image,
              coverColor: "cover-blue",
              totalPages: result.number_of_pages_median ?? 0,
              currentPage: 0,
              status: "unread",
              uploadedAt: new Date().toISOString(),
            };
            return (
              <article className={`public-result ${selected ? "public-result-selected" : ""}`} key={result.key}>
                <div className="public-cover">{image ? <img src={image} alt={`${title} cover`} loading="lazy" /> : <BookOpen size={22} />}</div>
                <div className="public-result-copy">
                  <button type="button" className="public-result-select" onClick={() => setSelectedResultKey(result.key)} aria-pressed={selected}>
                    <h3>{title}</h3>
                    <p>{author}</p>
                  </button>
                  <small>{result.first_publish_year?.toLocaleString(locale) ?? t("Publication year unavailable")}{result.number_of_pages_median ? ` · ${result.number_of_pages_median.toLocaleString(locale)} ${t("pages")}` : ""}</small>
                  <span className={`public-pdf-badge ${readable ? "public-pdf-available" : "public-pdf-metadata"}`}>{readable ? t("Public preview available") : t("Preview unavailable")}</span>
                  <div className="public-result-actions">
                    <button type="button" className="button button-outline" onClick={() => setSelectedResultKey(result.key)}>{t("Preview details")}</button>
                    <button type="button" className={`button ${alreadyAdded ? "button-outline" : "button-primary"}`} disabled={alreadyAdded || addingBook === result.key} onClick={() => void addBookToLibrary(result.key, book, result)}>
                      {alreadyAdded ? <><Check size={14} /> {t("Added")}</> : addingBook === result.key ? t("Adding...") : t("Add to library")}
                    </button>
                  </div>
                </div>
              </article>
            );
            })}
            </div>
          </section>
          {(() => {
            const selected = results.find((result) => result.key === selectedResultKey);
            if (!selected) return null;
            const readable = hasPublicPreview(selected);
            const image = selected.cover_i ? `https://covers.openlibrary.org/b/id/${selected.cover_i}-L.jpg` : "";
            const subjects = selected.subject?.slice(0, 5).join(" · ");
            return <aside className="public-preview-panel" aria-label={t("Book preview")}>
              <h2><BookOpen size={15} /> {t("Book preview")}</h2>
              {image ? <img className="public-preview-cover" src={image} alt={`${selected.title} cover`} loading="lazy" /> : <div className="public-preview-cover public-preview-cover-empty"><BookOpen size={28} /></div>}
              <h3>{selected.title}</h3>
              <p className="public-preview-author">{t("By")} {selected.author_name?.slice(0, 3).join(", ") || t("Unknown author")}</p>
              <div className="public-preview-details">
                <span><strong>{t("First published")}</strong> {selected.first_publish_year ?? "—"}</span>
                <span><strong>{t("Editions")}</strong> {selected.edition_count ?? "—"}</span>
                <span><strong>{t("Access")}</strong> {selected.ebook_access || t("Unknown")}</span>
              </div>
              {subjects && <p className="public-preview-subjects"><strong>{t("Subjects")}</strong> {subjects}</p>}
              <p className="public-preview-description">{getPreviewText(selected) || t("No preview text available for this edition.")}</p>
              <div className="public-preview-actions">
                <button type="button" className="button button-primary" disabled={!readable} onClick={() => setReadingResult(selected)}>
                  <BookOpen size={13} /> {readable ? t("Read online") : t("Preview unavailable")}
                </button>
                <a className="button button-outline" href={`https://openlibrary.org${selected.key}`} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} /> {t("Details")}
                </a>
              </div>
            </aside>;
          })()}
        </div>
      )}
      {!loading && !error && results.length === 0 && <div className="public-empty"><Globe size={23} /><p>{t("Search millions of books from the Open Library catalog.")}</p><small>{t("Search results require an internet connection.")}</small></div>}
      {readingResult && readingResult.ia?.[0] && <div className="public-reader-overlay" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setReadingResult(null);
      }}>
        <section className="public-reader-dialog" role="dialog" aria-modal="true" aria-labelledby="public-reader-title">
          <header><h2 id="public-reader-title">{readingResult.title}</h2><button type="button" className="icon-button" onClick={() => setReadingResult(null)} aria-label={t("Close")}><X size={18} /></button></header>
          <iframe
            src={`https://archive.org/embed/${encodeURIComponent(readingResult.ia[0])}`}
            title={`${readingResult.title} ${t("Online reader")}`}
            allow="fullscreen"
            allowFullScreen
          />
        </section>
      </div>}
    </div>
  );
}
