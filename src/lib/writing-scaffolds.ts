import type { WritingChapter, WritingExplorerCategory, WritingFormatType, WritingPage, WritingPageKind, WritingProject } from "../types";

type ScaffoldPage = Pick<WritingPage, "title" | "content" | "kind" | "category">;
type ScaffoldFolder = Pick<WritingChapter, "title" | "content" | "category"> & { pages: ScaffoldPage[] };

const pageKindForCategory: Record<WritingExplorerCategory, WritingPageKind> = {
  writing: "page",
  characters: "page",
  scenes: "scene",
  notes: "note",
  world: "note",
  outline: "note",
  research: "note",
};

const genrePrompts: Record<string, { hook: string; premise: string; world: string }> = {
  Fantasy: {
    hook: "What impossible event, object, or choice opens this story?",
    premise: "What does magic make possible, and what does it cost?",
    world: "Define the magic system, its limits, and who controls it.",
  },
  "Sci-Fi": {
    hook: "What discovery or technological disruption changes ordinary life?",
    premise: "What scientific rule or future technology drives the conflict?",
    world: "Define the technology, its limitations, and its effects on society.",
  },
  "Mystery / Thriller": {
    hook: "What unsettling clue or danger appears first?",
    premise: "What question must be answered, and what is at stake if it is not?",
    world: "Map the timeline, evidence, secrets, and plausible misdirection.",
  },
  Romance: {
    hook: "What brings the central pair together at the worst possible time?",
    premise: "What emotional obstacle keeps them apart, and what could change?",
    world: "Define the setting, relationship stakes, and sources of tension.",
  },
  Drama: {
    hook: "What pressure forces the central character to act now?",
    premise: "Which relationships or values are tested by the central conflict?",
    world: "Define the setting, relationships, and pressures shaping the conflict.",
  },
  "Technical / Education": {
    hook: "What practical problem or surprising question will draw readers in?",
    premise: "What should the reader understand or be able to do by the end?",
    world: "Define key terms, prerequisites, examples, and reliable references.",
  },
};

function page(title: string, category: WritingExplorerCategory, content = ""): ScaffoldPage {
  const extension: Record<WritingExplorerCategory, string> = {
    writing: ".w",
    characters: ".c",
    scenes: ".s",
    notes: ".n",
    world: ".l",
    outline: ".o",
    research: ".r",
  };
  return {
    title: `${title}${extension[category]}`,
    content,
    kind: pageKindForCategory[category],
    category,
  };
}

function folder(title: string, category: WritingExplorerCategory, pages: ScaffoldPage[], content = ""): ScaffoldFolder {
  return { title, content, category, pages };
}

function introNotes(genre: string): string {
  const prompt = genrePrompts[genre] ?? {
    hook: "What image, question, or moment will make a reader turn the page?",
    premise: "Who wants what, what stands in their way, and why now?",
    world: "Define the setting, its rules, and the details that shape the conflict.",
  };
  return `# Introduction\n\n## Hook\n${prompt.hook}\n\n## Premise\n${prompt.premise}\n\n## Reader promise\nWhat should the reader feel, learn, or question after reading?\n`;
}

function characterSheet(role: string): string {
  return `# ${role}\n\n**Role:** ${role}\n**Want:**\n**Need:**\n**Strength:**\n**Flaw:**\n**Relationships:**\n**Arc:**\n`;
}

function sceneBeats(): string {
  return "**Location / time:**\n**Purpose:**\n**Conflict:**\n**Turn or reveal:**\n**Exit beat:**\n";
}

function asDocuments(folders: ScaffoldFolder[], now: string): WritingChapter[] {
  return folders.map((item) => ({
    id: crypto.randomUUID(),
    title: item.title,
    content: item.content,
    category: item.category,
    updatedAt: now,
    pages: item.pages.map((itemPage) => ({
      ...itemPage,
      id: crypto.randomUUID(),
      updatedAt: now,
    })),
  }));
}

