import { BACK_TEMPLATE_STYLES, FRONT_TEMPLATE_STYLES, PAPER_COLORS, WRITING_COLORS } from "./catalog";
import { newChapter } from "./explorer";
import type { WritingFormatType, WritingGenreCategory, WritingProject, WritingSession } from "../../types";

export function isWritingSession(value: unknown): value is WritingSession {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string" &&
    "projectId" in value && typeof value.projectId === "string" &&
    "date" in value && typeof value.date === "string" &&
    "wordsWritten" in value && typeof value.wordsWritten === "number" &&
    "durationSeconds" in value && typeof value.durationSeconds === "number";
}

export function newProject(
  userId: string,
  options?: { title: string; formatType: WritingFormatType; genre: WritingGenreCategory; targetWordGoal: number | null },
): WritingProject {
  return {
    id: crypto.randomUUID(),
    userId,
    title: options?.title.trim() || "Untitled story",
    subtitle: "",
    synopsis: "",
    genre: options?.genre ?? "Literary Fiction",
    formatType: options?.formatType ?? "Book",
    targetWordGoal: options?.targetWordGoal ?? undefined,
    dailyWordGoal: 500,
    paperStyle: "editorial",
    paperColor: PAPER_COLORS[0].value,
    fontFamily: "editorial",
    fontSize: 18,
    lineSpacing: 1.8,
    coverColor: WRITING_COLORS[0],
    coverDesign: {
      template: "blank",
      backTemplate: "blank",
      title: options?.title.trim() || "Untitled story",
      subtitle: "",
      author: "",
      spine: "",
      spineAuthor: "",
      spineTextColor: "#29251E",
      spineFontFamily: "Cinzel",
      spineFontSize: 16,
      spineAuthorFontSize: 12,
      background: FRONT_TEMPLATE_STYLES.blank.background,
      backBackground: BACK_TEMPLATE_STYLES.blank.background,
      backTextColor: BACK_TEMPLATE_STYLES.blank.textColor,
      backGradientEnd: BACK_TEMPLATE_STYLES.blank.gradientEnd,
      backGradientType: "linear",
      textColor: FRONT_TEMPLATE_STYLES.blank.titleColor,
      titleColor: FRONT_TEMPLATE_STYLES.blank.titleColor,
      typography: "editorial",
      fabricFontFamily: "Cormorant Garamond",
      backFontFamily: BACK_TEMPLATE_STYLES.blank.fontFamily,
      backFontSize: 30,
      backLetterSpacing: 0,
      backAlignment: "center",
      backTitleShadow: false,
      backGrain: false,
      backBleedGuide: false,
      backTrimGuide: true,
      backSafeGuide: false,
      side: "front",
      badge: "",
      fontSize: FRONT_TEMPLATE_STYLES.blank.fontSize,
      letterSpacing: 0,
      alignment: "center",
      imageFit: "full",
      imageOverlay: 35,
      grain: false,
      gradientEnd: FRONT_TEMPLATE_STYLES.blank.gradientEnd,
      gradientType: "linear",
      spineWidth: 7,
      spineColor: "#F5EFE6",
      bleedGuide: false,
      trimGuide: true,
      safeGuide: false,
      zoom: 100,
      layers: [],
    },
    visibility: "personal",
    chapters: [{ ...newChapter(1), title: "Untitled section" }],
    wordCount: 0,
    updatedAt: new Date().toISOString(),
  };
}
