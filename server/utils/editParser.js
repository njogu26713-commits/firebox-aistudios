/**
 * Parse and apply Aider-style search/replace diff blocks from AI output.
 *
 * Expected format:
 *   ### FILE: path/to/file.ext
 *   <<<<<<< SEARCH
 *   exact existing text (must match verbatim)
 *   =======
 *   replacement text
 *   >>>>>>> REPLACE
 *
 * Multiple SEARCH/REPLACE blocks per file are supported.
 * Falls back to a full fenced-code-block replacement if no hunks found.
 */

export function parseEditOutput(aiOutput) {
  const results = {}; // { filePath: { hunks?: [], fullContent?: string } }

  // Split on FILE: markers so each section belongs to one file
  const sections = aiOutput.split(/(?=###\s+FILE:)/);

  for (const section of sections) {
    const fileMatch = section.match(/###\s+FILE:\s+([^\n]+)/);
    if (!fileMatch) continue;
    const filePath = fileMatch[1].trim().replace(/^[`"']|[`"']$/g, "").replace(/^\/+/, "").replace(/\\/g, "/");
    if (!filePath || filePath.includes("\0")) continue;

    // Try search/replace hunks first
    const hunks = [];
    const hunkRe = /<<<<<<< SEARCH\r?\n([\s\S]*?)=======\r?\n([\s\S]*?)>>>>>>> REPLACE/g;
    let m;
    while ((m = hunkRe.exec(section)) !== null) {
      hunks.push({ search: m[1], replace: m[2] });
    }

    if (hunks.length > 0) {
      results[filePath] = { hunks };
    } else {
      // Fall back: whole file in a fenced block
      const fenceMatch = section.match(/```(?:[^\r\n`]*)\r?\n([\s\S]*?)```/);
      if (fenceMatch && fenceMatch[1].trim()) {
        results[filePath] = { fullContent: fenceMatch[1] };
      }
    }
  }

  return results;
}

/**
 * Apply parsed edits to existing file content.
 * Returns { content: string, applied: number, failed: number }.
 */
export function applyEdits(originalContent, edits) {
  if (edits.fullContent !== undefined) {
    return { content: edits.fullContent, applied: 1, failed: 0 };
  }

  let content = String(originalContent ?? "");
  let applied = 0;
  let failed = 0;
  const normalizeNewlines = (value) => String(value ?? "").replace(/\r\n?/g, "\n");

  for (const { search, replace } of (edits.hunks || [])) {
    if (content.includes(search)) {
      // Replace only the first occurrence to avoid accidental multi-replace
      content = content.replace(search, replace);
      applied++;
    } else {
      // Try with normalized line endings, which is common when the project uses CRLF but the model emits LF.
      const normContent = normalizeNewlines(content);
      const normSearch = normalizeNewlines(search);
      if (normContent.includes(normSearch)) {
        content = normContent.replace(normSearch, String(replace ?? ""));
        applied++;
      } else {
        // Last resort: compare trimmed line endings and trailing whitespace without changing unrelated text.
        const softSearch = normSearch.split("\n").map(line => line.trimEnd()).join("\n");
        const softContent = normContent.split("\n").map(line => line.trimEnd()).join("\n");
        const softIndex = softContent.indexOf(softSearch);
        if (softIndex !== -1) {
          const before = softContent.slice(0, softIndex);
          const after = softContent.slice(softIndex + softSearch.length);
          content = `${before}${String(replace ?? "")}${after}`;
          applied++;
        } else {
          console.warn(`[editParser] Hunk not found (first 80 chars): ${search.slice(0, 80).replace(/\n/g, "↵")}`);
          failed++;
        }
      }
    }
  }

  return { content, applied, failed };
}
