import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clock3,
  MessageSquare,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import BookCover from "../components/BookCover";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import { useConfirmationDialog } from "../components/confirmation-dialog";
import { loadRecords, resolveFileUrl, saveRecords } from "../lib/storage";
import type { Book, BookStatus } from "../types";
import type { StoredRecord } from "../lib/storage";

interface BookDetailsPageProps {
  book: Book;
  onBack: () => void;
  onRead: () => void;
  onEdit: () => void;
  onUpdate: (book: Book) => void;
  onDelete: () => void;
}

interface BookNote extends StoredRecord {
  bookId: string;
  content: string;
  page?: number;
  isPrivate: boolean;
  createdAt?: string;
}

function formatDate(value: string | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

export default function BookDetailsPage({ book, onBack, onRead, onEdit, onUpdate, onDelete }: BookDetailsPageProps) {
  const { locale, t } = useLanguage();
  const { confirm, dialog: confirmationDialog } = useConfirmationDialog();
  const progress = book.totalPages > 0
    ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100))
    : 0;
  const [fileUrl, setFileUrl] = useState("");
  const [fileError, setFileError] = useState("");
  const [allNotes, setAllNotes] = useState<BookNote[]>([]);
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [noteError, setNoteError] = useState("");
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<BookNote | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [notePage, setNotePage] = useState<number | "">("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState("");

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    setFileUrl("");
    setFileError("");

    const fileKey = book.fileKey ?? book.remoteFileName;
    if (!fileKey) return;

    resolveFileUrl(fileKey, book.fileMimeType, book.fileName, book.remoteFileName, "books")
      .then((file) => {
        if (!file) throw new Error("The attached book file could not be found.");
        if (cancelled) {
          if (file.revoke) URL.revokeObjectURL(file.url);
          return;
        }
        objectUrl = file.revoke ? file.url : "";
        setFileUrl(file.url);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFileError(error instanceof Error ? error.message : "Could not load the attached book file.");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [book.fileKey, book.fileMimeType, book.fileName, book.remoteFileName]);

  useEffect(() => {
    let cancelled = false;
    setNotesLoading(true);
    setNoteError("");
    loadRecords<BookNote>("notes")
      .then((records) => {
        if (cancelled) return;
        setAllNotes(records);
        setNotes(records.filter((note) => note.bookId === book.id));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Could not load book notes:", error);
          setNoteError(error instanceof Error ? error.message : "Could not load notes for this book.");
        }
      })
      .finally(() => {
        if (!cancelled) setNotesLoading(false);
      });
    return () => { cancelled = true; };
  }, [book.id]);

  const updateStatus = (status: BookStatus) => {
    const now = new Date().toISOString();
    onUpdate({
      ...book,
      status,
      ...(status === "reading" ? { startedAt: book.startedAt ?? now } : {}),
      ...(status === "archived" ? { currentPage: book.totalPages || book.currentPage, finishedAt: now } : {}),
    });
  };

  const resetNoteEditor = () => {
    setShowNoteEditor(false);
    setEditingNote(null);
    setNoteContent("");
    setNotePage("");
    setIsPrivate(true);
  };

  const startEditNote = (note: BookNote) => {
    setEditingNote(note);
    setNoteContent(note.content);
    setNotePage(note.page ?? "");
    setIsPrivate(note.isPrivate);
    setShowNoteEditor(true);
  };

  const saveNote = async () => {
    if (!noteContent.trim() || notesLoading || noteError) return;
    setSavingNote(true);
    setNoteError("");
    const now = new Date().toISOString();
    const updatedNote: BookNote = editingNote
      ? {
          ...editingNote,
          content: noteContent.trim(),
          page: notePage || undefined,
          isPrivate,
          updatedAt: now,
        }
      : {
          id: crypto.randomUUID(),
          bookId: book.id,
          content: noteContent.trim(),
          page: notePage || undefined,
          isPrivate,
          createdAt: now,
          updatedAt: now,
        };
    const nextAllNotes = editingNote
      ? allNotes.map((note) => note.id === editingNote.id ? updatedNote : note)
      : [updatedNote, ...allNotes];

    try {
      await saveRecords("notes", nextAllNotes);
      setAllNotes(nextAllNotes);
      setNotes(nextAllNotes.filter((note) => note.bookId === book.id));
      resetNoteEditor();
    } catch (error) {
      console.error("Could not save book note:", error);
      setNoteError(error instanceof Error ? error.message : "Could not save this note.");
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!await confirm({
      title: t("Delete note?"),
      message: t("This action cannot be undone."),
      confirmLabel: t("Delete"),
    })) return;
    setDeletingNoteId(noteId);
    setNoteError("");
    const nextAllNotes = allNotes.filter((note) => note.id !== noteId);
    try {
      await saveRecords("notes", nextAllNotes);
      setAllNotes(nextAllNotes);
      setNotes(nextAllNotes.filter((note) => note.bookId === book.id));
    } catch (error) {
      console.error("Could not delete book note:", error);
      setNoteError(error instanceof Error ? error.message : "Could not delete this note.");
    } finally {
      setDeletingNoteId("");
    }
  };

  const isPdf = book.fileMimeType?.toLowerCase().includes("pdf") || book.fileName?.toLowerCase().endsWith(".pdf");
  const fileType = book.fileMimeType?.split("/").pop()?.toUpperCase()
    ?? book.fileName?.split(".").pop()?.toUpperCase()
    ?? "N/A";

  return (
    <div className="page-shell book-details-page">
      {confirmationDialog}
      <button className="text-button back-button" onClick={onBack}>
        <ArrowLeft size={15} /> {t("Back to library")}
      </button>

      <div className="book-detail-layout">
        <main className="book-detail-main">
          <header className="book-detail-heading">
            <div>
              <span className="eyebrow">{book.category.toUpperCase()}</span>
              <h1>{book.title}</h1>
              <p className="detail-author">{t("by")} {book.author}</p>
            </div>
            <button type="button" className="button button-outline" onClick={onEdit}>
              <Pencil size={14} /> {t("Edit book")}
            </button>
          </header>

          <section className="detail-status-card">
            <div className="detail-status-heading">
              <div>
                <span className="detail-section-label">{t("Status")}</span>
                <strong className="detail-status-value">{t(book.status[0].toUpperCase() + book.status.slice(1))}</strong>
              </div>
              <div className="detail-status-numbers">
                <span>{progress.toLocaleString(locale)}% {t("complete")}</span>
                <span>{book.currentPage.toLocaleString(locale)} / {book.totalPages ? book.totalPages.toLocaleString(locale) : "—"} {t("pages")}</span>
              </div>
            </div>
            <div className="detail-progress-track"><span style={{ width: `${progress}%` }} /></div>
            <div className="detail-status-actions">
              {book.status === "unread" && (
                <button className="button button-primary" onClick={() => updateStatus("reading")}>
                  <BookOpen size={15} /> {t("Start reading")}
                </button>
              )}
              {book.status === "reading" && (
                <button className="button button-primary" onClick={() => updateStatus("archived")}>
                  <Check size={15} /> {t("Mark finished")}
                </button>
              )}
              {book.status === "archived" && (
                <button className="button button-outline" onClick={() => updateStatus("unread")}>{t("Restore to unread")}</button>
              )}
              {book.status !== "archived" && (
                <button className="button button-outline" onClick={onRead}>
                  {book.status === "reading" ? t("Continue reading") : t("Open reader")}
                </button>
              )}
            </div>
          </section>

          {(book.fileKey || book.remoteFileName) && (
            <section className="detail-panel detail-reader-panel">
              <div className="detail-panel-heading">
                <h2>{t("Reader preview")}</h2>
                <span>{book.fileName || fileType}</span>
              </div>
              {fileError ? (
                <ErrorAlert className="detail-file-message" message={fileError} />
              ) : !fileUrl ? (
                <p className="detail-file-message" role="status">{t("Loading book file…")}</p>
              ) : isPdf ? (
                <iframe className="detail-pdf-preview" src={fileUrl} title={`${book.title} ${t("PDF preview")}`} />
              ) : (
                <div className="detail-file-message">
                  <p>{t("This file is attached to your book. Open it with the reader or download it to your device.")}</p>
                  <a href={fileUrl} target="_blank" rel="noreferrer">{t("Open attached file")}</a>
                </div>
              )}
            </section>
          )}
        </main>

        <aside className="book-detail-sidebar">
          <section className="detail-panel detail-notes-panel">
            <div className="detail-panel-heading">
              <h2><MessageSquare size={14} /> {t("Notes & Comments")}</h2>
              <button
                type="button"
                className="button button-primary detail-add-note"
                onClick={() => { resetNoteEditor(); setShowNoteEditor(true); }}
                disabled={notesLoading || Boolean(noteError)}
              >
                <Plus size={14} /> {t("Add note")}
              </button>
            </div>

            {noteError && <ErrorAlert className="form-error" message={noteError} />}

            {showNoteEditor && (
              <div className="detail-note-editor">
                <div className="detail-note-editor-heading">
                  <strong>{editingNote ? t("Edit note") : t("New note")}</strong>
                  <button type="button" className="icon-button" onClick={resetNoteEditor} aria-label={t("Close note editor")}>
                    <X size={14} />
                  </button>
                </div>
                <textarea
                  value={noteContent}
                  onChange={(event) => setNoteContent(event.target.value)}
                  placeholder={t("Write your thoughts about this book...")}
                  rows={3}
                />
                <div className="detail-note-options">
                  <label>
                    {t("Page")}
                    <input
                      type="number"
                      min="1"
                      value={notePage}
                      onChange={(event) => setNotePage(event.target.value ? Number(event.target.value) : "")}
                      placeholder={t("Optional")}
                    />
                  </label>
                  <label className="detail-private-note">
                    <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
                    {t("Private note")}
                  </label>
                </div>
                <div className="detail-note-editor-actions">
                  <button type="button" className="button button-outline" onClick={resetNoteEditor}>{t("Cancel")}</button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => void saveNote()}
                    disabled={!noteContent.trim() || savingNote}
                  >
                    <Save size={14} /> {savingNote ? t("Saving...") : editingNote ? t("Update") : t("Save")}
                  </button>
                </div>
              </div>
            )}

            {notesLoading ? (
              <p className="detail-notes-empty" role="status">{t("Loading notes…")}</p>
            ) : notes.length ? (
              <div className="detail-notes-list">
                {notes.map((note) => (
                  <article className="detail-note" key={note.id}>
                    <div className="detail-note-content">{note.content}</div>
                    <div className="detail-note-meta">
                      <span><Clock3 size={12} /> {formatDate(note.updatedAt || note.createdAt, locale)}</span>
                      {note.page && <span><BookOpen size={12} /> {t("Page")} {note.page.toLocaleString(locale)}</span>}
                      {note.isPrivate && <span className="detail-note-private">{t("Private")}</span>}
                    </div>
                    <div className="detail-note-actions">
                      <button type="button" onClick={() => startEditNote(note)} aria-label={t("Edit note")}><Pencil size={13} /></button>
                      <button
                        type="button"
                        onClick={() => void deleteNote(note.id)}
                        disabled={deletingNoteId === note.id}
                        aria-label={t("Delete note")}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="detail-notes-empty">
                <span aria-hidden="true">📝</span>
                <strong>{t("No notes yet")}</strong>
                <small>{t("Start adding your thoughts about this book.")}</small>
              </div>
            )}
          </section>

          <section className="detail-panel detail-book-info">
            <div className="detail-panel-heading">
              <h2>{t("Book details")}</h2>
              <button type="button" className="button button-danger" onClick={onDelete}>
                <Trash2 size={14} /> {t("Delete book")}
              </button>
            </div>
            <dl>
              <div><dt>{t("Category")}</dt><dd>{book.category}</dd></div>
              <div><dt>{t("Cover")}</dt><dd>{book.coverImage ? t("Custom image") : t(book.coverColor.replace("cover-", ""))}</dd></div>
              <div><dt>{t("File type")}</dt><dd>{fileType}</dd></div>
              <div><dt>{t("Uploaded")}</dt><dd>{formatDate(book.uploadedAt, locale)}</dd></div>
              {book.startedAt && <div><dt>{t("Started")}</dt><dd>{formatDate(book.startedAt, locale)}</dd></div>}
              {book.finishedAt && <div><dt>{t("Finished")}</dt><dd>{formatDate(book.finishedAt, locale)}</dd></div>}
            </dl>
            {book.description && (
              <div className="detail-description-block">
                <h3>{t("Description")}</h3>
                <p>{book.description}</p>
              </div>
            )}
            {book.story && (
              <div className="detail-description-block">
                <h3>{t("Story")}</h3>
                <p>{book.story}</p>
              </div>
            )}
          </section>

          <section className="detail-panel detail-cover-panel">
            <h2>{t("Book cover")}</h2>
            <BookCover book={book} className="detail-cover" />
          </section>
        </aside>
      </div>
    </div>
  );
}
