import { describe, expect, test } from "vitest";
import type { ReviewDiff } from "$lib/api";
import { buildGuidePrompt, parseGuide } from "./review-guide";

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
});
