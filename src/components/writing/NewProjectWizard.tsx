import { BookOpen, Clapperboard, FileText, Folder, FolderOpen, GraduationCap, LoaderCircle, Terminal, X } from "lucide-react";
import type { WritingFormatType, WritingGenreCategory } from "../../types";

export type NewProjectDraft = {
  title: string;
  parentPath: string;
  formatType: WritingFormatType;
  genre: WritingGenreCategory;
  targetWordGoal: string;
  starterEnabled: boolean;
  aiTemplatesEnabled: boolean;
  syncOnline: boolean;
};

interface NewProjectWizardProps {
  draft: NewProjectDraft;
  onChange: (draft: NewProjectDraft) => void;
  onCancel: () => void;
  onChooseLocation: () => void;
  onCreate: () => void | Promise<void>;
  isCreating: boolean;
  t: (value: string) => string;
}

const PROJECT_TYPES: { value: WritingFormatType; label: string; icon: typeof BookOpen }[] = [
  { value: "Book / Novel", label: "Book / Novel", icon: BookOpen },
  { value: "Short Story", label: "Short Story", icon: FileText },
  { value: "Play / Screenplay", label: "Play / Screenplay", icon: Clapperboard },
  { value: "Course", label: "Course", icon: GraduationCap },
  { value: "Non-Fiction", label: "Non-Fiction", icon: FolderOpen },
];

const GENRES: { value: WritingGenreCategory; label: string }[] = [
  { value: "Literary Fiction", label: "Literary Fiction" },
  { value: "Sci-Fi", label: "Sci-Fi" },
  { value: "Fantasy", label: "Fantasy" },
  { value: "Mystery / Thriller", label: "Mystery / Thriller" },
  { value: "Romance", label: "Romance" },
  { value: "Drama", label: "Drama" },
  { value: "Technical / Education", label: "Education" },
];

const PREVIEW: Record<WritingFormatType, { folders: { name: string; color: string; files: { name: string; ext: string }[] }[]; root?: { name: string; ext: string }[] }> = {
  "Book / Novel": {
    root: [{ name: "introduction", ext: "w" }],
    folders: [
      { name: "Characters", color: "text-rose-400", files: [{ name: "protagonist", ext: "c" }, { name: "antagonist", ext: "c" }] },
      { name: "Chapters", color: "text-emerald-400", files: [{ name: "chapter-1", ext: "w" }, { name: "chapter-2", ext: "w" }] },
      { name: "Scenes", color: "text-purple-400", files: [{ name: "chapter-1-scenes", ext: "s" }, { name: "chapter-2-scenes", ext: "s" }] },
      { name: "World & Lore", color: "text-teal-400", files: [{ name: "setting-and-rules", ext: "l" }] },
      { name: "Notes", color: "text-amber-400", files: [{ name: "ideas-notes", ext: "n" }] },
    ],
  },
  "Short Story": {
    root: [{ name: "story-draft", ext: "w" }],
    folders: [
      { name: "Characters", color: "text-rose-400", files: [{ name: "main-character", ext: "c" }] },
      { name: "Scenes", color: "text-purple-400", files: [{ name: "key-scenes", ext: "s" }] },
      { name: "Notes", color: "text-amber-400", files: [{ name: "outline-and-theme", ext: "n" }] },
    ],
  },
  "Play / Screenplay": {
    folders: [
      { name: "Outline", color: "text-blue-400", files: [{ name: "beat-sheet", ext: "o" }] },
      { name: "Characters", color: "text-rose-400", files: [{ name: "cast-breakdown", ext: "c" }] },
      { name: "Act I", color: "text-purple-400", files: [{ name: "scene-1", ext: "s" }, { name: "scene-2", ext: "s" }] },
      { name: "Notes", color: "text-amber-400", files: [{ name: "stage-and-camera", ext: "n" }] },
    ],
  },
  Course: {
    root: [{ name: "syllabus", ext: "o" }],
    folders: [
      { name: "Module 1", color: "text-emerald-400", files: [{ name: "lesson-1", ext: "w" }, { name: "lesson-2", ext: "w" }] },
      { name: "Exercises", color: "text-amber-400", files: [{ name: "worksheet-1", ext: "n" }] },
      { name: "Resources", color: "text-teal-400", files: [{ name: "references", ext: "r" }] },
    ],
  },
  "Non-Fiction": {
    root: [{ name: "introduction", ext: "w" }],
    folders: [
      { name: "Outline", color: "text-blue-400", files: [{ name: "chapter-outline", ext: "o" }] },
      { name: "Chapters", color: "text-emerald-400", files: [{ name: "chapter-1", ext: "w" }, { name: "chapter-2", ext: "w" }] },
      { name: "Research", color: "text-teal-400", files: [{ name: "sources-and-notes", ext: "r" }] },
      { name: "Notes", color: "text-amber-400", files: [{ name: "ideas-and-questions", ext: "n" }] },
    ],
  },
  "Book": { folders: [] },
  "Novel": { folders: [] },
  "Essay / Article": { folders: [] },
  "Poetry": { folders: [] },
  "Script / Notes": { folders: [] },
};

