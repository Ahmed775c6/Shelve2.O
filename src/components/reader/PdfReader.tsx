import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { DocumentProps, PageProps } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import styles from "./PdfReader.module.css";
import { matchesShortcut } from "../../lib/keyboard-shortcuts";
import { useLanguage } from "../language-provider";

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfReaderProps {
  fileUrl: string;
  pageIndex: number;
  fitToPage: boolean;
  fitWidth?: boolean;
  zoom?: number;
  isRtl?: boolean;
  onPageChange: (pageIndex: number) => void;
  onDocumentLoad: (pageCount: number, document: PDFDocumentProxy) => void;
  onSpreadSizeChange?: (pagesPerSpread: number) => void;
}

export default function PdfReader({
  fileUrl,
  pageIndex,
  fitToPage,
  fitWidth = false,
  zoom = 1,
  isRtl = false,
  onPageChange,
  onDocumentLoad,
  onSpreadSizeChange,
}: PdfReaderProps) {
  const { t } = useLanguage();
  const readerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const lastTurnAt = useRef(0);
  const previousPageIndex = useRef(pageIndex);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [pageCount, setPageCount] = useState(0);
  const [pageAspectRatio, setPageAspectRatio] = useState(0.707);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [turnDirection, setTurnDirection] = useState<"forward" | "backward" | null>(null);

  useEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    resizeObserver.observe(reader);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;
    reader.scrollTop = 0;
  }, [fileUrl, pageIndex]);

  useEffect(() => {
    const previousIndex = previousPageIndex.current;
    previousPageIndex.current = pageIndex;
    if (previousIndex === pageIndex) return;

    setTurnDirection(pageIndex > previousIndex ? "forward" : "backward");
    const timeoutId = window.setTimeout(() => setTurnDirection(null), 900);
    return () => window.clearTimeout(timeoutId);
  }, [pageIndex]);

  const handleDocumentLoad = useCallback((document: Parameters<NonNullable<DocumentProps["onLoadSuccess"]>>[0]) => {
    setPageCount(document.numPages);
    setLoadError(null);
    onDocumentLoad(document.numPages, document);
  }, [onDocumentLoad]);

  const turnPage = useCallback((direction: -1 | 1) => {
    if (!pageCount || Date.now() - lastTurnAt.current < 250) return;

    const spreadSize = dimensions.width >= 760 ? 2 : 1;
    const nextPage = Math.max(0, Math.min(pageIndex + direction * spreadSize, pageCount - 1));
    if (nextPage !== pageIndex) {
      lastTurnAt.current = Date.now();
      onPageChange(nextPage);
    }
  }, [dimensions.width, onPageChange, pageCount, pageIndex]);

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartY.current;
    touchStartY.current = null;
    if (startY === null) return;

    const deltaY = startY - event.changedTouches[0].clientY;
    if (Math.abs(deltaY) > 48) {
      const reader = readerRef.current;
      const atTop = !reader || reader.scrollTop <= 0;
      const atBottom = !reader || reader.scrollTop + reader.clientHeight >= reader.scrollHeight - 1;
      if ((deltaY > 0 && !atBottom) || (deltaY < 0 && !atTop)) {
        if (reader) reader.scrollTop += deltaY;
        return;
      }

      turnPage(deltaY > 0 ? 1 : -1);
    }
  };

  const pagesPerSpread = dimensions.width >= 760 ? 2 : 1;
  useEffect(() => {
    onSpreadSizeChange?.(pagesPerSpread);
  }, [onSpreadSizeChange, pagesPerSpread]);

  const pageGap = pagesPerSpread === 2 ? 24 : 0;
  const availableWidth = Math.max(1, dimensions.width - 48 - pageGap);
  const pageWidth = fitToPage
    ? Math.max(1, Math.min(availableWidth / pagesPerSpread, (dimensions.height - 32) / pageAspectRatio))
    : fitWidth
      ? Math.max(1, availableWidth / pagesPerSpread)
    : Math.max(1, Math.min(600, availableWidth / pagesPerSpread));
  const pageScale = fitToPage || fitWidth ? 1 : zoom;

  return (
    <div
      ref={readerRef}
      className={`${styles.reader} ${fitToPage ? styles.fitToPage : ""}`}
      dir={isRtl ? "rtl" : "ltr"}
      onTouchStart={(event) => {
        touchStartY.current = event.touches[0].clientY;
      }}
      onTouchEnd={handleTouchEnd}
      onKeyDown={(event) => {
        if (matchesShortcut(event, "pdfNextPage")) {
          event.preventDefault();
          turnPage(1);
        } else if (matchesShortcut(event, "pdfPreviousPage")) {
          event.preventDefault();
          turnPage(-1);
        }
      }}
      role="region"
      tabIndex={0}
      aria-label={t("PDF reader. Scroll or swipe vertically to turn pages.")}
    >
      {loadError ? (
        <div className={styles.message} role="alert">{loadError}</div>
      ) : (
        <Document
          file={fileUrl}
          onLoadSuccess={handleDocumentLoad}
          onLoadError={(error) => {
            console.error("Error loading PDF:", error);
            setLoadError(t("Unable to load this PDF. Check your connection or open the file directly."));
          }}
          loading={<div className={styles.message}>{t("Loading PDF...")}</div>}
        >
          {pageCount > 0 && (
            <div
              className={[
                styles.spread,
                isRtl ? styles.rtl : "",
                pagesPerSpread === 2 && pageIndex + 1 < pageCount ? styles.twoPageSpread : "",
                pagesPerSpread === 2 && turnDirection === "forward" ? styles.forwardTurn : "",
                pagesPerSpread === 2 && turnDirection === "backward" ? styles.backwardTurn : "",
              ].filter(Boolean).join(" ")}
              aria-live="polite"
            >
              <Page
                pageNumber={pageIndex + 1}
                width={pageWidth}
                scale={pageScale}
                onLoadSuccess={(page: Parameters<NonNullable<PageProps["onLoadSuccess"]>>[0]) => {
                  const viewport = page.getViewport({ scale: 1 });
                  setPageAspectRatio(viewport.height / viewport.width);
                }}
                renderTextLayer
                renderAnnotationLayer
                loading={<div className={styles.message}>{t("Rendering page...")}</div>}
              />
              {pagesPerSpread === 2 && pageIndex + 1 < pageCount && (
                <Page
                  pageNumber={pageIndex + 2}
                  width={pageWidth}
                  scale={pageScale}
                  renderTextLayer
                  renderAnnotationLayer
                  loading={<div className={styles.message}>{t("Rendering page...")}</div>}
                />
              )}
            </div>
          )}
        </Document>
      )}
    </div>
  );
}
