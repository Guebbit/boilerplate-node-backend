---
source: tests/cross-cutting/side-effects-have-one-layer.test.ts
sha256: 6f9fc114b25be78494c46d6a27f7e34ed020598a1ce860593019412154dbf47f
generated_at: 2026-11-08T09:32:47.274297+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/side-effects-have-one-layer.test.ts

## Purpose

Enforces a project-wide invariant: four side-effect functions (`enqueueEmail`, `recordAudit`, `emitAnalyticsEvent`, `emitDomainEvent`) must be called from exactly one layer (service), unless a specific file is listed in an allowlist with a one-sentence justification. It exists because this is a *set-level* constraint—no single-file lint rule or type signature can express "the same function should not be called from two different layers across the codebase."

## Key elements

- **`EXPECTED_LAYER`** — Maps each governed marker to its required layer. All four are `'service'`. Written as an *intention*, not derived from current code.
- **`ALLOWED_ELSEWHERE`** — Allowlist keyed by `"<marker> @ <module>/<path>"`. Currently holds two entries (both in `account/session/login-observability.ts`) with security/session reasoning.
- **`layerOf(file)`** — Classifies a file by its path relative to `MODULES_ROOT` into `controller | service | repository | model | routes | domain | other`. Treats `services/` folder and bare `service.ts` as the same layer.
- **`moduleFiles()`** — Recursively walks `MODULES_ROOT`, collecting `.ts` files while skipping `tests/` directories (specs emit freely by design).
- **`callSites()`** — For each marker, regex-matches actual *calls* (lookbehind excludes imports and comment mentions) across all module files, stripping comments first.
- **`describe` block** — Three tests: (1) a canary that at least one call site exists per marker (so the regex hasn't silently broken), (2) the main assertion that no straying call site exists outside the allowlist, (3) a stale-exception check that every allowlist entry still has a live call.

## Relationships

- **`tests/support/paths.ts`** — Imports `MODULES_ROOT` (the directory walked for module files) and `isDeployed()` (used in the canary test to skip the `emitDomainEvent` check when the `orders` module is not present in the current deployment).

## Notes

- The regex uses a lookbehind `(?<![\w.])` to match only bare function calls, not property accesses (`obj.enqueueEmail(`) or imports. Comments are stripped before matching so that docblock mentions don't count.
- `ALLOWED_ELSEWHERE` keys are compound (`marker @ path`), so an exception for `recordAudit` in a file does not silently cover `enqueueEmail` in the same file.
- The canary test guards against the silent no-op failure mode: if the regex pattern breaks, `callSites()` returns empty arrays and the main assertion passes vacuously. The canary fails first.
- `emitDomainEvent` canary is conditional on `isDeployed('orders')` because only shop modules (specifically `orders`) publish domain events.
- The test is intentionally *not* "no controller may call these"—it is "the home layer is a singleton and every departure is named." This distinction matters for the two login controllers that have a security rationale.
