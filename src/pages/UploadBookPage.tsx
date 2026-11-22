import AddBookDialog from "../components/AddBookDialog";
import type { Book } from "../types";

interface UploadBookPageProps {
  onSave: (book: Book, file?: File, cover?: File) => Promise<void>;
  onCancel: () => void;
}

export default function UploadBookPage({ onSave, onCancel }: UploadBookPageProps) {
  return <div className="upload-book-page"><AddBookDialog standalone onClose={onCancel} onSave={onSave} /></div>;
}
