import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { animate, motion, useMotionValue, useSpring } from "framer-motion";
import {
  Canvas, Circle, FabricImage, FabricObject, Gradient, IText, Line, Polygon, Rect, Textbox,
  Pattern, type TFiller,
} from "fabric";
import type { WritingBackCoverTemplate, WritingCoverDesign, WritingFrontCoverTemplate } from "../types";
import { matchesShortcut } from "../lib/keyboard-shortcuts";

type CoverSide = "front" | "back" | "wrap" | "mockup";
type CanvasState = Record<string, unknown>;
type FabricName = "title" | "subtitle" | "author" | "back-author" | "spine-author" | "front-author" | "tag" | "blurb" | "barcode" | "image" | "scrim" | "ornament" | "publisher" | "quote" | "author-bio" | "metadata" | "review-quote-one" | "review-quote-two" | "review-quote-three" | "review-source-one" | "review-source-two" | "review-source-three";
type FabricCoverObject = FabricObject & { name?: string; objectType?: string; locked?: boolean };
type FabricTextStyle = {
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: "normal" | "italic";
  charSpacing?: number;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right" | "justify";
  fill?: string;
  shadow?: string;
};
type FabricShapeStyle = { fill?: string; stroke?: string; strokeWidth?: number; opacity?: number; rx?: number };

export interface FabricCoverLayerInfo {
  name: string;
  label: string;
  kind: "text" | "shape" | "image";
  visible: boolean;
  locked: boolean;
}

export interface FabricCoverSelection {
  name: string;
  kind: "text" | "shape" | "image";
  text?: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  charSpacing?: number;
  lineHeight?: number;
  textAlign?: string;
  rx?: number;
}

export interface FabricCoverCanvasHandle {
  exportCanvas: () => { state: CanvasState; dataUrl: string } | null;
  addText: (name: FabricName, text: string) => void;
  addOrnament: (ornament: string, genre: string) => void;
  undo: () => void;
  redo: () => void;
  zoom: (direction: -1 | 0 | 1) => void;
  fitImage: () => void;
  sendImageToBack: () => void;
  toggleScrim: () => void;
  updateSelectedText: (style: FabricTextStyle) => void;
  updateSelectedShape: (style: FabricShapeStyle) => void;
  selectLayer: (name: string) => void;
  setLayerVisible: (name: string, visible: boolean) => void;
  setLayerLocked: (name: string, locked: boolean) => void;
  deleteLayer: (name: string) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;
}

interface Props {
  projectId: string;
  side: CoverSide;
  design: WritingCoverDesign;
  title: string;
  author: string;
  synopsis: string;
  backMockupUrl: string;
  genre: string;
  imageUrl: string;
  mockupUrl: string;
  mockupAutoRotate: boolean;
  onMockupAutoRotateChange: (enabled: boolean) => void;
  mockupAngleResetKey: number;
  onStateChange: (side: Exclude<CoverSide, "mockup">, state: CanvasState) => void;
  onSelectionChange: (selection: FabricCoverSelection | null) => void;
  onLayersChange: (layers: FabricCoverLayerInfo[]) => void;
  onHistoryChange: (undo: boolean, redo: boolean) => void;
  onPreviewChange: (url: string) => void;
  onBackPreviewChange: (url: string) => void;
  onError: (message: string) => void;
}

function HardcoverMockup({
  frontDataUrl,
  backDataUrl,
  title,
  synopsis,
  author,
  spine,
  spineAuthor,
  spineTextColor,
  spineFontFamily,
  spineFontSize,
  spineAuthorFontSize,
  autoRotate,
  onAutoRotateChange,
  angleResetKey,
}: {
  frontDataUrl: string;
  backDataUrl: string;
  title: string;
  synopsis: string;
  author: string;
  spine: string;
  spineAuthor: string;
  spineTextColor: string;
  spineFontFamily: string;
  spineFontSize: number;
  spineAuthorFontSize: number;
  autoRotate: boolean;
  onAutoRotateChange: (enabled: boolean) => void;
  angleResetKey: number;
}) {
  const yaw = useMotionValue(-25);
  const pitch = useMotionValue(6);
  const smoothYaw = useSpring(yaw, { stiffness: 90, damping: 22, mass: 0.8 });
  const smoothPitch = useSpring(pitch, { stiffness: 90, damping: 22, mass: 0.8 });
  const pointerStart = useRef<{ pointerId: number; x: number; y: number; yaw: number; pitch: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!autoRotate || dragging) return;
    const rotation = animate(yaw, yaw.get() + 360, { duration: 48, ease: "linear", repeat: Infinity });
    return () => rotation.stop();
  }, [autoRotate, dragging, yaw]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw: yaw.get(),
      pitch: pitch.get(),
    };
    onAutoRotateChange(false);
    setDragging(true);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    yaw.set(start.yaw + (event.clientX - start.x) * 0.72);
    pitch.set(Math.max(-70, Math.min(70, start.pitch - (event.clientY - start.y) * 0.62)));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStart.current?.pointerId !== event.pointerId) return;
    pointerStart.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => {
    if (angleResetKey === 0) return;
    animate(yaw, -25, { type: "spring", stiffness: 90, damping: 18 });
    animate(pitch, 6, { type: "spring", stiffness: 90, damping: 18 });
  }, [angleResetKey, pitch, yaw]);

  return (
    <div className="fabric-hardcover-mockup">
      <div
        className={`fabric-hardcover-mockup-stage ${dragging ? "is-dragging" : ""}`}
        role="img"
        aria-label="Interactive 3D hardcover preview. Drag to rotate."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <motion.div className="fabric-hardcover-orbit" style={{ rotateX: smoothPitch, rotateY: smoothYaw }}>
          <div className="fabric-hardcover-box">
            <div className="fabric-hardcover-face fabric-hardcover-face-front">
              {frontDataUrl ? <img src={frontDataUrl} alt="Front cover" draggable={false} /> : <span>{title}</span>}
            </div>
            <div className="fabric-hardcover-face fabric-hardcover-face-back">
              {backDataUrl ? <img src={backDataUrl} alt="Back cover" draggable={false} /> : <p>{synopsis}</p>}
            </div>
            <div className="fabric-hardcover-face fabric-hardcover-face-spine">
              <span style={{ color: spineTextColor, fontFamily: spineFontFamily, fontSize: `${Math.max(7, spineFontSize * 0.55)}px` }}>{spine || title}</span>
              <small style={{ color: spineTextColor, fontFamily: spineFontFamily, fontSize: `${Math.max(6, spineAuthorFontSize * 0.55)}px` }}>{spineAuthor || author}</small>
            </div>
            <div className="fabric-hardcover-face fabric-hardcover-face-right" aria-hidden="true" />
            <div className="fabric-hardcover-face fabric-hardcover-face-top" aria-hidden="true" />
            <div className="fabric-hardcover-face fabric-hardcover-face-bottom" aria-hidden="true" />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

const WIDTH = 600;
const HEIGHT = 900;
const WRAP_WIDTH = 1320;
const IMAGE_MARKER = "__SHELVE_COVER_ART__";
FabricObject.customProperties = [...new Set([...FabricObject.customProperties, "name", "objectType", "locked"])];

const asCoverObject = (object: FabricObject): FabricCoverObject => object as FabricCoverObject;
const objectName = (object: FabricObject) => asCoverObject(object).name ?? object.type;
const getSpineWidth = (design: WritingCoverDesign) => Math.max(34, Math.min(120, (design.spineWidth ?? 7) * 9));
const objectKind = (object: FabricObject): FabricCoverLayerInfo["kind"] => {
  if (object instanceof IText) return "text";
  if (object instanceof FabricImage) return "image";
  return "shape";
};
const labelFor = (name: string) => name.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const withIdentity = <T extends FabricObject>(object: T, name: string, objectType: string): T => {
  Object.assign(object, { name, objectType });
  return object;
};

function serializedCanvas(canvas: Canvas): CanvasState {
  const serialized = canvas.toJSON() as CanvasState & { objects?: Record<string, unknown>[] };
  if (Array.isArray(serialized.objects)) {
    serialized.objects = serialized.objects
      .filter((object) => object.objectType !== "guide")
      .map((object) => object.objectType === "cover-image" ? { ...object, src: IMAGE_MARKER } : object);
  }
  return serialized;
}

function renderCanvas(canvas: Canvas, multiplier: number) {
  const guides = canvas.getObjects().filter((object) => asCoverObject(object).objectType === "guide");
  guides.forEach((guide) => guide.set("visible", false));
  canvas.renderAll();
  try {
    return canvas.toDataURL({ format: "png", multiplier });
  } finally {
    guides.forEach((guide) => guide.set("visible", true));
    canvas.renderAll();
  }
}

function stateForLoad(state: string, imageUrl: string, imageEnabled = true) {
  const serialized = JSON.parse(state) as CanvasState & { objects?: Record<string, unknown>[] };
  if (Array.isArray(serialized.objects)) {
    serialized.objects = serialized.objects.filter((object) => {
      if (object.objectType === "cover-image") return Boolean(imageUrl) && imageEnabled;
      return object.objectType !== "scrim" || imageEnabled;
    }).map((object) => object.objectType === "cover-image" ? { ...object, src: imageUrl } : object);
  }
  return serialized;
}

function setCanvasBackground(canvas: Canvas, design: WritingCoverDesign, side: "front" | "back" = "front") {
  const isBack = side === "back";
  const start = isBack ? design.backBackground || "#F5EFE6" : design.background || (design.template === "blank" ? "#FFFFFF" : "#0D3B44");
  const end = isBack ? design.backGradientEnd || start : design.gradientEnd || "#E5C07B";
  const type = isBack ? design.backGradientType : design.gradientType;
  canvas.backgroundColor = type === "radial"
    ? new Gradient({
      type: "radial",
      gradientUnits: "pixels",
      coords: { x1: WIDTH / 2, y1: HEIGHT / 2, r1: 0, x2: WIDTH / 2, y2: HEIGHT / 2, r2: WIDTH },
      colorStops: [{ offset: 0, color: end }, { offset: 1, color: start }],
    })
    : new Gradient({
      type: "linear",
      gradientUnits: "pixels",
      coords: { x1: 0, y1: 0, x2: WIDTH, y2: HEIGHT },
      colorStops: [{ offset: 0, color: start }, { offset: 1, color: end }],
    });
}

function paperGrainPattern() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 64;
  textureCanvas.height = 64;
  const context = textureCanvas.getContext("2d");
  if (!context) throw new Error("Could not create the cover paper texture.");
  for (let index = 0; index < 320; index += 1) {
    const alpha = Math.random() * 0.18;
    context.fillStyle = `rgba(255,244,220,${alpha})`;
    context.fillRect(Math.random() * 64, Math.random() * 64, 1, 1);
  }
  return new Pattern({ source: textureCanvas, repeat: "repeat" });
}

function textObject(
  name: FabricName,
  text: string,
  left: number,
  top: number,
  options: { fontSize?: number; fill?: string; fontFamily?: string; textAlign?: "left" | "center" | "right" | "justify"; width?: number; fontWeight?: string | number; angle?: number } = {},
) {
  const textOptions = {
    left, top, originX: "center" as const, originY: "center" as const,
    width: options.width ?? 470,
    fontFamily: options.fontFamily ?? "Playfair Display",
    fontSize: options.fontSize ?? 30,
    fontWeight: options.fontWeight ?? "normal",
    angle: options.angle ?? 0,
    fill: options.fill ?? "#F8F4EC",
    textAlign: options.textAlign ?? "center",
    editable: true,
    splitByGrapheme: false,
    cornerColor: "#E5C07B",
    borderColor: "#E5C07B",
    transparentCorners: false,
    padding: 5,
  };
  const object = name === "blurb"
    ? new Textbox(text, textOptions)
    : new IText(text, textOptions);
  return withIdentity(object, name, "text");
}

type CoverPalette = { background: string; ink: string; accent: string; paper: string; deep: string; fontFamily?: string };
export const DEFAULT_BACK_BLURB = "In a valley where the old orchards meet the sea, a forgotten glasshouse keeps the stories its keepers could not tell. When a daughter returns to settle her family’s estate, she finds a map of impossible gardens and a history that has been carefully pruned. The Glass Orchard is a luminous story about inheritance, belonging, and the wild things that survive us.";

function coverPaletteForDesign(design: WritingCoverDesign): CoverPalette {
  const palettes: Record<string, CoverPalette> = {
    "classic-penguin": { background: "#FAF6EE", ink: "#171715", accent: "#D95D24", paper: "#FAF6EE", deep: "#171715" },
    "midnight-frame": { background: "#0D1117", ink: "#F8F4EC", accent: "#E5C07B", paper: "#EFECE4", deep: "#080B10" },
    "swiss-grid": { background: "#F7F4EE", ink: "#1E2423", accent: "#B85D3B", paper: "#EFECE4", deep: "#212322" },
    "noir-split": { background: "#090A0D", ink: "#F8F4EC", accent: "#DC2626", paper: "#EFECE4", deep: "#090A0D" },
    "editorial-arch": { background: "#F5EFE6", ink: "#16302B", accent: "#C85A32", paper: "#F5EFE6", deep: "#16302B" },
    "vintage-crest": { background: "#10241E", ink: "#F3ECE0", accent: "#C9B985", paper: "#F3ECE0", deep: "#1C2823" },
    brutalist: { background: "#0A0A0B", ink: "#F8F4EC", accent: "#E5C07B", paper: "#EFECE4", deep: "#050506" },
    "botanical-gradient": { background: "#0B132B", ink: "#F59E0B", accent: "#F59E0B", paper: "#FAF7F2", deep: "#1A2E54" },
    "academic-monograph": { background: "#18181B", ink: "#FAF7F2", accent: "#B85032", paper: "#FAF7F2", deep: "#18181B" },
    "art-deco-sunburst": { background: "#0E1726", ink: "#E9D18D", accent: "#D8B85A", paper: "#EFECE4", deep: "#101925" },
    "minimalist-whisper": { background: "#EFE7DA", ink: "#2C221E", accent: "#5C6B57", paper: "#EFE7DA", deep: "#2C221E" },
    "cinema-scrim": { background: "#090A0D", ink: "#F8F4EC", accent: "#DC2626", paper: "#EFECE4", deep: "#090A0D" },
    "coastal-watercolor": { background: "#DCEBE7", ink: "#163B3B", accent: "#497B76", paper: "#F5EFE6", deep: "#173B3D" },
    "solar-orbit": { background: "#101A35", ink: "#F5B544", accent: "#F59E0B", paper: "#F7F2E8", deep: "#0B132B" },
    "botanical-press": { background: "#18352B", ink: "#F5EBDD", accent: "#C9B985", paper: "#F5EBDD", deep: "#10241E" },
    "desert-myth": { background: "#D9A46F", ink: "#33211A", accent: "#8F4C35", paper: "#F0D8B8", deep: "#6D3528" },
    "blueprint-essay": { background: "#E8EDF0", ink: "#1C3445", accent: "#51788A", paper: "#F4F5F1", deep: "#233D4A" },
    "romance-letterpress": { background: "#5B2638", ink: "#FAE8DB", accent: "#D9A98F", paper: "#FAE8DB", deep: "#351A29" },
    "neon-city-noir": { background: "#11121B", ink: "#F4D6CF", accent: "#F06DB4", paper: "#F4D6CF", deep: "#2B1D36" },
    blank: { background: "#FAF8F5", ink: "#29251E", accent: "#9A8464", paper: "#FAF8F5", deep: "#29251E" },
  };
  const palette = palettes[design.template] ?? palettes["classic-penguin"];
  return {
    ...palette,
    background: design.background || palette.background,
    ink: design.titleColor || palette.ink,
  };
}

