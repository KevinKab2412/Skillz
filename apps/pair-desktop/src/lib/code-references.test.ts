import { expect, test } from "vitest";
import { splitCodeReferences } from "./code-references";

test("links saved backticked citations and bare citations without losing prose", () => {
  expect(splitCodeReferences("See `admin/configsvc/core/admin/notification_sends.py:43–45`, then src/worker.ts:7.")).toEqual([
    { text: "See " },
    { text: "admin/configsvc/core/admin/notification_sends.py:43–45", reference: { path: "admin/configsvc/core/admin/notification_sends.py", start: 43, end: 45 } },
    { text: ", then " },
    { text: "src/worker.ts:7", reference: { path: "src/worker.ts", start: 7, end: 7 } },
    { text: "." },
  ]);
});

test("accepts a quoted path with spaces and preserves ordinary inline code", () => {
  expect(splitCodeReferences("Call `send()` as shown in `./source files/worker.py:2 - 3`.")).toEqual([
    { text: "Call `send()` as shown in " },
    { text: "./source files/worker.py:2 - 3", reference: { path: "source files/worker.py", start: 2, end: 3 } },
    { text: "." },
  ]);
});

test("leaves external, escaping, and invalid citations as plain text", () => {
  const text = "https://example.com/src/a.ts:1 /tmp/a.ts:1 `../a.ts:2` `src/../a.ts:2` `src/a.ts:4–2` src/a.ts:0 src/a.ts:9007199254740992";
  expect(splitCodeReferences(text)).toEqual([{ text }]);
});
