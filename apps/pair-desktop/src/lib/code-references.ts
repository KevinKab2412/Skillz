export type CodeReference = { path: string; start: number; end: number };
type TextPart = { text: string; reference?: CodeReference };

// Backticks allow paths with spaces and filenames without an extension.
const citations = /\x60([^\x60\n]+)\x60|(?<![\w./:@~\\-])((?:\.\/)?(?:[\w.-]+\/)*[\w.-]*\.[\w-]+:\d+(?:[ \t]*[-–—][ \t]*\d+)?)(?![\w:/\\-])/g;

export function splitCodeReferences(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let from = 0;
  for (const match of text.matchAll(citations)) {
    const label = match[1] ?? match[2];
    const location = /^([^:\r\n]+):([1-9]\d*)(?:[ \t]*[-–—][ \t]*([1-9]\d*))?$/.exec(label);
    if (!location) continue;
    const path = location[1].replace(/^\.\//, "");
    if (path !== path.trim() || /[\\<>]/.test(path) || path.startsWith("~/") ||
        path.split("/").some((segment) => !segment || segment === ".." || segment === ".")) continue;
    const start = Number(location[2]);
    const end = Number(location[3] ?? location[2]);
    if (!Number.isSafeInteger(end) || end < start) continue;
    if (from < match.index) parts.push({ text: text.slice(from, match.index) });
    parts.push({ text: label, reference: { path, start, end } });
    from = match.index + match[0].length;
  }
  if (from < text.length) parts.push({ text: text.slice(from) });
  return parts;
}
