# tests/cross-cutting/authenticated-controllers.test.ts

## Purpose

A static-analysis guard test that verifies no controller handler using the `authContextOf` accessor is mounted on a route lacking `isAuth` protection. It exists because TypeScript cannot express "this route is authenticated" — that knowledge lives in `routes.ts` routing order, and a misplaced `router.use(isAuth)` (e.g., mid-file) would otherwise let a public route silently call `authContextOf` and crash at runtime with `undefined.id`.

## Key elements

- **`handlersReadingAuthContext(moduleRoot)`** — Scans every `.ts` file in `<module>/controllers/` for the literal string `authContextOf(` and returns the set of exported handler names (`export const <name> =`) that use it.
- **`unauthenticatedMounts(moduleRoot)`** — Walks `<module>/routes.ts` line-by-line, tracking whether a `router.use(...isAuth...)` blanket has been seen. Returns handler names mounted on routes that are *not* covered by such a blanket and do not themselves pass `isAuth`.
- **`modules()`** — Lists directory names under `src/modules/` (resolved relative to this test file).
- **Test: "finds no handler asserting an auth context its route does not guarantee"** — Cross-references the two sets above across all modules; fails listing any offending `module: handler` pair.
- **Test: "actually finds controllers to check"** — Canary assertion that the total count of auth-reading handlers is > 10, preventing a false pass from a path-resolution bug or empty scan.

## Relationships

No graph neighbors are recorded for this file. It is self-contained: it reads source files via `node:fs` and performs no imports from the application under test.

## Notes

- **No imports from `src/`.** The test is purely lexical — it reads file contents as text. This means it will still pass if the project does not compile, but it also means it cannot catch indirect or renamed usages (e.g., a re-export alias for `authContextOf`).
- **Order-sensitive route parsing.** The `unauthenticatedMounts` helper treats a `router.use(isAuth)` line as a one-way latch: everything *below* it is authenticated, everything *above* it is not. Comment lines (`//` and `*`) are skipped. This mirrors the documented hazard in the `feedback` module where `router.use(isAuth)` appears mid-file.
- **Handler extraction heuristic.** The "handler" is identified as the last identifier on the `router.<method>(...)` line. Multi-arg or multi-line route definitions may not be parsed correctly.
- **`MODULES_ROOT`** is computed from `__dirname/../..` → `src/modules`. If the test is run from a different working directory or the project is restructured, both the scan and the canary will silently find nothing (the canary only guards against zero, not against the wrong directory).
