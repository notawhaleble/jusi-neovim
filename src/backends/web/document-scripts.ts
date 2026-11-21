// Executed only inside sandboxed web documents. No host IPC or Node access.
export function mirrorExtractorSource(): string {
  return `(async () => {
    class ExtractionLimit extends Error {}
    try {
      const jobId = (window.__jusiTextJobId || 0) + 1;
      window.__jusiTextJobId = jobId;
      let sliceStart = performance.now();
      const yieldIfNeeded = async () => {
        if (performance.now() - sliceStart < 8) return;
        await new Promise(resolve => setTimeout(resolve, 0));
        if (window.__jusiTextJobId !== jobId) throw new Error("Text build superseded");
        sliceStart = performance.now();
      };
      window.__jusiMirrorNodes = new Map();
      window.__jusiMirrorIndexMap = [];
      const maxChars = 200000;
      let sourceChars = 0;
      const checkOutput = () => {
        if (charCount >= maxChars || indexMap.length >= 400000) throw new ExtractionLimit();
      };
      const collapsibleWhitespace = /[ \\t\\n\\f\\r]/;
      const lines = [];
      const indexMap = [];
      let currentLine = "";
      let currentLineStart = 0;
      let currentLineTop = null;
      let lastWasSpace = false;
      let charCount = 0;
      let currentBlock = null;
      let currentParent = null;
      let codeWhitespace = false;
      const fileCellSelector = '.react-code-file-contents .react-code-lines [data-testid="code-cell"][data-line-number]';
      const styleCache = new WeakMap();
      window.__jusiTextStyles = new WeakMap();
      const lineHeight = (() => {
        const style = window.getComputedStyle(document.body || document.documentElement);
        const parsed = Number.parseFloat(style.lineHeight);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
      })();
      window.__jusiMirrorLineHeight = lineHeight;
      const getStyle = (element) => {
        if (!styleCache.has(element)) {
          const s = window.getComputedStyle(element);
          styleCache.set(element, s);
          window.__jusiTextStyles.set(element, [s.display,s.visibility,s.whiteSpace,s.textTransform,s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight,s.letterSpacing,s.width,s.position,s.clip,s.clipPath,s.contentVisibility].join('|'));
        }
        return styleCache.get(element);
      };
      const applyTextTransform = (text, transform) => {
        const mode = String(transform || "").toLowerCase();
        if (mode === "uppercase") {
          return text.toUpperCase();
        }
        if (mode === "lowercase") {
          return text.toLowerCase();
        }
        if (mode === "capitalize") {
          return text.replace(/\\b[a-z]/g, (match) => match.toUpperCase());
        }
        return text;
      };
      const normalizeNodeText = async (text, whiteSpace, textTransform) => {
        const ws = String(whiteSpace || "").toLowerCase();
        const preserve = ws === "pre" || ws === "pre-wrap" || ws === "break-spaces";
        const preLine = ws === "pre-line";
        let normalized = "";
        const offsets = [];
        for (let index = 0; index < text.length; index += 1) {
          if (index % 1024 === 0) await yieldIfNeeded();
          if (++sourceChars > 1000000) throw new ExtractionLimit();
          const char = text[index];
          if (char === "\\r") {
            continue;
          }
          if (collapsibleWhitespace.test(char)) {
            if (preserve) {
              normalized += char;
              offsets.push(index);
              lastWasSpace = char === " " || char === "\\t";
              continue;
            }
            if (preLine && char === "\\n") {
              normalized += "\\n";
              offsets.push(index);
              lastWasSpace = false;
              continue;
            }
            if (lastWasSpace) {
              continue;
            }
            normalized += " ";
            offsets.push(index);
            lastWasSpace = true;
            continue;
          }
          normalized += char;
          offsets.push(index);
          lastWasSpace = false;
        }
        const transformed = applyTextTransform(normalized, textTransform);
        return transformed.length === normalized.length
          ? { text: transformed, offsets }
          : { text: normalized, offsets };
      };
      const rectsForRange = (node, startOffset, endOffset) => {
        if (endOffset <= startOffset) {
          return [];
        }
        const range = document.createRange();
        try {
          range.setStart(node, Math.max(0, Math.min(startOffset, node.length)));
          range.setEnd(node, Math.max(0, Math.min(endOffset, node.length)));
          return Array.from(range.getClientRects())
            .filter((rect) => rect.width > 0 || rect.height > 0)
            .map((rect) => ({
              x: rect.x,
              y: rect.y,
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }));
        } catch (_error) {
          return [];
        } finally {
          range.detach();
        }
      };
      const crossesVisualLines = (rects) => {
        if (rects.length <= 1) {
          return false;
        }
        const firstTop = rects[0].top;
        return rects.some((rect) => Math.abs(rect.top - firstTop) > lineHeight * 0.6);
      };
      const tokenize = (text) => {
        const tokens = [];
        let index = 0;
        while (index < text.length) {
          const char = text[index];
          if (char === "\\n") {
            tokens.push({ type: "newline", start: index, end: index + 1 });
            index += 1;
            continue;
          }
          if (char === " " || char === "\\t") {
            const start = index;
            while (index < text.length && (text[index] === " " || text[index] === "\\t")) {
              index += 1;
            }
            tokens.push({ type: "space", start, end: index });
            continue;
          }
          const start = index;
          while (index < text.length && text[index] !== " " && text[index] !== "\\t" && text[index] !== "\\n") {
            index += 1;
          }
          tokens.push({ type: "word", start, end: index });
        }
        return tokens;
      };
      const blockDisplayPattern = /^(block|list-item|table|table-row|table-cell|flex|grid|flow-root)$/;
      const blockAncestor = (node) => {
        let element = node.parentElement;
        const root = document.body || document.documentElement;
        while (element && element !== root && element !== document.documentElement) {
          const display = getStyle(element).display || "";
          if (blockDisplayPattern.test(display)) {
            return element;
          }
          element = element.parentElement;
        }
        return node.parentElement;
      };
      const separatorTags = new Set(["A", "BUTTON", "LI", "TD", "TH", "OPTION", "SUMMARY"]);
      const shouldSeparateInlineNodes = (previous, next) => {
        if (!previous || !next || previous === next || currentLine.length === 0 || currentLine.endsWith(" ")) {
          return false;
        }
        const previousTag = previous.tagName ? previous.tagName.toUpperCase() : "";
        const nextTag = next.tagName ? next.tagName.toUpperCase() : "";
        if (separatorTags.has(previousTag) || separatorTags.has(nextTag)) {
          return true;
        }
        const previousDisplay = getStyle(previous).display || "";
        const nextDisplay = getStyle(next).display || "";
        return previousDisplay.includes("inline-block") || nextDisplay.includes("inline-block");
      };
      const excludedAncestors = new WeakMap();
      const visuallyExcluded = (element) => {
        const chain = [];
        let excluded = false;
        for (let current = element; current; current = current.parentElement) {
          if (excludedAncestors.has(current)) { excluded = excludedAncestors.get(current); break; }
          chain.push(current);
          const style = getStyle(current);
          // Screen-reader labels commonly use a zero-area legacy clip and/or
          // inset(50%). Their DOM ranges still have geometry, often at page top.
          const clip = (style.clip || "").match(/^rect\\(([^)]+)\\)$/);
          const edges = clip ? clip[1].split(/[,\\s]+/).filter(Boolean).map(parseFloat) : [];
          const emptyClip = ['absolute','fixed'].includes(style.position) && edges.length === 4
            && edges.every(Number.isFinite) && (edges[2] <= edges[0] || edges[1] <= edges[3]);
          if (style.display === 'none' || style.contentVisibility === 'hidden' || emptyClip
            || /^inset\\(50%(?:\\s+50%){0,3}\\)$/.test(style.clipPath)) { excluded = true; break; }
        }
        for (const current of chain) excludedAncestors.set(current, excluded);
        return excluded;
      };
      const isTextNodeVisible = (node, fileCell) => {
        if (!node || node.nodeType !== Node.TEXT_NODE || !node.parentElement) {
          return false;
        }
        const parent = node.parentElement;
        const tag = parent.tagName ? parent.tagName.toUpperCase() : "";
        if (["SCRIPT","STYLE","NOSCRIPT","TEMPLATE","INPUT","TEXTAREA","SELECT","OPTION"].includes(tag)) {
          return false;
        }
        if (parent.closest && parent.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), #jusi-neovim-mirror-overlay, #jusi-neovim-web-mode-frame')) {
          return false;
        }
        const hidden = parent.closest('[aria-hidden="true"]');
        // GitHub renders the visible file and its line-number gutter in one
        // presentation-only container. Admit just the rendered source cells.
        if (hidden && (!fileCell || hidden !== fileCell.closest('.react-code-file-contents')
          || hidden.parentElement?.closest('[aria-hidden="true"]'))) return false;
        const style = getStyle(parent);
        if (!style || style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        return !visuallyExcluded(parent);
      };
      const flushLine = (includeNewline = true, preserveEmpty = false, newline = null) => {
        while (currentLine.endsWith(" ") && !indexMap[indexMap.length - 1]) {
          currentLine = currentLine.slice(0, -1);
          indexMap.pop();
        }
        if (currentLine.length === 0 && !preserveEmpty) {
          currentLineTop = null;
          lastWasSpace = false;
          currentLineStart = indexMap.length;
          return;
        }
        if (lines.length >= 200000) throw new ExtractionLimit();
        const lineStart = currentLineStart;
        lines.push({
          lineNumber: lines.length,
          text: currentLine,
          startIndex: lineStart,
          endIndex: lineStart + currentLine.length,
          spans: [],
        });
        currentLine = "";
        currentLineTop = null;
        lastWasSpace = false;
        if (includeNewline) {
          if (indexMap.length >= 400000) throw new ExtractionLimit();
          indexMap.push(newline);
        }
        currentLineStart = indexMap.length;
      };
      const pushSyntheticSpace = () => {
        if (currentLine.length === 0 || currentLine.endsWith(" ")) {
          return;
        }
        checkOutput();
        currentLine += " ";
        indexMap.push(null);
        charCount += 1;
      };
      const pushSpaceRun = (text) => {
        if (currentLine.length === 0) {
          return;
        }
        for (let index = 0; index < text.length; index += 1) {
          if (currentLine.endsWith(" ") && text[index] === " ") {
            continue;
          }
          checkOutput();
          currentLine += text[index];
          indexMap.push(null);
          charCount += 1;
        }
      };
      const pushMappedRun = async (node, text, offsets, start, end, rect) => {
        if (rect && currentLineTop !== null && Math.abs(rect.top - currentLineTop) > lineHeight * 0.6) {
          flushLine();
        }
        if (currentLine.length === 0) {
          currentLineStart = indexMap.length;
          currentLineTop = rect ? rect.top : null;
        }
        for (let index = start; index < end; index += 1) {
          if ((index - start) % 1024 === 0) await yieldIfNeeded();
          checkOutput();
          currentLine += text[index];
          indexMap.push({ node, offset: offsets[index] });
          charCount += 1;
        }
      };
      const pushWrappedRun = async (node, text, offsets, start, end) => {
        await yieldIfNeeded();
        const rects = rectsForRange(node, offsets[start], offsets[end - 1] + 1);
        if (end - start === 1 || !crossesVisualLines(rects)) {
          await pushMappedRun(node, text, offsets, start, end, rects.length > 0 ? rects[0] : null);
          return;
        }
        // Split only ranges spanning visual lines. Mapping each unit separately
        // repeats Chromium range/layout work for every character of a long word.
        const middle = start + Math.floor((end - start) / 2);
        await pushWrappedRun(node, text, offsets, start, middle);
        await pushWrappedRun(node, text, offsets, middle, end);
      };
      const pushToken = async (node, text, offsets, token) => {
        if (token.type === "newline") {
          flushLine(true, true, codeWhitespace ? {node, offset: offsets[token.start]} : null);
          return;
        }
        if (token.type === "space" && !codeWhitespace) {
          pushSpaceRun(text.slice(token.start, token.end));
          return;
        }
        const startOffset = offsets[token.start];
        const endOffset = offsets[token.end - 1] + 1;
        const rects = rectsForRange(node, startOffset, endOffset);
        if (crossesVisualLines(rects)) {
          await pushWrappedRun(node, text, offsets, token.start, token.end);
          return;
        }
        await pushMappedRun(node, text, offsets, token.start, token.end, rects.length > 0 ? rects[0] : null);
      };
      const pushTokens = async (node, text, offsets, tokens, start, end) => {
        await yieldIfNeeded();
        if (end - start === 1) {
          await pushToken(node, text, offsets, tokens[start]);
          return;
        }
        // Bound native geometry result size before querying long bidi paragraphs.
        if (tokens[end - 1].end - tokens[start].start > 1024) {
          const middle = start + Math.floor((end - start) / 2);
          await pushTokens(node, text, offsets, tokens, start, middle);
          await pushTokens(node, text, offsets, tokens, middle, end);
          return;
        }
        const rects = rectsForRange(node, offsets[tokens[start].start], offsets[tokens[end - 1].end - 1] + 1);
        if (crossesVisualLines(rects)) {
          const middle = start + Math.floor((end - start) / 2);
          await pushTokens(node, text, offsets, tokens, start, middle);
          await pushTokens(node, text, offsets, tokens, middle, end);
          return;
        }
        const rect = rects.length > 0 ? rects[0] : null;
        for (let index = start; index < end; index++) {
          await yieldIfNeeded();
          const token = tokens[index];
          if (token.type === "word" || (codeWhitespace && token.type === "space")) await pushMappedRun(node, text, offsets, token.start, token.end, rect);
          else await pushToken(node, text, offsets, token);
        }
      };
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      let visited = 0;
      while (node) {
        if (++visited > 100000) throw new ExtractionLimit();
        await yieldIfNeeded();
        const fileCell = node.parentElement?.closest(fileCellSelector);
        if (!isTextNodeVisible(node, fileCell)) { node = walker.nextNode(); continue; }
        const parent = node.parentElement;
        const style = getStyle(parent);
        codeWhitespace = !!fileCell || (!!parent.closest('pre, code') && ['pre','pre-wrap','break-spaces'].includes(style.whiteSpace));
        const block = fileCell || blockAncestor(node);
        if (currentBlock && block !== currentBlock && currentLine.length > 0) {
          flushLine();
        }
        currentBlock = block;
        if (!codeWhitespace && shouldSeparateInlineNodes(currentParent, parent)) {
          pushSyntheticSpace();
        }
        currentParent = parent;
        const normalized = await normalizeNodeText(node.nodeValue || "", fileCell ? "pre" : style.whiteSpace, style.textTransform);
        const tokens = tokenize(normalized.text);
        if (tokens.length) await pushTokens(node, normalized.text, normalized.offsets, tokens, 0, tokens.length);
        node = walker.nextNode();
      }
      flushLine(false);
      if (window.__jusiTextJobId !== jobId) throw new Error("Document changed during extraction");
      window.__jusiMirrorIndexMap = indexMap;
      const totalTextLength = lines.length > 0 ? lines[lines.length - 1].endIndex : 0;
      return {
        version: Date.now(),
        lines,
        totalTextLength,
      };
    } catch (error) {
      if (error instanceof ExtractionLimit) return { limitExceeded: true };
      throw error;
    }
  })()`;
}

