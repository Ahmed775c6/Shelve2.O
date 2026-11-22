import { useEffect, useState } from "react";
import { resolveFileUrl } from "../lib/storage";
import { useLanguage } from "./language-provider";

interface Book3DProps {
  title: string;
  author: string;
  coverColor: string;
  coverImage?: string;
  coverMimeType?: string;
  coverFileName?: string;
  remoteCoverFileName?: string;
  description?: string;
  category?: string;
  pages?: number;
  progress?: number;
}

export default function Book3D({
  title,
  author,
  coverColor,
  coverImage,
  coverMimeType,
  coverFileName,
  remoteCoverFileName,
  description,
  category,
  pages,
  progress = 0,
}: Book3DProps) {
  const { locale, t } = useLanguage();
  const [flipped, setFlipped] = useState(false);
  const [resolvedCover, setResolvedCover] = useState(coverImage ?? "");
  const normalizedColor = coverColor.replace(/^cover-/, "c-");
  const circumference = 50.27;
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    if (!coverImage?.startsWith("asset:")) {
      setResolvedCover(coverImage ?? "");
      return;
    }
    resolveFileUrl(coverImage.slice("asset:".length), coverMimeType, coverFileName, remoteCoverFileName, "covers").then((resolved) => {
      if (!resolved) throw new Error("The saved cover image could not be found.");
      if (cancelled) {
        if (resolved.revoke) URL.revokeObjectURL(resolved.url);
        return;
      }
      objectUrl = resolved.revoke ? resolved.url : undefined;
      setResolvedCover(resolved.url);
    }).catch((error: unknown) => {
      console.error("Could not load a book cover:", error);
      if (!cancelled) setResolvedCover("");
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [coverImage, coverMimeType, coverFileName, remoteCoverFileName]);

  return (
    <button
      type="button"
      className="book-3d-button"
      aria-label={`${t("Flip book cover for")} ${title}`}
      aria-pressed={flipped}
      onClick={() => setFlipped((current) => !current)}
    >
      <span className="book-3d-wrap">
        <span className={`book-3d ${flipped ? "is-flipped" : ""}`}>
          <span className="book-front-cover">
            <span className={`book-front-half book-front-left ${!resolvedCover ? normalizedColor : ""}`}>
              {resolvedCover && <img src={resolvedCover} alt="" draggable={false} />}
            </span>
            <span className={`book-front-half book-front-right ${!resolvedCover ? normalizedColor : ""}`}>
              {resolvedCover && <img src={resolvedCover} alt={`${title} cover`} draggable={false} />}
            </span>
            {!resolvedCover && (
              <span className="book-cover-design">
                <span className="book-cover-line-left" />
                <span className="book-cover-line-right" />
                <span className="book-cover-title">
                  <span>{title}</span>
                  <small>{t("by")} {author}</small>
                </span>
              </span>
            )}
            {progress > 0 && (
              <svg className="book-progress-ring" viewBox="0 0 22 22" aria-label={`${progress.toLocaleString(locale)}% ${t("read")}`}>
                <circle cx="11" cy="11" r="8" fill="none" stroke="var(--border-strong)" strokeWidth="2.5" />
                <circle
                  cx="11"
                  cy="11"
                  r="8"
                  fill="none"
                  stroke="var(--progress-color)"
                  strokeWidth="2.5"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  transform="rotate(-90 11 11)"
                />
              </svg>
            )}
          </span>
          <span className="book-middle-left" />
          <span className="book-middle-right" />
          <span className="book-middle-top" />
          <span className="book-page-bottom" />
          <span className={`book-back-cover ${normalizedColor}`}>
            <span className="book-back-eyebrow">{t("Book details")}</span>
            <strong>{title}</strong>
            <small>{author}</small>
            <dl className="book-back-meta">
              {category && <div><dt>{t("Category")}</dt><dd>{category}</dd></div>}
              {pages ? <div><dt>{t("Pages")}</dt><dd>{pages.toLocaleString(locale)}</dd></div> : null}
            </dl>
            <span className="book-back-description">{description || t("A story waiting to be discovered.")}</span>
          </span>
        </span>
      </span>
    </button>
  );
}
