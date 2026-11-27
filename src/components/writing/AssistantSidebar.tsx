import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  ArrowRight, BookMarked, Check, FileDown, FileText, Globe2, History, Lock, PenLine, Plus, RotateCcw,
  Send, Settings2, ShieldCheck, Sparkles,
} from "lucide-react";
import { AssistantMarkdown } from "./MarkdownContent";
import { StudioSelect } from "./StudioSelect";
import { useLanguage } from "../language-provider";
import { GENRES, WRITING_COLORS } from "../../studio/logic/catalog";
import { openStudioPage } from "../../studio/logic/routes";
import type { AssistantConversation, AssistantMessage, AssistantTool } from "../../studio/logic/assistant";
import type { WritingChapter, WritingPage, WritingProject } from "../../types";

type AssistantContextScope = "selection" | "page" | "chapter" | "book";
type AssistantRightTab = "assistant" | "settings";

interface AssistantSidebarProps {
  activeProject: WritingProject | null;
  activeChapter: WritingChapter | WritingPage | null;
  activePage: WritingPage | null;
  activePageParentChapter: WritingChapter | null;
  assistantBusy: boolean;
  assistantChatId: string;
  assistantContextScope: AssistantContextScope;
  assistantDraft: string;
  assistantHistory: AssistantConversation[];
  assistantHistoryOpen: boolean;
  assistantMessages: AssistantMessage[];
  assistantTool: AssistantTool;
  assistantThreadRef: RefObject<HTMLDivElement | null>;
  assistantComposerRef: RefObject<HTMLTextAreaElement | null>;
  rightTab: AssistantRightTab;
  selection: { text: string } | null;
  token: string | null;
  onCopyAssistantMessage: (message: AssistantMessage) => void | Promise<void>;
  onCreatePage: (projectId: string, chapterId: string | null, kind: "note", title: string, content: string, category: "outline") => void;
  onInsertAssistantMessage: (message: AssistantMessage, replaceSelection?: boolean) => void;
  onOpenConversation: (conversation: AssistantConversation) => void;
  onStartNewChat: () => void;
  onSubmitDraft: () => void;
  onUnpublishProject: () => void | Promise<void>;
  onUpdateProject: (projectId: string, patch: Partial<WritingProject>) => void;
  setAssistantContextScope: Dispatch<SetStateAction<AssistantContextScope>>;
  setAssistantDraft: Dispatch<SetStateAction<string>>;
  setAssistantHistoryOpen: Dispatch<SetStateAction<boolean>>;
  setAssistantTool: Dispatch<SetStateAction<AssistantTool>>;
  setRightTab: Dispatch<SetStateAction<AssistantRightTab>>;
}

