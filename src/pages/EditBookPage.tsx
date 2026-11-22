import { useEffect, useRef, useState } from "react";
import { BookOpen, ImagePlus, Save, Trash2 } from "lucide-react";
import BookCover from "../components/BookCover";
import CategoryCombobox from "../components/CategoryCombobox";
import { useLanguage } from "../components/language-provider";
import { ErrorAlert } from "../components/error-feedback";
import type { Book } from "../types";

interface EditBookPageProps {
  book: Book;
  onSave: (book: Book, cover?: File) => Promise<void>;
  onCancel: () => void;
}

const coverColors = [
  "cover-blue",
  "cover-purple",
  "cover-red",
  "cover-green",
  "cover-teal",
  "cover-amber",
  "cover-slate",
  "cover-rose",
];

export default function EditBookPage({ book, onSave, onCancel }: EditBookPageProps) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(book);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview("");
      return;
    }

    const preview = URL.createObjectURL(coverFile);
    setCoverPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [coverFile]);

  const selectCover = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setError(t("Choose an image smaller than 5 MB."));
      return;
    }
    setCoverFile(file);
    setError("");
  };

  const removeCover = () => {
    setCoverFile(null);
    setDraft((current) => ({
      ...current,
      coverImage: "",
      coverFileName: "",
      coverMimeType: "",
      remoteCoverFileName: "",
    }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updatedBook: Book = {
        ...draft,
        title: draft.title.trim(),
        author: draft.author.trim(),
        category: draft.category.trim() || "Uncategorized",
        description: draft.description.trim(),
        coverImage: coverFile ? `asset:${crypto.randomUUID()}` : draft.coverImage,
        coverFileName: coverFile?.name ?? draft.coverFileName,
        coverMimeType: coverFile?.type ?? draft.coverMimeType,
        updatedAt: new Date().toISOString(),
      };
      await onSave(updatedBook, coverFile ?? undefined);
    } catch (saveError) {
      setError(t(saveError instanceof Error ? saveError.message : "Could not save this book."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-shell edit-book-page">
      <header className="edit-book-heading">
        <BookOpen size={18} />
        <div>
          <span className="eyebrow">{t("SHELVE / EDIT BOOK")}</span>
          <h1>{t("Edit Book")}</h1>
          <p>{t("Update the details in your library.")}</p>
        </div>
      </header>

      <form className="edit-book-form" onSubmit={(event) => void submit(event)}>
        <section className="edit-book-cover-section" aria-label={t("Book cover")}>
          <div className="edit-book-cover-preview">
            {coverPreview ? (
              <img src={coverPreview} alt={t("Selected cover preview")} />
            ) : draft.coverImage ? (
              <BookCover book={draft} className="edit-book-cover-image" />
            ) : (
              <div className={`edit-book-cover-placeholder ${draft.coverColor}`}>
                <span>{draft.title || t("No cover")}</span>
              </div>
            )}
          </div>
          <div className="edit-book-cover-actions">
            <span className="edit-book-label">{t("Book Cover")}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="edit-book-file-input"
              onChange={(event) => selectCover(event.target.files?.[0])}
            />
            <button type="button" className="button button-outline" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus size={15} />
              {draft.coverImage || coverFile ? t("Change image") : t("Upload image")}
            </button>
            {(draft.coverImage || coverFile) && (
              <button type="button" className="edit-book-remove-cover" onClick={removeCover}>
                <Trash2 size={14} />
                {t("Remove")}
              </button>
            )}
          </div>
        </section>

        <div className="edit-book-fields">
          <label>
            {t("Title")}
            <input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label>
            {t("Author")}
            <input required value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} />
          </label>
          <CategoryCombobox
            label={t("Category")}
            value={draft.category}
            onChange={(category) => setDraft((current) => ({ ...current, category }))}
            placeholder={t("Choose or type a category")}
          />
          <label>
            {t("Total pages")}
            <input
              type="number"
              min="0"
              value={draft.totalPages || ""}
              onChange={(event) => setDraft({ ...draft, totalPages: Number(event.target.value) || 0 })}
            />
          </label>
        </div>

        <div className="edit-book-textareas">
          <label>
            {t("Description")}
            <textarea rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </label>
          <label>
            {t("Story (optional)")}
            <textarea rows={4} value={draft.story ?? ""} onChange={(event) => setDraft({ ...draft, story: event.target.value })} />
          </label>
        </div>

        <fieldset className="edit-book-colors">
          <legend>{t("Cover Color")}</legend>
          <div>
            {coverColors.map((color) => (
              <button
                key={color}
                type="button"
                className={`cover-swatch ${color} ${draft.coverColor === color ? "selected" : ""}`}
                aria-label={`${t("Select")} ${t(color.replace("cover-", ""))} ${t("cover color")}`}
                aria-pressed={draft.coverColor === color}
                onClick={() => setDraft({ ...draft, coverColor: color })}
              />
            ))}
          </div>
        </fieldset>

        {error && <ErrorAlert className="form-error" message={error} />}

        <footer>
          <button type="button" className="button button-outline" onClick={onCancel}>{t("Cancel")}</button>
          <button type="submit" className="button button-primary" disabled={saving}>
            <Save size={15} />
            {saving ? t("Saving...") : t("Save changes")}
          </button>
        </footer>
      </form>
    </main>
  );
}