export function mirrorProjectionClearSource(): string {
  return `(() => {
    const caret = document.getElementById("jusi-neovim-mirror-caret");
    if (caret) {
      caret.style.display = "none";
    }
  })()`;
}

export function mirrorSelectionClearSource(): string {
  return `(() => {
    const root = document.getElementById("jusi-neovim-mirror-selection");
    if (root) {
      root.replaceChildren();
    }
  })()`;
}

export function webModeFrameSource(visible: boolean): string {
  return `(() => {
    document.documentElement.dataset.jusiMode = "${visible ? "rich" : "text"}";
    const frame = document.getElementById("jusi-neovim-web-mode-frame");
    if (frame) {
      frame.remove();
    }
  })()`;
}

export function pointerVisibilitySource(hidden: boolean): string {
  return `(() => {
    const id = "jusi-neovim-pointer-visibility";
    let style = document.getElementById(id);
    if (${hidden ? "true" : "false"}) {
      if (!style) {
        style = document.createElement("style");
        style.id = id;
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = "html, body, * { cursor: none !important; }";
      return;
    }
    if (style) {
      style.remove();
    }
  })()`;
}

export function mirrorSelectionProjectionSource(startIndex: number, endIndex: number): string {
  return mirrorSelectionRangesSource([{ from: startIndex, to: endIndex }]);
}

