import type { HighlightAttrs } from "../core/types.js";
const number = (value: unknown): number | undefined => typeof value === "number" ? value : undefined;
function colorNumberToCss(value: number | null | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return `#${value.toString(16).padStart(6, "0")}`;
}

export function decodeHighlightAttrs(value: unknown): HighlightAttrs {
    if (!(typeof value === 'object' && value !== null && !Array.isArray(value))) {
      return {};
    }

    const attrs = value as Record<string, unknown>;
    return {
      foreground: colorNumberToCss(number(attrs.foreground ?? attrs.fg)),
      background: colorNumberToCss(number(attrs.background ?? attrs.bg)),
      special: colorNumberToCss(number(attrs.special ?? attrs.sp)),
      bold: attrs.bold === true ? true : undefined,
      italic: attrs.italic === true ? true : undefined,
      underline: attrs.underline === true ? true : undefined,
      undercurl: attrs.undercurl === true ? true : undefined,
      underdouble: attrs.underdouble === true ? true : undefined,
      underdotted: attrs.underdotted === true ? true : undefined,
      underdashed: attrs.underdashed === true ? true : undefined,
      strikethrough: attrs.strikethrough === true ? true : undefined,
      reverse: attrs.reverse === true ? true : undefined,
    };
  }

