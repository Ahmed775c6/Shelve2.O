import type { WritingCoverDesign, WritingCoverLayer, WritingBackCoverTemplate, WritingFrontCoverTemplate, WritingLegacyCoverTemplate } from "../../types";
import {
  BACK_COVER_TEMPLATES, BACK_TEMPLATE_STYLES, COVER_FONTS, COVER_TEMPLATES, FRONT_TEMPLATE_STYLES,
  LEGACY_COVER_TEMPLATES, LEGACY_TEMPLATE_MAP,
} from "./catalog";

export function isFrontCoverTemplate(value: string): value is WritingFrontCoverTemplate {
  return COVER_TEMPLATES.some((template) => template.value === value);
}

export function isBackCoverTemplate(value: string): value is WritingBackCoverTemplate {
  return BACK_COVER_TEMPLATES.some((template) => template.value === value);
}

export function coverInk(background: string, fallback = "#F8F4EC"): string {
  const firstHex = background.match(/#[0-9a-f]{6}/i)?.[0];
  if (!firstHex) return fallback;
  const channels = firstHex.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) return fallback;
  const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 > 0.42 ? "#26312A" : fallback;
}

function initialCoverLayers(title: string, subtitle: string, author: string): WritingCoverLayer[] {
  return [
    { id: "cover-title", type: "title", label: "Title", text: title, x: 50, y: 38, visible: true },
    { id: "cover-subtitle", type: "subtitle", label: "Subtitle", text: subtitle, x: 50, y: 54, visible: Boolean(subtitle) },
    { id: "cover-author", type: "author", label: "Author", text: author, x: 50, y: 83, visible: Boolean(author) },
    { id: "cover-badge", type: "badge", label: "Series / Badge", text: "A NOVEL", x: 50, y: 22, visible: true },
  ];
}

export function isWritingCoverDesign(value: unknown): value is WritingCoverDesign {
  return typeof value === "object" && value !== null &&
    "template" in value && (
      COVER_TEMPLATES.some((template) => template.value === value.template) ||
      LEGACY_COVER_TEMPLATES.includes(value.template as WritingLegacyCoverTemplate)
    ) &&
    "title" in value && typeof value.title === "string" &&
    "subtitle" in value && typeof value.subtitle === "string" &&
    "author" in value && typeof value.author === "string" &&
    "spine" in value && typeof value.spine === "string" &&
    "background" in value && typeof value.background === "string" &&
    "textColor" in value && typeof value.textColor === "string" &&
    "typography" in value && COVER_FONTS.some((font) => font.value === value.typography) &&
    (!("backTemplate" in value) || BACK_COVER_TEMPLATES.some((template) => template.value === value.backTemplate)) &&
    "side" in value && (value.side === "front" || value.side === "back" || value.side === "wrap" || value.side === "mockup");
}

function isCoverLayer(value: unknown): value is WritingCoverLayer {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "string" &&
    "type" in value && ["title", "subtitle", "author", "badge", "ornament"].includes(String(value.type)) &&
    "label" in value && typeof value.label === "string" &&
    "text" in value && typeof value.text === "string" &&
    "x" in value && typeof value.x === "number" &&
    "y" in value && typeof value.y === "number" &&
    "visible" in value && typeof value.visible === "boolean";
}