export function scaffoldWritingProject(
  project: WritingProject,
  formatType: WritingFormatType,
  options: { starterEnabled?: boolean; aiTemplatesEnabled?: boolean } = {},
): WritingProject {
  const now = new Date().toISOString();
  const genre = project.genre;
  let projectPages: ScaffoldPage[] = [];
  let folders: ScaffoldFolder[];

  if (formatType === "Short Story") {
    projectPages = [page("story-draft", "writing", `# ${project.title}\n\n**Opening image:**\n\n**Central conflict:**\n\n**Turning point:**\n\n**Ending:**\n`)];
    folders = [
      folder("Characters", "characters", [page("main-character", "characters", characterSheet("Main character"))]),
      folder("Scenes", "scenes", [page("key-scenes", "scenes", sceneBeats())]),
      folder("Notes", "notes", [page("outline-and-theme", "notes", `**Theme:**\n**Beginning:**\n**Turning point:**\n**Ending:**\n`)]),
    ];
  } else if (formatType === "Play / Screenplay") {
    folders = [
      folder("Outline", "outline", [page("beat-sheet", "outline", "## Opening image\n## Inciting incident\n## Act I turn\n## Midpoint\n## Climax\n## Final image\n")]),
      folder("Characters", "characters", [page("cast-breakdown", "characters", characterSheet("Cast breakdown"))]),
      folder("Act I", "scenes", [page("scene-1", "scenes", sceneBeats()), page("scene-2", "scenes", sceneBeats())]),
      folder("Notes", "notes", [page("stage-and-camera", "notes", "**Stage / location:**\n**Set and props:**\n**Camera / blocking:**\n**Sound and light:**\n")]),
    ];
  } else if (formatType === "Course") {
    projectPages = [page("syllabus", "outline", `# ${project.title} — Syllabus\n\n**Audience:**\n**Learning outcomes:**\n**Assessment:**\n**Schedule:**\n`)];
    folders = [
      folder("Module 1", "writing", [page("lesson-1", "writing"), page("lesson-2", "writing")]),
      folder("Exercises", "notes", [page("worksheet-1", "notes", "**Objective:**\n**Instructions:**\n**Reflection:**\n")]),
      folder("Resources", "research", [page("references", "research", "**Source:**\n**Link:**\n**Key notes:**\n")]),
    ];
  } else if (formatType === "Non-Fiction") {
    projectPages = [page("introduction", "writing", introNotes(genre))];
    folders = [
      folder("Outline", "outline", [page("chapter-outline", "outline", "## Chapter 1\n## Chapter 2\n## Chapter 3\n")]),
      folder("Chapters", "writing", [page("chapter-1", "writing"), page("chapter-2", "writing")]),
      folder("Research", "research", [page("sources-and-notes", "research", "**Source:**\n**Claim / evidence:**\n**Citation:**\n")]),
      folder("Notes", "notes", [page("ideas-and-questions", "notes")]),
    ];
  } else {
    const worldPrompt = genrePrompts[genre]?.world ?? `Define the setting, its rules, and the details that shape this ${genre} story.`;
    projectPages = [page("introduction", "writing", introNotes(genre))];
    folders = [
      folder("Characters", "characters", [
        page("protagonist", "characters", characterSheet("Protagonist")),
        page("antagonist", "characters", characterSheet("Antagonist")),
      ]),
      folder("Chapters", "writing", [page("chapter-1", "writing"), page("chapter-2", "writing")]),
      folder("Scenes", "scenes", [
        page("chapter-1-scenes", "scenes", sceneBeats()),
        page("chapter-2-scenes", "scenes", sceneBeats()),
      ]),
      folder("World & Lore", "world", [page("setting-and-rules", "world", `${worldPrompt}\n\n**Setting:**\n**Rules:**\n**Consequences:**\n`)]),
      folder("Notes", "notes", [page("ideas-and-research", "notes", "**Ideas:**\n\n**Research questions:**\n")]),
    ];
  }

  if (options.starterEnabled === false) {
    folders = [];
    projectPages = [];
  }

  const result = {
    ...project,
    formatType,
    chapters: asDocuments(folders, now),
    pages: projectPages.map((item) => ({ ...item, id: crypto.randomUUID(), updatedAt: now })),
  };

  if (options.aiTemplatesEnabled === false) {
    result.chapters = result.chapters.map((chapter) => ({
      ...chapter,
      pages: (chapter.pages ?? []).map((item) => item.category === "scenes" ? { ...item, content: "" } : item),
    }));
  }

  return result;
}