export function mirrorSelectionRangesSource(ranges: { from: number; to: number }[]): string {
  return `(() => {
    const indexMap = window.__jusiMirrorIndexMap || [];
    const ranges = ${JSON.stringify(ranges)};
    const nearestMappedIndex = (start, direction) => {
      let cursor = Math.max(0, Math.min(start, indexMap.length - 1));
      while (cursor >= 0 && cursor < indexMap.length) {
        if (indexMap[cursor]) {
          return cursor;
        }
        cursor += direction;
      }
      return null;
    };
    const boundaryForIndex = (target, isEnd) => {
      if (indexMap.length === 0) {
        return null;
      }
      if (target <= 0) {
        const first = nearestMappedIndex(0, 1);
        return first === null ? null : indexMap[first];
      }
      if (target >= indexMap.length) {
        const last = nearestMappedIndex(indexMap.length - 1, -1);
        return last === null ? null : { node: indexMap[last].node, offset: indexMap[last].offset + 1 };
      }
      const mapped = indexMap[target];
      if (mapped) {
        return mapped;
      }
      if (isEnd) {
        const previous = nearestMappedIndex(target - 1, -1);
        return previous === null ? null : { node: indexMap[previous].node, offset: indexMap[previous].offset + 1 };
      }
      const next = nearestMappedIndex(target, 1);
      return next === null ? null : indexMap[next];
    };
    const ensureSelectionRoot = () => {
      let overlay = document.getElementById("jusi-neovim-mirror-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "jusi-neovim-mirror-overlay";
        overlay.style.position = "fixed";
        overlay.style.left = "0px";
        overlay.style.top = "0px";
        overlay.style.width = "100vw";
        overlay.style.height = "100vh";
        overlay.style.overflow = "visible";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "2147483647";
        overlay.style.contain = "layout paint style";
        (document.body || document.documentElement).appendChild(overlay);
      }
      let root = document.getElementById("jusi-neovim-mirror-selection");
      if (!root) {
        root = document.createElement("div");
        root.id = "jusi-neovim-mirror-selection";
        root.style.position = "absolute";
        root.style.left = "0px";
        root.style.top = "0px";
        root.style.width = "100vw";
        root.style.height = "100vh";
        root.style.pointerEvents = "none";
        overlay.insertBefore(root, overlay.firstChild);
      }
      return root;
    };
    const root = ensureSelectionRoot();
    root.replaceChildren();
    let count = 0;
    for (const {from: startIndex, to: endIndex} of ranges) {
    if (endIndex <= startIndex) continue;
    const start = boundaryForIndex(startIndex, false);
    const end = boundaryForIndex(endIndex, true);
    if (!start || !end || !start.node || !end.node) continue;
    const range = document.createRange();
    try {
      range.setStart(start.node, Math.max(0, Math.min(start.offset, start.node.length)));
      range.setEnd(end.node, Math.max(0, Math.min(end.offset, end.node.length)));
    } catch (_error) {
      range.detach();
      continue;
    }
    const rects = Array.from(range.getClientRects());
    for (const rect of rects) {
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      const node = document.createElement("div");
      node.style.position = "absolute";
      node.style.left = Math.round(rect.left) + "px";
      node.style.top = Math.round(rect.top) + "px";
      node.style.width = Math.max(1, Math.round(rect.width)) + "px";
      node.style.height = Math.max(1, Math.round(rect.height)) + "px";
      node.style.background = "rgba(70, 130, 255, 0.36)";
      node.style.outline = "1px solid rgba(70, 130, 255, 0.22)";
      root.appendChild(node);
      count += 1;
    }
    range.detach();
    }
    return count;
  })()`;
}