function coverPaletteForBackDesign(design: WritingCoverDesign): CoverPalette {
  const palettes: Record<WritingBackCoverTemplate, CoverPalette> = {
    "classic-editorial": { background: "#F5EFE6", ink: "#1F1C18", accent: "#C85A32", paper: "#F5EFE6", deep: "#16302B", fontFamily: "Cormorant Garamond" },
    "author-spotlight": { background: "#F5EFE6", ink: "#1F1C18", accent: "#5C6B57", paper: "#FAF7F2", deep: "#2C221E", fontFamily: "Cormorant Garamond" },
    "minimalist-literary": { background: "#FAF7F2", ink: "#1F1C18", accent: "#9B7754", paper: "#FAF7F2", deep: "#2C221E", fontFamily: "Cormorant Garamond" },
    "praise-grid": { background: "#F5EFE6", ink: "#1F1C18", accent: "#C85A32", paper: "#FAF7F2", deep: "#16302B", fontFamily: "Cormorant Garamond" },
    "swiss-grid-back": { background: "#F7F4EE", ink: "#18181B", accent: "#B85032", paper: "#EFECE6", deep: "#18181B", fontFamily: "Inter" },
    "tri-band-back": { background: "#FAF6EE", ink: "#171715", accent: "#D95D24", paper: "#FAF6EE", deep: "#171715", fontFamily: "Cormorant Garamond" },
    "framed-keepsake": { background: "#F5EFE6", ink: "#1F1C18", accent: "#5C6B57", paper: "#FAF7F2", deep: "#16302B", fontFamily: "Cormorant Garamond" },
    "atmospheric-dark": { background: "#090A0D", ink: "#F8F4EC", accent: "#DC2626", paper: "#FAF7F2", deep: "#090A0D", fontFamily: "Cormorant Garamond" },
    "coastal-editorial-back": { background: "#E7F0EC", ink: "#193B38", accent: "#497B76", paper: "#F5F5EF", deep: "#173B3D", fontFamily: "Cormorant Garamond" },
    "field-notes-back": { background: "#EEE8D9", ink: "#302C23", accent: "#718166", paper: "#F7F3E9", deep: "#353B30", fontFamily: "Inter" },
    "science-fiction-back": { background: "#0B132B", ink: "#F5F0E7", accent: "#F59E0B", paper: "#F7F2E8", deep: "#101A35", fontFamily: "Inter" },
    "poetry-verse-back": { background: "#EFE7DA", ink: "#2C221E", accent: "#5C6B57", paper: "#FAF7F2", deep: "#2C221E", fontFamily: "Cormorant Garamond" },
    "romance-letter-back": { background: "#F7E9E1", ink: "#4A2432", accent: "#9E5362", paper: "#FFF9F3", deep: "#532839", fontFamily: "Playfair Display" },
    "mythic-chronicle-back": { background: "#182A2B", ink: "#F4E7C7", accent: "#C89A52", paper: "#F4E7C7", deep: "#101A1B", fontFamily: "Cinzel" },
    "academic-press-back": { background: "#F1EFE8", ink: "#242A2B", accent: "#52716D", paper: "#F8F7F2", deep: "#252A2A", fontFamily: "Cormorant Garamond" },
    "noir-casefile-back": { background: "#111216", ink: "#F3EEE7", accent: "#CF3D45", paper: "#F7F3EB", deep: "#090A0D", fontFamily: "Inter" },
    "memoir-photo-back": { background: "#E8DFD2", ink: "#342B25", accent: "#8C6F57", paper: "#F6F1E9", deep: "#302A25", fontFamily: "Cormorant Garamond" },
    "garden-chronicle-back": { background: "#E9EBDD", ink: "#26362B", accent: "#6A7E55", paper: "#F5F2E8", deep: "#23352B", fontFamily: "Cormorant Garamond" },
    "minimal-metadata-back": { background: "#FAF8F5", ink: "#29251E", accent: "#9A8464", paper: "#FAF8F5", deep: "#29251E", fontFamily: "Inter" },
    blank: { background: "#FAF8F5", ink: "#29251E", accent: "#9A8464", paper: "#FAF8F5", deep: "#29251E", fontFamily: "Cormorant Garamond" },
  };
  const palette = palettes[design.backTemplate ?? "classic-editorial"];
  return {
    ...palette,
    background: design.backBackground || palette.background,
    ink: design.backTextColor || palette.ink,
    fontFamily: design.backFontFamily || palette.fontFamily,
  };
}

export const FRONT_COVER_SCENARIOS: Record<WritingFrontCoverTemplate, { title: string; author: string; subtitle: string; badge: string }> = {
  "classic-penguin": { title: "THE NORTHERN SEA", author: "Henrik Lindqvist", subtitle: "A chronicle of far shores", badge: "A NOVEL" },
  "midnight-frame": { title: "Salt & Cedar", author: "Nadia Benali", subtitle: "Poems from the in-between", badge: "POETRY" },
  "swiss-grid": { title: "On Quiet Architecture", author: "Julian Mercer", subtitle: "Essays on the spaces we keep", badge: "PHILOSOPHY / ESSAYS" },
  "noir-split": { title: "MIDNIGHT AT HARBOR 9", author: "Elena Rostova", subtitle: "A Harbor District mystery", badge: "A NOIR THRILLER" },
  "editorial-arch": { title: "The Glass Orchard", author: "Clara Vance", subtitle: "A novel of memory and wild things", badge: "LITERARY FICTION" },
  "vintage-crest": { title: "THE NORTHERN SEA", author: "Henrik Lindqvist", subtitle: "A chronicle of far shores", badge: "A NOVEL" },
  brutalist: { title: "ORBITAL ZERO", author: "Kaelen Voss", subtitle: "The last signal from Europa", badge: "SPECULATIVE FICTION" },
  "botanical-gradient": { title: "ORBITAL ZERO", author: "Kaelen Voss", subtitle: "The last signal from Europa", badge: "SPECULATIVE FICTION" },
  "academic-monograph": { title: "On Quiet Architecture", author: "Julian Mercer", subtitle: "Essays on the spaces we keep", badge: "PHILOSOPHY / ESSAYS" },
  "art-deco-sunburst": { title: "Salt & Cedar", author: "Nadia Benali", subtitle: "Poems from the in-between", badge: "POETRY" },
  "minimalist-whisper": { title: "Salt & Cedar", author: "Nadia Benali", subtitle: "Poems from the in-between", badge: "POETRY" },
  "cinema-scrim": { title: "MIDNIGHT AT HARBOR 9", author: "Elena Rostova", subtitle: "A Harbor District mystery", badge: "A NOIR THRILLER" },
  "coastal-watercolor": { title: "The Lantern Coast", author: "Mara Reyes", subtitle: "Where the tide returns every secret", badge: "A NOVEL" },
  "solar-orbit": { title: "AXIOM STATION", author: "Ren Ito", subtitle: "The signal came from inside the sun", badge: "SCI-FI / 2189" },
  "botanical-press": { title: "A Garden of Names", author: "Elise Hart", subtitle: "A field guide to what we inherit", badge: "LITERARY FICTION" },
  "desert-myth": { title: "The City Beneath Sand", author: "Ilyan Qadir", subtitle: "An atlas of vanished kingdoms", badge: "A MYTHIC NOVEL" },
  "blueprint-essay": { title: "Rooms for Thought", author: "Nora Vale", subtitle: "Notes on living with intention", badge: "ESSAYS" },
  "romance-letterpress": { title: "Letters in Bloom", author: "Sophie Laurent", subtitle: "A correspondence across two summers", badge: "A NOVEL" },
  "neon-city-noir": { title: "The Last Blue Hour", author: "Daria Volkov", subtitle: "A city keeps its own alibis", badge: "A CITY NOIR" },
  blank: { title: "", author: "", subtitle: "", badge: "" },
};

export const BACK_COVER_SCENARIOS: Record<WritingBackCoverTemplate, {
  author: string;
  category: string;
  blurb: string;
  quote: string;
  source: string;
  bio: string;
}> = {
  "classic-editorial": {
    author: "Clara Vance", category: "FICTION / LITERARY", blurb: DEFAULT_BACK_BLURB,
    quote: "“A luminous, unforgettable debut.”", source: "— THE PARIS REVIEW",
    bio: "Clara Vance writes about memory, family, and the landscapes that shape us. Her essays and stories have appeared in journals on both sides of the Atlantic.",
  },
  "author-spotlight": {
    author: "Nadia Benali", category: "POETRY / MEMOIR",
    blurb: "Salt & Cedar follows a daughter between the coast where she was raised and the city she chose. In these poems, kitchen windows, sea walls, and family sayings become a map back to herself.",
    quote: "“A book of rare tenderness and clarity.”", source: "— THE BOOK REVIEW",
    bio: "Nadia Benali is a poet and essayist whose work explores language, migration, and the small rituals that make a home.",
  },
  "minimalist-literary": {
    author: "Julian Mercer", category: "ESSAYS / CULTURE",
    blurb: "What makes a room feel like ours? Julian Mercer looks closely at the quiet architecture of daily life: the thresholds we cross, the objects we keep, and the spaces that teach us how to belong.",
    quote: "“A graceful invitation to pay attention.”", source: "— THE COMMON READER",
    bio: "Julian Mercer writes about architecture, place, and the ordinary details that give a life its shape.",
  },
  "praise-grid": {
    author: "Elena Rostova", category: "FICTION / MYSTERY",
    blurb: "At Harbor 9, every witness remembers a different night. When an old case resurfaces, inspector Mara Sokolov follows a trail of dockside receipts, missing hours, and loyalties that have outlasted the truth.",
    quote: "“Sharp, atmospheric, and impossible to put down.”", source: "— LITERARY HUB",
    bio: "Elena Rostova is the author of the Harbor District mysteries.",
  },
  "swiss-grid-back": {
    author: "Ren Ito", category: "SCIENCE FICTION",
    blurb: "Axiom Station was built to listen to the stars. When its instruments detect a repeating signal from the sun, systems engineer Sora Lin discovers the message is changing—and the station is running out of time.",
    quote: "“A brilliantly precise voyage into the unknown.”", source: "— ORBITAL REVIEW",
    bio: "Ren Ito writes speculative fiction about technology, memory, and our place in the cosmos.",
  },
  "tri-band-back": {
    author: "Henrik Lindqvist", category: "FICTION / HISTORICAL",
    blurb: "On the northern coast, a lighthouse keeper records the names of ships that never return. Decades later, his granddaughter finds the ledger and learns that every blank page marks a choice someone made to survive.",
    quote: "“A haunting story with the sweep of the sea.”", source: "— NORTH & SOUTH",
    bio: "Henrik Lindqvist is a novelist whose work draws on the histories and folklore of the Nordic coast.",
  },
  "framed-keepsake": {
    author: "Mara Reyes", category: "FICTION / LITERARY",
    blurb: "At the edge of a salt-bright town, an abandoned glasshouse holds a family’s unfinished stories. Mara Reyes brings three generations together in a novel about what we inherit—and what we choose to grow.",
    quote: "“A luminous, unforgettable debut.”", source: "— THE PARIS REVIEW",
    bio: "Mara Reyes writes from the Pacific coast, where the weather often changes the ending.",
  },
  "atmospheric-dark": {
    author: "Daria Volkov", category: "FICTION / NOIR",
    blurb: "At the last blue hour, a missing journalist leaves behind one tape and a list of names. Detective Anya Sokolov follows the evidence through a city where every light has a price and every silence belongs to someone.",
    quote: "“A dark, beautiful book that refuses to let go.”", source: "— NIGHT READER",
    bio: "Daria Volkov writes noir fiction about cities, secrets, and the people caught between them.",
  },
  "coastal-editorial-back": {
    author: "Mara Reyes", category: "FICTION / COASTAL",
    blurb: "Every spring, the tide leaves a lantern on the shore. When cartographer Inés Vale finds one still burning, she follows its light to a village that disappeared from every map but her grandmother’s.",
    quote: "“A salt-air story full of wonder.”", source: "— THE COASTAL REVIEW",
    bio: "Mara Reyes is a novelist and amateur tide-pool naturalist.",
  },
  "field-notes-back": {
    author: "Elise Hart", category: "NATURE / LITERARY",
    blurb: "A botanist returns to catalog the plants on her family’s hillside. In the margins of her field notebook, she finds her mother’s observations—and a record of the year the garden began to change.",
    quote: "“An intimate field guide to belonging.”", source: "— THE NATURALIST",
    bio: "Elise Hart writes about gardens, kinship, and the language of living things.",
  },
  "science-fiction-back": {
    author: "Ren Ito", category: "SCI-FI / SPECULATIVE",
    blurb: "The signal from Axiom Station arrives seven minutes before it is sent. Engineer Sora Lin has one orbit to discover who—or what—is answering, before Earth mistakes the message for a warning.",
    quote: "“Big ideas, beautifully human stakes.”", source: "— ORBITAL REVIEW",
    bio: "Ren Ito is a speculative-fiction writer and former systems engineer.",
  },
  "poetry-verse-back": {
    author: "Nadia Benali", category: "POETRY / MEMOIR",
    blurb: "These poems move between salt water and cedar shade, between a mother’s first language and a daughter’s new one. Each page makes room for what distance changes—and what it leaves intact.",
    quote: "“Tender, exact, and quietly radiant.”", source: "— VERSE & VOICE",
    bio: "Nadia Benali is a poet and essayist.",
  },
  "romance-letter-back": {
    author: "Sophie Laurent", category: "FICTION / ROMANCE",
    blurb: "Two strangers begin exchanging letters through a bookshop’s lost-and-found. By the time they learn each other’s names, the summer is nearly over—and the truth they have avoided is waiting at the station.",
    quote: "“A romance to keep and reread.”", source: "— PAPERBACK MONTHLY",
    bio: "Sophie Laurent writes love stories about timing, courage, and second chances.",
  },
  "mythic-chronicle-back": {
    author: "Ilyan Qadir", category: "FANTASY / MYTH",
    blurb: "Beneath the dunes lies a city whose doors open only at moonrise. A young archivist descends to recover its lost names, and discovers that the kingdom above has been built on a story no one was meant to remember.",
    quote: "“An epic with the intimacy of a whispered legend.”", source: "— MYTH & MAP",
    bio: "Ilyan Qadir writes mythic fantasy inspired by desert histories and oral storytelling.",
  },
  "academic-press-back": {
    author: "Julian Mercer", category: "PHILOSOPHY / ESSAYS",
    blurb: "In eight lucid essays, Julian Mercer asks how the places we inhabit shape the people we become. From a rented room to a public square, each space offers a lesson in attention, care, and shared life.",
    quote: "“A rare work of clarity and generosity.”", source: "— THE IDEAS REVIEW",
    bio: "Julian Mercer teaches and writes about architecture, ethics, and everyday life.",
  },
  "noir-casefile-back": {
    author: "Daria Volkov", category: "THRILLER / NOIR",
    blurb: "CASE 09-441 was closed at 02:13. The evidence says otherwise. When a new witness calls from Harbor 9, Detective Sokolov reopens a file that implicates the one person she still trusts.",
    quote: "“Sharp, atmospheric, and impossible to put down.”", source: "— LITERARY HUB",
    bio: "Daria Volkov is the author of The Last Blue Hour.",
  },
  "memoir-photo-back": {
    author: "Nadia Benali", category: "MEMOIR / FAMILY",
    blurb: "A box of photographs arrives without a return address. As Nadia traces the faces and places inside, a family history emerges in fragments: a harbor, a cedar tree, and the promises that crossed an ocean.",
    quote: "“A beautiful meditation on what a family keeps.”", source: "— THE MEMOIRIST",
    bio: "Nadia Benali is a poet and essayist whose work has appeared in literary journals.",
  },
  "garden-chronicle-back": {
    author: "Clara Vance", category: "FICTION / LITERARY",
    blurb: "A walled garden changes its layout each night. Its new caretaker begins leaving notes among the leaves, only to find replies in the handwriting of the woman who built it a century ago.",
    quote: "“A luminous, unforgettable debut.”", source: "— THE PARIS REVIEW",
    bio: "Clara Vance writes about memory, family, and the landscapes that shape us.",
  },
  "minimal-metadata-back": {
    author: "Nora Vale", category: "ESSAYS / CULTURE",
    blurb: "A clear-eyed collection about the routines, rooms, and relationships that make a life. Nora Vale finds meaning not in grand gestures, but in the small decisions we make every day.",
    quote: "“Elegant, humane, and deeply considered.”", source: "— THE COMMON READER",
    bio: "Nora Vale is an essayist and cultural critic.",
  },
  blank: { author: "", category: "", blurb: "", quote: "", source: "", bio: "" },
};

