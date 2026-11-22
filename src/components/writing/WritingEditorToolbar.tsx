import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, FilePlus, Image, Italic, Link2, List, ListChecks, ListOrdered,
  MoreHorizontal, Palette, Quote, Redo2, Replace, RotateCcw, SlidersHorizontal, Strikethrough, Table2, Underline, Undo2,
} from "lucide-react";
import { useLanguage } from "../language-provider";
import { StudioSelect } from "./StudioSelect";

interface WritingEditorToolbarProps {
  fontSize: number;
  lineSpacing: number;
  rulerVisible: boolean;
  onCommand: (command: string, value?: string) => void;
  onFontFamily: (family: string) => void;
  onFontSize: (size: number) => void;
  onDocumentStyle: (style: string) => void;
  onLineSpacing: (spacing: number) => void;
  onInsertChecklist: () => void;
  onInsertHtml: (html: string) => void;
  onInsertImage: () => void;
  onInsertDivider: (pageBreak?: boolean) => void;
  onInsertLink: () => void;
  onOpenFindReplace: () => void;
  onToggleRuler: () => void;
}

export function WritingEditorToolbar({
  fontSize,
  lineSpacing,
  rulerVisible,
  onCommand,
  onFontFamily,
  onFontSize,
  onDocumentStyle,
  onLineSpacing,
  onInsertChecklist,
  onInsertHtml,
  onInsertImage,
  onInsertDivider,
  onInsertLink,
  onOpenFindReplace,
  onToggleRuler,
}: WritingEditorToolbarProps) {
  const { t } = useLanguage();

  return (
    <div className="studio-word-ribbon" role="toolbar" aria-label={t("Document formatting ribbon")}>
      <div className="studio-ribbon-group">
        <button type="button" title={t("Undo")} aria-label={t("Undo")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("undo")}><Undo2 size={15} /></button>
        <button type="button" title={t("Redo")} aria-label={t("Redo")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("redo")}><Redo2 size={15} /></button>
        <button type="button" title={t("Clear formatting")} aria-label={t("Clear formatting")} onMouseDown={(event) => event.preventDefault()} onClick={() => { onCommand("removeFormat"); onCommand("formatBlock", "p"); }}><RotateCcw size={14} /></button>
      </div>
      <div className="studio-ribbon-group studio-ribbon-typography">
        <StudioSelect ariaLabel={t("Font family")} defaultValue="Georgia" className="studio-select-font" onMouseDown={(event) => event.stopPropagation()} onValueChange={onFontFamily} options={[
          { value: "serif", label: t("Serif") }, { value: "sans-serif", label: t("Sans") }, { value: "monospace", label: t("Mono") }, { value: "Georgia", label: "Georgia" }, { value: "Inter", label: "Inter" },
        ]} />
        <StudioSelect ariaLabel={t("Font size")} value={String(fontSize)} className="studio-select-size" onMouseDown={(event) => event.stopPropagation()} onValueChange={(value) => onFontSize(Number(value))} options={[12, 14, 16, 18, 20, 24, 28, 32].map((size) => ({ value: String(size), label: `${size}px` }))} />
        <StudioSelect ariaLabel={t("Text style")} defaultValue="normal" className="studio-select-style" onMouseDown={(event) => event.stopPropagation()} onValueChange={onDocumentStyle} options={[
          { value: "normal", label: t("Normal Text") }, { value: "title", label: t("Title") }, { value: "subtitle", label: t("Subtitle") }, { value: "heading1", label: t("Heading 1") }, { value: "heading2", label: t("Heading 2") }, { value: "heading3", label: t("Heading 3") }, { value: "quote", label: t("Quote") },
        ]} />
      </div>
      <div className="studio-ribbon-group">
        <button type="button" title={t("Bold")} aria-label={t("Bold")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("bold")}><Bold size={15} /></button>
        <button type="button" title={t("Italic")} aria-label={t("Italic")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("italic")}><Italic size={15} /></button>
        <button type="button" title={t("Underline")} aria-label={t("Underline")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("underline")}><Underline size={15} /></button>
        <button type="button" title={t("Strikethrough")} aria-label={t("Strikethrough")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("strikeThrough")}><Strikethrough size={15} /></button>
        <label className="studio-ribbon-color" title={t("Text color")}><Palette size={14} /><input type="color" aria-label={t("Text color")} defaultValue="#29251e" onChange={(event) => onCommand("foreColor", event.target.value)} /></label>
        <label className="studio-ribbon-color" title={t("Highlight color")}><span className="studio-highlight-mark">A</span><input type="color" aria-label={t("Highlight color")} defaultValue="#f4d77b" onChange={(event) => onCommand("hiliteColor", event.target.value)} /></label>
      </div>
      <div className="studio-ribbon-group">
        <button type="button" title={t("Align left")} aria-label={t("Align left")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("justifyLeft")}><AlignLeft size={15} /></button>
        <button type="button" title={t("Center")} aria-label={t("Center")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("justifyCenter")}><AlignCenter size={15} /></button>
        <button type="button" title={t("Align right")} aria-label={t("Align right")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("justifyRight")}><AlignRight size={15} /></button>
        <button type="button" title={t("Justify")} aria-label={t("Justify")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("justifyFull")}><AlignJustify size={15} /></button>
        <StudioSelect ariaLabel={t("Line spacing")} value={String(lineSpacing)} className="studio-select-spacing" onMouseDown={(event) => event.stopPropagation()} onValueChange={(value) => onLineSpacing(Number(value))} options={[{ value: "1.15", label: "1.15" }, { value: "1.5", label: "1.5" }, { value: "1.8", label: "1.8" }, { value: "2", label: "2.0" }]} />
        <button type="button" title={t("Bulleted list")} aria-label={t("Bulleted list")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("insertUnorderedList")}><List size={15} /></button>
        <button type="button" title={t("Numbered list")} aria-label={t("Numbered list")} onMouseDown={(event) => event.preventDefault()} onClick={() => onCommand("insertOrderedList")}><ListOrdered size={15} /></button>
        <button type="button" title={t("Checklist")} aria-label={t("Checklist")} onMouseDown={(event) => event.preventDefault()} onClick={onInsertChecklist}><ListChecks size={15} /></button>
      </div>
      <div className="studio-ribbon-group">
        <button type="button" title={t("Insert table")} aria-label={t("Insert table")} onMouseDown={(event) => event.preventDefault()} onClick={() => onInsertHtml("<table><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>")}><Table2 size={15} /></button>
        <button type="button" title={t("Insert image")} aria-label={t("Insert image")} onMouseDown={(event) => event.preventDefault()} onClick={onInsertImage}><Image size={15} /></button>
        <button type="button" title={t("Insert divider")} aria-label={t("Insert divider")} onMouseDown={(event) => event.preventDefault()} onClick={() => onInsertDivider()}><MoreHorizontal size={15} /></button>
        <button type="button" title={t("Insert page break")} aria-label={t("Insert page break")} onMouseDown={(event) => event.preventDefault()} onClick={() => onInsertDivider(true)}><FilePlus size={15} /></button>
        <button type="button" title={t("Insert link")} aria-label={t("Insert link")} onMouseDown={(event) => event.preventDefault()} onClick={onInsertLink}><Link2 size={15} /></button>
        <button type="button" title={t("Insert callout")} aria-label={t("Insert callout")} onMouseDown={(event) => event.preventDefault()} onClick={() => onInsertHtml(`<div class="editor-callout"><strong>${t("Note")}</strong><br>${t("Write a note...")}</div><p><br></p>`)}><Quote size={15} /></button>
        <button type="button" title={t("Find & Replace")} aria-label={t("Find & Replace")} onMouseDown={(event) => event.preventDefault()} onClick={onOpenFindReplace}><Replace size={15} /></button>
      </div>
      <button type="button" className={`studio-ribbon-toggle ${rulerVisible ? "selected" : ""}`} title={t("Toggle ruler")} aria-label={t("Toggle ruler")} aria-pressed={rulerVisible} onClick={onToggleRuler}><SlidersHorizontal size={14} /></button>
    </div>
  );
}