export function mirrorProjectionSource(index: number, autoScroll: boolean): string {
  return `(() => {
    const indexMap = window.__jusiMirrorIndexMap || [];
    const requestedIndex = Math.max(0, Math.floor(${index}));
    const shouldAutoScroll = ${autoScroll ? "true" : "false"};
    const nearestMappedIndex = (start, direction) => {
      let cursor = Math.max(0, Math.min(start, indexMap.length - 1));
      while (cursor >= 0 && cursor < indexMap.length) {
        if (indexMap[cursor]) {
          return cursor;
        }
        cursor += direction;
      }
      return null;
    };
    const boundaryForIndex = (target) => {
      if (indexMap.length === 0) {
        return null;
      }
      if (target <= 0) {
        const first = nearestMappedIndex(0, 1);
        return first === null ? null : indexMap[first];
      }
      if (target >= indexMap.length) {
        const last = nearestMappedIndex(indexMap.length - 1, -1);
        return last === null ? null : { node: indexMap[last].node, offset: indexMap[last].offset + 1 };
      }
      const mapped = indexMap[target];
      if (mapped) {
        return mapped;
      }
      const previous = nearestMappedIndex(target - 1, -1);
      if (previous !== null) {
        return { node: indexMap[previous].node, offset: indexMap[previous].offset + 1 };
      }
      const next = nearestMappedIndex(target, 1);
      return next === null ? null : indexMap[next];
    };
    const boundary = boundaryForIndex(requestedIndex);
    if (!boundary || !boundary.node || boundary.node.nodeType !== Node.TEXT_NODE) {
      return null;
    }
    const ensureCaret = () => {
      let root = document.getElementById("jusi-neovim-mirror-overlay");
      if (!root) {
        root = document.createElement("div");
        root.id = "jusi-neovim-mirror-overlay";
        root.style.position = "fixed";
        root.style.left = "0px";
        root.style.top = "0px";
        root.style.width = "100vw";
        root.style.height = "100vh";
        root.style.overflow = "visible";
        root.style.pointerEvents = "none";
        root.style.zIndex = "2147483647";
        root.style.contain = "layout paint style";
        (document.body || document.documentElement).appendChild(root);
      }
      let caret = document.getElementById("jusi-neovim-mirror-caret");
      if (!caret) {
        caret = document.createElement("div");
        caret.id = "jusi-neovim-mirror-caret";
        caret.style.position = "absolute";
        caret.style.boxSizing = "border-box";
        caret.style.border = "1px solid #4f7cff";
        caret.style.background = "rgba(79, 124, 255, 0.2)";
        caret.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.55), 0 0 6px rgba(79,124,255,0.45)";
        caret.style.pointerEvents = "none";
        root.appendChild(caret);
      }
      return caret;
    };
    const rectForBoundary = () => {
      const textNode = boundary.node;
      const offset = Math.max(0, Math.min(boundary.offset, textNode.length));
      const range = document.createRange();
      let rect = null;
      try {
        range.setStart(textNode, offset);
        const point = textNode.data.codePointAt(offset);
        let endOffset = Math.min(offset + (point > 0xffff ? 2 : 1), textNode.length);
        while (endOffset < textNode.length) {
          const next = String.fromCodePoint(textNode.data.codePointAt(endOffset));
          if (!/\\p{Mark}/u.test(next)) break;
          endOffset += next.length;
        }
        range.setEnd(textNode, endOffset);
        const rects = range.getClientRects();
        for (const candidate of Array.from(rects)) {
          if (candidate.width > 0 || candidate.height > 0) {
            rect = candidate;
            break;
          }
        }
        if (!rect) {
          const candidate = range.getBoundingClientRect();
          if (candidate && (candidate.width > 0 || candidate.height > 0)) {
            rect = candidate;
          }
        }
      } catch (_error) {
        rect = null;
      } finally {
        range.detach();
      }
      return rect;
    };
    const scrollingElement = () => document.scrollingElement || document.documentElement || document.body;
    const canScrollElement = (element, axis) => {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const overflow = axis === "y" ? style.overflowY : style.overflowX;
      if (!["auto", "scroll", "overlay"].includes(overflow)) {
        return false;
      }
      return axis === "y"
        ? element.scrollHeight > element.clientHeight + 1
        : element.scrollWidth > element.clientWidth + 1;
    };
    const scrollCandidates = (axis) => {
      const candidates = [];
      let element = boundary.node.parentElement;
      while (element && element !== document.documentElement) {
        if (canScrollElement(element, axis)) {
          candidates.push(element);
        }
        element = element.parentElement;
      }
      candidates.push(window);
      return candidates;
    };
    const scrollBounds = (candidate) => {
      if (candidate === window) {
        return {
          top: 0,
          left: 0,
          bottom: window.innerHeight,
          right: window.innerWidth,
          width: window.innerWidth,
          height: window.innerHeight,
        };
      }
      const bounds = candidate.getBoundingClientRect();
      return {
        top: bounds.top,
        left: bounds.left,
        bottom: bounds.bottom,
        right: bounds.right,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const deltaForAxis = (rect, bounds, axis) => {
      if (axis === "y") {
        const margin = Math.min(Math.max(18, (rect.height || window.__jusiMirrorLineHeight || 16) * 2), Math.max(0, bounds.height / 3));
        if (rect.top < bounds.top + margin) {
          return rect.top - (bounds.top + margin);
        }
        if (rect.bottom > bounds.bottom - margin) {
          return rect.bottom - (bounds.bottom - margin);
        }
        return 0;
      }
      const margin = Math.min(18, Math.max(0, bounds.width / 4));
      if (rect.left < bounds.left + margin) {
        return rect.left - (bounds.left + margin);
      }
      if (rect.right > bounds.right - margin) {
        return rect.right - (bounds.right - margin);
      }
      return 0;
    };
    const applyScroll = (candidate, axis, delta) => {
      if (!delta) {
        return false;
      }
      if (candidate === window) {
        const root = scrollingElement();
        const oldX = window.scrollX;
        const oldY = window.scrollY;
        const maxX = Math.max(0, root.scrollWidth - window.innerWidth);
        const maxY = Math.max(0, root.scrollHeight - window.innerHeight);
        const nextX = axis === "x" ? Math.max(0, Math.min(maxX, oldX + delta)) : oldX;
        const nextY = axis === "y" ? Math.max(0, Math.min(maxY, oldY + delta)) : oldY;
        if (Math.abs(nextX - oldX) < 0.5 && Math.abs(nextY - oldY) < 0.5) {
          return false;
        }
        window.scrollTo(nextX, nextY);
        return true;
      }
      if (axis === "y") {
        const old = candidate.scrollTop;
        const max = Math.max(0, candidate.scrollHeight - candidate.clientHeight);
        const next = Math.max(0, Math.min(max, old + delta));
        if (Math.abs(next - old) < 0.5) {
          return false;
        }
        candidate.scrollTop = next;
        return true;
      }
      const old = candidate.scrollLeft;
      const max = Math.max(0, candidate.scrollWidth - candidate.clientWidth);
      const next = Math.max(0, Math.min(max, old + delta));
      if (Math.abs(next - old) < 0.5) {
        return false;
      }
      candidate.scrollLeft = next;
      return true;
    };
    const scrollAxisIntoView = (rect, axis) => {
      for (const candidate of scrollCandidates(axis)) {
        const bounds = scrollBounds(candidate);
        const delta = deltaForAxis(rect, bounds, axis);
        if (applyScroll(candidate, axis, delta)) {
          return true;
        }
      }
      return false;
    };
    const scrollIntoView = (rect) => {
      if (!shouldAutoScroll || !rect) {
        return rect;
      }
      const movedY = scrollAxisIntoView(rect, "y");
      const movedX = scrollAxisIntoView(movedY ? rectForBoundary() || rect : rect, "x");
      if (movedX || movedY) {
        return rectForBoundary();
      }
      return rect;
    };
    let rect = scrollIntoView(rectForBoundary());
    if (!rect) {
      const caret = document.getElementById("jusi-neovim-mirror-caret");
      if (caret) {
        caret.style.display = "none";
      }
      return null;
    }
    const caret = ensureCaret();
    caret.style.display = "block";
    caret.style.left = Math.round(rect.left) + "px";
    caret.style.top = Math.round(rect.top) + "px";
    caret.style.width = Math.max(3, Math.round(rect.width || 8)) + "px";
    caret.style.height = Math.max(2, Math.round(rect.height || 16)) + "px";
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  })()`;
}

