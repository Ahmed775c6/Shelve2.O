import Book3D from "./Book3D";
import { useLanguage } from "./language-provider";
import type { Book } from "../types";

interface BookCardProps {
  book: Book;
  onOpen: () => void;
  onStart: () => void;
  onFinish: () => void;
}

export default function BookCard({ book, onOpen, onStart, onFinish }: BookCardProps) {
  const { t } = useLanguage();
  const progress = book.totalPages > 0 ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)) : 0;
  const statusLabel = book.status === "archived"
    ? t("Finished") + " 🥳"
    : book.status === "reading"
      ? `${t("In progress")} ${progress}% 🤓`
      : t("Pending");
  const badgeColor = book.status === "archived"
    ? "status-finished"
    : book.category === "Fantasy"
      ? "status-fantasy"
      : book.category === "Sci-fi"
        ? "status-scifi"
        : "status-default";

  return (
    <article className="book-card book-card-3d">
      <Book3D
        title={book.title}
        author={book.author}
        coverColor={book.coverColor}
        coverImage={book.coverImage}
        coverMimeType={book.coverMimeType}
        coverFileName={book.coverFileName}
        remoteCoverFileName={book.remoteCoverFileName}
        description={book.description}
        category={book.category}
        pages={book.totalPages}
        progress={progress}
      />
      <div className="book-status-rotated">
        <div className={`book-status-glass ${badgeColor}`}>
          <span className="book-status-label">{statusLabel}</span>
          {book.status === "unread" && <button type="button" className="book-status-primary" onClick={onStart}>{t("Start reading")}</button>}
          {book.status === "reading" && <button type="button" className="book-status-primary" onClick={onFinish}>{t("Finish it?")}</button>}
          <button type="button" className="book-status-secondary" onClick={onOpen}>{t("View details")}</button>
        </div>
      </div>
    </article>
  );
}
