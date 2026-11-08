---
source: tests/cross-cutting/personal-data-erasure.test.ts
sha256: da759d36c6dc1b513a41e19fefe49b9ce002b6b1b034f47ecc75d4ea8802297d
generated_at: 2026-11-08T09:29:54.991627+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/personal-data-erasure.test.ts

## Purpose

Cross-cutting GDPR Art. 17 guard: ensures that every module whose model references an account (via `ref: 'User'` or a `*UserId` field) declares a `personalData.erase` hook in its manifest. Catches the failure mode of a new module silently retaining a person's rows because it forgot the declaration. Does **not** verify erase correctness — that belongs to each module's own tests and `tests/integration/erasure.test.ts`.

## Key elements

- **`EXEMPT`** — `Record<string, string>` of modules legally exempt from the hook requirement, each paired with a legal/technical reason. Currently: `users` (it *is* the cascade) and `audit-logs` (retained for the audit window per Art. 6(1)(c)/(f)).
- **`NAMES_AN_ACCOUNT`** — Regex (`/ref:\s*'User'|\b[a-zA-Z]*[uU]serId\??\s*:/`) matching model fields that name an account.
- **`modulesHoldingUserRows`** — Computed at load time: scans `MODULES_ROOT` for `model.ts` files whose text matches `NAMES_AN_ACCOUNT`; returns a sorted list of module folder names.
- **Test: "finds the modules…(the guard is not vacuous)"** — Asserts the computed list contains a known set of modules (`access`, `account`, `addresses`, `api-keys`, `cart`, `notifications`, `webhooks`), filtered by `isDeployed`. Uses an exact floor (not `>= 1`) so a ref rename that empties the list fails here.
- **Test: "…declares an erase hook in its manifest"** — `it.each` over non-exempt modules; reads `module.ts` as text and asserts both `personalData:` and `erase:` appear.

## Relationships

- **`tests/support/paths.ts`** — Imports `MODULES_ROOT` (the directory to scan for module folders) and `isDeployed` (to conditionally include/exclude shop modules in the vacuity floor).

## Notes

- Files are read as **text** (`readFileSync`), never imported. A module that fails to load would otherwise vanish from the scan instead of failing the check.
- The regex is intentionally narrow: it catches `ref: 'User'` and `*UserId:` keys. The doc-comment acknowledges that `access`, `api-keys`, and `webhooks` hold a plain id string the `ref` pattern misses — they are still caught by the `*UserId` branch or listed in the floor.
- Exemptions require a written reason; the doc-comment says "Add only with an argument."
- The floor test uses `arrayContaining` (not `toEqual`) so additional modules discovered at runtime are fine, but the listed ones must all be present.
