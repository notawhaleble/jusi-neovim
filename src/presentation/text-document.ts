import type { MirrorDocument } from "../core/types.js";

/** Treat extraction results as untrusted document data, even when the caller is our shell. */
export function validateMirror(value: unknown): asserts value is MirrorDocument {
  const doc = value as MirrorDocument;
  if (!doc || !Number.isSafeInteger(doc.version) || doc.version < 0 || !Array.isArray(doc.lines)
    || doc.lines.length > 200000 || !Number.isSafeInteger(doc.totalTextLength)
    || doc.totalTextLength < 0 || doc.totalTextLength > 400000) throw new Error("Invalid text document");
  let chars = 0;
  let end = 0;
  for (const [index, line] of doc.lines.entries()) {
    if (!line || typeof line.text !== "string" || /[\r\n\0]/.test(line.text)
      || line.lineNumber !== index || !Number.isSafeInteger(line.startIndex) || !Number.isSafeInteger(line.endIndex)
      || line.startIndex < end || line.endIndex !== line.startIndex + line.text.length
      || line.endIndex > doc.totalTextLength || !Array.isArray(line.spans) || line.spans.length > 200000) {
      throw new Error("Invalid text line");
    }
    chars += line.text.length;
    if (chars > 200000) throw new Error("Text document exceeds limit");
    end = line.endIndex;
  }
}
