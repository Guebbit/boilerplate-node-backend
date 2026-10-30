---
source: tests/cross-cutting/outbox-names.test.ts
sha256: 3515fc988aecce22da7866a6a5d1c3457c6e74b2b623a0dfb056ddac9da8110a
generated_at: 2026-10-29T06:47:47.852449+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/outbox-names.test.ts

## Purpose

Enforces cross-backend naming conventions for the `template:` field every module publishes in its `emails.ts`. Because the paired PHP/Laravel twin uses the same identifier to locate mails in its own outbox, this test guarantees names are extension-free, unique, resolvable to a real template file, and exactly the set both backends have agreed on.

## Key elements

- **`templateFileOrUndefined(name)`** — Wraps `templateFile()` (from `mailer.ts`) to convert the "unregistered name" exception into `undefined`, so the existence check can distinguish "never registered" from "registered but file missing."
- **`listEmailFiles()`** — Discovers every `src/modules/<name>/emails.ts` on disk rather than maintaining a manual list.
- **`templateAssignments(source)`** — Extracts all lines matching `template:` from a source string.
- **`namesIn(source)`** — Pulls the literal string value from each `template: '…'` assignment.
- **`publishedNames()`** — Flattens the above into `{ module, name }[]` for all modules.
- **Six `it` blocks** — (1) canary: non-empty discovery; (2) every `template:` value must be a string literal; (3) names must match `^[a-z][\da-z-]*\.[a-z][\da-z-]*$` (two kebab-case segments, no dot-suffix); (4) no two modules claim the same name; (5) every name resolves via `templateFile()` to an existing file; (6) the full set equals a hardcoded `agreedByPair` list (filtered through `isDeployed`).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports `templateFile`, the single point where a logical name becomes a filesystem path (appending the engine-specific extension). The test depends on this function's existence and its throw-on-unregistered behavior.
- **`tests/support/paths.ts`** — Imports `MODULES_ROOT` (base directory for the `emails.ts` discovery) and `isDeployed` (filters the agreed-name list to only modules present in the current deployment).

## Notes

- The test performs **static source analysis** (regex over `emails.ts` text). A name built at runtime (variable, template literal, helper call) is invisible to the sweep — which is exactly what the "literals only" case prevents.
- `path.extname` cannot validate the no-extension rule because names are dotted by design (`account.verify-request` would be misread as having extension `.verify-request`). The regex is the correct tool.
- The "agreed set" case hardcodes the full expected list. When a module is removed via `demo:remove`, its names are filtered out automatically through `isDeployed` rather than requiring a manual edit to the array.
- The test relies on the shared setup in `tests/support/setup.ts` having already built the template collection for the worker; `templateFile()` resolves against that pre-built state.