export function normalizeCoverDesign(value: unknown, title: string, subtitle: string, author: string, background: string): WritingCoverDesign {
  const source = isWritingCoverDesign(value) ? value : null;
  const fill = source?.background ?? (source?.template === "blank" ? FRONT_TEMPLATE_STYLES.blank.background : source ? background : FRONT_TEMPLATE_STYLES.blank.background);
  const sourceLayers = source?.layers?.filter(isCoverLayer);
  const sourceIsLegacyTemplate = source ? LEGACY_COVER_TEMPLATES.includes(source.template as WritingLegacyCoverTemplate) : false;
  return {
    template: source
      ? LEGACY_COVER_TEMPLATES.includes(source.template as WritingLegacyCoverTemplate)
        ? LEGACY_TEMPLATE_MAP[source.template as WritingLegacyCoverTemplate]
        : source.template as WritingFrontCoverTemplate
      : "blank",
    backTemplate: source?.backTemplate ?? "blank",
    title: source?.title ?? title,
    subtitle: source?.subtitle ?? subtitle,
    author: source?.author ?? author,
    spine: source?.spine ?? "",
    spineAuthor: source?.spineAuthor ?? "",
    spineTextColor: source?.spineTextColor ?? "#29251E",
    spineFontFamily: source?.spineFontFamily ?? "Cinzel",
    spineFontSize: Math.min(32, Math.max(10, source?.spineFontSize ?? 16)),
    spineAuthorFontSize: Math.min(24, Math.max(8, source?.spineAuthorFontSize ?? 12)),
    background: fill,
    backBackground: source?.backBackground ?? BACK_TEMPLATE_STYLES[source?.backTemplate ?? "blank"].background,
    backTextColor: source?.backTextColor ?? BACK_TEMPLATE_STYLES[source?.backTemplate ?? "blank"].textColor,
    backGradientEnd: source?.backGradientEnd ?? BACK_TEMPLATE_STYLES[source?.backTemplate ?? "blank"].gradientEnd,
    backGradientType: source?.backGradientType ?? BACK_TEMPLATE_STYLES[source?.backTemplate ?? "blank"].gradientType,
    textColor: source?.textColor ?? coverInk(fill),
    titleColor: source?.titleColor ?? (source ? coverInk(fill) : FRONT_TEMPLATE_STYLES.blank.titleColor),
    typography: source?.typography ?? "editorial",
    fabricFontFamily: source?.fabricFontFamily ?? "Playfair Display",
    backFontFamily: source?.backFontFamily ?? BACK_TEMPLATE_STYLES[source?.backTemplate ?? "blank"].fontFamily,
    fabricCanvasStates: source?.fabricCanvasStates
      ? sourceIsLegacyTemplate
        ? { ...source.fabricCanvasStates, front: undefined }
        : source.fabricCanvasStates
      : undefined,
    imageEnabled: source?.imageEnabled,
    side: source?.side === "wrap" || source?.side === "back" || source?.side === "mockup" ? source.side : "front",
    badge: source?.badge ?? (source ? "A NOVEL" : ""),
    fontSize: Math.min(72, Math.max(12, source?.fontSize ?? 32)),
    backFontSize: Math.min(72, Math.max(12, source?.backFontSize ?? 30)),
    letterSpacing: Math.min(16, Math.max(-2, source?.letterSpacing ?? 0)),
    backLetterSpacing: Math.min(16, Math.max(-2, source?.backLetterSpacing ?? 0)),
    alignment: source?.alignment === "left" || source?.alignment === "right" ? source.alignment : "center",
    backAlignment: source?.backAlignment === "left" || source?.backAlignment === "right" ? source.backAlignment : "center",
    titleShadow: source?.titleShadow ?? true,
    backTitleShadow: source?.backTitleShadow ?? false,
    backGrain: source?.backGrain ?? false,
    backBleedGuide: source?.backBleedGuide ?? false,
    backTrimGuide: source?.backTrimGuide ?? true,
    backSafeGuide: source?.backSafeGuide ?? false,
    imageFit: source?.imageFit === "inset" || source?.imageFit === "top" ? source.imageFit : "full",
    imageOverlay: Math.min(80, Math.max(0, source?.imageOverlay ?? 35)),
    grain: source?.grain ?? false,
    gradientEnd: source?.gradientEnd ?? FRONT_TEMPLATE_STYLES.blank.gradientEnd,
    gradientType: source?.gradientType === "radial" ? "radial" : "linear",
    spineWidth: Math.min(18, Math.max(3, source?.spineWidth ?? 7)),
    spineColor: source?.spineColor ?? "#F5EFE6",
    bleedGuide: source?.bleedGuide ?? false,
    trimGuide: source?.trimGuide ?? true,
    safeGuide: source?.safeGuide ?? false,
    zoom: Math.min(150, Math.max(50, source?.zoom ?? 100)),
    layers: !source || source.template === "blank"
      ? []
      : sourceLayers?.length
      ? sourceLayers
      : initialCoverLayers(source?.title ?? title, source?.subtitle ?? subtitle, source?.author ?? author),
    imageKey: source?.imageKey,
    imageFileName: source?.imageFileName,
    imageMimeType: source?.imageMimeType,
    remoteImageName: source?.remoteImageName,
    artDirection: source?.artDirection,
    appliedCoverKey: source?.appliedCoverKey,
    appliedRemoteCoverName: source?.appliedRemoteCoverName,
  };
}
