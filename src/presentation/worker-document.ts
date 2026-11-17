export interface WorkerTextDocument {
  offsetEncoding: "utf-8";
  lines: Array<{ text: string; anchor: { source: string; startByte: number; endByte: number } }>;
}
/** Revalidate at the process boundary; retain no unexpected worker fields. */
export function workerDocument(value: unknown): WorkerTextDocument {
  const doc = value as WorkerTextDocument;
  const encoder = new TextEncoder();
  const validString = (s: unknown, limit: number): s is string => typeof s === "string"
    && !s.includes("\0") && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s)
    && encoder.encode(s).length <= limit;
  if (!doc || doc.offsetEncoding !== "utf-8" || !Array.isArray(doc.lines) || doc.lines.length > 10000) throw new Error("Invalid worker document");
  let bytes = 0;
  const lines = doc.lines.map(line => {
    const a = line?.anchor;
    if (!validString(line?.text, 524288) || /[\r\n]/.test(line.text) || !a || !validString(a.source, 1024) || !a.source
      || !Number.isSafeInteger(a.startByte) || !Number.isSafeInteger(a.endByte) || a.startByte < 0 || a.endByte < a.startByte) throw new Error("Invalid worker text line");
    bytes += encoder.encode(line.text).length;
    if (bytes > 524288) throw new Error("Worker text limit exceeded");
    return { text: line.text, anchor: { source: a.source, startByte: a.startByte, endByte: a.endByte } };
  });
  return { offsetEncoding: "utf-8", lines };
}