function addTemplateObjects(canvas: Canvas, design: WritingCoverDesign, title: string, author: string, genre: string) {
  const palette = coverPaletteForDesign(design);
  canvas.backgroundColor = design.background || palette.background;
  const scenario = FRONT_COVER_SCENARIOS[design.template as WritingFrontCoverTemplate];
  const isUntitled = ["", "untitled", "untitled story"].includes(title.trim().toLowerCase());
  const titleText = isUntitled ? scenario.title : title;
  const authorText = author.trim() || scenario.author;
  const subtitleText = design.subtitle || scenario.subtitle;
  const badgeText = design.badge && design.badge !== "A NOVEL" ? design.badge : scenario.badge;
  if (design.template === "blank") {
    canvas.backgroundColor = design.background || "#FAF8F5";
    canvas.renderAll();
    return;
  }
  const addRect = (name: string, left: number, top: number, width: number, height: number, fill: string | TFiller, options: Record<string, unknown> = {}) => {
    canvas.add(withIdentity(new Rect({ left, top, width, height, fill, selectable: true, ...options }), name, "shape"));
  };
  const addRule = (name: string, x1: number, y1: number, x2: number, y2: number, color = palette.accent, width = 2) => {
    canvas.add(withIdentity(new Line([x1, y1, x2, y2], { stroke: color, strokeWidth: width }), name, "shape"));
  };
  const addText = (
    name: FabricName,
    text: string,
    x: number,
    y: number,
    options: { fontSize?: number; fill?: string; fontFamily?: string; width?: number; textAlign?: "left" | "center" | "right"; fontWeight?: string | number; fontStyle?: "normal" | "italic"; charSpacing?: number; lineHeight?: number },
  ) => {
    const object = textObject(name, text, x, y, options);
    object.set({ fontStyle: options.fontStyle, charSpacing: options.charSpacing, lineHeight: options.lineHeight });
    canvas.add(object);
  };
  const addFrame = (name: string, inset: number, color = palette.accent, strokeWidth = 2) => {
    addRect(`${name} frame`, inset, inset, WIDTH - inset * 2, HEIGHT - inset * 2, "rgba(0,0,0,0)", { stroke: color, strokeWidth });
  };
  const addDiamond = (name: string, x: number, y: number, size: number, color = palette.accent) => {
    canvas.add(withIdentity(new Polygon(
      [{ x, y: y - size }, { x: x + size, y }, { x, y: y + size }, { x: x - size, y }],
      { fill: color, stroke: color, strokeWidth: 1 },
    ), name, "shape"));
  };

  if (design.template === "classic-penguin") {
    canvas.backgroundColor = "#FAF6EE";
    addRect("Tangerine center band", 0, 180, WIDTH, 500, "#D95D24");
    addText("author", authorText.toUpperCase(), WIDTH / 2, 76, { fontSize: 16, fill: "#171715", fontFamily: "Inter", fontWeight: 700, charSpacing: 150 });
    addRule("Top series rule", 86, 132, 514, 132, "#171715", 2);
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 154, { fontSize: 10, fill: "#171715", fontFamily: "Inter", charSpacing: 180 });
    addText("title", titleText, WIDTH / 2, 410, { fontSize: 56, fill: "#171715", fontFamily: "Cormorant Garamond", fontWeight: 600, width: 490 });
    addText("subtitle", subtitleText, WIDTH / 2, 548, { fontSize: 23, fill: "#171715", fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 450 });
  } else if (design.template === "midnight-frame") {
    canvas.backgroundColor = "#0D1117";
    addFrame("Outer champagne", 28, "#E5C07B", 2);
    addFrame("Inner champagne", 42, "#E5C07B", 1);
    [[48, 48], [552, 48], [48, 852], [552, 852]].forEach(([x, y], index) => addDiamond(`Corner diamond ${index + 1}`, x, y, 7));
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 208, { fontSize: 13, fill: "#E5C07B", fontFamily: "Inter", charSpacing: 260 });
    addRule("Title divider", 190, 274, 410, 274, "#E5C07B", 1);
    addText("title", titleText, WIDTH / 2, 425, { fontSize: 54, fill: "#F8F4EC", fontFamily: "Cinzel", width: 460 });
    addText("subtitle", subtitleText, WIDTH / 2, 542, { fontSize: 22, fill: "#E5C07B", fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 430 });
    addText("author", authorText.toUpperCase(), WIDTH / 2, 790, { fontSize: 14, fill: "#F8F4EC", fontFamily: "Inter", charSpacing: 180 });
  } else if (design.template === "swiss-grid") {
    canvas.backgroundColor = "#F7F4EE";
    addRect("Terracotta grid block", 0, 0, 210, 165, "#B85D3B");
    addRect("Ink corner block", 470, 704, 130, 196, "#1E2423");
    addRule("Swiss rule one", 48, 204, 552, 204, "#1E2423", 1);
    addRule("Swiss rule two", 48, 700, 552, 700, "#1E2423", 1);
    addText("tag", genre.toUpperCase(), 70, 127, { fontSize: 13, fill: "#F7F4EE", fontFamily: "Inter", fontWeight: 700, textAlign: "left", width: 420, charSpacing: 110 });
    addText("title", titleText, 72, 388, { fontSize: 43, fill: "#1E2423", fontFamily: "Inter", fontWeight: 700, textAlign: "left", width: 460, lineHeight: 1.05 });
    addText("subtitle", subtitleText, 72, 505, { fontSize: 20, fill: "#565A54", fontFamily: "Inter", textAlign: "left", width: 410 });
    addText("author", authorText.toUpperCase(), 72, 790, { fontSize: 13, fill: "#1E2423", fontFamily: "Inter", fontWeight: 700, textAlign: "left", width: 350, charSpacing: 100 });
  } else if (design.template === "noir-split") {
    canvas.backgroundColor = "#090A0D";
    addRect("Crimson spine band", 0, 0, 100, HEIGHT, "#DC2626");
    canvas.add(withIdentity(new Polygon([{ x: 510, y: 0 }, { x: 600, y: 0 }, { x: 220, y: 900 }, { x: 130, y: 900 }], { fill: "#DC2626", opacity: 0.12 }), "Diagonal crimson slash", "shape"));
    addRect("Noir accent line", 140, 160, 5, 580, "#DC2626");
    addText("tag", badgeText.toUpperCase(), 174, 560, { fontSize: 12, fill: "#DC2626", fontFamily: "Inter", textAlign: "left", width: 390, charSpacing: 160 });
    addText("title", titleText, 174, 662, { fontSize: 48, fill: "#F8F4EC", fontFamily: "Inter", fontWeight: 700, textAlign: "left", width: 395, lineHeight: 1.02 });
    addText("subtitle", subtitleText, 174, 753, { fontSize: 19, fill: "#D4D0C8", fontFamily: "Cormorant Garamond", fontStyle: "italic", textAlign: "left", width: 370 });
    addText("author", authorText.toUpperCase(), 174, 822, { fontSize: 13, fill: "#F8F4EC", fontFamily: "Inter", fontWeight: 600, textAlign: "left", width: 380, charSpacing: 120 });
  } else if (design.template === "editorial-arch") {
    canvas.backgroundColor = "#F8F4EC";
    const archPoints = [{ x: 140, y: 740 }, { x: 140, y: 400 }];
    for (let step = 0; step <= 16; step += 1) {
      const angle = Math.PI - (Math.PI * step) / 16;
      archPoints.push({ x: 300 + 160 * Math.cos(angle), y: 400 - 160 * Math.sin(angle) });
    }
    archPoints.push({ x: 460, y: 740 });
    canvas.add(withIdentity(new Polygon(archPoints, { fill: "#16302B", opacity: 0.1, stroke: "#C85A32", strokeWidth: 2 }), "Botanical forest arch", "shape"));
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 184, { fontSize: 11, fill: "#596454", fontFamily: "Inter", charSpacing: 190 });
    addText("title", titleText, WIDTH / 2, 422, { fontSize: 48, fill: "#292721", fontFamily: "Playfair Display", fontStyle: "italic", width: 440 });
    addText("subtitle", subtitleText, WIDTH / 2, 540, { fontSize: 22, fill: "#44483F", fontFamily: "Cormorant Garamond", width: 420 });
    addRule("Arch ornamental divider", 220, 608, 380, 608, "#C85A32", 1);
    addDiamond("Arch divider ornament", 300, 608, 5, "#C85A32");
    addRule("Botanical branch", 126, 694, 204, 572, "#5C6B57", 2);
    addRule("Botanical leaf", 160, 642, 111, 617, "#5C6B57", 2);
    addText("author", authorText.toUpperCase(), WIDTH / 2, 790, { fontSize: 13, fill: "#363A32", fontFamily: "Inter", charSpacing: 150 });
  } else if (design.template === "vintage-crest") {
    canvas.backgroundColor = "#10241E";
    addRect("Linen label plate", 55, 112, 490, 488, "#F3ECE0", { stroke: "#C9B985", strokeWidth: 2 });
    addRect("Plate inset rule", 70, 127, 460, 458, "rgba(0,0,0,0)", { stroke: "#8B927E", strokeWidth: 1 });
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 195, { fontSize: 11, fill: "#445247", fontFamily: "Inter", charSpacing: 150 });
    addText("title", titleText, WIDTH / 2, 352, { fontSize: 47, fill: "#29251E", fontFamily: "Cormorant Garamond", width: 430 });
    addText("subtitle", subtitleText, WIDTH / 2, 465, { fontSize: 20, fill: "#51564C", fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 420 });
    canvas.add(withIdentity(new Circle({ left: WIDTH / 2, top: 680, originX: "center", originY: "center", radius: 32, fill: "rgba(0,0,0,0)", stroke: "#C9B985", strokeWidth: 2 }), "Publisher crest", "shape"));
    addText("publisher", "✦", WIDTH / 2, 680, { fontSize: 25, fill: "#C9B985", fontFamily: "Cinzel" });
    addText("author", authorText.toUpperCase(), WIDTH / 2, 790, { fontSize: 13, fill: "#F3ECE0", fontFamily: "Inter", charSpacing: 170 });
  } else if (design.template === "brutalist") {
    canvas.backgroundColor = "#0A0A0B";
    addText("tag", badgeText.toUpperCase(), 54, 112, { fontSize: 12, fill: "#E5C07B", fontFamily: "Inter", textAlign: "left", width: 470, charSpacing: 220 });
    addText("title", titleText, 300, 410, { fontSize: 70, fill: "#F8F4EC", fontFamily: "Inter", fontWeight: 900, width: 530, lineHeight: 0.9 });
    addRect("Gold brutalist bar", 52, 690, 145, 9, "#E5C07B");
    addText("subtitle", subtitleText, 52, 735, { fontSize: 18, fill: "#D5D0C6", fontFamily: "Inter", textAlign: "left", width: 490 });
    addText("author", authorText.toUpperCase(), 52, 812, { fontSize: 13, fill: "#F8F4EC", fontFamily: "Inter", textAlign: "left", width: 480, charSpacing: 170 });
  } else if (design.template === "botanical-gradient") {
    canvas.backgroundColor = new Gradient({
      type: "radial", gradientUnits: "pixels", coords: { x1: WIDTH / 2, y1: 380, r1: 0, x2: WIDTH / 2, y2: 380, r2: WIDTH },
      colorStops: [{ offset: 0, color: "#1A2E54" }, { offset: 1, color: "#0B132B" }],
    });
    [95, 155, 215].forEach((radius, index) => {
      canvas.add(withIdentity(new Circle({ left: 300, top: 350, originX: "center", originY: "center", radius, fill: "rgba(0,0,0,0)", stroke: "#F59E0B", strokeWidth: 1, opacity: 0.55 - index * 0.1 }), `Orbital ring ${index + 1}`, "shape"));
    });
    addRule("Geometric horizon one", 0, 575, WIDTH, 575, "#F59E0B", 1);
    addRule("Geometric horizon two", 70, 630, 530, 630, "#F59E0B", 1);
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 188, { fontSize: 11, fill: "#F59E0B", fontFamily: "Inter", charSpacing: 230 });
    addText("title", titleText, WIDTH / 2, 430, { fontSize: 50, fill: "#FAF7F2", fontFamily: "Inter", fontWeight: 700, width: 460 });
    addText("subtitle", subtitleText, WIDTH / 2, 540, { fontSize: 16, fill: "#F59E0B", fontFamily: "Cormorant Garamond", charSpacing: 80, width: 430 });
    addText("author", authorText.toUpperCase(), WIDTH / 2, 790, { fontSize: 12, fill: "#FAF7F2", fontFamily: "Inter", charSpacing: 180 });
  } else if (design.template === "academic-monograph") {
    canvas.backgroundColor = "#18181B";
    addRect("Monograph terracotta block", 0, 0, 210, 165, "#B85032");
    addRect("Monograph top rule", 48, 62, 504, 7, "#FAF7F2");
    addText("tag", `${genre.toUpperCase()}  /  MONOGRAPH`, 55, 112, { fontSize: 11, fill: "#FAF7F2", fontFamily: "Inter", textAlign: "left", width: 480, charSpacing: 120 });
    addRule("Monograph header rule", 55, 145, 545, 145, "#B85032", 1);
    addText("title", titleText, 55, 355, { fontSize: 46, fill: "#FAF7F2", fontFamily: "Cormorant Garamond", textAlign: "left", width: 470 });
    addText("subtitle", subtitleText, 55, 480, { fontSize: 21, fill: "#E3DED4", fontFamily: "Cormorant Garamond", textAlign: "left", width: 450 });
    addRule("Monograph footer rule", 55, 740, 545, 740, "#B85032", 1);
    addText("publisher", "SHELVE MONOGRAPH SERIES", 55, 788, { fontSize: 10, fill: "#FAF7F2", fontFamily: "Inter", textAlign: "left", width: 250, charSpacing: 100 });
    addText("author", authorText.toUpperCase(), 545, 788, { fontSize: 11, fill: "#FAF7F2", fontFamily: "Inter", textAlign: "right", width: 250, charSpacing: 90 });
  } else if (design.template === "art-deco-sunburst") {
    canvas.backgroundColor = "#0E1726";
    addFrame("Deco outer frame", 30, "#D8B85A", 2);
    addFrame("Deco inner frame", 48, "#D8B85A", 1);
    [[70, 70], [530, 70], [70, 830], [530, 830]].forEach(([x, y], index) => {
      addRule(`Deco step horizontal ${index}`, x - 18, y, x + 18, y, "#D8B85A", 2);
      addRule(`Deco step vertical ${index}`, x, y - 18, x, y + 18, "#D8B85A", 2);
    });
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 185, { fontSize: 12, fill: "#D8B85A", fontFamily: "Cinzel", charSpacing: 230 });
    addDiamond("Deco center ornament", WIDTH / 2, 290, 19, "#D8B85A");
    addText("title", titleText, WIDTH / 2, 470, { fontSize: 50, fill: "#F2E6BC", fontFamily: "Cinzel", width: 440, charSpacing: 55 });
    addText("subtitle", subtitleText, WIDTH / 2, 590, { fontSize: 20, fill: "#D8B85A", fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 420 });
    addText("author", authorText.toUpperCase(), WIDTH / 2, 790, { fontSize: 12, fill: "#F2E6BC", fontFamily: "Inter", charSpacing: 190 });
  } else if (design.template === "minimalist-whisper") {
    canvas.backgroundColor = "#EFE7DA";
    addFrame("Poetry outer hairline", 30, "#5C6B57", 1);
    addFrame("Poetry inner hairline", 42, "#5C6B57", 1);
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 325, { fontSize: 9, fill: "#777267", fontFamily: "Inter", charSpacing: 210 });
    addText("title", titleText, WIDTH / 2, 426, { fontSize: 31, fill: "#2C221E", fontFamily: "Playfair Display", width: 420 });
    addText("subtitle", subtitleText, WIDTH / 2, 490, { fontSize: 15, fill: "#5C6B57", fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 380 });
    addDiamond("Poetry olive diamond", WIDTH / 2, 568, 6, "#5C6B57");
    addText("author", authorText.toUpperCase(), WIDTH / 2, 810, { fontSize: 10, fill: "#2C221E", fontFamily: "Inter", charSpacing: 180 });
  } else if (design.template === "coastal-watercolor") {
    canvas.backgroundColor = new Gradient({
      type: "linear", gradientUnits: "pixels", coords: { x1: 0, y1: 0, x2: WIDTH, y2: HEIGHT },
      colorStops: [{ offset: 0, color: "#F5EFE6" }, { offset: 0.55, color: "#DCEBE7" }, { offset: 1, color: "#A9C9C1" }],
    });
    canvas.add(withIdentity(new Polygon(
      [{ x: 0, y: 545 }, { x: 115, y: 505 }, { x: 220, y: 540 }, { x: 345, y: 495 }, { x: WIDTH, y: 530 }, { x: WIDTH, y: 900 }, { x: 0, y: 900 }],
      { fill: "#497B76", opacity: 0.25, stroke: "#497B76", strokeWidth: 1 },
    ), "Coastal watercolor tide", "shape"));
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 190, { fontSize: 11, fill: "#497B76", fontFamily: "Inter", charSpacing: 190 });
    addText("title", titleText, WIDTH / 2, 390, { fontSize: 49, fill: "#163B3B", fontFamily: "Playfair Display", width: 470 });
    addRule("Coastal horizon", 150, 515, 450, 515, "#497B76", 1);
    addText("subtitle", subtitleText, WIDTH / 2, 575, { fontSize: 20, fill: "#315B56", fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 430 });
    addText("author", authorText, WIDTH / 2, 800, { fontSize: 14, fill: "#163B3B", fontFamily: "Inter", charSpacing: 120 });
  } else if (design.template === "solar-orbit") {
    canvas.backgroundColor = "#101A35";
    [100, 172, 245].forEach((radius, index) => {
      canvas.add(withIdentity(new Circle({ left: 300, top: 350, originX: "center", originY: "center", radius, fill: "rgba(0,0,0,0)", stroke: "#F59E0B", strokeWidth: index === 1 ? 2 : 1, opacity: 0.7 - index * 0.12 }), `Solar orbit ${index + 1}`, "shape"));
    });
    canvas.add(withIdentity(new Circle({ left: 420, top: 272, originX: "center", originY: "center", radius: 11, fill: "#F5B544", stroke: "#F5B544" }), "Orbiting signal", "shape"));
    addRule("Solar horizon", 42, 600, 558, 600, "#F59E0B", 1);
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 158, { fontSize: 11, fill: "#F5B544", fontFamily: "Inter", charSpacing: 230 });
    addText("title", titleText, WIDTH / 2, 510, { fontSize: 52, fill: "#F5F0E7", fontFamily: "Inter", fontWeight: 800, width: 490 });
    addText("subtitle", subtitleText, WIDTH / 2, 622, { fontSize: 17, fill: "#F5B544", fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 440 });
    addText("author", authorText.toUpperCase(), WIDTH / 2, 808, { fontSize: 12, fill: "#F5F0E7", fontFamily: "Inter", charSpacing: 190 });
  } else if (design.template === "botanical-press") {
    canvas.backgroundColor = "#18352B";
    addFrame("Botanical press outer frame", 32, "#C9B985", 2);
    addFrame("Botanical press inner frame", 44, "#C9B985", 1);
    const arch = [{ x: 155, y: 700 }, { x: 155, y: 365 }];
    for (let step = 0; step <= 18; step += 1) {
      const angle = Math.PI - (Math.PI * step) / 18;
      arch.push({ x: 300 + 145 * Math.cos(angle), y: 365 - 145 * Math.sin(angle) });
    }
    arch.push({ x: 445, y: 700 });
    canvas.add(withIdentity(new Polygon(arch, { fill: "rgba(201,185,133,0.12)", stroke: "#C9B985", strokeWidth: 1 }), "Botanical label arch", "shape"));
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 194, { fontSize: 10, fill: "#C9B985", fontFamily: "Inter", charSpacing: 200 });
    addText("title", titleText, WIDTH / 2, 420, { fontSize: 47, fill: "#F5EBDD", fontFamily: "Cormorant Garamond", width: 430 });
    addRule("Botanical divider", 220, 550, 380, 550, "#C9B985", 1);
    addDiamond("Botanical seed ornament", WIDTH / 2, 550, 5, "#C9B985");
    addText("subtitle", subtitleText, WIDTH / 2, 610, { fontSize: 19, fill: "#D8D0BA", fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 420 });
    addText("author", authorText.toUpperCase(), WIDTH / 2, 800, { fontSize: 12, fill: "#F5EBDD", fontFamily: "Inter", charSpacing: 170 });
  } else if (design.template === "desert-myth") {
    canvas.backgroundColor = new Gradient({
      type: "linear", gradientUnits: "pixels", coords: { x1: 0, y1: 0, x2: 0, y2: HEIGHT },
      colorStops: [{ offset: 0, color: "#F0D8B8" }, { offset: 1, color: "#D9A46F" }],
    });
    canvas.add(withIdentity(new Polygon([{ x: 0, y: 570 }, { x: 105, y: 420 }, { x: 228, y: 568 }, { x: 345, y: 390 }, { x: 485, y: 565 }, { x: WIDTH, y: 446 }, { x: WIDTH, y: 690 }, { x: 0, y: 690 }], { fill: "#8F4C35", opacity: 0.5 }), "Dune silhouette", "shape"));
    canvas.add(withIdentity(new Polygon([{ x: 0, y: 640 }, { x: 160, y: 535 }, { x: 300, y: 650 }, { x: 455, y: 525 }, { x: WIDTH, y: 630 }, { x: WIDTH, y: 760 }, { x: 0, y: 760 }], { fill: "#B9784F", opacity: 0.72 }), "Second dune silhouette", "shape"));
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 160, { fontSize: 11, fill: "#6D3528", fontFamily: "Inter", charSpacing: 180 });
    addText("title", titleText, WIDTH / 2, 390, { fontSize: 50, fill: "#33211A", fontFamily: "Cinzel", width: 470 });
    addRule("Desert sun rule", 210, 505, 390, 505, "#8F4C35", 2);
    addText("subtitle", subtitleText, WIDTH / 2, 620, { fontSize: 19, fill: "#33211A", fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 430 });
    addText("author", authorText.toUpperCase(), WIDTH / 2, 810, { fontSize: 12, fill: "#33211A", fontFamily: "Inter", charSpacing: 170 });
  } else if (design.template === "blueprint-essay") {
    canvas.backgroundColor = "#E8EDF0";
    for (let y = 55; y < HEIGHT; y += 55) addRule(`Blueprint horizontal ${y}`, 0, y, WIDTH, y, "#51788A", 0.5);
    addRect("Blueprint terracotta block", 0, 0, 205, 155, "#B85032");
    addRect("Blueprint ink block", 430, 730, 170, 170, "#233D4A");
    addText("tag", `${genre.toUpperCase()}  /  NOTES`, 50, 115, { fontSize: 11, fill: "#F4F5F1", fontFamily: "Inter", textAlign: "left", width: 500, charSpacing: 130 });
    addRule("Blueprint title rule", 52, 200, 548, 200, "#233D4A", 2);
    addText("title", titleText, 58, 380, { fontSize: 43, fill: "#1C3445", fontFamily: "Inter", fontWeight: 700, textAlign: "left", width: 470, lineHeight: 1.05 });
    addText("subtitle", subtitleText, 58, 520, { fontSize: 19, fill: "#405967", fontFamily: "Cormorant Garamond", textAlign: "left", width: 430 });
    addText("author", authorText.toUpperCase(), 58, 805, { fontSize: 12, fill: "#F4F5F1", fontFamily: "Inter", textAlign: "left", width: 320, charSpacing: 130 });
  } else if (design.template === "romance-letterpress") {
    canvas.backgroundColor = "#5B2638";
    addFrame("Letterpress frame", 28, "#D9A98F", 1);
    [[86, 162], [514, 162], [86, 738], [514, 738]].forEach(([x, y], index) => {
      canvas.add(withIdentity(new Circle({ left: x, top: y, originX: "center", originY: "center", radius: 22, fill: "rgba(0,0,0,0)", stroke: "#D9A98F", strokeWidth: 1 }), `Letterpress floral seal ${index + 1}`, "shape"));
    });
    addDiamond("Letterpress center ornament", WIDTH / 2, 300, 10, "#D9A98F");
    addText("tag", badgeText.toUpperCase(), WIDTH / 2, 210, { fontSize: 10, fill: "#D9A98F", fontFamily: "Inter", charSpacing: 200 });
    addText("title", titleText, WIDTH / 2, 430, { fontSize: 48, fill: "#FAE8DB", fontFamily: "Playfair Display", fontStyle: "italic", width: 455 });
    addRule("Letterpress divider", 205, 545, 395, 545, "#D9A98F", 1);
    addText("subtitle", subtitleText, WIDTH / 2, 610, { fontSize: 19, fill: "#F1D4C5", fontFamily: "Cormorant Garamond", width: 430 });
    addText("author", authorText.toUpperCase(), WIDTH / 2, 800, { fontSize: 12, fill: "#FAE8DB", fontFamily: "Inter", charSpacing: 180 });
  } else if (design.template === "neon-city-noir") {
    canvas.backgroundColor = new Gradient({
      type: "linear", gradientUnits: "pixels", coords: { x1: 0, y1: 0, x2: WIDTH, y2: HEIGHT },
      colorStops: [{ offset: 0, color: "#11121B" }, { offset: 0.6, color: "#211A2B" }, { offset: 1, color: "#2B1D36" }],
    });
    addRect("Neon vertical accent", 58, 118, 5, 620, "#F06DB4");
    addRule("Neon city slash", 110, 178, 484, 83, "#F06DB4", 3);
    addRule("Neon skyline line", 65, 570, 540, 570, "#A8B9CE", 1);
    [85, 145, 210, 306, 382, 468, 520].forEach((x, index) => addRect(`City silhouette ${index + 1}`, x, 500 - (index % 3) * 35, 38, 70 + (index % 3) * 35, "#171923"));
    addText("tag", badgeText.toUpperCase(), 86, 620, { fontSize: 11, fill: "#F06DB4", fontFamily: "Inter", textAlign: "left", width: 430, charSpacing: 150 });
    addText("title", titleText, 86, 715, { fontSize: 48, fill: "#F4D6CF", fontFamily: "Inter", fontWeight: 800, textAlign: "left", width: 440, lineHeight: 1.02 });
    addText("subtitle", subtitleText, 86, 790, { fontSize: 16, fill: "#D7C8D1", fontFamily: "Cormorant Garamond", textAlign: "left", width: 430 });
    addText("author", authorText.toUpperCase(), 86, 846, { fontSize: 10, fill: "#F4D6CF", fontFamily: "Inter", textAlign: "left", width: 420, charSpacing: 130 });
  } else {
    canvas.backgroundColor = new Gradient({
      type: "linear", gradientUnits: "pixels", coords: { x1: 0, y1: 0, x2: 0, y2: HEIGHT },
      colorStops: [{ offset: 0, color: "#323840" }, { offset: 0.5, color: "#1B2027" }, { offset: 1, color: "#090B0E" }],
    });
    addRect("Cinema bottom gradient scrim", 0, 470, WIDTH, 430, new Gradient({
      type: "linear", gradientUnits: "pixels", coords: { x1: 0, y1: 470, x2: 0, y2: HEIGHT },
      colorStops: [{ offset: 0, color: "rgba(9,11,14,0.15)" }, { offset: 1, color: "rgba(9,11,14,0.96)" }],
    }));
    addText("quote", "“A story that stays with you.”", WIDTH / 2, 165, { fontSize: 15, fill: "#F8F4EC", fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 450 });
    addText("title", titleText, WIDTH / 2, 635, { fontSize: 53, fill: "#FFFFFF", fontFamily: "Inter", fontWeight: 800, width: 500 });
    addText("subtitle", subtitleText, WIDTH / 2, 730, { fontSize: 18, fill: "#E5C07B", fontFamily: "Inter", width: 450 });
    addText("author", authorText.toUpperCase(), WIDTH / 2, 810, { fontSize: 12, fill: "#F8F4EC", fontFamily: "Inter", charSpacing: 170 });
  }
  canvas.renderAll();
}