export function mirrorScrollSource(lines: number, index: number | null): string {
  return `(() => {
    const requestedIndex = ${index === null ? "null" : Math.max(0, Math.floor(index))};
    const indexMap = window.__jusiMirrorIndexMap || [];
    const lineHeight = Number(window.__jusiMirrorLineHeight) || (() => {
      const style = window.getComputedStyle(document.body || document.documentElement);
      const parsed = Number.parseFloat(style.lineHeight);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
    })();
    const nearestMappedIndex = (start, direction) => {
      let cursor = Math.max(0, Math.min(start, indexMap.length - 1));
      while (cursor >= 0 && cursor < indexMap.length) {
        if (indexMap[cursor]) {
          return cursor;
        }
        cursor += direction;
      }
      return null;
    };
    const boundaryForIndex = (target) => {
      if (target === null || indexMap.length === 0) {
        return null;
      }
      if (target <= 0) {
        const first = nearestMappedIndex(0, 1);
        return first === null ? null : indexMap[first];
      }
      if (target >= indexMap.length) {
        const last = nearestMappedIndex(indexMap.length - 1, -1);
        return last === null ? null : indexMap[last];
      }
      const mapped = indexMap[target];
      if (mapped) {
        return mapped;
      }
      const next = nearestMappedIndex(target, 1);
      if (next !== null) {
        return indexMap[next];
      }
      const previous = nearestMappedIndex(target - 1, -1);
      return previous === null ? null : indexMap[previous];
    };
    const canScrollElement = (element) => {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return false;
      }
      const style = window.getComputedStyle(element);
      if (!["auto", "scroll", "overlay"].includes(style.overflowY)) {
        return false;
      }
      return element.scrollHeight > element.clientHeight + 1;
    };
    const delta = ${lines} * lineHeight;
    const tryScrollElement = (element) => {
      const old = element.scrollTop;
      const max = Math.max(0, element.scrollHeight - element.clientHeight);
      const next = Math.max(0, Math.min(max, old + delta));
      if (Math.abs(next - old) < 0.5) {
        return false;
      }
      element.scrollTop = next;
      return true;
    };
    const boundary = boundaryForIndex(requestedIndex);
    let element = boundary && boundary.node ? boundary.node.parentElement : null;
    while (element && element !== document.documentElement) {
      if (canScrollElement(element) && tryScrollElement(element)) {
        return element.scrollTop;
      }
      element = element.parentElement;
    }
    const root = document.scrollingElement || document.documentElement || document.body;
    const old = window.scrollY;
    const max = Math.max(0, root.scrollHeight - window.innerHeight);
    const next = Math.max(0, Math.min(max, old + delta));
    if (Math.abs(next - old) >= 0.5) {
      window.scrollTo(window.scrollX, next);
    }
    return window.scrollY;
  })()`;
}

