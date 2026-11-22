import { useEffect, useState } from "react";
import { BookOpen, Check, ChevronDown, ChevronUp, Globe, PenLine } from "lucide-react";
import type { Book, WritingChapter } from "../types";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import { SectionTitle } from "./shared";
import { apiRequest } from "../lib/api";

interface PublicBookResult {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
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

export default function PublicLibraryPage({ books, onAdd }: { books: Book[]; onAdd: (book: Book) => void }) {
  const { locale, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicBookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [publicWritings, setPublicWritings] = useState<PublicWriting[]>([]);
  const [publicWritingError, setPublicWritingError] = useState("");
  const [expandedWriting, setExpandedWriting] = useState<string | null>(null);

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
    void loadPublicWritings();
    return () => { active = false; };
  }, [t]);

  const search = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: term, limit: "18", fields: "key,title,author_name,first_publish_year,cover_i,number_of_pages_median" });
      const response = await fetch(`https://openlibrary.org/search.json?${params}`);
      if (!response.ok) throw new Error(t("Open Library search is unavailable. Try again later."));
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || !("docs" in payload) || !Array.isArray(payload.docs)) {
        throw new Error(t("Open Library returned an unexpected response."));
      }
      setResults(payload.docs.filter((book): book is PublicBookResult =>
        Boolean(book && typeof book === "object" && "key" in book && typeof book.key === "string" && "title" in book && typeof book.title === "string"),
      ));
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
      <SectionTitle eyebrow="A WORLD OF STORIES" title="Public Library" detail="Find a book in Open Library and add it to your personal shelf." />
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
                  <button type="button" className={`button ${alreadyAdded ? "button-outline" : "button-primary"}`} disabled={alreadyAdded} onClick={() => onAdd({
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
                  })}>{alreadyAdded ? <><Check size={13} /> {t("Added")}</> : t("Add to library")}</button>
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
        <div className="public-results">
          {results.map((result) => {
            const title = result.title;
            const author = result.author_name?.[0] ?? t("Unknown author");
            const image = result.cover_i ? `https://covers.openlibrary.org/b/id/${result.cover_i}-M.jpg` : "";
            const alreadyAdded = books.some((book) => book.title.toLowerCase() === title.toLowerCase());
            const book: Book = {
              id: `open-library-${result.key.replace(/[^a-zA-Z0-9]/g, "-")}`,
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
              <article className="public-result" key={result.key}>
                <div className="public-cover">{image ? <img src={image} alt={`${title} cover`} loading="lazy" /> : <BookOpen size={22} />}</div>
                <div className="public-result-copy"><h3>{title}</h3><p>{author}</p><small>{result.first_publish_year?.toLocaleString(locale) ?? t("Publication year unavailable")}{result.number_of_pages_median ? ` · ${result.number_of_pages_median.toLocaleString(locale)} ${t("pages")}` : ""}</small>
                  <button className={`button ${alreadyAdded ? "button-outline" : "button-primary"}`} disabled={alreadyAdded} onClick={() => onAdd(book)}>
                    {alreadyAdded ? <><Check size={14} /> {t("Added")}</> : t("Add to library")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!loading && !error && results.length === 0 && <div className="public-empty"><Globe size={23} /><p>{t("Search millions of books from the Open Library catalog.")}</p><small>{t("Search results require an internet connection.")}</small></div>}
    </div>
  );
}
