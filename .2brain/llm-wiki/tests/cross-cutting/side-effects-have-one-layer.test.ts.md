---
source: tests/cross-cutting/side-effects-have-one-layer.test.ts
sha256: a0601d05c3d8fe0e03618eeea5ad7ab4a95474acd8e03ea6af577dbafd34ac11
generated_at: 2026-09-27T15:52:47.854094+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/side-effects-have-one-layer.test.ts

## Purpose

A cross-cutting architectural test that enforces the rule: each domain side-effect (queued email, audit record, analytics event, domain event) is published from exactly one layer — the service layer — or the departure is explicitly justified in the allowlist. It exists because ESLint reads one file at a time and cannot see that fourteen call sites of the same function live at inconsistent layers; this test scans the whole module tree and asserts the set is consistent.

## Key elements

- **`EXPECTED_LAYER`** — `Readonly<Record<string, Layer>>` mapping each side-effect marker (`enqueueEmail`, `recordAudit`, `emitAnalyticsEvent`, `emitDomainEvent`) to the layer it must be called from. Written as an intention, not derived from current code.
- **`ALLOWED_ELSEWHERE`** — `Readonly<Record<string, string>>` of documented exceptions, keyed as `"<marker> @ <module>/<path>"` so one file's excuse never silently covers a second marker. Currently permits three exceptions in the `account` module's login/reset path.
- **`moduleFiles()`** — walks `MODULES_ROOT` recursively, returning every `.ts` file while skipping `tests/` subdirectories.
- **`layerOf(file)`** — classifies a file into a `Layer` by its path segment relative to `MODULES_ROOT` (e.g. `controllers/` → `'controller'`, `services/` or `service.ts` → `'service'`).
- **`callSites()`** — reads every module file, strips block and line comments, then regex-matches call expressions (`marker(`) to build a `Map<marker, {file, layer}[]>`.
- **Four `it` blocks** — (1) canary: each marker must have ≥ 1 call site so a broken regex doesn't silently pass; (2) core assertion: no call site sits in a non-expected layer unless in the allowlist; (3) stale-exception guard: every allowlist entry must still correspond to a live call site; (4) meta-guard: every layer name in `EXPECTED_LAYER` must be a known `Layer` value.

## Relationships

- **`tests/support/paths.ts`** — imported as `@tests/paths`; provides `MODULES_ROOT`, the root directory the file-walk starts from. Changing this constant changes which files the test scans.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — the `ALLOWED_ELSEWHERE` entries reference the 2FA login path (`post-login-2fa.ts`, `login-observability.ts`) that this unit test exercises. If the controller-layer emit is moved into a service, the exception here must be removed and the two-factor flow re-wired.
- **`src/modules/addresses/factories.ts`** — lives under the same `MODULES_ROOT` tree the test scans; any side-effect call added to the addresses module would be subject to this assertion.

## Notes

- The regex matches the **call** (`marker(`), not imports or comment mentions. Comments are stripped before matching, so a docstring naming `recordAudit` will not register as a call site.
- `EXPECTED_LAYER` is intentionally **not** auto-derived from the codebase. The test asserts code against a declared intention; deriving it from the tree would make the test tautological.
- The allowlist key format `marker @ file` is deliberate: an exception for `recordAudit` in a given file does **not** also permit `enqueueEmail` in that same file.
- The canary test (`finds the emits it means to check`) is the safety net that prevents this entire file from becoming a silent no-op if a marker name is renamed in production code.
- `services/` folder and a bare `service.ts` are treated as the **same** layer — splitting into a folder is a size decision and must not create a new legal emit site.
