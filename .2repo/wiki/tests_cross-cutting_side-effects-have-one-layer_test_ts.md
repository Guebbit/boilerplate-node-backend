# tests/cross-cutting/side-effects-have-one-layer.test.ts

## Purpose

A structural (cross-cutting) test that enforces a single architectural invariant across all modules: each of the four tracked side effects (`enqueueEmail`, `emitAuditEvent`, `emitAnalyticsEvent`, `emitDomainEvent`) must be called from exactly one designated layer (the service layer), unless an explicit, sentence-length justification is recorded. It exists because no per-file lint rule can see the *set* of call sites across fourteen+ files, so a test that reads the tree is the only enforcement mechanism.

## Key elements

- **`moduleFiles()`** — Walks `src/modules/` and returns every `.ts` file, skipping `tests/` subdirectories (specs emit freely and are out of scope).
- **`layerOf(file)`** — Classifies a file into one of seven layers (`controller`, `service`, `repository`, `model`, `routes`, `domain`, `other`) purely from its path. Treats `services/` folder and bare `service.ts` as the same layer.
- **`label(file)`** — Produces the `<module>/<path>` string used in failure messages and allowlist keys.
- **`EXPECTED_LAYER`** — A `Readonly<Record<string, Layer>>` mapping each side-effect marker to `'service'`. Written as intention, not derived from current code.
- **`ALLOWED_ELSEWHERE`** — `Readonly<Record<string, string>>` of documented exceptions, keyed `"<marker> @ <module>/<path>"`, each carrying a human-readable reason. Three entries exist (two for `login-observability.ts`, one for `post-reset-request.ts`).
- **`callSites()`** — Scans every module file's source for a call-site regex (`(?<![\w.])marker\s*\(`) after stripping block and line comments, returning a `Map<marker, {file, layer}[]>`.
- **`describe` block (5 tests)**:
  1. *Canary* — asserts the sweep actually found call sites (guards against a silent no-op).
  2. *Core assertion* — no call site sits in a layer ≠ `EXPECTED_LAYER` unless covered by `ALLOWED_ELSEWHERE`.
  3. *Exception quality* — every reason in `ALLOWED_ELSEWHERE` must be ≥ 12 words.
  4. *Stale-exception check* — every allowlist key must still correspond to a live call site.
  5. *Table sanity* — every layer value in `EXPECTED_LAYER` must be a known `Layer` literal.

## Relationships

No direct import, call, or data dependency on either graph neighbor is visible in this file. The test is self-contained: it reads the filesystem under `src/modules/` at runtime and has no imports from project source.

## Notes

- The regex in `callSites()` deliberately matches the *call* (`marker(`) rather than the import, and comments are stripped first — a docblock mentioning `emitAuditEvent` will not be flagged.
- `ALLOWED_ELSEWHERE` is keyed per-marker-and-file, so an exception for `emitAuditEvent` does not implicitly permit `enqueueEmail` in the same file.
- The test is intentionally **not** a "no controller may emit" blanket rule; the three documented exceptions in `session/login-observability.ts` and `post-reset-request.ts` are kept because the security argument (user enumeration, session-existence timing) cannot be satisfied from a service that is only reached after a user is found.
- `EXPECTED_LAYER` is hard-coded as intention. A test that re-derives the expected layer from the current tree would pass forever and prevent nothing.
- The walk skips `tests/` directories at any depth, so spec files that intentionally trigger an emit are never swept.