function addBarcode(canvas: Canvas, left: number, top: number, width: number, height: number, ink = "#252521") {
  canvas.add(withIdentity(new Rect({ left, top, width, height, fill: "#FFFFFF", stroke: "#3A3A36", strokeWidth: 1 }), "ISBN barcode", "shape"));
  const barCount = 17;
  const gap = (width - 16) / (barCount - 1);
  for (let index = 0; index < barCount; index += 1) {
    const x = left + 8 + index * gap;
    canvas.add(withIdentity(new Line([x, top + 8, x, top + height - 14], { stroke: ink, strokeWidth: index % 4 === 0 ? 2 : 1 }), `Barcode line ${index + 1}`, "shape"));
  }
  canvas.add(textObject("barcode", "ISBN-13 978-1-954821-04-7", left + width / 2, top + height - 5, { fontSize: 7, fill: ink, fontFamily: "Inter", width: width - 8 }));
}

function addBackCoverObjects(
  canvas: Canvas,
  synopsis: string,
  author: string,
  palette: CoverPalette,
  template: WritingBackCoverTemplate = "classic-editorial",
  genre = "FICTION",
  authorLayer: "author" | "back-author" = "author",
) {
  const story = BACK_COVER_SCENARIOS[template];
  const blurb = synopsis.trim() || story.blurb;
  const authorName = author.trim() || story.author;
  const addText = (
    name: FabricName,
    text: string,
    x: number,
    y: number,
    options: { fontSize?: number; fill?: string; fontFamily?: string; width?: number; textAlign?: "left" | "center" | "right"; fontWeight?: string | number; fontStyle?: "normal" | "italic"; charSpacing?: number },
  ) => {
    const object = textObject(name, text, x, y, { ...options, fontFamily: options.fontFamily ?? palette.fontFamily });
    if (options.charSpacing !== undefined) object.set({ charSpacing: options.charSpacing });
    canvas.add(object);
  };
  const addRect = (name: string, left: number, top: number, width: number, height: number, fill: string) => {
    canvas.add(withIdentity(new Rect({ left, top, width, height, fill }), name, "shape"));
  };
  const addRule = (name: string, x1: number, y1: number, x2: number, y2: number, color = palette.accent) => {
    canvas.add(withIdentity(new Line([x1, y1, x2, y2], { stroke: color, strokeWidth: 1 }), name, "shape"));
  };
  const addBlurb = (x = WIDTH / 2, y = 410, width = 456, color = palette.ink, fontSize = 16, align: "left" | "center" = "left") => {
    addText("blurb", blurb, x, y, { fontSize, fill: color, fontFamily: "Cormorant Garamond", width, textAlign: align });
  };
  const addPublisher = (x: number, y: number, color = palette.ink) => {
    canvas.add(withIdentity(new Circle({ left: x, top: y, originX: "center", originY: "center", radius: 14, fill: "rgba(0,0,0,0)", stroke: color, strokeWidth: 1 }), "Publisher mark", "shape"));
    addText("publisher", "S", x, y, { fontSize: 14, fill: color, fontFamily: "Cinzel" });
  };
  if (template === "blank") return;
  addText("metadata", story.category || genre.toUpperCase(), 72, 66, { fontSize: 10, fill: palette.accent, fontFamily: "Inter", width: 456, textAlign: "left", fontWeight: 700 });

  if (template === "classic-editorial") {
    addText("quote", story.quote, WIDTH / 2, 128, { fontSize: 19, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 450, textAlign: "center" });
    addText("review-source-one", story.source, WIDTH / 2, 164, { fontSize: 9, fill: palette.accent, fontFamily: "Inter", width: 450, textAlign: "center" });
    addRule("Praise divider", 115, 192, 485, 192);
    addBlurb(WIDTH / 2, 430, 456, palette.ink, 16);
    addPublisher(80, 785);
    addBarcode(canvas, 426, 730, 124, 66);
  } else if (template === "author-spotlight") {
    addBlurb(WIDTH / 2, 270, 456, palette.ink, 16);
    addRule("Author bio divider", 70, 460, 530, 460);
    addText("tag", "ABOUT THE AUTHOR", 300, 515, { fontSize: 11, fill: palette.accent, fontFamily: "Inter", width: 450, textAlign: "center" });
    canvas.add(withIdentity(new Circle({ left: 125, top: 660, originX: "center", originY: "center", radius: 54, fill: palette.paper, stroke: palette.accent, strokeWidth: 2 }), "Author portrait placeholder", "shape"));
    canvas.add(withIdentity(new Circle({ left: 125, top: 630, originX: "center", originY: "center", radius: 18, fill: "#D7D1C5", stroke: "#D7D1C5" }), "Portrait silhouette", "shape"));
    canvas.add(withIdentity(new Circle({ left: 125, top: 688, originX: "center", originY: "center", radius: 32, fill: "#D7D1C5", stroke: "#D7D1C5" }), "Portrait shoulders", "shape"));
    addText(authorLayer, authorName, 315, 605, { fontSize: 18, fill: palette.ink, fontFamily: "Playfair Display", width: 300, textAlign: "left" });
    addText("author-bio", story.bio, 315, 690, { fontSize: 14, fill: palette.ink, fontFamily: "Cormorant Garamond", width: 300, textAlign: "left" });
    addBarcode(canvas, 426, 778, 124, 66);
  } else if (template === "minimalist-literary") {
    addBlurb(WIDTH / 2, 390, 430, palette.ink, 17, "center");
    canvas.add(withIdentity(new Circle({ left: WIDTH / 2, top: 575, originX: "center", originY: "center", radius: 4, fill: palette.accent, stroke: palette.accent }), "Minimal back ornament", "shape"));
    addText("author", authorName, WIDTH / 2, 700, { fontSize: 12, fill: palette.ink, fontFamily: "Inter", width: 440, textAlign: "center" });
    addBarcode(canvas, 230, 770, 140, 74);
  } else if (template === "praise-grid") {
    addText("review-quote-one", story.quote, WIDTH / 2, 118, { fontSize: 17, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 470, textAlign: "center" });
    addText("review-source-one", story.source, WIDTH / 2, 160, { fontSize: 9, fill: palette.accent, fontFamily: "Inter", width: 450, textAlign: "center" });
    addRule("Review divider one", 90, 202, 510, 202);
    addText("review-quote-two", "“Sharp, atmospheric, and impossible to put down.”", WIDTH / 2, 250, { fontSize: 16, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 460, textAlign: "center" });
    addText("review-source-two", "— LITERARY HUB", WIDTH / 2, 288, { fontSize: 9, fill: palette.accent, fontFamily: "Inter", width: 450, textAlign: "center" });
    addRule("Review divider two", 90, 325, 510, 325);
    addText("review-quote-three", "“A rare book to return to.”", WIDTH / 2, 366, { fontSize: 16, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 460, textAlign: "center" });
    addText("review-source-three", "— THE READER'S JOURNAL", WIDTH / 2, 402, { fontSize: 9, fill: palette.accent, fontFamily: "Inter", width: 450, textAlign: "center" });
    addRule("Synopsis divider", 90, 442, 510, 442);
    addBlurb(WIDTH / 2, 580, 440, palette.ink, 14);
    addBarcode(canvas, 426, 730, 124, 66);
  } else if (template === "swiss-grid-back") {
    addRule("Metadata column divider", 205, 76, 205, 825, palette.accent);
    addText("metadata", genre.toUpperCase(), 45, 122, { fontSize: 12, fill: palette.ink, fontFamily: "Inter", width: 135, textAlign: "left" });
    addText("metadata", "FIRST EDITION", 45, 177, { fontSize: 10, fill: palette.ink, fontFamily: "Inter", width: 140, textAlign: "left" });
    addText("metadata", "€19.99", 45, 226, { fontSize: 12, fill: palette.ink, fontFamily: "Inter", width: 135, textAlign: "left" });
    addBarcode(canvas, 34, 690, 150, 88);
    addBlurb(400, 390, 330, palette.ink, 16);
    addText("author", authorName, 240, 785, { fontSize: 12, fill: palette.ink, fontFamily: "Inter", width: 320, textAlign: "left" });
  } else if (template === "tri-band-back") {
    addRect("Back top cream band", 0, 0, WIDTH, 150, palette.paper);
    addRect("Back center color band", 0, 150, WIDTH, 560, palette.accent);
    addRect("Back lower cream band", 0, 710, WIDTH, 190, palette.paper);
    addText("tag", "A STORY FOR EVERY GENERATION", WIDTH / 2, 116, { fontSize: 9, fill: palette.deep, fontFamily: "Inter", width: 500, textAlign: "center" });
    addBlurb(WIDTH / 2, 418, 456, "#211A16", 16);
    addText("author", authorName, 80, 790, { fontSize: 12, fill: palette.deep, fontFamily: "Inter", width: 280, textAlign: "left" });
    addPublisher(380, 790, palette.deep);
    addBarcode(canvas, 426, 742, 124, 66, "#211A16");
  } else if (template === "framed-keepsake") {
    canvas.add(withIdentity(new Rect({ left: 30, top: 34, width: 540, height: 832, fill: "rgba(0,0,0,0)", stroke: palette.accent, strokeWidth: 2 }), "Keepsake outer frame", "shape"));
    canvas.add(withIdentity(new Rect({ left: 42, top: 46, width: 516, height: 808, fill: "rgba(0,0,0,0)", stroke: palette.ink, strokeWidth: 1 }), "Keepsake inner frame", "shape"));
    addBlurb(WIDTH / 2, 400, 430, palette.ink, 16, "center");
    addRule("Keepsake divider", 220, 650, 380, 650);
    addBarcode(canvas, 230, 730, 140, 80);
  } else if (template === "atmospheric-dark") {
    addText("quote", story.quote, WIDTH / 2, 120, { fontSize: 17, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 450, textAlign: "center" });
    addBlurb(WIDTH / 2, 415, 456, palette.ink, 16);
    addBarcode(canvas, 426, 730, 124, 66);
  } else if (template === "coastal-editorial-back") {
    addRect("Coastal tide accent", 0, 0, WIDTH, 10, palette.accent);
    addText("quote", story.quote, WIDTH / 2, 135, { fontSize: 18, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 456, textAlign: "center" });
    addText("review-source-one", story.source, WIDTH / 2, 170, { fontSize: 9, fill: palette.accent, fontFamily: "Inter", width: 450, textAlign: "center" });
    addRule("Coastal editorial divider", 110, 205, 490, 205);
    addBlurb(WIDTH / 2, 430, 456, palette.ink, 16);
    addText("author", authorName, 72, 786, { fontSize: 12, fill: palette.ink, fontFamily: "Cormorant Garamond", width: 300, textAlign: "left" });
    addBarcode(canvas, 426, 730, 124, 66);
  } else if (template === "field-notes-back") {
    addRect("Field notes margin", 0, 0, 22, HEIGHT, palette.accent);
    addRule("Field notes column rule", 192, 90, 192, 820, palette.accent);
    addText("metadata", "FIELD\nNOTES", 48, 150, { fontSize: 13, fill: palette.accent, fontFamily: "Inter", width: 120, textAlign: "left", fontWeight: 700 });
    addText("metadata", story.category, 48, 245, { fontSize: 9, fill: palette.ink, fontFamily: "Inter", width: 120, textAlign: "left" });
    addText("tag", "A RECORD OF\nGROWING THINGS", 48, 340, { fontSize: 10, fill: palette.ink, fontFamily: "Cormorant Garamond", width: 120, textAlign: "left" });
    addBlurb(380, 360, 330, palette.ink, 16);
    addText("author", authorName, 225, 710, { fontSize: 12, fill: palette.ink, fontFamily: "Cormorant Garamond", width: 310, textAlign: "left" });
    addBarcode(canvas, 36, 720, 140, 80);
  } else if (template === "science-fiction-back") {
    addRect("Signal marker", 64, 112, 6, 82, palette.accent);
    addText("quote", story.quote, 92, 152, { fontSize: 17, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 440, textAlign: "left" });
    addRule("Signal divider", 64, 226, 536, 226, palette.accent);
    addBlurb(WIDTH / 2, 460, 450, palette.ink, 16);
    addText("metadata", "AXIOM STATION  /  FICTION FROM THE FUTURE", 64, 680, { fontSize: 9, fill: palette.accent, fontFamily: "Inter", width: 440, textAlign: "left", fontWeight: 700 });
    addBarcode(canvas, 426, 730, 124, 66);
  } else if (template === "poetry-verse-back") {
    addText("quote", story.quote, WIDTH / 2, 170, { fontSize: 18, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 440, textAlign: "center" });
    addRule("Verse ornament rule", 240, 235, 360, 235, palette.accent);
    addBlurb(WIDTH / 2, 440, 420, palette.ink, 17, "center");
    canvas.add(withIdentity(new Circle({ left: WIDTH / 2, top: 630, originX: "center", originY: "center", radius: 5, fill: palette.accent, stroke: palette.accent }), "Verse gold ornament", "shape"));
    addText("author", authorName, WIDTH / 2, 714, { fontSize: 12, fill: palette.ink, fontFamily: "Inter", width: 420, textAlign: "center" });
    addBarcode(canvas, 230, 770, 140, 74);
  } else if (template === "romance-letter-back") {
    addText("quote", story.quote, WIDTH / 2, 148, { fontSize: 19, fill: palette.ink, fontFamily: "Playfair Display", fontStyle: "italic", width: 450, textAlign: "center" });
    addText("review-source-one", story.source, WIDTH / 2, 190, { fontSize: 9, fill: palette.accent, fontFamily: "Inter", width: 450, textAlign: "center" });
    addRule("Letterpress back divider", 100, 230, 500, 230);
    addBlurb(WIDTH / 2, 445, 450, palette.ink, 16);
    addText("author", authorName, 72, 765, { fontSize: 13, fill: palette.ink, fontFamily: "Playfair Display", width: 300, textAlign: "left" });
    addBarcode(canvas, 426, 730, 124, 66);
  } else if (template === "mythic-chronicle-back") {
    canvas.add(withIdentity(new Rect({ left: 30, top: 34, width: 540, height: 832, fill: "rgba(0,0,0,0)", stroke: palette.accent, strokeWidth: 2 }), "Chronicle outer frame", "shape"));
    canvas.add(withIdentity(new Rect({ left: 42, top: 46, width: 516, height: 808, fill: "rgba(0,0,0,0)", stroke: palette.accent, strokeWidth: 1 }), "Chronicle inner frame", "shape"));
    addText("quote", story.quote, WIDTH / 2, 155, { fontSize: 16, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 440, textAlign: "center" });
    addRule("Chronicle heading divider", 210, 220, 390, 220);
    addBlurb(WIDTH / 2, 440, 430, palette.ink, 16, "center");
    canvas.add(withIdentity(new Polygon(
      [{ x: WIDTH / 2, y: 642 }, { x: WIDTH / 2 + 8, y: 650 }, { x: WIDTH / 2, y: 658 }, { x: WIDTH / 2 - 8, y: 650 }],
      { fill: palette.accent, stroke: palette.accent, strokeWidth: 1 },
    ), "Chronicle ornament", "shape"));
    addBarcode(canvas, 230, 750, 140, 72);
  } else if (template === "academic-press-back") {
    addRect("Academic header band", 0, 0, WIDTH, 122, "#E4E2D9");
    addText("tag", "SHELVE MONOGRAPH SERIES", 55, 96, { fontSize: 10, fill: palette.accent, fontFamily: "Inter", width: 470, textAlign: "left", fontWeight: 700 });
    addRule("Academic header rule", 55, 140, 545, 140, palette.ink);
    addText("metadata", "SUBJECT", 58, 205, { fontSize: 9, fill: palette.accent, fontFamily: "Inter", width: 110, textAlign: "left", fontWeight: 700 });
    addText("metadata", story.category, 58, 238, { fontSize: 11, fill: palette.ink, fontFamily: "Inter", width: 475, textAlign: "left" });
    addBlurb(WIDTH / 2, 450, 470, palette.ink, 16);
    addText("author", authorName, 58, 700, { fontSize: 12, fill: palette.ink, fontFamily: "Cormorant Garamond", width: 250, textAlign: "left" });
    addBarcode(canvas, 426, 730, 124, 66);
  } else if (template === "noir-casefile-back") {
    addRect("Case file red header", 0, 0, WIDTH, 124, "#CF3D45");
    addText("tag", "CASE FILE  /  09-441", 58, 88, { fontSize: 11, fill: "#FFFFFF", fontFamily: "Inter", width: 470, textAlign: "left", fontWeight: 700, charSpacing: 150 });
    addText("quote", story.quote, 64, 190, { fontSize: 17, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 450, textAlign: "left" });
    addText("review-source-one", story.source, 64, 228, { fontSize: 9, fill: palette.accent, fontFamily: "Inter", width: 440, textAlign: "left" });
    addRule("Case file evidence rule", 64, 260, 536, 260);
    addBlurb(WIDTH / 2, 465, 450, palette.ink, 16);
    addText("author", authorName.toUpperCase(), 64, 700, { fontSize: 10, fill: palette.ink, fontFamily: "Inter", width: 320, textAlign: "left", fontWeight: 700 });
    addBarcode(canvas, 426, 730, 124, 66);
  } else if (template === "memoir-photo-back") {
    addText("quote", story.quote, WIDTH / 2, 130, { fontSize: 17, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 460, textAlign: "center" });
    addBlurb(WIDTH / 2, 355, 440, palette.ink, 15);
    addRule("Memoir bio divider", 70, 555, 530, 555);
    canvas.add(withIdentity(new Circle({ left: 116, top: 682, originX: "center", originY: "center", radius: 46, fill: palette.paper, stroke: palette.accent, strokeWidth: 2 }), "Memoir portrait frame", "shape"));
    canvas.add(withIdentity(new Circle({ left: 116, top: 665, originX: "center", originY: "center", radius: 16, fill: "#B8A99A", stroke: "#B8A99A" }), "Memoir portrait silhouette", "shape"));
    addText("author", authorName, 190, 635, { fontSize: 15, fill: palette.ink, fontFamily: "Playfair Display", width: 340, textAlign: "left" });
    addText("author-bio", story.bio, 190, 710, { fontSize: 13, fill: palette.ink, fontFamily: "Cormorant Garamond", width: 330, textAlign: "left" });
    addBarcode(canvas, 426, 790, 124, 58);
  } else if (template === "garden-chronicle-back") {
    addRect("Garden top panel", 0, 0, WIDTH, 14, palette.accent);
    addText("quote", story.quote, WIDTH / 2, 142, { fontSize: 18, fill: palette.ink, fontFamily: "Cormorant Garamond", fontStyle: "italic", width: 450, textAlign: "center" });
    addRule("Garden divider", 215, 205, 385, 205, palette.accent);
    [170, 190, 210].forEach((radius, index) => {
      canvas.add(withIdentity(new Circle({ left: WIDTH / 2, top: 245, originX: "center", originY: "center", radius, fill: "rgba(0,0,0,0)", stroke: palette.accent, strokeWidth: 1, opacity: 0.32 - index * 0.07 }), `Garden growth ring ${index + 1}`, "shape"));
    });
    addBlurb(WIDTH / 2, 455, 430, palette.ink, 15);
    addText("author", authorName, 70, 765, { fontSize: 12, fill: palette.ink, fontFamily: "Cormorant Garamond", width: 280, textAlign: "left" });
    addBarcode(canvas, 426, 730, 124, 66);
  } else if (template === "minimal-metadata-back") {
    addText("tag", story.category, 72, 150, { fontSize: 10, fill: palette.accent, fontFamily: "Inter", width: 456, textAlign: "center", fontWeight: 700, charSpacing: 120 });
    addRule("Minimal metadata top rule", 180, 195, 420, 195);
    addBlurb(WIDTH / 2, 410, 440, palette.ink, 16, "center");
    addRule("Minimal metadata lower rule", 180, 620, 420, 620);
    addText("author", authorName, WIDTH / 2, 700, { fontSize: 12, fill: palette.ink, fontFamily: "Inter", width: 420, textAlign: "center" });
    addBarcode(canvas, 230, 770, 140, 74);
  }
}

