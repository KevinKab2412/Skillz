# Behavior evidence — implementation to review

Read this policy before choosing verification or assessing supplied evidence. The caller owns task
state and merge decisions; this module owns evidence capture and handoff. Evidence complements
repository tests and guards. Approved requirements supply expected behavior.

## Choose and capture

| Changed behavior | Default evidence |
|---|---|
| Any UI or visual change, including static layout, styling, text, and rendering | A recording of the actual rendered result and relevant interactions; matching before/after captures where a baseline exists |
| API or CLI | Repeatable requests/commands with expected and actual output |
| Performance | Before/after measurements with cases, environment, and threshold source |
| Documentation with no rendered UI change | Content checks and verification of runnable examples |

Recording is the default for all UI/visual changes, even when the change is static. For static
changes, show the affected view and relevant viewport/state comparisons. For interactive changes,
record the actual verification session from its starting state through the observed outcomes.
Use available browser video or desktop capture tooling. Headless browser video is a valid recording;
label scripted automation versus a manually driven session accurately. Reuse matching existing
evidence rather than recording the same revision and cases again.

Start capture before the meaningful actions. Record named cases and `passed`, `failed`, or
`untested` outcomes with expected/actual observations and approximate timestamps. A timestamp or
an annotation alone does not establish that an assertion passed: inspect the rendered state.
Finalize the video, confirm it is playable, and inspect the key moments before delivery. Include
still frames when they make a visual comparison easier to inspect.

If recording is unavailable, unsafe, or explicitly declined by the user, state the reason and use
numbered screenshots with assertions as the fallback where safe. If rendering itself is unavailable,
report the visual behavior as untested. Disclose the recording limitation; do not silently substitute
screenshots or claim a capture occurred. A missing recording alone is not a product defect or an
automatic merge blocker; explain the concrete verification gap and applicable repository policy.

For fixes, capture or reference the old failure alongside the corrected result when safely
reproducible. Otherwise identify the baseline gap. Keep the caller's known-bad verifier check;
a persuasive-looking recording does not replace it.

## Bind evidence to the tested code

- Record worktree, branch, commit, and deployment/build identity where available. For dirty work,
  also record a digest of the tested patch and new-file contents; HEAD alone is insufficient.
- Name the runtime/browser, viewport, starting state, fixture identities, feature flags, and relevant
  environment assumptions. Exclude secret values and personal/customer data.
- Before probing a local server, confirm the port's process and working directory serve this
  worktree's code. Worktrees share ports and may share databases. When this cannot be established,
  disclose the mismatch risk rather than claiming the current patch was tested.
- Keep artifacts and repeatable capture/probe scripts in a gitignored task directory or OS-temp
  directory. Do not add capture dependencies to the project merely to generate evidence; use
  existing tooling or an isolated tool installation within existing permissions.

## Evidence handoff

Return a compact evidence bundle from implementation to review:

| Field | Required content |
|---|---|
| Identity | Tested revision, dirty-patch/new-file digest where applicable, worktree, environment, and deployment/build |
| Cases | Acceptance behavior, independently sourced expected result, actual result, and `passed` / `failed` / `untested` with reason |
| Artifacts | Recording/screenshots/output paths, case timestamps or numbered captures, and capture inspection result |
| Repeat | Exact safe rerun commands or script path, starting state, and required fixtures |
| Limits | Unrun paths, missing baseline or capture capability, assumptions, and known-bad verifier result |

Review inspects the bundle first and checks identity, coverage, and actual observations. Supplied
artifacts are supporting evidence, not an independent reviewer run. Rerun material claims and
suspicious gaps with the smallest safe probe. After relevant code, fixture, or configuration changes,
mark affected evidence stale and refresh it; unrelated edits need no blanket recapture.
Report supplied, reviewer-reproduced, stale, and untested evidence distinctly. Missing artifacts
must not be turned into an invented runtime failure.

## Safe delivery

Capture only sanitized test data. Keep secrets, customer data, unrelated windows, and notifications
out of frame; if that is impossible, stop capture and report the affected path untested. Inspect
artifacts for sensitive content before sharing. Deliver local paths to the requester by default.
Upload, PR comments, and tracker writes require authorization for that destination and task;
verification permission alone does not authorize publication. Reuse the caller's posting gates.
