import { useState } from "react";
import { Plus, Search } from "lucide-react";
import Bookshelf from "../components/Bookshelf";
import { useLanguage } from "../components/language-provider";
import type { BookStatus } from "../types";
import type { ScreenProps } from "./shared";
import { EmptyState, SectionTitle } from "./shared";

export default function LibraryPage({ books, search, onOpenBook, onStartBook, onAddBook }: ScreenProps) {
  const { locale, t } = useLanguage();
  const [filter, setFilter] = useState<"all" | BookStatus>("all");
  const filtered = books.filter((book) =>
    (filter === "all" || book.status === filter) &&
    (!search || `${book.title} ${book.author} ${book.category}`.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="page-shell">
      <SectionTitle
        eyebrow={t("COLLECTION OVERVIEW")}
        title={t("My library")}
        detail={`${books.length.toLocaleString(locale)} ${t("books across your collection")}`}
        action={<button className="button button-primary" onClick={onAddBook}><Plus size={15} /> {t("Add book")}</button>}
      />
      <div className="filter-bar">
        <div className="filter-search"><Search size={15} /><span>{search || t("Search by title, author or category")}</span></div>
        <div className="filter-tabs">
          {(["all", "reading", "unread", "archived"] as const).map((key) => (
            <button key={key} className={filter === key ? "selected" : ""} onClick={() => setFilter(key)}>
              {key === "all" ? t("All books") : key === "unread" ? t("To read") : key === "archived" ? t("Finished") : t("Reading")}
            </button>
          ))}
        </div>
      </div>
      {filtered.length ? (
        <Bookshelf
          books={filtered}
          ariaLabel={t("My library")}
          onOpenBook={onStartBook}
          onPrimaryAction={onStartBook}
          onViewDetails={onOpenBook}
          primaryActionLabel={(book) => book.status === "unread"
            ? t("Start reading")
            : book.status === "archived"
              ? t("Read again")
              : t("Continue reading")}
        />
      ) : (
        <EmptyState
          title={search ? t("No books found") : t("No books in this shelf")}
          detail={search ? t("Try another title, author or category.") : t("Add your first book to start a collection.")}
          onAdd={!search ? onAddBook : undefined}
        />
      )}
    </div>
  );
}