async function addWrapObjects(canvas: Canvas, props: Props) {
  const { design, title, author } = props;
  const spineAuthor = design.spineAuthor?.trim() || author.trim() || FRONT_COVER_SCENARIOS[design.template as WritingFrontCoverTemplate]?.author || "";
  const spineTitle = design.spine.trim() || title;
  const spineTextColor = design.spineTextColor ?? "#F8F4EC";
  const spineFontFamily = design.spineFontFamily ?? "Cinzel";
  const spineWidth = getSpineWidth(design);
  const frontX = WIDTH + spineWidth;
  const [backDataUrl, frontDataUrl] = await Promise.all([
    renderStoredCoverPreview(props, "back"),
    renderStoredCoverPreview(props, "front"),
  ]);
  canvas.backgroundColor = "#EFECE4";
  const backImage = await FabricImage.fromURL(backDataUrl);
  backImage.set({
    left: WIDTH / 2, top: HEIGHT / 2, originX: "center", originY: "center",
    scaleX: WIDTH / backImage.width!, scaleY: HEIGHT / backImage.height!,
    selectable: false, evented: false,
  });
  canvas.add(withIdentity(backImage, "Back Cover Preview", "back-preview"));
  canvas.add(withIdentity(new Rect({
    left: WIDTH, top: 0, width: spineWidth, height: HEIGHT,
    fill: design.spineColor || "#F5EFE6", selectable: true,
  }), "Spine", "shape"));
  canvas.add(textObject("tag", spineTitle, WIDTH + spineWidth / 2, HEIGHT * 0.42, {
    fontSize: design.spineFontSize ?? 16, fill: spineTextColor, fontFamily: spineFontFamily, width: HEIGHT * 0.8, angle: 90,
  }));
  canvas.add(textObject("spine-author", spineAuthor, WIDTH + spineWidth / 2, HEIGHT * 0.79, {
    fontSize: design.spineAuthorFontSize ?? 12, fill: spineTextColor, fontFamily: spineFontFamily, width: HEIGHT * 0.55, angle: 90,
  }));
  const frontImage = await FabricImage.fromURL(frontDataUrl);
  frontImage.set({
    left: frontX + WIDTH / 2, top: HEIGHT / 2, originX: "center", originY: "center",
    scaleX: WIDTH / frontImage.width!, scaleY: HEIGHT / frontImage.height!,
    selectable: false, evented: false,
  });
  canvas.add(withIdentity(frontImage, "Front Cover Preview", "front-preview"));
}

