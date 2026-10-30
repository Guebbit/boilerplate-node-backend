---
source: tests/cross-cutting/personal-data-erasure.test.ts
sha256: da759d36c6dc1b513a41e19fefe49b9ce002b6b1b034f47ecc75d4ea8802297d
generated_at: 2026-10-29T06:48:22.862752+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/personal-data-erasure.test.ts

## Purpose

Cross-cutting GDPR guard (Art. 17) that statically verifies every module whose model references a user account declares a `personalData.erase` hook in its manifest. It pins the *declaration*—not correctness—so a new module that stores person rows without opting into the erasure cascade fails at test time rather than leaking data silently.

## Key elements

- **`EXEMPT`** — `Record<string, string>` mapping module names to a written justification for why they are exempt from carrying an `erase` hook (currently `users` and `audit-logs`).
- **`NAMES_AN_ACCOUNT`** — Regex matching either `ref: 'User'` or any `*UserId` / `userId` field key in a model file.
- **`modulesHoldingUserRows`** — Computed at module-load time: every subdirectory of `MODULES_ROOT` whose `model.ts` matches `NAMES_AN_ACCOUNT`, sorted alphabetically.
- **Test: "finds the modules… (the guard is not vacuous)"** — Asserts the list contains a known floor of modules (filtered through `isDeployed`), so a regex or rename regression that empties the list fails here.
- **Test: `it.each` over non-exempt modules** — Reads each module's `module.ts` as text and asserts it contains `personalData:` and `erase:`.

## Relationships

- **`tests/support/paths.ts`** — Imports `MODULES_ROOT` (base directory scanned for module folders) and `isDeployed` (filters the floor assertion so shop-only modules don't break non-shop deployments).

## Notes

- **Text scan, not import.** Files are read with `readFileSync` + regex. A module that fails to load still participates in the check instead of vanishing.
- **Floor, not exact count.** The first test uses `expect.arrayContaining`, so adding a new user-referencing module won't break it—only removing expected ones will.
- **EXEMPT requires a reason.** The type forces a string justification; adding a module to the exemption list without one is a compile error.
- **Scope boundary.** This file only verifies the hook is *declared*. Correctness of the erase logic lives in each module's own tests; the end-to-end cascade is `tests/integration/erasure.test.ts`.
