---
source: tests/cross-cutting/audit-actions.test.ts
sha256: b6171aedd2796fa31fba6f2e2637bc4afc2780f03051796c1b4ad101b08c74f7
generated_at: 2026-11-14T23:01:22.960408+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/audit-actions.test.ts

## Purpose

Cross-cutting test that validates the audit-action vocabulary across all modules without hard-coding a list of action names. It asserts two structural invariants: the file-discovery sweep actually finds modules, and no two modules declare the same action string. This replaces what would otherwise be a single brittle enumeration (which would reintroduce the cross-domain coupling the module split eliminates).

## Key elements

- **`listAuditFiles()`** — Scans `MODULES_ROOT` directories for a sibling `audit.ts` file; returns `{ module, file }` pairs. Discovery-based, so new modules are picked up automatically.
- **`readActions(file)`** — Dynamically `import()`s a module's `audit.ts` and locates the exported record-of-strings by shape (the only non-string-typed export whose values are all strings). Returns the action map, or `{}` if none is found.
- **`describe('audit actions across modules')`** — Two `it` blocks:
  - *finds an audit vocabulary in every module that emits one* — Canary check (module directory count > 0, at least one audit file found, each file exports ≥ 1 action) followed by per-file assertion.
  - *never lets two modules claim the same action string* — Collects all action strings into a `Map<action, module>`; fails with a descriptive collision list if a duplicate is found.

## Relationships

- **`tests/support/paths.ts`** — Supplies `MODULES_ROOT`, the directory under which per-module subdirectories live. This is the sole cross-file import; everything else is `node:fs` / `node:path`.

## Notes

- Action *shape* (dotted `noun.noun`, 2–4 segments, lower snake_case) is intentionally **not** asserted here. That enforcement lives in `eslint.config.ts` (per-file rule) and in schema validation at `regenerate` time for `rules.yaml` / `security.*` actions.
- `readActions` imports the module for real rather than parsing source text, so a broken import fails loudly instead of silently yielding an empty set.
- The canary assertion (`readdirSync(MODULES_ROOT).length > 0`) is deliberately a disk read, not a hardcoded count, to avoid the line going stale when modules are added or removed.