function normalizeLegacyBackCoverLayout(canvas: Canvas) {
  const blurb = canvas.getObjects().find((object) => objectName(object) === "blurb");
  if (blurb instanceof IText && blurb.fontSize === 28 && blurb.width === 440) {
    blurb.set({ left: WIDTH / 2, top: 340, width: 456, fontSize: 18, originX: "center", originY: "center" });
    blurb.setCoords();
  }
  const author = canvas.getObjects().find((object) => objectName(object) === "author");
  if (author instanceof IText && author.top === 720 && author.width === 440) {
    author.set({ left: 190, top: 770, width: 270, originX: "center", originY: "center" });
    author.setCoords();
  }
  const barcode = canvas.getObjects().find((object) => objectName(object) === "ISBN barcode");
  if (barcode instanceof Rect && barcode.top === 735) barcode.set({ left: 430, top: 730, width: 120, height: 65 });
  canvas.getObjects().filter((object) => objectName(object).startsWith("Barcode line")).forEach((object) => {
    if (object.top === 746) object.set({ left: (object.left ?? 0) + 15, top: 741 });
    object.setCoords();
  });
}

function FabricCanvasView(props: Props, ref: React.ForwardedRef<FabricCoverCanvasHandle>) {
  const elementRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const readyCanvasRef = useRef<Canvas | null>(null);
  const latest = useRef(props);
  const callbacks = useRef(props);
  const suppressEvents = useRef(false);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const lastState = useRef("");
  const guideLines = useRef<FabricObject[]>([]);
  const [canvasWidth, setCanvasWidth] = useState(WIDTH);
  const [canvasReadyVersion, setCanvasReadyVersion] = useState(0);

  latest.current = props;
  callbacks.current = props;
  const resolvedSpineAuthor = props.design.spineAuthor?.trim()
    || props.author.trim()
    || FRONT_COVER_SCENARIOS[props.design.template as WritingFrontCoverTemplate]?.author
    || "";

  const publishPreview = (canvas: Canvas, side: CoverSide) => {
    const url = renderCanvas(canvas, side === "front" || side === "back" ? 2 : 1);
    if (side === "front") callbacks.current.onPreviewChange(url);
    if (side === "back") callbacks.current.onBackPreviewChange(url);
  };

  useImperativeHandle(ref, () => {
    const canvas = () => canvasRef.current;
    const active = () => canvas()?.getActiveObject() ?? null;
    const persist = () => {
      const current = canvas();
      if (!current || suppressEvents.current || latest.current.side === "mockup") return;
      current.requestRenderAll();
      const state = serializedCanvas(current);
      const json = JSON.stringify(state);
      if (json !== lastState.current && lastState.current) {
        undoStack.current = [...undoStack.current.slice(-49), lastState.current];
        redoStack.current = [];
      }
      lastState.current = json;
      callbacks.current.onStateChange(latest.current.side, state);
      callbacks.current.onHistoryChange(undoStack.current.length > 0, redoStack.current.length > 0);
      try {
        publishPreview(current, latest.current.side);
      } catch (error) {
        console.error("Could not render the cover preview:", error);
      }
      updateSelection(current);
      updateLayers(current);
    };
    const updateSelection = (current: Canvas) => {
      const object = current.getActiveObject();
      if (!object) {
        callbacks.current.onSelectionChange(null);
        return;
      }
      const selected: FabricCoverSelection = {
        name: objectName(object),
        kind: objectKind(object),
        fill: typeof object.fill === "string" ? object.fill : "#F8F4EC",
        stroke: typeof object.stroke === "string" ? object.stroke : "#E5C07B",
        strokeWidth: object.strokeWidth ?? 1,
        opacity: object.opacity ?? 1,
        ...(object instanceof IText ? {
          text: object.text,
          fontFamily: object.fontFamily,
          fontSize: object.fontSize,
          fontWeight: object.fontWeight,
          fontStyle: object.fontStyle,
          charSpacing: object.charSpacing,
          lineHeight: object.lineHeight,
          textAlign: object.textAlign,
        } : {}),
        ...(object instanceof Rect ? { rx: object.rx } : {}),
      };
      callbacks.current.onSelectionChange(selected);
    };
    const updateLayers = (current: Canvas) => callbacks.current.onLayersChange(
      current.getObjects()
        .filter((object) => !["guide", "texture"].includes(asCoverObject(object).objectType ?? ""))
        .map((object) => ({
          name: objectName(object),
          label: labelFor(objectName(object)),
          kind: objectKind(object),
          visible: object.visible,
          locked: asCoverObject(object).locked ?? !object.selectable,
        })),
    );
    const modifyText = (style: FabricTextStyle) => {
      const object = active();
      if (!(object instanceof IText)) return;
      object.set(style);
      object.setCoords();
      persist();
    };
    const modifyShape = (style: FabricShapeStyle) => {
      const object = active();
      if (!object || object instanceof IText) return;
      object.set(style);
      object.setCoords();
      persist();
    };
    const deleteObject = (object: FabricObject | null) => {
      const current = canvas();
      if (!current || !object) return;
      current.remove(object);
      current.discardActiveObject();
      current.requestRenderAll();
      persist();
    };
    return {
      exportCanvas: () => {
        const current = canvas();
        if (!current || latest.current.side === "mockup") return null;
        try {
          return {
            state: serializedCanvas(current),
            dataUrl: renderCanvas(current, 2),
          };
        } catch (error) {
          callbacks.current.onError(error instanceof Error ? error.message : "Could not render the cover.");
          return null;
        }
      },
      addText: (name, text) => {
        const current = canvas();
        if (!current) return;
        const isBack = latest.current.side === "back";
        const object = textObject(name, text || labelFor(name), WIDTH / 2, 450, {
          fontSize: name === "title" ? (isBack ? latest.current.design.backFontSize : latest.current.design.fontSize) ?? 52 : 24,
          fill: (isBack ? latest.current.design.backTextColor : latest.current.design.titleColor) || "#F8F4EC",
          fontFamily: (isBack ? latest.current.design.backFontFamily : latest.current.design.fabricFontFamily) || "Playfair Display",
        });
        current.add(object);
        current.setActiveObject(object);
        current.requestRenderAll();
        persist();
      },
      addOrnament: (ornament, genre) => {
        const current = canvas();
        if (!current) return;
        const palette = latest.current.side === "back"
          ? coverPaletteForBackDesign(latest.current.design)
          : coverPaletteForDesign(latest.current.design);
        const centerX = latest.current.side === "wrap" ? WIDTH + getSpineWidth(latest.current.design) + WIDTH / 2 : WIDTH / 2;
        const gold = palette.accent;
        const add = (object: FabricObject, name: string) => current.add(withIdentity(object, name, "shape"));
        if (ornament === "divider") add(new Line([centerX - 160, 450, centerX + 160, 450], { stroke: gold, strokeWidth: 2 }), "Hairline rule");
        else if (ornament === "double-rule") {
          add(new Line([centerX - 160, 444, centerX + 160, 444], { stroke: gold, strokeWidth: 2 }), "Double rule upper");
          add(new Line([centerX - 160, 456, centerX + 160, 456], { stroke: gold, strokeWidth: 2 }), "Double rule lower");
        } else if (ornament === "corner-frame") {
          add(new Rect({ left: 35, top: 35, width: latest.current.side === "wrap" ? 1180 : 530, height: 830, fill: "rgba(0,0,0,0)", stroke: gold, strokeWidth: 2 }), "Double gold border frame");
        } else if (ornament === "arch") {
          add(new Polygon([{ x: centerX - 110, y: 560 }, { x: centerX - 110, y: 370 }, { x: centerX - 90, y: 300 }, { x: centerX, y: 265 }, { x: centerX + 90, y: 300 }, { x: centerX + 110, y: 370 }, { x: centerX + 110, y: 560 }], { fill: "rgba(229,192,123,0.12)", stroke: gold, strokeWidth: 2 }), "Arch backdrop");
        } else if (ornament === "crest") add(new Circle({ left: centerX, top: 280, originX: "center", originY: "center", radius: 54, fill: "rgba(0,0,0,0)", stroke: gold, strokeWidth: 3 }), "Circle crest");
        else if (ornament === "sash") add(new Rect({ left: 0, top: 360, width: latest.current.side === "wrap" ? WRAP_WIDTH : WIDTH, height: 165, fill: palette.deep, stroke: gold, strokeWidth: 2 }), "Horizontal banner sash");
        else {
          add(new Rect({ left: centerX - 95, top: 160, width: 190, height: 48, rx: 20, ry: 20, fill: palette.deep, stroke: gold, strokeWidth: 2 }), "Genre pill");
          current.add(textObject("tag", genre.toUpperCase(), centerX, 184, { fontSize: 16, fill: palette.paper, fontFamily: "Cinzel", width: 170 }));
        }
        current.requestRenderAll();
        persist();
      },
      undo: () => {
        const current = canvas();
        const side = latest.current.side;
        const state = undoStack.current.pop();
        if (!current || !state || side === "mockup") return;
        const now = JSON.stringify(serializedCanvas(current));
        redoStack.current = [...redoStack.current, now];
        suppressEvents.current = true;
        void current.loadFromJSON(stateForLoad(state, latest.current.imageUrl, latest.current.design.imageEnabled !== false)).then(() => {
          suppressEvents.current = false;
          current.requestRenderAll();
          lastState.current = JSON.stringify(serializedCanvas(current));
          callbacks.current.onStateChange(side, serializedCanvas(current));
          callbacks.current.onHistoryChange(undoStack.current.length > 0, redoStack.current.length > 0);
          updateLayers(current);
          updateSelection(current);
          try {
            publishPreview(current, side);
          } catch (error) {
            callbacks.current.onError(error instanceof Error ? error.message : "Could not render the cover preview.");
          }
        });
      },
      redo: () => {
        const current = canvas();
        const side = latest.current.side;
        const state = redoStack.current.pop();
        if (!current || !state || side === "mockup") return;
        undoStack.current = [...undoStack.current, JSON.stringify(serializedCanvas(current))];
        suppressEvents.current = true;
        void current.loadFromJSON(stateForLoad(state, latest.current.imageUrl, latest.current.design.imageEnabled !== false)).then(() => {
          suppressEvents.current = false;
          current.requestRenderAll();
          lastState.current = JSON.stringify(serializedCanvas(current));
          callbacks.current.onStateChange(side, serializedCanvas(current));
          callbacks.current.onHistoryChange(undoStack.current.length > 0, redoStack.current.length > 0);
          updateLayers(current);
          updateSelection(current);
          try {
            publishPreview(current, side);
          } catch (error) {
            callbacks.current.onError(error instanceof Error ? error.message : "Could not render the cover preview.");
          }
        });
      },
      zoom: (direction) => {
        const current = canvas();
        if (!current) return;
        const currentZoom = current.getZoom();
        const nextZoom = direction === 0 ? 1 : Math.min(1.5, Math.max(0.5, currentZoom + direction * 0.1));
        current.setZoom(nextZoom);
        current.requestRenderAll();
      },
      fitImage: () => {
        const current = canvas();
        const image = current?.getObjects().find((object) => asCoverObject(object).objectType === "cover-image");
        if (!current || !(image instanceof FabricImage)) return;
        const x = latest.current.side === "wrap" ? WIDTH + getSpineWidth(latest.current.design) + WIDTH / 2 : WIDTH / 2;
        const scale = Math.max(WIDTH / image.width!, HEIGHT / image.height!);
        image.set({ left: x, top: HEIGHT / 2, originX: "center", originY: "center", scaleX: scale, scaleY: scale });
        image.setCoords();
        persist();
      },
      sendImageToBack: () => {
        const current = canvas();
        const image = current?.getObjects().find((object) => asCoverObject(object).objectType === "cover-image");
        if (current && image) {
          current.sendObjectToBack(image);
          current.requestRenderAll();
          persist();
        }
      },
      toggleScrim: () => {
        const current = canvas();
        if (!current) return;
        const existing = current.getObjects().find((object) => asCoverObject(object).objectType === "scrim");
        if (existing) current.remove(existing);
        else {
          const image = current.getObjects().find((object) => asCoverObject(object).objectType === "cover-image");
          const scrim = withIdentity(new Rect({ left: 0, top: 0, width: WIDTH, height: HEIGHT, fill: "rgba(8,11,15,0.35)", selectable: true }), "Dark scrim overlay", "scrim");
          current.add(scrim);
          if (image) current.moveObjectTo(scrim, current.getObjects().indexOf(image) + 1);
        }
        current.requestRenderAll();
        persist();
      },
      updateSelectedText: modifyText,
      updateSelectedShape: modifyShape,
      selectLayer: (name) => {
        const current = canvas();
        const object = current?.getObjects().find((item) => objectName(item) === name);
        if (current && object) {
          current.setActiveObject(object);
          current.requestRenderAll();
          updateSelection(current);
        }
      },
      setLayerVisible: (name, visible) => {
        const current = canvas();
        const object = current?.getObjects().find((item) => objectName(item) === name);
        if (current && object) {
          object.set("visible", visible);
          current.requestRenderAll();
          persist();
        }
      },
      setLayerLocked: (name, locked) => {
        const current = canvas();
        const object = current?.getObjects().find((item) => objectName(item) === name);
        if (current && object) {
          Object.assign(asCoverObject(object), { locked });
          object.set({ selectable: !locked, evented: !locked });
          current.requestRenderAll();
          persist();
        }
      },
      deleteLayer: (name) => {
        const current = canvas();
        const object = current?.getObjects().find((item) => objectName(item) === name);
        deleteObject(object ?? null);
      },
      deleteSelected: () => deleteObject(active()),
      duplicateSelected: () => {
        const current = canvas();
        const object = active();
        if (!current || !object) return;
        void object.clone().then((copy) => {
          const namedCopy = withIdentity(copy, `${objectName(object)} copy`, asCoverObject(object).objectType ?? "shape");
          namedCopy.set({ left: (object.left ?? 0) + 24, top: (object.top ?? 0) + 24 });
          current.add(namedCopy);
          current.setActiveObject(namedCopy);
          current.requestRenderAll();
          persist();
        });
      },
      bringForward: () => {
        const current = canvas();
        const object = active();
        if (current && object) { current.bringObjectForward(object); current.requestRenderAll(); persist(); }
      },
      sendBackward: () => {
        const current = canvas();
        const object = active();
        if (current && object) { current.sendObjectBackwards(object); current.requestRenderAll(); persist(); }
      },
    };
  });

  useEffect(() => {
    const element = elementRef.current;
    if (!element || props.side === "mockup") return;
    const side: Exclude<CoverSide, "mockup"> = props.side;
    const width = side === "wrap" ? WRAP_WIDTH : WIDTH;
    setCanvasWidth(width);
    const canvas = new Canvas(element, {
      width,
      height: HEIGHT,
      backgroundColor: props.design.background,
      preserveObjectStacking: true,
      selection: true,
      enableRetinaScaling: true,
    });
    canvas.clear();
    canvasRef.current = canvas;
    readyCanvasRef.current = null;
    setCanvasReadyVersion((version) => version + 1);
    undoStack.current = [];
    redoStack.current = [];
    callbacks.current.onHistoryChange(false, false);
    suppressEvents.current = true;
    const updateSelection = () => {
      const object = canvas.getActiveObject();
      if (!object) {
        callbacks.current.onSelectionChange(null);
        return;
      }
      callbacks.current.onSelectionChange({
        name: objectName(object),
        kind: objectKind(object),
        fill: typeof object.fill === "string" ? object.fill : "#F8F4EC",
        stroke: typeof object.stroke === "string" ? object.stroke : "#E5C07B",
        strokeWidth: object.strokeWidth ?? 1,
        opacity: object.opacity ?? 1,
        ...(object instanceof IText ? {
          text: object.text, fontFamily: object.fontFamily, fontSize: object.fontSize,
          fontWeight: object.fontWeight, fontStyle: object.fontStyle,
          charSpacing: object.charSpacing, lineHeight: object.lineHeight, textAlign: object.textAlign,
        } : {}),
        ...(object instanceof Rect ? { rx: object.rx } : {}),
      });
    };
    const updateLayers = () => callbacks.current.onLayersChange(canvas.getObjects()
      .filter((object) => !["guide", "texture"].includes(asCoverObject(object).objectType ?? ""))
      .map((object) => ({
        name: objectName(object), label: labelFor(objectName(object)), kind: objectKind(object),
        visible: object.visible, locked: asCoverObject(object).locked ?? !object.selectable,
      })));
    const stateChanged = () => {
      if (suppressEvents.current) return;
      const state = serializedCanvas(canvas);
      const json = JSON.stringify(state);
      if (lastState.current && lastState.current !== json) {
        undoStack.current = [...undoStack.current.slice(-49), lastState.current];
        redoStack.current = [];
      }
      lastState.current = json;
      callbacks.current.onStateChange(side, state);
      callbacks.current.onHistoryChange(undoStack.current.length > 0, redoStack.current.length > 0);
      updateLayers();
      updateSelection();
      try {
        publishPreview(canvas, side);
      } catch (error) {
        console.error("Could not update the book mockup preview:", error);
      }
    };
    const centeredGuides = (event: { target?: FabricObject }) => {
      const target = event.target;
      if (!target || asCoverObject(target).objectType === "guide") return;
      suppressEvents.current = true;
      guideLines.current.filter((line) => asCoverObject(line).objectType === "snap-guide").forEach((line) => canvas.remove(line));
      guideLines.current = guideLines.current.filter((line) => asCoverObject(line).objectType !== "snap-guide");
      const center = target.getCenterPoint();
      const centerX = width / 2;
      const centerY = HEIGHT / 2;
      const snappedX = Math.abs(center.x - centerX) < 10;
      const snappedY = Math.abs(center.y - centerY) < 10;
      if (snappedX) target.set({ left: (target.left ?? 0) + centerX - center.x });
      if (snappedY) target.set({ top: (target.top ?? 0) + centerY - center.y });
      if (snappedX || snappedY) target.setCoords();
      if (snappedX) {
        const line = withIdentity(new Line([centerX, 0, centerX, HEIGHT], { stroke: "#E5C07B", strokeWidth: 1, strokeDashArray: [6, 6], selectable: false, evented: false, excludeFromExport: true }), "vertical-snap-guide", "snap-guide");
        canvas.add(line);
        guideLines.current.push(line);
      }
      if (snappedY) {
        const line = withIdentity(new Line([0, centerY, width, centerY], { stroke: "#E5C07B", strokeWidth: 1, strokeDashArray: [6, 6], selectable: false, evented: false, excludeFromExport: true }), "horizontal-snap-guide", "snap-guide");
        canvas.add(line);
        guideLines.current.push(line);
      }
      suppressEvents.current = false;
      canvas.requestRenderAll();
    };
    canvas.on("selection:created", updateSelection);
    canvas.on("selection:updated", updateSelection);
    canvas.on("selection:cleared", () => callbacks.current.onSelectionChange(null));
    canvas.on("object:added", () => { updateLayers(); stateChanged(); });
    canvas.on("object:removed", () => { updateLayers(); stateChanged(); });
    canvas.on("object:modified", () => {
      guideLines.current.filter((line) => asCoverObject(line).objectType === "snap-guide").forEach((line) => canvas.remove(line));
      guideLines.current = guideLines.current.filter((line) => asCoverObject(line).objectType !== "snap-guide");
      canvas.requestRenderAll();
      stateChanged();
    });
    canvas.on("object:moving", centeredGuides);
    canvas.on("text:changed", stateChanged);

    const initialize = async () => {
      try {
        await document.fonts.ready;
        const blankTemplate = (side === "front" && callbacks.current.design.template === "blank")
          || (side === "back" && callbacks.current.design.backTemplate === "blank");
        const stored = side === "wrap" || blankTemplate ? undefined : callbacks.current.design.fabricCanvasStates?.[side];
        if (stored && side !== "wrap") {
          await canvas.loadFromJSON(stateForLoad(JSON.stringify(stored), callbacks.current.imageUrl, callbacks.current.design.imageEnabled !== false));
          setCanvasBackground(canvas, callbacks.current.design, side);
        } else if (side === "wrap") {
          await addWrapObjects(canvas, callbacks.current);
        } else {
          setCanvasBackground(canvas, callbacks.current.design, side);
          if (side === "front") addTemplateObjects(canvas, callbacks.current.design, callbacks.current.title, callbacks.current.author, callbacks.current.genre);
          else if (side === "back") addBackCoverObjects(
            canvas,
            callbacks.current.synopsis,
            callbacks.current.author,
            coverPaletteForBackDesign(callbacks.current.design),
            callbacks.current.design.backTemplate,
            callbacks.current.genre,
          );
        }
        if (side === "front" && callbacks.current.design.template !== "blank" && !stored && callbacks.current.design.imageEnabled !== false && callbacks.current.imageUrl && !canvas.getObjects().some((object) => asCoverObject(object).objectType === "cover-image")) {
          await insertCoverImage(canvas, callbacks.current.imageUrl, side, callbacks.current.design.imageOverlay ?? 35, getSpineWidth(callbacks.current.design));
        }
        if (side === "back") normalizeLegacyBackCoverLayout(canvas);
        canvas.setZoom((callbacks.current.design.zoom ?? 100) / 100);
        canvas.requestRenderAll();
        suppressEvents.current = false;
        lastState.current = JSON.stringify(serializedCanvas(canvas));
        updateLayers();
        updateSelection();
        publishPreview(canvas, side);
        callbacks.current.onStateChange(side, serializedCanvas(canvas));
        readyCanvasRef.current = canvas;
        setCanvasReadyVersion((version) => version + 1);
      } catch (error) {
        suppressEvents.current = false;
        console.error("Could not initialize the Fabric cover canvas:", error);
        callbacks.current.onError(error instanceof Error ? error.message : "Could not initialize the cover canvas.");
      }
    };
    void initialize();

    const keyTarget = canvas.upperCanvasEl;
    keyTarget.tabIndex = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const selected = canvas.getActiveObject();
      if (selected instanceof IText && selected.isEditing) return;
      if (matchesShortcut(event, "coverUndo") || matchesShortcut(event, "coverRedoShift")) {
        event.preventDefault();
        event.stopPropagation();
        const redo = matchesShortcut(event, "coverRedoShift");
        const state = redo ? redoStack.current.pop() : undoStack.current.pop();
        if (state) {
          const current = JSON.stringify(serializedCanvas(canvas));
          if (redo) undoStack.current.push(current);
          else redoStack.current.push(current);
          suppressEvents.current = true;
          void canvas.loadFromJSON(stateForLoad(state, callbacks.current.imageUrl, callbacks.current.design.imageEnabled !== false)).then(() => {
            suppressEvents.current = false;
            canvas.requestRenderAll();
            lastState.current = JSON.stringify(serializedCanvas(canvas));
            callbacks.current.onStateChange(side, serializedCanvas(canvas));
            callbacks.current.onHistoryChange(undoStack.current.length > 0, redoStack.current.length > 0);
            updateLayers();
            updateSelection();
            try {
              publishPreview(canvas, side);
            } catch (error) {
              callbacks.current.onError(error instanceof Error ? error.message : "Could not render the cover preview.");
            }
          });
        }
      } else if (matchesShortcut(event, "coverRedo")) {
        event.preventDefault();
        event.stopPropagation();
        const state = redoStack.current.pop();
        if (state) {
          undoStack.current.push(JSON.stringify(serializedCanvas(canvas)));
          suppressEvents.current = true;
          void canvas.loadFromJSON(stateForLoad(state, callbacks.current.imageUrl, callbacks.current.design.imageEnabled !== false)).then(() => {
            suppressEvents.current = false;
            canvas.requestRenderAll();
            lastState.current = JSON.stringify(serializedCanvas(canvas));
            callbacks.current.onStateChange(side, serializedCanvas(canvas));
            callbacks.current.onHistoryChange(undoStack.current.length > 0, redoStack.current.length > 0);
            updateLayers();
            updateSelection();
            try {
              publishPreview(canvas, side);
            } catch (error) {
              callbacks.current.onError(error instanceof Error ? error.message : "Could not render the cover preview.");
            }
          });
        }
      } else if (matchesShortcut(event, "coverDelete")) {
        if (selected) {
          event.preventDefault();
          event.stopPropagation();
          canvas.remove(selected);
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          stateChanged();
        }
      } else if (selected && (matchesShortcut(event, "coverMove") || matchesShortcut(event, "coverMoveFast"))) {
        event.preventDefault();
        event.stopPropagation();
        const nudge = matchesShortcut(event, "coverMoveFast") ? 10 : 1;
        const delta = event.key === "ArrowUp" ? [0, -nudge] : event.key === "ArrowDown" ? [0, nudge] : event.key === "ArrowLeft" ? [-nudge, 0] : [nudge, 0];
        selected.set({ left: (selected.left ?? 0) + delta[0], top: (selected.top ?? 0) + delta[1] });
        selected.setCoords();
        canvas.requestRenderAll();
        stateChanged();
      }
    };
    keyTarget.addEventListener("keydown", onKeyDown);

    return () => {
      keyTarget.removeEventListener("keydown", onKeyDown);
      canvas.off();
      canvasRef.current = null;
      if (readyCanvasRef.current === canvas) readyCanvasRef.current = null;
      guideLines.current = [];
      void canvas.dispose();
    };
  }, [props.projectId, props.side, props.design.template, props.design.backTemplate, props.imageUrl]);

  useEffect(() => {
    if (props.side !== "mockup") return;
    let cancelled = false;
    const renderMockupFaces = async () => {
      const [front, back] = await Promise.all([
        renderStoredCoverPreview(props, "front"),
        props.backMockupUrl ? Promise.resolve("") : renderStoredCoverPreview(props, "back"),
      ]);
      if (cancelled) return;
      if (front) {
        callbacks.current.onPreviewChange(front);
      }
      if (back) callbacks.current.onBackPreviewChange(back);
    };
    void renderMockupFaces().catch((error: unknown) => {
      if (!cancelled) callbacks.current.onError(error instanceof Error ? error.message : "Could not render the hardcover preview.");
    });
    return () => { cancelled = true; };
  }, [
    props.projectId, props.side, props.design.fabricCanvasStates, props.design.template, props.design.backTemplate,
    props.design.title, props.design.subtitle, props.design.author, props.design.badge,
    props.design.imageEnabled, props.title, props.author, props.synopsis, props.genre,
    props.imageUrl, props.backMockupUrl,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || readyCanvasRef.current !== canvas || props.side === "mockup") return;
    if (props.side === "front" || props.side === "back") setCanvasBackground(canvas, props.design, props.side);
    const title = canvas.getObjects().find((object) => objectName(object) === "title");
    const isBack = props.side === "back";
    if (title instanceof IText) title.set({
      text: props.design.title,
      fill: isBack ? props.design.backTextColor || "#1F1C18" : props.design.titleColor || props.design.textColor,
    });
    const subtitle = canvas.getObjects().find((object) => objectName(object) === "subtitle");
    if (subtitle instanceof IText) subtitle.set("text", props.design.subtitle);
    const authorLayer = props.side === "wrap" ? "front-author" : "author";
    const author = canvas.getObjects().find((object) => objectName(object) === authorLayer);
    if (author instanceof IText) author.set("text", props.design.author || props.author);
    const blurb = canvas.getObjects().find((object) => objectName(object) === "blurb");
    if (props.side === "back" && blurb instanceof IText) blurb.set("text", props.synopsis.trim() || DEFAULT_BACK_BLURB);
    const tag = canvas.getObjects().find((object) => objectName(object) === "tag");
    if (props.side === "front" && tag instanceof IText && props.design.badge) tag.set("text", props.design.badge);
    const titleObject = canvas.getObjects().find((object) => objectName(object) === "title");
    if (titleObject instanceof IText) titleObject.set({
      fontFamily: isBack ? props.design.backFontFamily || "Cormorant Garamond" : props.design.fabricFontFamily || "Playfair Display",
      fontSize: isBack ? props.design.backFontSize ?? titleObject.fontSize : props.design.fontSize ?? titleObject.fontSize,
      charSpacing: isBack ? props.design.backLetterSpacing ?? titleObject.charSpacing : props.design.letterSpacing ?? titleObject.charSpacing,
      textAlign: isBack ? props.design.backAlignment ?? "center" : props.design.alignment ?? "center",
      shadow: (isBack ? props.design.backTitleShadow : props.design.titleShadow) ? "rgba(0,0,0,0.55) 0px 2px 12px" : "",
    });
    canvas.requestRenderAll();
    callbacks.current.onStateChange(props.side, serializedCanvas(canvas));
    try {
      publishPreview(canvas, props.side);
    } catch (error) {
      callbacks.current.onError(error instanceof Error ? error.message : "Could not render the cover preview.");
    }
  }, [
    props.design.background, props.design.gradientEnd, props.design.gradientType,
    props.design.backBackground, props.design.backGradientEnd, props.design.backGradientType,
    props.design.title, props.design.subtitle, props.design.author, props.design.titleColor,
    props.design.textColor, props.design.fabricFontFamily, props.design.titleShadow,
    props.design.backTextColor, props.design.backFontFamily, props.design.backFontSize,
    props.design.backLetterSpacing, props.design.backAlignment, props.design.backTitleShadow,
    props.design.fontSize, props.design.letterSpacing, props.design.badge, props.design.alignment, props.author,
    props.synopsis, props.side, canvasReadyVersion,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || readyCanvasRef.current !== canvas || props.side !== "front" || !props.imageUrl) return;
    const existing = canvas.getObjects().find((object) => asCoverObject(object).objectType === "cover-image");
    if (existing || props.design.imageEnabled === false) return;
    void insertCoverImage(canvas, props.imageUrl, "front", props.design.imageOverlay ?? 35).then(() => {
      canvas.requestRenderAll();
    }).catch((error: unknown) => callbacks.current.onError(error instanceof Error ? error.message : "Could not add cover artwork."));
  }, [props.imageUrl, props.design.imageOverlay, props.design.imageEnabled, props.side, canvasReadyVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || readyCanvasRef.current !== canvas || props.side !== "front") return;
    const image = canvas.getObjects().find((object) => asCoverObject(object).objectType === "cover-image");
    const dimmer = canvas.getObjects().find((object) => asCoverObject(object).objectType === "scrim");
    if (image instanceof FabricImage) {
      const fit = props.design.imageFit ?? "full";
      const targetHeight = fit === "top" ? HEIGHT * 0.52 : fit === "inset" ? HEIGHT * 0.84 : HEIGHT;
      const targetWidth = fit === "inset" ? WIDTH * 0.84 : WIDTH;
      const scale = fit === "inset"
        ? Math.min(targetWidth / image.width!, targetHeight / image.height!)
        : Math.max(targetWidth / image.width!, targetHeight / image.height!);
      image.set({
        left: WIDTH / 2,
        top: fit === "top" ? targetHeight / 2 : HEIGHT / 2,
        originX: "center",
        originY: "center",
        scaleX: scale,
        scaleY: scale,
      });
      image.setCoords();
    }
    if (dimmer) dimmer.set({ opacity: (props.design.imageOverlay ?? 35) / 100 });
    else if (image && (props.design.imageOverlay ?? 35) > 0) {
      const baseX = 0;
      const newDimmer = withIdentity(new Rect({
        left: baseX, top: 0, width: WIDTH, height: HEIGHT, fill: "#080B0F",
        opacity: (props.design.imageOverlay ?? 35) / 100, selectable: true, evented: true,
      }), "Dark scrim overlay", "scrim");
      canvas.add(newDimmer);
      canvas.moveObjectTo(newDimmer, canvas.getObjects().indexOf(image) + 1);
    }
    canvas.requestRenderAll();
  }, [props.design.imageFit, props.design.imageOverlay, props.design.spineWidth, props.side, canvasReadyVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || readyCanvasRef.current !== canvas || props.side === "mockup") return;
    const guideValues = props.side === "back"
      ? { bleedGuide: props.design.backBleedGuide, trimGuide: props.design.backTrimGuide, safeGuide: props.design.backSafeGuide }
      : { bleedGuide: props.design.bleedGuide, trimGuide: props.design.trimGuide, safeGuide: props.design.safeGuide };
    const guides = canvas.getObjects().filter((object) => asCoverObject(object).objectType === "guide");
    guides.forEach((guide) => canvas.remove(guide));
    const enabled = [
      { key: "bleedGuide", inset: 13, color: "#FF8E72" },
      { key: "trimGuide", inset: 1, color: "#F8F4EC" },
      { key: "safeGuide", inset: 25, color: "#85D0A6" },
    ] as const;
    enabled.forEach(({ key, inset, color }) => {
      if (!guideValues[key]) return;
      const regions = props.side === "wrap"
        ? [0, WIDTH + getSpineWidth(props.design)]
        : [0];
      regions.forEach((left) => canvas.add(withIdentity(new Rect({
        left: left + inset, top: inset, width: WIDTH - inset * 2, height: HEIGHT - inset * 2,
        fill: "rgba(0,0,0,0)", stroke: color, strokeWidth: 1, strokeDashArray: [8, 8],
        selectable: false, evented: false, excludeFromExport: true,
      }), `${key}-guide`, "guide")));
    });
    canvas.requestRenderAll();
  }, [
    props.design.bleedGuide, props.design.trimGuide, props.design.safeGuide,
    props.design.backBleedGuide, props.design.backTrimGuide, props.design.backSafeGuide,
    props.design.spineWidth, props.side, canvasReadyVersion,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || readyCanvasRef.current !== canvas || props.side !== "wrap") return;
    const spine = canvas.getObjects().find((object) => objectName(object) === "Spine");
    if (!(spine instanceof Rect)) return;
    const currentWidth = spine.width * spine.scaleX;
    const nextWidth = getSpineWidth(props.design);
    const delta = nextWidth - currentWidth;
    if (!delta) return;
    const frontStart = (spine.left ?? WIDTH) + currentWidth;
    spine.set("width", nextWidth);
    spine.set("scaleX", 1);
    canvas.getObjects().forEach((object) => {
      if (object === spine || object.getCenterPoint().x <= frontStart) return;
      object.set("left", (object.left ?? 0) + delta);
      object.setCoords();
    });
    const spineTitle = canvas.getObjects().find((object) => objectName(object) === "tag");
    if (spineTitle instanceof IText) spineTitle.set("left", WIDTH + nextWidth / 2);
    const spineAuthor = canvas.getObjects().filter((object) => objectName(object) === "spine-author")
      .find((object) => object.getCenterPoint().x > WIDTH && object.getCenterPoint().x < frontStart);
    if (spineAuthor instanceof IText) spineAuthor.set("left", WIDTH + nextWidth / 2);
    canvas.requestRenderAll();
    callbacks.current.onStateChange("wrap", serializedCanvas(canvas));
  }, [props.design.spineWidth, props.side, canvasReadyVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || readyCanvasRef.current !== canvas || props.side !== "wrap") return;
    const spine = canvas.getObjects().find((object) => objectName(object) === "Spine");
    const spineTitle = canvas.getObjects().find((object) => objectName(object) === "tag");
    const spineAuthor = canvas.getObjects().find((object) => objectName(object) === "spine-author");
    if (spine instanceof Rect) spine.set("fill", props.design.spineColor ?? "#F5EFE6");
    if (spineTitle instanceof IText) spineTitle.set({
      text: props.design.spine.trim() || props.title,
      fill: props.design.spineTextColor ?? "#F8F4EC",
      fontFamily: props.design.spineFontFamily ?? "Cinzel",
      fontSize: props.design.spineFontSize ?? 16,
      top: HEIGHT * 0.42,
    });
    if (spineAuthor instanceof IText) spineAuthor.set({
      text: props.design.spineAuthor?.trim() || props.author.trim() || FRONT_COVER_SCENARIOS[props.design.template as WritingFrontCoverTemplate]?.author || "",
      fill: props.design.spineTextColor ?? "#F8F4EC",
      fontFamily: props.design.spineFontFamily ?? "Cinzel",
      fontSize: props.design.spineAuthorFontSize ?? 12,
      top: HEIGHT * 0.79,
    });
    spine?.setCoords();
    spineTitle?.setCoords();
    spineAuthor?.setCoords();
    canvas.requestRenderAll();
    callbacks.current.onStateChange("wrap", serializedCanvas(canvas));
    publishPreview(canvas, "wrap");
  }, [
    props.author, props.design.spine, props.design.spineAuthor, props.design.spineAuthorFontSize,
    props.design.spineColor, props.design.spineFontFamily, props.design.spineFontSize,
    props.design.spineTextColor, props.side, props.title, canvasReadyVersion,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || readyCanvasRef.current !== canvas || props.side === "mockup") return;
    const previous = canvas.getObjects().find((object) => asCoverObject(object).objectType === "texture");
    if (previous) canvas.remove(previous);
    const grainEnabled = props.side === "back" ? props.design.backGrain : props.design.grain;
    if (grainEnabled) {
      const width = props.side === "wrap" ? WRAP_WIDTH : WIDTH;
      const texture = withIdentity(new Rect({
        left: 0, top: 0, width, height: HEIGHT, fill: paperGrainPattern(),
        opacity: 0.2, selectable: false, evented: false,
      }), "Paper grain texture", "texture");
      canvas.add(texture);
      const imageIndex = canvas.getObjects().findIndex((object) => asCoverObject(object).objectType === "cover-image");
      canvas.moveObjectTo(texture, imageIndex >= 0 ? imageIndex + 1 : 0);
    }
    canvas.requestRenderAll();
  }, [props.design.grain, props.design.backGrain, props.design.spineWidth, props.side, canvasReadyVersion]);

  return (
    <div className={`fabric-cover-surface ${props.side === "mockup" ? "mockup-active" : ""} ${props.side === "wrap" ? "wrap-active" : ""}`} style={{ "--fabric-width": `${canvasWidth}px`, "--hardcover-spine-color": props.design.spineColor ?? "#15252A" } as CSSProperties}>
      <div className="fabric-cover-canvas-wrap" aria-hidden={props.side === "mockup"}>
        <canvas ref={elementRef} aria-label={`${props.side} book cover design canvas`} />
      </div>
      {props.side === "mockup" && <HardcoverMockup
        frontDataUrl={props.mockupUrl}
        backDataUrl={props.backMockupUrl}
        title={props.title}
        synopsis={props.synopsis}
        author={props.author}
        spine={props.design.spine}
        spineAuthor={resolvedSpineAuthor}
        spineTextColor={props.design.spineTextColor ?? "#F8F4EC"}
        spineFontFamily={props.design.spineFontFamily ?? "Cinzel"}
        spineFontSize={props.design.spineFontSize ?? 16}
        spineAuthorFontSize={props.design.spineAuthorFontSize ?? 12}
        autoRotate={props.mockupAutoRotate}
        onAutoRotateChange={props.onMockupAutoRotateChange}
        angleResetKey={props.mockupAngleResetKey}
      />}
    </div>
  );
}

