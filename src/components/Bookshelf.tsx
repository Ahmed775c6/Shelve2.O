import { useEffect, useState } from "react";
import { BookOpen, Info } from "lucide-react";
import BookCover from "./BookCover";
import { useLanguage } from "./language-provider";
import type { Book } from "../types";

interface BookshelfProps {
  books: Book[];
  ariaLabel: string;
  onOpenBook: (book: Book) => void;
  onPrimaryAction: (book: Book) => void;
  onViewDetails: (book: Book) => void;
  primaryActionLabel?: (book: Book) => string;
}

function ShelfBook({
  book,
  onOpen,
  onPrimaryAction,
  onViewDetails,
  primaryActionLabel,
}: {
  book: Book;
  onOpen: () => void;
  onPrimaryAction: () => void;
  onViewDetails: () => void;
  primaryActionLabel: string;
}) {
  const { locale, t } = useLanguage();
  const progress = book.totalPages > 0
    ? Math.max(0, Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)))
    : 0;
  const progressLabel = `${progress.toLocaleString(locale)}% ${t("read")}`;

  return (
    <article className="reading-shelf-book">
      <button
        type="button"
        className="reading-shelf-cover-button"
        onClick={onOpen}
        aria-label={`${primaryActionLabel}: ${book.title}`}
        title={`${book.title} — ${book.author}`}
      >
        <span className="reading-shelf-book-volume">
          <BookCover book={book} className="reading-shelf-art" />
          <span className="reading-shelf-cover-sheen" />
          <span className="reading-shelf-ribbon" />
        </span>
      </button>
      <div
        className="reading-shelf-progress"
        role="progressbar"
        aria-label={`${book.title}: ${progressLabel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="reading-shelf-action-dock">
        <div className="reading-shelf-action-copy">
          <strong title={book.title}>{book.title}</strong>
          <span title={book.author}>{book.author}</span>
        </div>
        <span className="reading-shelf-progress-pill">{progressLabel}</span>
        <div className="reading-shelf-action-buttons">
          <button type="button" className="reading-shelf-continue" onClick={onPrimaryAction}>
            <BookOpen size={13} />
            {primaryActionLabel}
          </button>
          <button
            type="button"
            className="reading-shelf-details"
            onClick={onViewDetails}
            aria-label={`${t("Book details")}: ${book.title}`}
            title={t("Book details")}
          >
            <Info size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function Bookshelf({
  books,
  ariaLabel,
  onOpenBook,
  onPrimaryAction,
  onViewDetails,
  primaryActionLabel,
}: BookshelfProps) {
  const { t } = useLanguage();
  const [booksPerShelf, setBooksPerShelf] = useState(5);

  useEffect(() => {
    const updateBooksPerShelf = () => {
      const width = window.innerWidth;
      setBooksPerShelf(width <= 480 ? 2 : width <= 767 ? 3 : width <= 1100 ? 4 : 5);
    };

    updateBooksPerShelf();
    window.addEventListener("resize", updateBooksPerShelf);
    return () => window.removeEventListener("resize", updateBooksPerShelf);
  }, []);

  const shelves: Book[][] = [];
  for (let index = 0; index < books.length; index += booksPerShelf) {
    shelves.push(books.slice(index, index + booksPerShelf));
  }

  return (
    <div className="reading-bookshelves" aria-label={ariaLabel}>
      {shelves.map((shelf, shelfIndex) => (
        <section className="reading-shelf-row" key={`shelf-${shelfIndex}`} aria-label={`${ariaLabel} ${shelfIndex + 1}`}>
          <div
            className="reading-shelf-books"
            style={{ gridTemplateColumns: `repeat(${booksPerShelf}, minmax(0, 1fr))` }}
          >
            {shelf.map((book) => (
              <ShelfBook
                key={book.id}
                book={book}
                onOpen={() => onOpenBook(book)}
                onPrimaryAction={() => onPrimaryAction(book)}
                onViewDetails={() => onViewDetails(book)}
                primaryActionLabel={primaryActionLabel?.(book) ?? t("Continue reading")}
              />
            ))}
          </div>
          <div className="reading-shelf-ledge" aria-hidden="true" />
        </section>
      ))}
    </div>
  );
}
