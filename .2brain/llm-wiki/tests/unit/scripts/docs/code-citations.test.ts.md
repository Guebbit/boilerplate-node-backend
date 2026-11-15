---
source: tests/unit/scripts/docs/code-citations.test.ts
sha256: 98d77327f12bfbc059446bde8ae80be8b524433ffb2dc46fb6874869d7686979
generated_at: 2026-11-15T00:26:02.013754+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/docs/code-citations.test.ts

## Purpose

Unit tests for `deadCodeCitations` — the function that flags `docs/…` links (including anchors) cited from files outside `docs/` but pointing to pages or headings that don't exist. Each test builds a scratch git repository in a temp directory so the tracked-file set is fully controlled, then asserts which citations are reported as dead.

## Key elements

- **`track(files)`** — local helper that writes the given `file → text` map into the scratch repo, runs `git add .`, and returns the list of tracked paths via `git ls-files`. All git subprocesses receive the env from `gitEnvironment()`.
- **`beforeEach` / `afterEach`** — create a fresh `mkdtemp` directory, `git init` it, and clean up with `rm -rf` after each test.
- **`run`** — `promisify(execFile)` alias so git commands don't block the event loop.
- **Test cases** (all under `describe('deadCodeCitations', …)`):
  - *Valid page + anchor* — citation resolves; expect no dead citations.
  - *Dead anchor* — heading renamed; expect the citing file + anchor reported.
  - *Dead page in contract YAML* — target `.md` absent; reported even when the citing file is an OpenAPI YAML.
  - *URL / peer-repo exclusion* — `https://…` links and `peer-repo/…` paths are not checked.
  - *Template-literal terminator* — anchors ending in `${`, `{`, or `}` are truncated before validation.

## Relationships

- **`scripts/docs/code-citations.ts`** — provides `deadCodeCitations(root, trackedFiles)`, the function under test.
- **`scripts/docs/repo-references.ts`** — provides `gitEnvironment()`, used as the env for every `git` subprocess call in this file.

## Notes

- `git ls-files` reads the index, not the working tree, so files must be staged (`git add .`) before they count as "tracked" for the SUT.
- The scratch repo is disposable; no `.gitignore` or branch config is set. `gitEnvironment()` (likely supplying `HOME`/`GIT_*` vars) is the only env manipulation, keeping the sandbox hermetic.
- The "template-literal" test documents a parsing edge-case: a `$`, `{`, or `}` immediately after the anchor slug terminates it, so `#cancel${suffix}` is treated as anchor `cancel`, not `cancel${suffix`.
