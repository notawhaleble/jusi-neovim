import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPathWithinRoot } from "../../electron/browser-policy.js";

export const directoryScheme = "jusi-directory";
const directoryProtocolRegistries = new WeakMap<object, string>();

export type ProtocolRegistry = {
  handle: (
    scheme: string,
    handler: (request: { url: string }) => Response | Promise<Response>,
  ) => void;
};

export function registerDirectoryProtocol(registry: ProtocolRegistry, root: string): void {
  const existing = directoryProtocolRegistries.get(registry);
  if (existing !== undefined) {
    if (existing !== root) throw new Error("Cannot change a local presentation root");
    return;
  }
  // Electron protocol.handle is synchronous; attachment must not race registration.
  // Only remember a grant after installation succeeds; failures reach the caller.
  registry.handle(directoryScheme, (request) => {
    const path = new URL(request.url).searchParams.get("path");
    if (!path || !isPathWithinRoot(path, root)) return htmlResponse("Local path is outside the opened root", 403);
    return handleDirectoryProtocolRequest(request);
  });
  directoryProtocolRegistries.set(registry, root);
}

async function handleDirectoryProtocolRequest(request: { url: string }): Promise<Response> {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");
  if (!filePath) {
    return htmlResponse("Directory not found", 404);
  }

  try {
    const stats = statSync(filePath);
    if (stats.isDirectory()) {
      return htmlResponse(directoryListingHtml(filePath), 200);
    }
    if (stats.isFile()) {
      return fileResponse(filePath, stats.size);
    }
    return htmlResponse("Path is not a regular file or directory", 404);
  } catch (_error) {
    return htmlResponse("Path not found", 404);
  }
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function directoryListingHtml(filePath: string): string {
  const entries = readdirSync(filePath, { withFileTypes: true })
    .map((entry) => {
      const childPath = join(filePath, entry.name);
      const isDirectory = entry.isDirectory();
      return {
        href: localPathUrl(childPath),
        name: entry.name + (isDirectory ? "/" : ""),
        isDirectory,
      };
    })
    .sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) {
        return left.isDirectory ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

  const parent = dirname(filePath);
  const parentLink = parent !== filePath
    ? `<li><a href="${escapeAttribute(localPathUrl(parent))}">../</a></li>`
    : "";
  const items = entries.map((entry) => {
    return `<li><a href="${escapeAttribute(entry.href)}">${escapeHtml(entry.name)}</a></li>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(filePath)}</title>
  <style>
    ${localFilePageCss()}
    h1 { font-size: 18px; margin: 0 0 16px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { padding: 3px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(basename(filePath) || filePath)}</h1>
  <ul>${parentLink}${items}</ul>
</body>
</html>`;
}

function fileResponse(filePath: string, size: number): Response {
  const maxPreviewBytes = 2 * 1024 * 1024;
  if (size > maxPreviewBytes) {
    return rawFileResponse(filePath);
  }
  if (isMarkdownPath(filePath)) {
    return htmlResponse(markdownFileHtml(filePath, readFileSync(filePath, "utf8")), 200);
  }
  if (shouldServeRawByExtension(filePath)) {
    return rawFileResponse(filePath);
  }

  const content = readFileSync(filePath);
  if (!isTextBuffer(content)) {
    return rawFileResponse(filePath, content);
  }

  return htmlResponse(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(filePath)}</title>
  <style>
    ${localFilePageCss()}
    h1 { font-size: 16px; margin: 0 0 16px; }
    pre { font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.45; margin: 0; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <h1>${escapeHtml(basename(filePath) || filePath)}</h1>
  <pre>${escapeHtml(content.toString("utf8"))}</pre>
</body>
</html>`, 200);
}

function markdownFileHtml(filePath: string, source: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(filePath)}</title>
  <style>
    ${localFilePageCss()}
    main { max-width: 900px; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.35em 0 0.55em; }
    h1 { border-bottom: 1px solid #30363d; font-size: 2em; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #30363d; font-size: 1.5em; padding-bottom: 0.25em; }
    h3 { font-size: 1.25em; }
    p, ul, ol, blockquote, pre { margin: 0 0 16px; }
    ul, ol { padding-left: 1.6em; }
    blockquote { border-left: 3px solid #3b434e; color: #9da7b3; padding-left: 12px; }
    code, pre { font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    code { background: #161b22; border-radius: 4px; padding: 0.15em 0.3em; }
    pre { background: #161b22; border-radius: 6px; overflow: auto; padding: 12px; }
    pre code { background: transparent; padding: 0; }
    img { max-width: 100%; }
    table { border-collapse: collapse; margin: 0 0 16px; }
    th, td { border: 1px solid #30363d; padding: 6px 10px; }
    @media (prefers-color-scheme: light) {
      h1, h2 { border-bottom-color: #d0d7de; }
      blockquote { border-left-color: #d0d7de; color: #57606a; }
      code, pre { background: #f6f8fa; }
      th, td { border-color: #d0d7de; }
    }
  </style>
</head>
<body>
  <main>${renderMarkdown(source, dirname(filePath))}</main>
</body>
</html>`;
}

function rawFileResponse(filePath: string, content = readFileSync(filePath)): Response {
  return new Response(new Uint8Array(content), {
    status: 200,
    headers: {
      "content-type": mimeTypeForPath(filePath),
      "content-disposition": `inline; filename="${escapeHeaderValue(basename(filePath) || "file")}"`,
    },
  });
}

function localFilePageCss(): string {
  return `
    :root { color-scheme: light dark; }
    body { background: #0d1117; color: #e6edf3; font: 14px system-ui, sans-serif; margin: 24px; }
    a { color: #8ab4f8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    @media (prefers-color-scheme: light) {
      body { background: #ffffff; color: #1f2328; }
      a { color: #0969da; }
    }
  `;
}

function isTextBuffer(content: Buffer): boolean {
  return !content.includes(0);
}

function isMarkdownPath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === ".md" || ext === ".markdown";
}

function shouldServeRawByExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return [
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".mp4",
    ".webm",
    ".mp3",
    ".wav",
    ".wasm",
    ".html",
    ".htm",
  ].includes(ext);
}

function renderMarkdown(source: string, basePath: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inFence = false;
  let fenceLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    blocks.push(`<p>${renderMarkdownInline(paragraph.join(" "), basePath)}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listType) {
      return;
    }
    blocks.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listItems = [];
    listType = null;
  };

  for (const line of lines) {
    const fence = /^```/.exec(line);
    if (fence) {
      if (inFence) {
        blocks.push(`<pre><code>${escapeHtml(fenceLines.join("\n"))}</code></pre>`);
        fenceLines = [];
        inFence = false;
      } else {
        flushParagraph();
        flushList();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceLines.push(line);
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderMarkdownInline(heading[2].trim(), basePath)}</h${level}>`);
      continue;
    }

    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(`<li>${renderMarkdownInline(unordered[1], basePath)}</li>`);
      continue;
    }

    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(`<li>${renderMarkdownInline(ordered[1], basePath)}</li>`);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${renderMarkdownInline(quote[1], basePath)}</blockquote>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  if (inFence) {
    blocks.push(`<pre><code>${escapeHtml(fenceLines.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  flushList();
  return blocks.join("\n");
}

function renderMarkdownInline(source: string, basePath: string): string {
  const tokens: string[] = [];
  let text = source.replace(/`([^`]+)`/g, (_match, code: string) => {
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = escapeHtml(text)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, href: string) => {
      return `<img alt="${escapeAttribute(alt)}" src="${escapeAttribute(markdownUrl(href, basePath))}">`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      return `<a href="${escapeAttribute(markdownUrl(href, basePath))}">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return text.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => tokens[Number(index)] ?? "");
}

function markdownUrl(rawHref: string, basePath: string): string {
  const href = rawHref.trim();
  if (href.startsWith("#")) {
    return href;
  }
  try {
    const parsed = new URL(href);
    if (parsed.protocol === "file:") {
      return localPathUrl(fileURLToPath(parsed));
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return href;
    }
    return "#";
  } catch (_error) {
    const hashIndex = href.indexOf("#");
    const pathPart = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
    const hashPart = hashIndex >= 0 ? href.slice(hashIndex) : "";
    return localPathUrl(resolve(basePath, pathPart)) + hashPart;
  }
}

function mimeTypeForPath(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".wasm":
      return "application/wasm";
    case ".json":
      return "application/json; charset=utf-8";
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function escapeHeaderValue(value: string): string {
  return value.replace(/["\\\r\n]/g, "_");
}

function localPathUrl(filePath: string): string {
  const url = new URL(`${directoryScheme}://open/`);
  url.searchParams.set("path", filePath);
  return url.href;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

