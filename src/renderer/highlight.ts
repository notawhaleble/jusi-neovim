import type { HighlightAttrs } from "../core/types.js";

export function styleForHighlight(
  attrs: HighlightAttrs | undefined,
  defaults: { foreground: string; background: string },
): string {
  if (!attrs) {
    return "";
  }

  const sourceForeground = attrs.foreground ?? defaults.foreground;
  const sourceBackground = attrs.background ?? defaults.background;
  const foreground = attrs.reverse ? sourceBackground : attrs.foreground;
  const background = attrs.reverse ? sourceForeground : attrs.background;
  const styles: string[] = [];
  if (foreground) {
    styles.push(`color:${foreground}`);
  }
  if (background) {
    styles.push(`background-color:${background}`);
  }
  if (attrs.bold) {
    styles.push("font-weight:700");
  }
  if (attrs.italic) {
    styles.push("font-style:italic");
  }
  const underlineStyle = attrs.undercurl ? 'wavy' : attrs.underdouble ? 'double'
    : attrs.underdotted ? 'dotted' : attrs.underdashed ? 'dashed' : attrs.underline ? 'solid' : undefined;
  const lines = [underlineStyle ? 'underline' : '', attrs.strikethrough ? 'line-through' : ''].filter(Boolean);
  if (lines.length) {
    styles.push(`text-decoration-line:${lines.join(' ')}`);
    styles.push(`text-decoration-style:${underlineStyle ?? 'solid'}`);
    styles.push(`text-decoration-color:${attrs.special ?? foreground ?? defaults.foreground}`);
    styles.push('text-decoration-skip-ink:none');
  }
  return styles.join(";");
}