async function insertCoverImage(canvas: Canvas, url: string, side: "front" | "wrap" = "front", overlay = 35, spineWidth = 63) {
  canvas.getObjects().filter((object) => asCoverObject(object).objectType === "cover-image").forEach((object) => canvas.remove(object));
  const image = await FabricImage.fromURL(url, { crossOrigin: "anonymous" });
  const scale = Math.max(WIDTH / image.width!, HEIGHT / image.height!);
  image.set({
    left: side === "wrap" ? WIDTH + spineWidth + WIDTH / 2 : WIDTH / 2, top: HEIGHT / 2, originX: "center", originY: "center",
    scaleX: scale, scaleY: scale, selectable: true, evented: true,
  });
  withIdentity(image, "Cover artwork", "cover-image");
  canvas.add(image);
  canvas.sendObjectToBack(image);
  const baseX = side === "wrap" ? WIDTH + spineWidth : 0;
  const scrim = withIdentity(new Rect({
    left: baseX, top: 0, width: WIDTH, height: HEIGHT, fill: "#080B0F",
    opacity: overlay / 100, selectable: true, evented: true,
  }), "Dark scrim overlay", "scrim");
  canvas.add(scrim);
  canvas.moveObjectTo(scrim, canvas.getObjects().indexOf(image) + 1);
}

