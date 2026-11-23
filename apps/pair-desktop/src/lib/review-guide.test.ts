import { describe, expect, test } from "vitest";
import type { ReviewDiff } from "$lib/api";
import { buildGuidePrompt, buildReviewChatPrompt, parseGuide, parsePatchRows, reviewContextForSelection } from "./review-guide";

const diff: ReviewDiff = {
  base_branch: "main",
  head_branch: "feature/ride-edit",
  base_commit: "a".repeat(40),
  head_commit: "b".repeat(40),
  merge_base: "a".repeat(40),
  total_files: 2,
  truncated: false,
  files: [
    { path: "app/model.ts", status: "M", additions: 2, deletions: 1, patch: "+return editable;", binary: false, truncated: false },
    { path: "app/model.test.ts", status: "M", additions: 4, deletions: 0, patch: "+expect(true);", binary: false, truncated: false },
  ],
};

describe("review guide", () => {
  test("asks for a behavioral route and treats repository text as data", () => {
    const prompt = buildGuidePrompt(diff);
    expect(prompt).toContain("behavioral sequence");
    expect(prompt).toContain("untrusted code or data");
    expect(prompt).toContain('<pair mode="guide"/>');
    expect(prompt).toContain('"path":"app/model.ts"');
    expect(prompt).toContain("do not edit files or run commands");
  });

  test("keeps suggestions beside their section and assigns every changed file once", () => {
    const guide = parseGuide(
      JSON.stringify({
        sections: [
          {
            title: "Edit policy",
            summary: "The model decides whether a scheduled ride can change.",
            focus: "Does the lock window match the API contract?",
            files: ["app/model.ts", "outside.ts"],
            suggestions: [
              { path: "app/model.ts", line: 12, severity: "check", summary: "Check the cutoff boundary." },
              { path: "app/model.test.ts", severity: "should_fix", summary: "Wrong section." },
            ],
          },
        ],
      }),
      ["app/model.ts", "app/model.test.ts"],
    );

    expect(guide.sections.map((section) => section.files)).toEqual([["app/model.ts"], ["app/model.test.ts"]]);
    expect(guide.sections[0].suggestions).toHaveLength(1);
    expect(guide.sections[1].title).toBe("Other changed files");
  });

  test("rejects a response that is not structured as a guide", () => {
    expect(() => parseGuide("not json", ["app/model.ts"])).toThrow();
  });

  test("keeps a selected diff line and nearby hunk context for review chat", () => {
    const rows = parsePatchRows("diff --git a/app/model.ts b/app/model.ts\n--- a/app/model.ts\n+++ b/app/model.ts\n@@ -10,2 +20,2 @@\n   const before = true;\n-  return oldValue;\n+  return nextValue;");
    const removed = rows.findIndex((row) => row.text === "-  return oldValue;");
    const added = rows.findIndex((row) => row.text === "+  return nextValue;");
    const context = reviewContextForSelection("app/model.ts", rows, removed, added, "return oldValue;\nreturn nextValue;");

    expect(context.location).toBe("old 11, new 21");
    expect(context.excerpt).toContain("@@ -10,2 +20,2 @@");
    const prompt = buildReviewChatPrompt(context, "Why did this return value change?");
    expect(prompt).toContain('<pair mode="guide"/>');
    expect(prompt).toContain("untrusted code or data");
    expect(prompt).toContain("Why did this return value change?");
    expect(prompt).toContain('"path":"app/model.ts"');
  });
});
