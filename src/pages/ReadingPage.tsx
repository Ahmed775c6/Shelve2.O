import { Plus } from "lucide-react";
import Bookshelf from "../components/Bookshelf";
import { useLanguage } from "../components/language-provider";
import type { ScreenProps } from "./shared";
import { EmptyState, SectionTitle } from "./shared";

interface ReadingPageProps extends ScreenProps {
  onViewDetails: (book: ScreenProps["books"][number]) => void;
}

export default function ReadingPage({ books, onOpenBook, onViewDetails, onAddBook }: ReadingPageProps) {
  const { t } = useLanguage();
  const current = books.filter((book) => book.status === "reading");

  return (
    <div className="page-shell reading-page">
      <SectionTitle
        eyebrow="YOUR CURRENT CHAPTER"
        title="Reading now"
        detail="Pick up right where you left off."
        action={<button className="button button-outline" onClick={onAddBook}><Plus size={14} /> {t("Add book")}</button>}
      />
      {current.length ? (
        <Bookshelf
          books={current}
          ariaLabel={t("Reading now")}
          onOpenBook={onOpenBook}
          onPrimaryAction={onOpenBook}
          onViewDetails={onViewDetails}
        />
      ) : (
        <EmptyState
          title={t("Nothing on your nightstand")}
          detail={t("Choose a book from your library when you're ready to begin.")}
          onAdd={onAddBook}
        />
      )}
    </div>
  );
}
