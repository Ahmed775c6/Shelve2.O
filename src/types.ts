export type BookStatus = "unread" | "reading" | "archived";
export type StorageMode = "offline" | "cloud";

export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  language?: string;
  description: string;
  story?: string;
  coverImage: string;
  coverColor: string;
  totalPages: number;
  currentPage: number;
  rating?: number;
  status: BookStatus;
  uploadedAt: string;
  updatedAt?: string;
  deletedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  fileName?: string;
  fileKey?: string;
  fileMimeType?: string;
  coverFileName?: string;
  coverMimeType?: string;
  remoteFileName?: string;
  remoteCoverFileName?: string;
}

export interface WritingChapter {
  id: string;
  title: string;
  content: string;
  richContent?: string;
  category?: WritingExplorerCategory;
  updatedAt: string;
  pages?: WritingPage[];
}

export type WritingPageKind = "page" | "scene" | "note";
export type WritingExplorerCategory = "writing" | "characters" | "scenes" | "notes" | "world" | "outline" | "research";

export interface WritingPage {
  id: string;
  title: string;
  content: string;
  richContent?: string;
  kind: WritingPageKind;
  category?: WritingExplorerCategory;
  updatedAt: string;
}

export type WritingFormatType =
  | "Book" | "Novel" | "Book / Novel" | "Short Story" | "Play / Screenplay" | "Course" | "Non-Fiction"
  | "Essay / Article" | "Poetry" | "Script / Notes";
export type WritingGenreCategory =
  | "Literary Fiction" | "Fantasy" | "Sci-Fi" | "Mystery / Thriller" | "Romance"
  | "Drama" | "Technical / Education" | "History" | "Philosophy" | "Self-Help" | "Biography" | "Science";
export type WritingPaperStyle = "editorial" | "lined" | "dotted" | "grid" | "cornell" | "aged";
export type WritingPageSize = "trade" | "a4";
export type WritingFontFamily = "editorial" | "literary" | "garamond" | "sans" | "humanist" | "mono";
export type WritingCoverFontFamily = WritingFontFamily | "display";

export interface WritingCoverLayer {
  id: string;
  type: "title" | "subtitle" | "author" | "badge" | "ornament";
  label: string;
  text: string;
  ornament?: "divider" | "double-rule" | "corner-frame" | "crest" | "shape" | "genre-pill" | "arch" | "sash";
  x: number;
  y: number;
  visible: boolean;
}

export type WritingFrontCoverTemplate =
  | "classic-penguin"
  | "midnight-frame"
  | "swiss-grid"
  | "noir-split"
  | "editorial-arch"
  | "vintage-crest"
  | "brutalist"
  | "botanical-gradient"
  | "academic-monograph"
  | "art-deco-sunburst"
  | "minimalist-whisper"
  | "cinema-scrim"
  | "coastal-watercolor"
  | "solar-orbit"
  | "botanical-press"
  | "desert-myth"
  | "blueprint-essay"
  | "romance-letterpress"
  | "neon-city-noir"
  | "blank";
export type WritingBackCoverTemplate =
  | "classic-editorial"
  | "author-spotlight"
  | "minimalist-literary"
  | "praise-grid"
  | "swiss-grid-back"
  | "tri-band-back"
  | "framed-keepsake"
  | "atmospheric-dark"
  | "coastal-editorial-back"
  | "field-notes-back"
  | "science-fiction-back"
  | "poetry-verse-back"
  | "romance-letter-back"
  | "mythic-chronicle-back"
  | "academic-press-back"
  | "noir-casefile-back"
  | "memoir-photo-back"
  | "garden-chronicle-back"
  | "minimal-metadata-back"
  | "blank";
export type WritingLegacyCoverTemplate =
  | "classic"
  | "banner"
  | "minimal"
  | "dark-overlay"
  | "editorial-gradient"
  | "split-block"
  | "vintage-bands"
  | "bold-type";

export interface WritingCoverDesign {
  template: WritingFrontCoverTemplate | WritingLegacyCoverTemplate;
  backTemplate?: WritingBackCoverTemplate;
  title: string;
  subtitle: string;
  author: string;
  spine: string;
  background: string;
  backBackground?: string;
  backTextColor?: string;
  backGradientEnd?: string;
  backGradientType?: "linear" | "radial";
  textColor: string;
  typography: WritingCoverFontFamily;
  side: "front" | "back" | "wrap" | "mockup";
  fabricCanvasStates?: Partial<Record<"front" | "back" | "wrap", Record<string, unknown>>>;
  fabricFontFamily?: "Playfair Display" | "Cormorant Garamond" | "Cinzel" | "Inter" | "Special Elite";
  backFontFamily?: "Playfair Display" | "Cormorant Garamond" | "Cinzel" | "Inter" | "Special Elite";
  backFontSize?: number;
  backLetterSpacing?: number;
  backAlignment?: "left" | "center" | "right";
  backTitleShadow?: boolean;
  backGrain?: boolean;
  backBleedGuide?: boolean;
  backTrimGuide?: boolean;
  backSafeGuide?: boolean;
  imageEnabled?: boolean;
  badge?: string;
  titleColor?: string;
  fontSize?: number;
  letterSpacing?: number;
  alignment?: "left" | "center" | "right";
  titleShadow?: boolean;
  imageFit?: "full" | "inset" | "top";
  imageOverlay?: number;
  grain?: boolean;
  gradientEnd?: string;
  gradientType?: "linear" | "radial";
  spineWidth?: number;
  spineColor?: string;
  spineAuthor?: string;
  spineTextColor?: string;
  spineFontFamily?: "Playfair Display" | "Cormorant Garamond" | "Cinzel" | "Inter" | "Special Elite";
  spineFontSize?: number;
  spineAuthorFontSize?: number;
  bleedGuide?: boolean;
  trimGuide?: boolean;
  safeGuide?: boolean;
  zoom?: number;
  layers?: WritingCoverLayer[];
  appliedCoverKey?: string;
  appliedRemoteCoverName?: string;
  imageKey?: string;
  imageFileName?: string;
  imageMimeType?: string;
  remoteImageName?: string;
  artDirection?: string;
}

export interface WritingProject {
  id: string;
  userId: string;
  title: string;
  subtitle: string;
  synopsis: string;
  genre: string;
  coverColor: string;
  coverImage?: string;
  visibility: "personal" | "public";
  formatType?: WritingFormatType;
  targetWordGoal?: number;
  dailyWordGoal?: number;
  paperStyle?: WritingPaperStyle;
  paperSize?: WritingPageSize;
  paperColor?: string;
  fontFamily?: WritingFontFamily;
  fontSize?: number;
  lineSpacing?: number;
  coverDesign?: WritingCoverDesign;
  chapters: WritingChapter[];
  pages?: WritingPage[];
  wordCount: number;
  updatedAt: string;
  lastOpenedAt?: string;
  publishedAt?: string;
  authorName?: string;
  [key: string]: unknown;
}

export interface WritingSession {
  id: string;
  projectId: string;
  startedAt: string;
  lastActivityAt: string;
  date: string;
  wordsWritten: number;
  durationSeconds: number;
  updatedAt: string;
  [key: string]: unknown;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  updatedAt?: string;
  plan?: "free" | "standard" | "premium";
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

export type AppView =
  | "overview"
  | "onboarding"
  | "signin"
  | "signup"
  | "library"
  | "reading"
  | "archive"
  | "analytics"
  | "writings"
  | "public-library"
  | "recommendations"
  | "ask"
  | "upload"
  | "settings"
  | "profile"
  | "planner"
  | "edit-book"
  | "details"
  | "reader";