const slugify = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled-story";

const previewFileColor = (ext: string) => {
  if (ext === "c") return "text-rose-400";
  if (ext === "s") return "text-purple-400";
  if (ext === "n") return "text-amber-400";
  if (ext === "l") return "text-teal-400";
  if (ext === "w") return "text-blue-400";
  if (ext === "o") return "text-blue-400";
  return "text-teal-400";
};

export function NewProjectWizard({ draft, onChange, onCancel, onChooseLocation, onCreate, isCreating, t }: NewProjectWizardProps) {
  const preview = PREVIEW[draft.formatType] ?? PREVIEW["Book / Novel"];
  const projectName = slugify(draft.title);
  const previewFolders = preview.folders
    .filter((folder) => draft.starterEnabled || folder.name === "Outline")
    .filter((folder) => draft.aiTemplatesEnabled || !folder.files.some((file) => file.ext === "s"));
  const previewRoot = draft.starterEnabled ? preview.root : undefined;

  return (
    <div
      className="h-full w-full overflow-x-hidden overflow-y-hidden border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] shadow-2xl backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-busy={isCreating}
      aria-labelledby="create-project-title"
    >
      <form className="flex h-full flex-col" onSubmit={(event) => { event.preventDefault(); void onCreate(); }}>
        <header className="col-span-full h-12 mt-10 px-4 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--titlebar-surface)_78%,transparent)] backdrop-blur-xl flex items-center justify-between">
          <button type="button" onClick={onCancel} className="grid hidden place-items-center text-[var(--text-2)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-highlight)]" aria-label={t("Close")}><X size={13} /></button>
        </header>

        <div className="flex w-full h-full overflow-x-hidden overflow-y-hidden max-sm:flex-col">
          <aside className="w-full max-w-70 bg-[color-mix(in_srgb,var(--surface-2)_82%,transparent)] backdrop-blur-lg border-r border-[var(--line)]">
            <fieldset>
              <legend className="sr-only">{t("Project Generators")}</legend>
              <div className="space-y-0.5  bg-[color-mix(in_srgb,var(--titlebar-surface)_78%,transparent)] backdrop-blur-xl h-full min-h-screen">
                <div className="p-4 flex items-center gap-2 border-b border-[var(--line)]">
                  <Terminal size={13} className="text-muted-foreground" />
                  <span id="create-project-title" className="text-xs font-medium text-foreground">{t("New Project")}</span>
                </div>
         <div className="p-2.5 flex flex-col gap-1.5">
                 {PROJECT_TYPES.map(({ value, label, icon: Icon }) => {
                  const active = draft.formatType === value;
                  const displayLabel = label === "Play / Screenplay" ? "Screenplay" : label;
                  return (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={active}
                      onClick={() => onChange({ ...draft, formatType: value })}
                      className={`flex px-2.5 py-3 w-full items-center gap-2.5 text-left text-[5px] ${active
                        ? "bg-primary font-medium text-[var(--accent-foreground)]"
                        : "text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"}`}
                    >
                      <Icon size={13} className={active ? "text-slate-50" : "text-muted-foreground"} />
                      <span className="whitespace-nowrap text-xs">{t(displayLabel)}</span>
                    </button>
                  );
                })}
         </div>
              </div>
            </fieldset>
          </aside>

          <div className="w-full bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] p-5 space-y-3.5 text-xs backdrop-blur-lg">
            <div className="grid grid-cols-[95px_1fr] items-center gap-3">
              <label htmlFor="new-project-title" className="text-muted-foreground">{t("Name")}:</label>
              <input
                id="new-project-title"
                autoFocus
                className="h-8 w-full border border-[var(--line-strong)] bg-[var(--bg-card)] px-2.5 text-[11px] text-[var(--text)] outline-none appearance-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:border-[var(--accent-primary)]"
                value={draft.title}
                onChange={(event) => onChange({ ...draft, title: event.target.value })}
                placeholder="untitled-story"
              />
            </div>

            <div className="grid grid-cols-[95px_1fr] items-center gap-3">
              <label htmlFor="new-project-location" className="text-muted-foreground">{t("Location")}:</label>
              <div className="flex h-8 items-center border border-[var(--line-strong)] bg-[var(--bg-card)] focus-within:ring-2 focus-within:ring-[var(--accent-primary)] focus-within:border-[var(--accent-primary)]">
                <input
                  id="new-project-location"
                  readOnly
                  className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[11px] text-[var(--text)] outline-none"
                  value={`~/Documents/${draft.parentPath}/${projectName}`}
                />
                <button type="button" disabled={isCreating} onClick={onChooseLocation} className="grid h-full w-8 shrink-0 place-items-center border-l border-[var(--line)] text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50" aria-label={t("Choose location")} title={t("Choose location")}>
                  <FolderOpen size={13} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-[95px_1fr] items-center gap-3">
              <label htmlFor="new-project-genre" className="text-muted-foreground">{t("Genre")}:</label>
              <select
                id="new-project-genre"
                className="h-8 w-full border border-[var(--line-strong)] bg-[var(--bg-card)] px-2.5 text-[11px] text-[var(--text)] outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:border-[var(--accent-primary)]"
                value={draft.genre}
                onChange={(event) => onChange({ ...draft, genre: event.target.value as WritingGenreCategory })}
              >
                {GENRES.map((genre) => (
                  <option key={genre.value} value={genre.value} className="bg-[var(--bg-card)] text-[var(--text)] checked:bg-[var(--accent-primary)] checked:text-[var(--accent-foreground)]">{t(genre.label)}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-[95px_1fr] items-center gap-3">
              <label htmlFor="new-project-word-goal" className="text-muted-foreground">{t("Word Goal")}:</label>
              <div className="flex h-8 items-center border border-[var(--line-strong)] bg-[var(--bg-card)] focus-within:ring-2 focus-within:ring-[var(--accent-primary)] focus-within:border-[var(--accent-primary)]">
                <input
                  id="new-project-word-goal"
                  type="number"
                  min="1"
                  value={draft.targetWordGoal}
                  onChange={(event) => onChange({ ...draft, targetWordGoal: event.target.value })}
                  placeholder="50000"
                  className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[11px] text-[var(--text)] outline-none"
                />
                <span className="pr-2.5 text-[10px] text-muted-foreground">words</span>
              </div>
            </div>
            <div className="border-t border-[var(--line)] my-3" />

            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={draft.starterEnabled}
                onChange={(event) => onChange({ ...draft, starterEnabled: event.target.checked })}
                className="size-3.5 accent-[var(--accent-primary)]"
              />
              <span>{t("Generate starter chapters & character sheets")}</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={draft.aiTemplatesEnabled}
                onChange={(event) => onChange({ ...draft, aiTemplatesEnabled: event.target.checked })}
                className="size-3.5 accent-[var(--accent-primary)]"
              />
              <span>{t("Include AI Co-Worker scene templates (.s)")}</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={draft.syncOnline}
                onChange={(event) => onChange({ ...draft, syncOnline: event.target.checked })}
                className="size-3.5 accent-[var(--accent-primary)]"
              />
              <span>{t("Sync this project online")}</span>
            </label>
          </div>

          <aside className="w-full max-w-70 border-l border-[var(--line)] bg-[color-mix(in_srgb,var(--surface-2)_82%,transparent)] backdrop-blur-lg p-3.5 max-sm:w-full max-sm:border-l-0 max-sm:border-t max-sm:border-[var(--line)]">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("Generated Tree")}</h3>
            <div className="font-mono text-xs space-y-1">
              <div className="flex w-full items-center gap-1.5 whitespace-nowrap truncate text-foreground"><FolderOpen size={12} className="shrink-0 text-amber-400" /><span className="truncate">{projectName}</span></div>
              {previewRoot?.map((file) => (
                <div key={file.name} className="ml-4 flex w-[calc(225px-28px)] items-center justify-between gap-2 whitespace-nowrap truncate text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-1.5 truncate"><FileText size={11} className={`shrink-0 ${previewFileColor(file.ext)}`} /><span className="truncate">{file.name}</span></span>
                  <code className="text-[9px]">.{file.ext}</code>
                </div>
              ))}
              {previewFolders.map((folder) => (
                <div key={folder.name} className="mt-1">
                  <div className="flex w-full items-center gap-1.5 whitespace-nowrap truncate text-foreground"><Folder size={11} className={folder.color} /><span className="truncate">{t(folder.name)}/</span></div>
                  {folder.files.map((file) => (
                    <div key={file.name} className="ml-5 flex w-[calc(225px-40px)] items-center justify-between gap-2 whitespace-nowrap truncate text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1.5 truncate"><FileText size={10} className={`shrink-0 ${previewFileColor(file.ext)}`} /><span className="truncate">{file.name}</span></span>
                      <code className="text-[9px]">.{file.ext}</code>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </aside>
        </div>

        <footer className="h-12 px-5 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] backdrop-blur-xl flex items-center justify-end gap-1.5">
          <button type="button" disabled={isCreating} onClick={onCancel} className="border border-[var(--accent-primary)] bg-[var(--accent-soft)] px-2 text-[9px] leading-none text-[var(--accent-highlight)] hover:bg-[var(--accent-primary)] hover:text-[var(--accent-foreground)] disabled:opacity-50">{t("Cancel")}</button>
          <button type="submit" disabled={isCreating} className="inline-flex items-center gap-1.5 px-2 text-xs leading-none font-medium text-[var(--accent-foreground)] hover:brightness-110 uppercase disabled:cursor-wait disabled:opacity-70">
            {isCreating && <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />}
            {isCreating ? t("Saving…") : t("Create")}
          </button>
        </footer>
      </form>
    </div>
  );
}
