# tests/cross-cutting/side-effects-have-one-layer.test.ts

## Purpose

Enforces the architectural rule that the four domain side effects (`enqueueEmail`, `emitAuditEvent`, `emitAnalyticsEvent`, `emitDomainEvent`) are each published from exactly one layer (the service layer), with any departure explicitly justified in a named allowlist. It exists because a per-file lint rule cannot see the *set* of files calling the same function; this test sweeps the whole module tree and asserts the set conforms to a declared intention.

## Key elements

- **`moduleFiles()`** — recursively walks `src/modules`, returning every `.ts` file while skipping `tests/` directories.
- **`layerOf(file)`** — classifies a file into a `Layer` (`controller`, `service`, `repository`, `model`, `routes`, `domain`, `other`) based solely on its relative path; treats `services/` folder and bare `service.ts` as the same layer.
- **`EXPECTED_LAYER`** — the authoritative map of marker → intended layer; all four markers are pinned to `'service'`. Written as intention, not derived from current code.
- **`ALLOWED_ELSEWHERE`** — keyed `'<marker> @ <module>/<path>'` → one-sentence reason. Three entries, all in `account/controllers/`, justified by the security constraint that a failed/unknown-user request never reaches a service.
- **`callSites()`** — regex-scans every module file (comments stripped) for invocation-pattern calls (`marker(`) and returns a `Map<marker, {file, layer}[]>`.
- **Test 1 (canary)** — asserts the sweep finds at least one call site per marker, so a regex breakage fails loudly rather than producing a vacuous pass.
- **Test 2 (core assertion)** — collects "strays" (call sites whose layer ≠ expected and not in the allowlist) and expects none.
- **Test 3 (reason quality)** — every allowlist entry must be ≥ 12 words, preventing a bare "N/A" excuse.
- **Test 4 (stale exceptions)** — every allowlist entry must still correspond to a live call site; dead entries fail.
- **Test 5 (table integrity)** — validates that `EXPECTED_LAYER` values are members of the `Layer` union, catching typos that would silently govern nothing.

## Relationships

Neither graph neighbor is imported or referenced in this file. The relationship is indirect: both `scripts/contracts/asyncapi-bundles.ts` and `tests/unit/db/seed-fixtures.test.ts` operate within the same `src/modules` tree that this test sweeps, so structural changes to module layout (e.g., renaming `services/` → `service/`) would affect all three.

## Notes

- The regex in `callSites()` deliberately matches the *call* (`marker(`) after stripping block and line comments, so a docblock mentioning the name is not counted. This is intentional to prevent "rewording comments to pass the test."
- `ALLOWED_ELSEWHERE` is keyed per-marker-and-file, not per-file, so an exception for `emitAuditEvent` in one controller does not silently cover `enqueueEmail` in the same file.
- The `tests/` subdirectory under each module is excluded from the sweep because spec files may legitimately invoke these functions to assert behavior.
- The module root is resolved relative to `__dirname` (`../../src/modules`), so the test must live two levels below `src/`.
- The canary test (Test 1) runs before the core assertion; without it a silent regex failure would make Test 2 pass with zero call sites found.
