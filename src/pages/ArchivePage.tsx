import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BookOpen, Check, ChevronDown, Circle, Clock3, Info, ListFilter, RotateCcw, Star, StickyNote, Trophy } from "lucide-react";
import BookCover from "../components/BookCover";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import { loadRecords, type StoredRecord } from "../lib/storage";
import type { AppView, Book } from "../types";
import { SectionTitle } from "./shared";

type ArchiveSort = "recent" | "rating" | "pages";
type RatingFilter = "all" | "rated" | "unrated";

interface ArchiveNote extends StoredRecord {
  bookId: string;
  content: string;
  kind?: string;
  createdAt?: string;
}

interface ArchivePageProps {
  books: Book[];
  onOpenBook: (book: Book) => void;
  onReadBook: (book: Book) => void;
  onUpdateBook: (book: Book) => void;
  onNavigate: (view: AppView) => void;
}

interface ArchiveDropdownOption<Value extends string> {
  value: Value;
  label: string;
  icon: ReactNode;
}

function ArchiveDropdown<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: ArchiveDropdownOption<Value>[];
  onChange: (value: Value) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(selectedIndex);
    optionRefs.current[selectedIndex]?.focus();
  }, [isOpen, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isOpen]);

  const focusOption = (index: number) => {
    if (!options.length) return;
    const nextIndex = (index + options.length) % options.length;
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  const selectOption = (nextValue: Value) => {
    onChange(nextValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[index];
      if (option) selectOption(option.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className="archive-select" ref={rootRef}>
      <span className="archive-select-label">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="archive-select-trigger"
        role="combobox"
        aria-label={`${label}: ${selectedOption?.label ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <span>{selectedOption?.label}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {isOpen && (
        <div id={listboxId} className="archive-select-menu" role="listbox" aria-label={label}>
          <div className="archive-select-menu-heading">{label}</div>
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <div
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                className="archive-select-option"
                role="option"
                aria-selected={selected}
                tabIndex={activeIndex === index ? 0 : -1}
                onFocus={() => setActiveIndex(index)}
                onClick={() => selectOption(option.value)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span className="archive-select-option-icon" aria-hidden="true">{option.icon}</span>
                <span className="archive-select-option-label">{option.label}</span>
                {selected && <Check className="archive-select-option-check" size={15} aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function finishedTimestamp(book: Book): number {
  if (!book.finishedAt) return 0;
  const timestamp = new Date(book.finishedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function ArchiveBookCard({
  book,
  reflection,
  locale,
  t,
  onRate,
  onRead,
  onOpenDetails,
  onMoveToReading,
}: {
  book: Book;
  reflection?: ArchiveNote;
  locale: string;
  t: (key: string) => string;
  onRate: (rating: number) => void;
  onRead: () => void;
  onOpenDetails: () => void;
  onMoveToReading: () => void;
}) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const rating = typeof book.rating === "number" && book.rating >= 1 && book.rating <= 5
    ? book.rating
    : 0;
  const shownRating = hoverRating ?? rating;
  const finishedDate = book.finishedAt
    ? new Date(book.finishedAt)
    : null;
  const dateLabel = finishedDate && !Number.isNaN(finishedDate.getTime())
    ? `${t("Finished")} ${finishedDate.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}`
    : t("Recently");
  const reflectionPreview = reflection?.content.replace(/\s+/g, " ").trim();

  return (
    <article className="archive-trophy-card">
      <div className="archive-trophy-cover-wrap">
        <BookCover book={book} className="archive-trophy-cover" />
        <span className="archive-completed-ribbon"><Check size={10} /> {t("Completed")}</span>
      </div>
      <div className="archive-trophy-content">
        <header className="archive-trophy-heading">
          <div>
            <h2 title={book.title}>{book.title}</h2>
            <p title={book.author}>{book.author}</p>
          </div>
          <span className="archive-category-pill">{book.category}</span>
        </header>

        <div className="archive-rating" role="group" aria-label={`${t("Rate book")}: ${book.title}`} onMouseLeave={() => setHoverRating(null)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              type="button"
              key={value}
              className="archive-rating-star"
              aria-label={`${t("Rate")} ${value}`}
              aria-pressed={rating === value}
              onMouseEnter={() => setHoverRating(value)}
              onFocus={() => setHoverRating(value)}
              onBlur={() => setHoverRating(null)}
              onClick={() => onRate(value)}
            >
              <Star size={15} fill={value <= shownRating ? "currentColor" : "none"} />
            </button>
          ))}
          <span>{rating ? `${rating}/5` : t("Not rated")}</span>
        </div>

        <div className="archive-completion-meta">
          <span><Clock3 size={12} /> {dateLabel}</span>
          <span><BookOpen size={12} /> {book.totalPages.toLocaleString(locale)} {t(book.totalPages === 1 ? "page" : "pages")}</span>
        </div>

        <div className="archive-reflection">
          {reflectionPreview ? (
            <blockquote title={reflectionPreview}>{`“${reflectionPreview}”`}</blockquote>
          ) : (
            <button type="button" className="archive-add-reflection" onClick={onOpenDetails}>
              <StickyNote size={12} /> {t("Add reflection")}
            </button>
          )}
        </div>

        <footer className="archive-trophy-actions">
          <button type="button" className="archive-reread-action" onClick={onRead}>
            <BookOpen size={13} /> {t("Re-read")}
          </button>
          <button type="button" onClick={onOpenDetails}>
            <Info size={13} /> {t("View notes / details")}
          </button>
          <button type="button" onClick={onMoveToReading}>
            <RotateCcw size={13} /> {t("Move back to Reading")}
          </button>
        </footer>
      </div>
    </article>
  );
}

export default function ArchivePage({ books, onOpenBook, onReadBook, onUpdateBook, onNavigate }: ArchivePageProps) {
  const { locale, t } = useLanguage();
  const archived = books.filter((book) => book.status === "archived");
  const [sortBy, setSortBy] = useState<ArchiveSort>("recent");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [notes, setNotes] = useState<ArchiveNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setNotesLoading(true);
    setNotesError("");
    loadRecords<ArchiveNote>("notes")
      .then((records) => {
        if (!cancelled) setNotes(records.filter((note) => note.kind !== "reader-highlight" && note.content?.trim()));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Could not load finished-book reflections:", error);
          setNotesError(error instanceof Error ? error.message : t("Could not load reflections."));
        }
      })
      .finally(() => {
        if (!cancelled) setNotesLoading(false);
      });
    return () => { cancelled = true; };
  }, [t]);

  const reflectionsByBook = useMemo(() => {
    const newestFirst = [...notes].sort((a, b) => {
      const aDate = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const bDate = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
    });
    const result = new Map<string, ArchiveNote>();
    for (const note of newestFirst) {
      if (!result.has(note.bookId)) result.set(note.bookId, note);
    }
    return result;
  }, [notes]);

  const ratedBooks = archived.filter((book) => typeof book.rating === "number" && book.rating >= 1 && book.rating <= 5);
  const totalPages = archived.reduce((total, book) => total + Math.max(0, book.totalPages), 0);
  const averageRating = ratedBooks.length
    ? ratedBooks.reduce((total, book) => total + (book.rating ?? 0), 0) / ratedBooks.length
    : null;

  const visibleBooks = archived
    .filter((book) => ratingFilter === "all" || (ratingFilter === "rated" ? ratedBooks.includes(book) : !ratedBooks.includes(book)))
    .sort((a, b) => {
      if (sortBy === "rating") return (b.rating ?? 0) - (a.rating ?? 0) || finishedTimestamp(b) - finishedTimestamp(a);
      if (sortBy === "pages") return b.totalPages - a.totalPages || finishedTimestamp(b) - finishedTimestamp(a);
      return finishedTimestamp(b) - finishedTimestamp(a);
    });

  const updateRating = (book: Book, rating: number) => onUpdateBook({ ...book, rating });
  const moveBackToReading = (book: Book) => {
    const updatedBook: Book = {
      ...book,
      status: "reading",
      startedAt: book.startedAt ?? new Date().toISOString(),
    };
    delete updatedBook.finishedAt;
    onUpdateBook(updatedBook);
  };
  const countDetail = `${archived.length.toLocaleString(locale)} ${t(archived.length === 1 ? "book completed" : "books completed")}`;

  return (
    <div className="page-shell archive-page">
      <SectionTitle eyebrow="STORIES WELL SPENT" title="Finished books" detail={countDetail} />

      <section className="archive-milestones" aria-label={t("Completion milestones")}>
        <article className="archive-milestone">
          <span className="archive-milestone-icon"><Trophy size={16} /></span>
          <div><small>{t("Books completed")}</small><strong>{archived.length.toLocaleString(locale)}</strong></div>
        </article>
        <article className="archive-milestone">
          <span className="archive-milestone-icon"><BookOpen size={16} /></span>
          <div><small>{t("Total pages conquered")}</small><strong>{totalPages.toLocaleString(locale)}</strong></div>
        </article>
        <article className="archive-milestone">
          <span className="archive-milestone-icon"><Star size={16} /></span>
          <div><small>{t("Average rating")}</small><strong>{averageRating === null ? "—" : `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(averageRating)} / 5`}</strong></div>
        </article>
      </section>

      {!archived.length ? (
        <section className="archive-trophy-empty">
          <span className="archive-empty-trophy"><Trophy size={25} /></span>
          <h2>{t("Your trophy shelf is waiting")}</h2>
          <p>{t("Every finished book will find a place here. Pick up a story whenever you're ready.")}</p>
          <button type="button" className="button button-primary" onClick={() => onNavigate("reading")}>
            <BookOpen size={14} /> {t("Go to Reading now")}
          </button>
        </section>
      ) : (
        <>
          <div className="archive-sort-bar">
            <ArchiveDropdown
              label={t("Sort by")}
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: "recent", label: t("Recently finished"), icon: <Clock3 size={15} /> },
                { value: "rating", label: t("Highest rated"), icon: <Star size={15} /> },
                { value: "pages", label: t("Most pages"), icon: <BookOpen size={15} /> },
              ]}
            />
            <ArchiveDropdown
              label={t("Rating")}
              value={ratingFilter}
              onChange={setRatingFilter}
              options={[
                { value: "all", label: t("All ratings"), icon: <ListFilter size={15} /> },
                { value: "rated", label: t("Rated"), icon: <Star size={15} /> },
                { value: "unrated", label: t("Unrated"), icon: <Circle size={15} /> },
              ]}
            />
          </div>
          {notesError && <ErrorAlert className="archive-notes-error" message={notesError} />}
          {visibleBooks.length ? (
            <section className="archive-trophy-grid" aria-label={t("Finished books")}>
              {visibleBooks.map((book) => (
                <ArchiveBookCard
                  key={book.id}
                  book={book}
                  reflection={reflectionsByBook.get(book.id)}
                  locale={locale}
                  t={t}
                  onRate={(rating) => updateRating(book, rating)}
                  onRead={() => onReadBook(book)}
                  onOpenDetails={() => onOpenBook(book)}
                  onMoveToReading={() => moveBackToReading(book)}
                />
              ))}
            </section>
          ) : (
            <div className="archive-filter-empty">{t("No books match these filters.")}</div>
          )}
          {notesLoading && <p className="archive-notes-loading" role="status">{t("Loading notes…")}</p>}
        </>
      )}
    </div>
  );
}