async function renderStoredCoverPreview(props: Props, side: "front" | "back") {
  await document.fonts.ready;
  const element = document.createElement("canvas");
  const canvas = new Canvas(element, {
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: props.design.background,
    enableRetinaScaling: true,
  });
  canvas.clear();
  try {
    const blankTemplate = (side === "front" && props.design.template === "blank")
      || (side === "back" && props.design.backTemplate === "blank");
    const stored = blankTemplate ? undefined : props.design.fabricCanvasStates?.[side];
    if (stored) {
      await canvas.loadFromJSON(stateForLoad(JSON.stringify(stored), props.imageUrl, props.design.imageEnabled !== false));
      setCanvasBackground(canvas, props.design, side);
    } else {
      setCanvasBackground(canvas, props.design, side);
      if (side === "front") {
        addTemplateObjects(canvas, props.design, props.title, props.author, props.genre);
        if (props.design.template !== "blank" && props.design.imageEnabled !== false && props.imageUrl) {
          await insertCoverImage(canvas, props.imageUrl, "front", props.design.imageOverlay ?? 35);
        }
      } else {
        addBackCoverObjects(canvas, props.synopsis, props.author, coverPaletteForBackDesign(props.design), props.design.backTemplate, props.genre);
      }
    }
    if (side === "back") normalizeLegacyBackCoverLayout(canvas);
    canvas.requestRenderAll();
    return renderCanvas(canvas, 2);
  } finally {
    await canvas.dispose();
  }
}

export const FabricCoverCanvas = forwardRef(FabricCanvasView);