export function AssistantSidebar({
  activeProject,
  activeChapter,
  activePage,
  activePageParentChapter,
  assistantBusy,
  assistantChatId,
  assistantContextScope,
  assistantDraft,
  assistantHistory,
  assistantHistoryOpen,
  assistantMessages,
  assistantTool,
  assistantThreadRef,
  assistantComposerRef,
  rightTab,
  selection,
  token,
  onCopyAssistantMessage,
  onCreatePage,
  onInsertAssistantMessage,
  onOpenConversation,
  onStartNewChat,
  onSubmitDraft,
  onUnpublishProject,
  onUpdateProject,
  setAssistantContextScope,
  setAssistantDraft,
  setAssistantHistoryOpen,
  setAssistantTool,
  setRightTab,
}: AssistantSidebarProps) {
  const { t } = useLanguage();

  return (
    <aside className="studio-assistant-panel studio-copilot-panel">
      <header className="studio-copilot-header">
        <strong>{t("AI CO-WORKER")}</strong>
        <div>
          <button type="button" title={t("New Chat")} aria-label={t("New Chat")} onClick={onStartNewChat}><Plus size={15} /></button>
          <button type="button" title={t("Chat History")} aria-label={t("Chat History")} aria-pressed={assistantHistoryOpen} onClick={() => setAssistantHistoryOpen((open) => !open)}><History size={15} /></button>
          <button type="button" title={t("Document Settings")} aria-label={t("Document Settings")} aria-pressed={rightTab === "settings"} onClick={() => setRightTab((tab) => tab === "settings" ? "assistant" : "settings")}><Settings2 size={15} /></button>
        </div>
      </header>
      {rightTab === "assistant" ? <div className="studio-copilot-body">
        {assistantHistoryOpen && <div className="studio-chat-history" role="listbox" aria-label={t("Chat History")}>
          {assistantHistory.length === 0
            ? <p>{t("No previous chats yet.")}</p>
            : assistantHistory.map((conversation) => <button type="button" key={conversation.id} role="option" aria-selected={assistantChatId === conversation.id} onClick={() => onOpenConversation(conversation)}>
              <strong>{conversation.title}</strong><small>{conversation.projectTitle} · {conversation.messages.length} {t("messages")}</small>
            </button>)}
        </div>}
        <div className="studio-chat-context-row">
          <details className="studio-context-attachment" onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("button")) event.currentTarget.open = false;
          }}>
            <summary><Plus size={13} />{t("Add Context")}</summary>
            <div role="menu">
              <button type="button" role="menuitem" disabled={!selection} onClick={() => setAssistantContextScope("selection")}>{t("Selection")}</button>
              <button type="button" role="menuitem" onClick={() => setAssistantContextScope("page")}>{t("Current Page")}</button>
              <button type="button" role="menuitem" disabled={Boolean(activePage && !activePageParentChapter)} onClick={() => setAssistantContextScope("chapter")}>{t("Chapter")}</button>
              <button type="button" role="menuitem" onClick={() => setAssistantContextScope("book")}>{t("Entire Book")}</button>
            </div>
          </details>
          <span className="studio-active-document-pill"><FileText size={12} />{activeChapter?.title || t("No document")}</span>
          <StudioSelect ariaLabel={t("Context scope")} value={assistantContextScope} className="studio-select-context" onValueChange={(value) => setAssistantContextScope(value as AssistantContextScope)} options={[
            { value: "selection", label: t("Selection"), disabled: !selection },
            { value: "page", label: t("Current Page") },
            { value: "chapter", label: t("Chapter"), disabled: Boolean(activePage && !activePageParentChapter) },
            { value: "book", label: t("Entire Book") },
          ]} />
        </div>
        {assistantContextScope === "selection" && selection && <div className="studio-selection-context">“{selection.text.slice(0, 100)}{selection.text.length > 100 ? "…" : ""}”</div>}
        <div className="assistant-chat-thread studio-copilot-thread" ref={assistantThreadRef} aria-live="polite">
          {assistantMessages.length === 0 && <div className="assistant-chat-empty"><Sparkles size={15} /><p>{t("Ask about the active document, or use /write, /edit, /critique, /outline, or /video-scene.")}</p></div>}
          {assistantMessages.map((message) => <article className={`assistant-message ${message.role}`} key={message.id}>
            <header><span className={message.role === "assistant" ? "copilot-message-icon" : ""}>{message.role === "user" ? t("You") : t("Copilot")}</span><small>{message.role === "user" ? "" : t("AI")}</small></header>
            <details className="assistant-read-context">
              <summary>{t("Read")}: {message.documentTitle || activeChapter?.title || t("Untitled section")}</summary>
              <span>{message.contextScope || t("Current Page")}</span>
            </details>
            <AssistantMarkdown value={message.text} />
            {message.role === "assistant" && <div className="assistant-message-actions">
              {message.tool === "video" && <button type="button" onClick={() => void onCopyAssistantMessage(message)}><FileDown size={12} />{t("Copy Video Scene Prompt")}</button>}
              {message.tool === "outline" && <button type="button" onClick={() => message.projectId && onCreatePage(message.projectId, message.parentChapterId ?? null, "note", "Outline", message.text, "outline")}><Plus size={12} />{t("Create New Page")}</button>}
              {["continue", "polish", "outline", "tone", "chat"].includes(message.tool ?? "") && <button type="button" onClick={() => onInsertAssistantMessage(message)}><ArrowRight size={12} />{t("Insert at Cursor")}</button>}
              {message.tool === "polish" && message.hasSelection && <button type="button" onClick={() => onInsertAssistantMessage(message, true)}><Check size={12} />{t("Replace Selection")}</button>}
            </div>}
          </article>)}
          {assistantBusy && <div className="assistant-thinking"><RotateCcw className="studio-spin" size={13} />{t("Thinking…")}</div>}
        </div>
        {!token && <p className="assistant-signin-note"><ShieldCheck size={13} />{t("Sign in to use the AI co-writer.")}</p>}
        <form className="assistant-composer studio-copilot-composer" onSubmit={(event) => { event.preventDefault(); onSubmitDraft(); }}>
          <textarea ref={assistantComposerRef} value={assistantDraft} onChange={(event) => {
            setAssistantDraft(event.target.value);
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`;
          }} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmitDraft();
            }
          }} placeholder={t("Ask AI co-worker or type / for commands...")} rows={2} aria-label={t("Ask AI co-worker or type / for commands...")} />
          <div className="studio-composer-footer">
            <StudioSelect ariaLabel={t("Chat mode")} className="studio-select-mode" value={assistantTool === "polish" || assistantTool === "tone" ? "edit" : assistantTool === "critique" || assistantTool === "outline" ? "plan" : assistantTool === "video" ? "video" : "ask"} onValueChange={(value) => {
              const modes: Record<string, AssistantTool> = { ask: "chat", edit: "polish", plan: "outline", video: "video" };
              setAssistantTool(modes[value]);
            }} options={[{ value: "ask", label: t("Ask") }, { value: "edit", label: t("Edit") }, { value: "plan", label: t("Plan") }, { value: "video", label: t("Video Scene") }]} />
            <button type="submit" disabled={assistantBusy || !token || !activeChapter || !assistantDraft.trim()}><Send size={14} />{t("Send")}</button>
          </div>
        </form>
      </div> : <div className="studio-settings-body">
        <div className="studio-settings-heading"><div className="studio-cover-preview" style={{ backgroundColor: activeProject?.coverColor }}><BookMarked size={22} /></div><div><h2>{t("Book details")}</h2><p>{t("Shape the world around your writing.")}</p></div></div>
        {activeProject && <>
          <label className="studio-field">{t("Genre")}<select value={activeProject.genre} onChange={(event) => onUpdateProject(activeProject.id, { genre: event.target.value })}>{GENRES.map((genre) => <option key={genre}>{t(genre)}</option>)}</select></label>
          <label className="studio-field">{t("Synopsis")}<textarea value={activeProject.synopsis} onChange={(event) => onUpdateProject(activeProject.id, { synopsis: event.target.value })} placeholder={t("What is this story about?")} rows={5} /></label>
          <label className="studio-field">{t("Cover image URL")}<input value={activeProject.coverImage ?? ""} onChange={(event) => onUpdateProject(activeProject.id, { coverImage: event.target.value })} placeholder="https://" /></label>
          <button type="button" className="studio-unpublish-full" onClick={() => openStudioPage("/writings/cover")}><PenLine size={13} /> {t("Design Cover")}</button>
          <div className="studio-field"><span>{t("Cover color")}</span><div className="studio-color-picker">{WRITING_COLORS.map((color) => <button key={color} type="button" style={{ backgroundColor: color }} className={activeProject.coverColor === color ? "selected" : ""} onClick={() => onUpdateProject(activeProject.id, { coverColor: color })} aria-label={`${t("Cover color")} ${color}`} />)}<label title={t("Choose a custom cover color")}><input type="color" value={activeProject.coverColor.startsWith("#") ? activeProject.coverColor : WRITING_COLORS[0]} onChange={(event) => onUpdateProject(activeProject.id, { coverColor: event.target.value })} /><Plus size={14} /></label></div></div>
          <div className="studio-visibility-card">{activeProject.visibility === "public" ? <Globe2 size={15} /> : <Lock size={15} />}<div><strong>{activeProject.visibility === "public" ? t("Public story") : t("Private draft")}</strong><small>{activeProject.visibility === "public" ? t("Discoverable in the Public Library.") : t("Only you can see this writing.")}</small></div></div>
          {activeProject.visibility === "public" && <button type="button" className="studio-unpublish-full" onClick={() => void onUnpublishProject()}>{t("Revert to personal draft")}</button>}
        </>}
      </div>}
    </aside>
  );
}
