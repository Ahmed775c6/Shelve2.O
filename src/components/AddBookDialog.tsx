import { useEffect, useState } from "react";
import { BookPlus, ImagePlus, UploadCloud } from "lucide-react";
import { useLanguage } from "./language-provider";
import { ErrorAlert } from "./error-feedback";
import CategoryCombobox from "./CategoryCombobox";
import type { Book } from "../types";

interface AddBookDialogProps {
  onClose: () => void;
  onSave: (book: Book, file?: File, cover?: File) => Promise<void>;
  standalone?: boolean;
}

const coverColors = ["cover-blue", "cover-purple", "cover-red", "cover-green", "cover-teal", "cover-amber", "cover-slate", "cover-rose"];

export default function AddBookDialog({ onClose, onSave, standalone = false }: AddBookDialogProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [pages, setPages] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File>();
  const [cover, setCover] = useState<File>();
  const [coverPreview, setCoverPreview] = useState("");
  const [coverColor, setCoverColor] = useState(coverColors[0]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  const selectCover = (selected?: File) => {
    if (!selected) return;
    if (!selected.type.startsWith("image/") || selected.size > 5 * 1024 * 1024) {
      setError(t("Choose an image smaller than 5 MB."));
      return;
    }
    setCover(selected);
    setCoverPreview(URL.createObjectURL(selected));
    setError("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (file && file.size > 50 * 1024 * 1024) {
      setError(t("Book files must be 50 MB or smaller."));
      return;
    }
    setSaving(true);
    setError("");
    const book: Book = {
      id: crypto.randomUUID(),
      title: title.trim(),
      author: author.trim(),
      category: category.trim() || "Uncategorized",
      description: description.trim(),
      coverImage: cover ? `asset:${crypto.randomUUID()}` : "",
      coverColor,
      totalPages: Number(pages) || 0,
      currentPage: 0,
      status: "unread",
      uploadedAt: new Date().toISOString(),
      fileName: file?.name,
      fileKey: file ? crypto.randomUUID() : undefined,
      fileMimeType: file?.type,
      coverFileName: cover?.name,
      coverMimeType: cover?.type,
    };
    try {
      await onSave(book, file, cover);
      onClose();
    } catch (saveError) {
      console.error("Could not add the book:", saveError);
      setError(t(saveError instanceof Error ? saveError.message : "The book could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={standalone ? "upload-book-page-dialog" : "dialog-backdrop"} role="presentation" onMouseDown={(event) => {
      if (!standalone && event.target === event.currentTarget) onClose();
    }}>
      <section className={`dialog add-book-dialog ${standalone ? "add-book-standalone" : ""}`} role="dialog" aria-modal={!standalone} aria-labelledby="add-book-title">
        <header className="dialog-header">
          <div><span className="eyebrow">{t("YOUR COLLECTION")}</span><h2 id="add-book-title">{t("Add a book")}</h2></div>
        </header>
        <form onSubmit={submit}>
          <div className="cover-picker">
            <div className="cover-picker-heading">
              <div className="cover-picker-title"><span>{t("Cover image")}</span><small>{t("Upload a custom cover or choose a color.")}</small></div>
              <label className="upload-cover"><ImagePlus size={17} /><span>{cover ? t("Change image") : t("Upload image")}</span><input type="file" accept="image/*" onChange={(event) => selectCover(event.target.files?.[0])} /></label>
            </div>
            <div className="cover-color-options">
              {coverColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`cover-swatch ${color} ${coverColor === color ? "selected" : ""}`}
                  onClick={() => setCoverColor(color)}
                  aria-label={`${t("Use")} ${t(color.replace("cover-", ""))} ${t("cover color")}`}
                  aria-pressed={coverColor === color}
                />
              ))}
              {coverPreview && <img className="cover-preview-thumb" src={coverPreview} alt={t("Selected cover preview")} />}
            </div>
          </div>
          <label className="file-drop">
            <input type="file" accept=".pdf,.epub,.mobi" onChange={(event) => setFile(event.target.files?.[0])} />
            <UploadCloud size={21} />
            <strong>{file?.name ?? t("Choose a book file")}</strong>
            <span>{t("PDF, ePub or MOBI · up to 50 MB · optional")}</span>
          </label>
          <div className="form-grid">
            <label>{t("Title")}<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Book title")} autoFocus /></label>
            <label>{t("Author")}<input required value={author} onChange={(event) => setAuthor(event.target.value)} placeholder={t("Author name")} /></label>
            <CategoryCombobox label={t("Category")} value={category} onChange={setCategory} placeholder={t("Choose or type a category")} />
            <label>{t("Total pages")}<input type="number" min="0" value={pages} onChange={(event) => setPages(event.target.value)} placeholder={t("Optional")} /></label>
          </div>
          <label className="form-label">{t("Description")}<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("A short note about this book")} /></label>
          {error && <ErrorAlert className="form-error" message={error} />}
          <footer className="dialog-footer">
            <button type="button" className="button button-outline" onClick={onClose}>{t("Cancel")}</button>
            <button className="button button-primary" disabled={saving}><BookPlus size={15} />{saving ? t("Adding...") : t("Add to library")}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