export function mirrorClickIndexSource(x: number, y: number): string {
  return `(() => {
    const x = ${x};
    const y = ${y};
    const indexMap = window.__jusiMirrorIndexMap || [];
    const rangeFromPoint = () => {
      if (typeof document.caretRangeFromPoint === "function") {
        return document.caretRangeFromPoint(x, y);
      }
      if (typeof document.caretPositionFromPoint === "function") {
        const position = document.caretPositionFromPoint(x, y);
        if (!position) {
          return null;
        }
        const range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
        return range;
      }
      return null;
    };
    const range = rangeFromPoint();
    if (!range) {
      return null;
    }
    let node = range.startContainer;
    let offset = range.startOffset;
    range.detach?.();
    if (!node) {
      return null;
    }
    if (node.nodeType !== Node.TEXT_NODE) {
      const child = node.childNodes ? node.childNodes[Math.min(offset, node.childNodes.length - 1)] : null;
      if (child && child.nodeType === Node.TEXT_NODE) {
        node = child;
        offset = 0;
      } else {
        return null;
      }
    }
    let bestPrevious = null;
    let bestNext = null;
    for (let index = 0; index < indexMap.length; index += 1) {
      const entry = indexMap[index];
      if (!entry || entry.node !== node) {
        continue;
      }
      if (entry.offset <= offset) {
        const distance = offset - entry.offset;
        if (!bestPrevious || distance < bestPrevious.distance) {
          bestPrevious = { index, distance };
        }
      } else {
        const distance = entry.offset - offset;
        if (!bestNext || distance < bestNext.distance) {
          bestNext = { index, distance };
        }
      }
    }
    return bestPrevious ? bestPrevious.index : bestNext ? bestNext.index : null;
  })()`;
}

