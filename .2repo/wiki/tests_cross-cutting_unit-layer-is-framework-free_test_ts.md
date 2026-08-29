# tests/cross-cutting/unit-layer-is-framework-free.test.ts

## Purpose

Enforces that no unit test (top-level or per-module) imports or references a real or in-memory database. It is the file-system-scan counterpart to the ESLint rule in `eslint.config.ts` that bans `supertest` and `@tests/http` from the same directories. Together they keep the `tests/unit` layer free of both HTTP and database infrastructure, which matters because Stryker re-runs the unit suite once per mutant and a `beforeEach` DB wipe would be paid thousands of times over.

## Key elements

- **`FORBIDDEN`** — Array of three forbidden substrings (`setupTestDb`, `mongodb-memory-server`, `@tests/database`). A unit-test file that contains any of them is a violation.
- **`moduleUnitDirectories()`** — Reads `src/modules/` and returns the path of each subdirectory that contains a `tests/unit` folder.
- **`walkTestFiles(dir)`** — Recursively collects every `.test.ts` file under a given directory.
- **`it('finds unit tests inside modules…')`** — Canary assertion: guarantees at least one module unit-test directory exists so the main sweep is not vacuously passing over zero files.
- **`it('keeps every unit test free of…')`** — Scans all collected test files for the forbidden strings and asserts the violation list is empty.

## Relationships

No graph neighbors are recorded for this file. It operates purely on the file system (`node:fs`, `node:path`) and does not import any project source.

## Notes

- Detection is a **substring check**, not an AST parse. A comment or string literal containing one of the forbidden tokens will trigger a false positive; conversely, a dynamically constructed import that avoids the literal string would slip through. In practice the ESLint rule covers the import-level case, so this file targets direct usage.
- The test reads files relative to its own location (`__dirname`), so it must stay in `tests/cross-cutting/` (one level below `tests/`) for the `TOP_LEVEL_UNIT` and `MODULES_ROOT` paths to resolve correctly.
- The canary test exists because `readdirSync` on an empty or missing modules root would return `[]`, and `.filter(existsSync)` on that would silently skip the sweep, making the main assertion a no-op.
