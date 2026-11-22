import type { ReactNode } from "react";
import { Library } from "lucide-react";
import { useLanguage } from "../components/language-provider";

export interface ScreenProps {
  books: import("../types").Book[];
  search: string;
  onNavigate: (view: import("../types").AppView) => void;
  onOpenBook: (book: import("../types").Book) => void;
  onStartBook: (book: import("../types").Book) => void;
  onFinishBook: (book: import("../types").Book) => void;
  onUpdateBook: (book: import("../types").Book) => void;
  onAddBook: () => void;
}

export function SectionTitle({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="section-title">
      <div>
        <span className="eyebrow">{t(eyebrow)}</span>
        <h1>{t(title)}</h1>
        {detail && <p>{t(detail)}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  onAdd,
}: {
  title: string;
  detail: string;
  onAdd?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Library size={24} /></div>
      <h3>{t(title)}</h3>
      <p>{t(detail)}</p>
      {onAdd && <button className="button button-primary" onClick={onAdd}>{t("Add your first book")}</button>}
    </div>
  );
}