export function mirrorLinkTargetSource(index: number): string {
  return `(() => {
    const indexMap = window.__jusiMirrorIndexMap || [];
    const requestedIndex = Math.max(0, Math.floor(${index}));
    const nearestMappedIndex = (start, direction) => {
      let cursor = Math.max(0, Math.min(start, indexMap.length - 1));
      while (cursor >= 0 && cursor < indexMap.length) {
        if (indexMap[cursor]) {
          return cursor;
        }
        cursor += direction;
      }
      return null;
    };
    const targetIndex = indexMap[requestedIndex] ? requestedIndex : nearestMappedIndex(requestedIndex, -1) ?? nearestMappedIndex(requestedIndex, 1);
    if (targetIndex === null || !indexMap[targetIndex] || !indexMap[targetIndex].node) {
      return false;
    }
    let element = indexMap[targetIndex].node.parentElement;
    const link = element && element.closest ? element.closest("a[href], area[href]") : null;
    if (!link) {
      return null;
    }
    const rects = Array.from(link.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const visibleRect = rects.find((rect) =>
      rect.right > 0 && rect.bottom > 0 && rect.left < viewportWidth && rect.top < viewportHeight
    ) || rects[0];
    if (!visibleRect) {
      return null;
    }
    return {
      href: typeof link.href === "string" ? link.href : null,
      x: Math.max(0, Math.floor(visibleRect.left + Math.min(visibleRect.width / 2, Math.max(1, visibleRect.width - 1)))),
      y: Math.max(0, Math.floor(visibleRect.top + Math.min(visibleRect.height / 2, Math.max(1, visibleRect.height - 1)))),
    };
  })()`;
}

