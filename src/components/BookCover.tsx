import { useEffect, useState } from "react";
import { resolveFileUrl } from "../lib/storage";
import type { Book } from "../types";

interface BookCoverProps {
  book: Pick<Book, "title" | "coverImage" | "coverColor" | "coverMimeType" | "coverFileName" | "remoteCoverFileName">;
  className?: string;
}

export default function BookCover({ book, className = "" }: BookCoverProps) {
  const [resolvedCover, setResolvedCover] = useState(book.coverImage);

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;

    if (!book.coverImage.startsWith("asset:")) {
      setResolvedCover(book.coverImage);
      return;
    }

    resolveFileUrl(book.coverImage.slice("asset:".length), book.coverMimeType, book.coverFileName, book.remoteCoverFileName, "covers")
      .then((resolved) => {
        if (!resolved) throw new Error("The saved cover image could not be found.");
        if (cancelled) {
          if (resolved.revoke) URL.revokeObjectURL(resolved.url);
          return;
        }
        objectUrl = resolved.revoke ? resolved.url : undefined;
        setResolvedCover(resolved.url);
      })
      .catch((error: unknown) => {
        console.error("Could not load a book cover:", error);
        if (!cancelled) setResolvedCover("");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [book.coverImage, book.coverMimeType, book.coverFileName, book.remoteCoverFileName]);

  return (
    <div className={`book-cover ${book.coverColor} ${className}`}>
      {resolvedCover ? (
        <img
          src={resolvedCover}
          alt={`${book.title} cover`}
        />
      ) : (
        <div className="book-cover-placeholder" aria-label={`${book.title} cover`}>
          <span>{book.title}</span>
        </div>
      )}
    </div>
  );
}
