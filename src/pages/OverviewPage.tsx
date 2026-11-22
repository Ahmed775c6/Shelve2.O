import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, Clock9, Library, Sparkles, TrendingUp } from "lucide-react";
import BookCard from "../components/BookCard";
import BookCover from "../components/BookCover";
import { useLanguage } from "../components/language-provider";
import type { ScreenProps } from "./shared";
import { EmptyState } from "./shared";

interface OverviewPageProps extends ScreenProps {
  userName?: string;
}

export default function OverviewPage({
  books,
  userName,
  onNavigate,
  onOpenBook,
  onStartBook,
  onFinishBook,
  onAddBook,
}: OverviewPageProps) {
  const { locale, t } = useLanguage();
  const reading = books.filter((book) => book.status === "reading");
  const finished = books.filter((book) => book.status === "archived");
  const pages = books.reduce((total, book) => total + book.currentPage, 0);
  const [now, setNow] = useState(() => new Date());
  const hour = now.getHours();
  const greeting = hour < 12 ? t("Good morning") : hour < 18 ? t("Good afternoon") : t("Good evening");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="page-shell">
     
      <div className="welcome-row">
        <div>
          <span className="eyebrow">{t("YOUR PERSONAL LIBRARY")}</span>
          <h1 className="text-2xl font-bold capitalize">{greeting}, {userName?.trim() || t("Reader")} <span className="moon-mark">{hour < 18 ? "☀️" : "🌙"}</span></h1>
          <p>{t("A little progress each day adds up to a lot.")}</p>
        </div>
     
        <div className="date-card">
          <Clock9 size={15} />
          <span>{new Intl.DateTimeFormat(locale, { weekday: "long", month: "short", day: "numeric" }).format(now)}</span>
          <strong>{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now)}</strong>
        </div>
      </div>
      <div className="stats-grid">
        <div className="stat-card"><span>{t("Books on your shelf")}</span><strong>{new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(books.length)}</strong><small><Library size={13} /> {t("Your whole collection")}</small></div>
        <div className="stat-card stat-accent"><span>{t("Reading now")}</span><strong>{new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(reading.length)}</strong><small><BookOpen size={13} /> {t("Keep the pages turning")}</small></div>
        <div className="stat-card stat-green"><span>{t("Books finished")}</span><strong>{new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(finished.length)}</strong><small><Check size={13} /> {t("Stories well spent")}</small></div>
        <div className="stat-card"><span>{t("Pages read")}</span><strong>{pages.toLocaleString(locale)}</strong><small><TrendingUp size={13} /> {t("Across your library")}</small></div>
      </div>
      {reading.length > 0 && (
        <section className="content-section">
          <div className="reading-section-heading">
            <h2>{t("Currently reading")}</h2>
            <div aria-hidden="true" />
          </div>
          <div className="currently-reading-grid">
            {reading.map((book) => {
              const progress = book.totalPages > 0
                ? Math.min(100, Math.max(0, (book.currentPage / book.totalPages) * 100))
                : 0;

              return (
                <article key={book.id} className="reading-book-card">
                  <BookCover book={book} className="reading-cover" />
                  <div className="reading-card-main">
                    <span className="reading-card-status">{t("Currently reading")}</span>
                    <h3>{book.title}</h3>
                    <p>{book.author} · {book.category} · {t("Added")} {new Date(book.uploadedAt).toLocaleDateString(locale)}</p>
                    <div className="reading-card-progress">
                      <div className="reading-card-progress-track">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                      <div className="reading-card-progress-meta">
                        <span>{t("Page")} {book.currentPage.toLocaleString(locale)} {t("of")} {book.totalPages ? book.totalPages.toLocaleString(locale) : "—"}</span>
                        <span>{Math.round(progress).toLocaleString(locale)}% · {t("last read")} {now.toLocaleDateString(locale)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="reading-card-actions">
                    <button className="reading-card-resume" onClick={() => onStartBook(book)}>
                      <BookOpen size={14} /> {t("Resume reading")}
                    </button>
                    <button className="reading-card-details" onClick={() => onOpenBook(book)}>
                      {t("Book details")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <section className="content-section">
        <div className="section-heading">
          <div><span className="eyebrow">{t("THE STACK")}</span></div>
          <button className="text-button" onClick={() => onNavigate("library")}>{t("Browse library")} <ArrowRight size={14} /></button>
        </div>
            <div className="flex items-center gap-3 mb-4.5">
          <h2 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">{t("Your shelf")}</h2>
          <div className="flex-1 h-px bg-[var(--border-subtle)]"></div>
        </div>
        {books.length ? (
          <div className="book-grid">
            {books.slice(0, 4).map((book) => (
              <BookCard key={book.id} book={book} onOpen={() => onOpenBook(book)} onStart={() => onStartBook(book)} onFinish={() => onFinishBook(book)} />
            ))}
          </div>
        ) : <EmptyState title="Your shelf is waiting" detail="Add a book and make this library your own." onAdd={onAddBook} />}
      </section>
      <section className="recommendation-banner">
        <div className="recommendation-icon"><Sparkles size={18} /></div>
        <div><span className="eyebrow">{t("LIVE BOOK CATALOG")}</span><h3>{t("Explore Open Library")}</h3><p>{t("Search real catalog records and add a book to your shelf.")}</p></div>
        <button className="button button-outline" onClick={() => onNavigate("recommendations")}>{t("Explore")} <ArrowRight size={14} /></button>
      </section>
    </div>
  );
}
