import type {
  WritingBackCoverTemplate, WritingCoverDesign, WritingCoverFontFamily, WritingCoverLayer,
  WritingFontFamily, WritingFormatType, WritingFrontCoverTemplate, WritingGenreCategory,
  WritingLegacyCoverTemplate, WritingPaperStyle,
} from "../../types";

export type CoverTemplateCategory = "Literary" | "Modern" | "Classic" | "Minimal" | "Bold";
export type CoverTemplateFilter = "All" | CoverTemplateCategory;
export type CoverTemplateTab = "front" | "back";
export type PaperColor = { name: string; value: string; ink: string };

export const LEGACY_WRITING_ID = "00000000-0000-4000-8000-000000000001";
export const FORMATS: WritingFormatType[] = ["Book / Novel", "Short Story", "Play / Screenplay", "Course", "Non-Fiction", "Book", "Novel", "Essay / Article", "Poetry", "Script / Notes"];
export const GENRES: WritingGenreCategory[] = ["Literary Fiction", "Sci-Fi", "Fantasy", "Mystery / Thriller", "Romance", "Drama", "Technical / Education", "History", "Philosophy", "Self-Help", "Biography", "Science"];
export const WRITING_COLORS = ["#7648d8", "#a5485e", "#287d78", "#4168a5", "#a77a31", "#4c687b"];
export const PAPER_STYLES: { value: WritingPaperStyle; label: string }[] = [
  { value: "editorial", label: "Blank Smooth" },
  { value: "lined", label: "Ruled Notebook" },
  { value: "dotted", label: "Dotted Journal" },
  { value: "grid", label: "Graph / Grid" },
  { value: "cornell", label: "Cornell Notes" },
  { value: "aged", label: "Vintage Manuscript" },
];
export const PAPER_COLORS: PaperColor[] = [
  { name: "Pure White", value: "#FFFFFF", ink: "#29251e" },
  { name: "Warm Ivory", value: "#FAF7F2", ink: "#29251e" },
  { name: "Aged Sepia", value: "#EFE6D5", ink: "#332a22" },
  { name: "Soft Sage", value: "#EBF0EC", ink: "#26312a" },
  { name: "Slate Mist", value: "#E9EEF2", ink: "#26313A" },
  { name: "Night Paper", value: "#14161A", ink: "#eee9df" },
];
export const FONT_FAMILIES: { value: WritingFontFamily; label: string; css: string }[] = [
  { value: "editorial", label: "Editorial Serif", css: "\"Playfair Display\", Georgia, serif" },
  { value: "literary", label: "Classic Book", css: "\"Cormorant Garamond\", Georgia, serif" },
  { value: "garamond", label: "Literary Garamond", css: "\"EB Garamond\", Georgia, serif" },
  { value: "sans", label: "Modern Sans", css: "Inter, system-ui, sans-serif" },
  { value: "humanist", label: "Clean Humanist", css: "Lora, Georgia, serif" },
  { value: "mono", label: "Typewriter", css: "\"Special Elite\", Courier, monospace" },
];
export const COVER_TEMPLATES: { value: WritingFrontCoverTemplate; label: string; category: CoverTemplateCategory }[] = [
  { value: "blank", label: "Blank Canvas", category: "Minimal" },
  { value: "classic-penguin", label: "Classic Penguin Tri-Band", category: "Classic" },
  { value: "midnight-frame", label: "Midnight Gold Frame", category: "Literary" },
  { value: "swiss-grid", label: "Swiss Modernist Grid", category: "Modern" },
  { value: "noir-split", label: "Noir Split Spine", category: "Modern" },
  { value: "editorial-arch", label: "Editorial Serif Arch", category: "Literary" },
  { value: "vintage-crest", label: "Vintage Linen & Crest", category: "Classic" },
  { value: "brutalist", label: "Brutalist Typography", category: "Bold" },
  { value: "botanical-gradient", label: "Botanical / Atmospheric Gradient", category: "Literary" },
  { value: "academic-monograph", label: "Academic / Monograph", category: "Minimal" },
  { value: "art-deco-sunburst", label: "Art Deco Sunburst", category: "Classic" },
  { value: "minimalist-whisper", label: "Minimalist Whisper", category: "Minimal" },
  { value: "cinema-scrim", label: "Cinema Poster Scrim", category: "Bold" },
  { value: "coastal-watercolor", label: "Coastal Watercolor", category: "Literary" },
  { value: "solar-orbit", label: "Solar Orbit", category: "Modern" },
  { value: "botanical-press", label: "Botanical Press", category: "Classic" },
  { value: "desert-myth", label: "Desert Myth", category: "Bold" },
  { value: "blueprint-essay", label: "Blueprint Essay", category: "Minimal" },
  { value: "romance-letterpress", label: "Romance Letterpress", category: "Classic" },
  { value: "neon-city-noir", label: "Neon City Noir", category: "Bold" },
];
export const BACK_COVER_TEMPLATES: { value: WritingBackCoverTemplate; label: string; category: CoverTemplateCategory }[] = [
  { value: "blank", label: "Blank Canvas", category: "Minimal" },
  { value: "classic-editorial", label: "Classic Editorial Blurb", category: "Classic" },
  { value: "author-spotlight", label: "Author Spotlight & Bio", category: "Literary" },
  { value: "minimalist-literary", label: "Minimalist Literary Back", category: "Minimal" },
  { value: "praise-grid", label: "Praise & Reviews Grid", category: "Bold" },
  { value: "swiss-grid-back", label: "Swiss Grid Back", category: "Modern" },
  { value: "tri-band-back", label: "Tri-Band Matching Back", category: "Classic" },
  { value: "framed-keepsake", label: "Framed Keepsake Back", category: "Literary" },
  { value: "atmospheric-dark", label: "Atmospheric Dark Back", category: "Bold" },
  { value: "coastal-editorial-back", label: "Coastal Editorial Back", category: "Literary" },
  { value: "field-notes-back", label: "Field Notes Back", category: "Modern" },
  { value: "science-fiction-back", label: "Science Fiction Back", category: "Modern" },
  { value: "poetry-verse-back", label: "Poetry Verse Back", category: "Literary" },
  { value: "romance-letter-back", label: "Romance Letter Back", category: "Classic" },
  { value: "mythic-chronicle-back", label: "Mythic Chronicle Back", category: "Bold" },
  { value: "academic-press-back", label: "Academic Press Back", category: "Minimal" },
  { value: "noir-casefile-back", label: "Noir Case File Back", category: "Bold" },
  { value: "memoir-photo-back", label: "Memoir & Portrait Back", category: "Literary" },
  { value: "garden-chronicle-back", label: "Garden Chronicle Back", category: "Classic" },
  { value: "minimal-metadata-back", label: "Minimal Metadata Back", category: "Minimal" },
];
export const LEGACY_COVER_TEMPLATES: WritingLegacyCoverTemplate[] = [
  "classic", "banner", "minimal", "dark-overlay", "editorial-gradient", "split-block", "vintage-bands", "bold-type",
];
export const TEMPLATE_FILTERS: CoverTemplateFilter[] = ["All", "Literary", "Modern", "Classic", "Minimal", "Bold"];
export const LEGACY_TEMPLATE_MAP: Record<WritingLegacyCoverTemplate, WritingFrontCoverTemplate> = {
  classic: "classic-penguin",
  banner: "noir-split",
  minimal: "minimalist-whisper",
  "dark-overlay": "midnight-frame",
  "editorial-gradient": "botanical-gradient",
  "split-block": "noir-split",
  "vintage-bands": "classic-penguin",
  "bold-type": "brutalist",
};
export const FRONT_TEMPLATE_STYLES: Record<WritingFrontCoverTemplate, {
  background: string;
  titleColor: string;
  gradientEnd: string;
  gradientType: "linear" | "radial";
  fontFamily: NonNullable<WritingCoverDesign["fabricFontFamily"]>;
  fontSize: number;
  alignment: NonNullable<WritingCoverDesign["alignment"]>;
}> = {
  "classic-penguin": { background: "#FAF6EE", titleColor: "#171715", gradientEnd: "#FAF6EE", gradientType: "linear", fontFamily: "Cormorant Garamond", fontSize: 56, alignment: "center" },
  "midnight-frame": { background: "#0D1117", titleColor: "#F8F4EC", gradientEnd: "#0D1117", gradientType: "radial", fontFamily: "Cinzel", fontSize: 54, alignment: "center" },
  "swiss-grid": { background: "#F7F4EE", titleColor: "#1E2423", gradientEnd: "#F7F4EE", gradientType: "linear", fontFamily: "Inter", fontSize: 43, alignment: "left" },
  "noir-split": { background: "#090A0D", titleColor: "#F8F4EC", gradientEnd: "#090A0D", gradientType: "linear", fontFamily: "Inter", fontSize: 48, alignment: "left" },
  "editorial-arch": { background: "#F5EFE6", titleColor: "#16302B", gradientEnd: "#F5EFE6", gradientType: "linear", fontFamily: "Playfair Display", fontSize: 48, alignment: "center" },
  "vintage-crest": { background: "#10241E", titleColor: "#29251E", gradientEnd: "#10241E", gradientType: "linear", fontFamily: "Cormorant Garamond", fontSize: 47, alignment: "center" },
  brutalist: { background: "#0A0A0B", titleColor: "#F8F4EC", gradientEnd: "#0A0A0B", gradientType: "linear", fontFamily: "Inter", fontSize: 70, alignment: "center" },
  "botanical-gradient": { background: "#0B132B", titleColor: "#F59E0B", gradientEnd: "#1A2E54", gradientType: "radial", fontFamily: "Inter", fontSize: 50, alignment: "center" },
  "academic-monograph": { background: "#18181B", titleColor: "#FAF7F2", gradientEnd: "#18181B", gradientType: "linear", fontFamily: "Cormorant Garamond", fontSize: 46, alignment: "left" },
  "art-deco-sunburst": { background: "#0E1726", titleColor: "#E9D18D", gradientEnd: "#0E1726", gradientType: "linear", fontFamily: "Cinzel", fontSize: 50, alignment: "center" },
  "minimalist-whisper": { background: "#EFE7DA", titleColor: "#2C221E", gradientEnd: "#EFE7DA", gradientType: "linear", fontFamily: "Playfair Display", fontSize: 31, alignment: "center" },
  "cinema-scrim": { background: "#090A0D", titleColor: "#F8F4EC", gradientEnd: "#090A0D", gradientType: "linear", fontFamily: "Inter", fontSize: 53, alignment: "center" },
  "coastal-watercolor": { background: "#DCEBE7", titleColor: "#163B3B", gradientEnd: "#F5EFE6", gradientType: "linear", fontFamily: "Playfair Display", fontSize: 49, alignment: "center" },
  "solar-orbit": { background: "#101A35", titleColor: "#F5B544", gradientEnd: "#263B69", gradientType: "radial", fontFamily: "Inter", fontSize: 52, alignment: "center" },
  "botanical-press": { background: "#18352B", titleColor: "#F5EBDD", gradientEnd: "#18352B", gradientType: "linear", fontFamily: "Cormorant Garamond", fontSize: 47, alignment: "center" },
  "desert-myth": { background: "#D9A46F", titleColor: "#33211A", gradientEnd: "#F0D8B8", gradientType: "linear", fontFamily: "Cinzel", fontSize: 52, alignment: "center" },
  "blueprint-essay": { background: "#E8EDF0", titleColor: "#1C3445", gradientEnd: "#E8EDF0", gradientType: "linear", fontFamily: "Inter", fontSize: 42, alignment: "left" },
  "romance-letterpress": { background: "#5B2638", titleColor: "#FAE8DB", gradientEnd: "#351A29", gradientType: "linear", fontFamily: "Playfair Display", fontSize: 48, alignment: "center" },
  "neon-city-noir": { background: "#11121B", titleColor: "#F4D6CF", gradientEnd: "#2B1D36", gradientType: "radial", fontFamily: "Inter", fontSize: 49, alignment: "left" },
  blank: { background: "#FFFFFF", titleColor: "#29251E", gradientEnd: "#FFFFFF", gradientType: "linear", fontFamily: "Cormorant Garamond", fontSize: 48, alignment: "center" },
};
export const BACK_TEMPLATE_STYLES: Record<WritingBackCoverTemplate, {
  background: string;
  textColor: string;
  accent: string;
  paper: string;
  deep: string;
  fontFamily: NonNullable<WritingCoverDesign["backFontFamily"]>;
  gradientEnd: string;
  gradientType: "linear" | "radial";
}> = {
  "classic-editorial": { background: "#F5EFE6", textColor: "#1F1C18", accent: "#C85A32", paper: "#F5EFE6", deep: "#16302B", fontFamily: "Cormorant Garamond", gradientEnd: "#F5EFE6", gradientType: "linear" },
  "author-spotlight": { background: "#F5EFE6", textColor: "#1F1C18", accent: "#5C6B57", paper: "#FAF7F2", deep: "#2C221E", fontFamily: "Cormorant Garamond", gradientEnd: "#F5EFE6", gradientType: "linear" },
  "minimalist-literary": { background: "#FAF7F2", textColor: "#1F1C18", accent: "#9B7754", paper: "#FAF7F2", deep: "#2C221E", fontFamily: "Cormorant Garamond", gradientEnd: "#FAF7F2", gradientType: "linear" },
  "praise-grid": { background: "#F5EFE6", textColor: "#1F1C18", accent: "#C85A32", paper: "#FAF7F2", deep: "#16302B", fontFamily: "Cormorant Garamond", gradientEnd: "#F5EFE6", gradientType: "linear" },
  "swiss-grid-back": { background: "#F7F4EE", textColor: "#18181B", accent: "#B85032", paper: "#EFECE6", deep: "#18181B", fontFamily: "Inter", gradientEnd: "#F7F4EE", gradientType: "linear" },
  "tri-band-back": { background: "#FAF6EE", textColor: "#171715", accent: "#D95D24", paper: "#FAF6EE", deep: "#171715", fontFamily: "Cormorant Garamond", gradientEnd: "#FAF6EE", gradientType: "linear" },
  "framed-keepsake": { background: "#F5EFE6", textColor: "#1F1C18", accent: "#5C6B57", paper: "#FAF7F2", deep: "#16302B", fontFamily: "Cormorant Garamond", gradientEnd: "#F5EFE6", gradientType: "linear" },
  "atmospheric-dark": { background: "#090A0D", textColor: "#F8F4EC", accent: "#DC2626", paper: "#FAF7F2", deep: "#090A0D", fontFamily: "Cormorant Garamond", gradientEnd: "#263B42", gradientType: "radial" },
  "coastal-editorial-back": { background: "#E7F0EC", textColor: "#193B38", accent: "#497B76", paper: "#F5F5EF", deep: "#173B3D", fontFamily: "Cormorant Garamond", gradientEnd: "#E7F0EC", gradientType: "linear" },
  "field-notes-back": { background: "#EEE8D9", textColor: "#302C23", accent: "#718166", paper: "#F7F3E9", deep: "#353B30", fontFamily: "Inter", gradientEnd: "#EEE8D9", gradientType: "linear" },
  "science-fiction-back": { background: "#0B132B", textColor: "#F5F0E7", accent: "#F59E0B", paper: "#F7F2E8", deep: "#101A35", fontFamily: "Inter", gradientEnd: "#1A2E54", gradientType: "radial" },
  "poetry-verse-back": { background: "#EFE7DA", textColor: "#2C221E", accent: "#5C6B57", paper: "#FAF7F2", deep: "#2C221E", fontFamily: "Cormorant Garamond", gradientEnd: "#EFE7DA", gradientType: "linear" },
  "romance-letter-back": { background: "#F7E9E1", textColor: "#4A2432", accent: "#9E5362", paper: "#FFF9F3", deep: "#532839", fontFamily: "Playfair Display", gradientEnd: "#F7E9E1", gradientType: "linear" },
  "mythic-chronicle-back": { background: "#182A2B", textColor: "#F4E7C7", accent: "#C89A52", paper: "#F4E7C7", deep: "#101A1B", fontFamily: "Cinzel", gradientEnd: "#182A2B", gradientType: "linear" },
  "academic-press-back": { background: "#F1EFE8", textColor: "#242A2B", accent: "#52716D", paper: "#F8F7F2", deep: "#252A2A", fontFamily: "Cormorant Garamond", gradientEnd: "#F1EFE8", gradientType: "linear" },
  "noir-casefile-back": { background: "#111216", textColor: "#F3EEE7", accent: "#CF3D45", paper: "#F7F3EB", deep: "#090A0D", fontFamily: "Inter", gradientEnd: "#111216", gradientType: "linear" },
  "memoir-photo-back": { background: "#E8DFD2", textColor: "#342B25", accent: "#8C6F57", paper: "#F6F1E9", deep: "#302A25", fontFamily: "Cormorant Garamond", gradientEnd: "#E8DFD2", gradientType: "linear" },
  "garden-chronicle-back": { background: "#E9EBDD", textColor: "#26362B", accent: "#6A7E55", paper: "#F5F2E8", deep: "#23352B", fontFamily: "Cormorant Garamond", gradientEnd: "#E9EBDD", gradientType: "linear" },
  "minimal-metadata-back": { background: "#FAF8F5", textColor: "#29251E", accent: "#9A8464", paper: "#FAF8F5", deep: "#29251E", fontFamily: "Inter", gradientEnd: "#FAF8F5", gradientType: "linear" },
  blank: { background: "#FAF8F5", textColor: "#29251E", accent: "#9A8464", paper: "#FAF8F5", deep: "#29251E", fontFamily: "Inter", gradientEnd: "#FAF8F5", gradientType: "linear" },
};
export const COVER_COLORS = ["#0D3B44", "#121418", "#1D2D24", "#283754", "#5A3035", "#D7C6A1", "#F8F4EC", "#E5C07B"];
export const COVER_FONTS: { value: WritingCoverFontFamily; label: string; css: string }[] = [
  { value: "editorial", label: "Editorial Serif", css: "Lora, Georgia, serif" },
  { value: "literary", label: "Classic Literary", css: "Merriweather, Palatino, Georgia, serif" },
  { value: "sans", label: "Modern Sans", css: "Inter, system-ui, sans-serif" },
  { value: "display", label: "Display Serif", css: "Georgia, 'Times New Roman', serif" },
  { value: "mono", label: "Typewriter", css: "'JetBrains Mono', Courier, monospace" },
];
export const COVER_ELEMENTS: { ornament: NonNullable<WritingCoverLayer["ornament"]>; label: string }[] = [
  { ornament: "divider", label: "Hairline Divider" },
  { ornament: "corner-frame", label: "Double Gold Border Frame" },
  { ornament: "arch", label: "Arch Backdrop" },
  { ornament: "crest", label: "Circle Crest" },
  { ornament: "sash", label: "Horizontal Banner Sash" },
  { ornament: "genre-pill", label: "Genre Pill Badge" },
];