export function mirrorActivateLinkSource(index: number): string {
  return `(() => {
    const indexMap = window.__jusiMirrorIndexMap || [];
    const requestedIndex = Math.max(0, Math.floor(${index}));
    const nearestMappedIndex = (start, direction) => {
      let cursor = Math.max(0, Math.min(start, indexMap.length - 1));
      while (cursor >= 0 && cursor < indexMap.length) {
        if (indexMap[cursor]) {
          return cursor;
        }
        cursor += direction;
      }
      return null;
    };
    const targetIndex = indexMap[requestedIndex] ? requestedIndex : nearestMappedIndex(requestedIndex, -1) ?? nearestMappedIndex(requestedIndex, 1);
    if (targetIndex === null || !indexMap[targetIndex] || !indexMap[targetIndex].node) {
      return false;
    }
    const element = indexMap[targetIndex].node.parentElement;
    if (!element?.isConnected) return false;
    let link = element.closest('a[href], area[href], button, summary, label, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [onclick], [tabindex]');
    if (!link) {
      for (let candidate = element; candidate && candidate !== document.body; candidate = candidate.parentElement) {
        if (getComputedStyle(candidate).cursor === 'pointer') { link = candidate; break; }
      }
    }
    if (!link || link.matches(':disabled, [aria-disabled="true"]') || link.closest('[inert]')) return false;
    link.click();
    return true;
  })()`;
}

/** Cycle distinct scroll owners in document order, selecting visible text when possible. */
export function mirrorRegionSource(index: number | null, direction: number): string {
  return `(() => {
    const indexMap = window.__jusiMirrorIndexMap || [];
    const root = document.scrollingElement || document.documentElement;
    const owners = new WeakMap(), regions = new Map();
    const owner = element => {
      if (!element || element === root || element === document.body) return root;
      if (owners.has(element)) return owners.get(element);
      const style = getComputedStyle(element);
      const scrollable = (/(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1)
        || (/(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1);
      const result = scrollable ? element : owner(element.parentElement);
      owners.set(element, result); return result;
    };
    let previousNode;
    for (let i = 0; i < indexMap.length; i++) {
      const node = indexMap[i]?.node;
      if (!node?.isConnected || node === previousNode) continue;
      previousNode = node;
      const element = node.parentElement, region = owner(element);
      if (!regions.has(region)) regions.set(region, { first: i, visible: null });
      const entry = regions.get(region);
      if (entry.visible !== null) continue;
      const bounds = region === root ? {left:0,top:0,right:innerWidth,bottom:innerHeight} : region.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(node);
      if (Array.from(range.getClientRects()).some(r => r.width > 0 && r.height > 0
        && r.bottom > Math.max(0,bounds.top) && r.top < Math.min(innerHeight,bounds.bottom)
        && r.right > Math.max(0,bounds.left) && r.left < Math.min(innerWidth,bounds.right))) entry.visible = i;
    }
    const entries = [...regions.entries()];
    if (entries.length < 2) return null;
    const current = owner(indexMap[${index === null ? 'null' : index}]?.node?.parentElement);
    const at = entries.findIndex(([region]) => region === current);
    const next = entries[(at + ${direction < 0 ? -1 : 1} + entries.length) % entries.length][1];
    return next.visible ?? next.first;
  })()`;
}
