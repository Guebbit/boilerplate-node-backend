---
source: tests/cross-cutting/outbox-names.test.ts
sha256: 2314592de07d8e748e08af9689226ea962a3581011e749464d0449e26ff9b34d
generated_at: 2026-09-27T15:51:33.692635+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/outbox-names.test.ts

## Purpose

Enforces the naming contract for every email template published by any module. The `template` field is a shared identifier consumed by the paired PHP/Laravel backend's e2e specs (which run against both backends), so names must be extension-free, unique, literal, resolvable to a real file, and match the agreed cross-backend set. This test acts as the single guard that keeps the contract intact after the `.ejs` suffix was moved out of the published name and into `templateFile()`.

## Key elements

- **`listEmailFiles()`** — Discovers every `src/modules/<name>/emails.ts` under `MODULES_ROOT` at runtime (no hardcoded module list).
- **`templateAssignments(source)`** — Filters source lines to those matching `^\s*template:` (used by the literal-only check).
- **`namesIn(source)`** — Extracts literal template names via the regex `^\s*template: '([^']+)'` (multi-line global).
- **`publishedNames()`** — Combines the above into a flat `{ module, name }[]` array; the single data source all assertions read from.
- **Test: "finds the mails it means to check"** — Canary: asserts ≥ 8 names across ≥ 4 modules so a rename or missing field doesn't make every subsequent assertion pass vacuously.
- **Test: "states every name as a literal"** — Fails if any `template:` line is not a plain single-quoted string (catches variables, template literals, helper calls).
- **Test: "keeps the names free of a file extension"** — Asserts every name matches `^[a-z][\da-z-]*\.[a-z][\da-z-]*$` (two kebab-case segments, no dot-suffix).
- **Test: "gives no two mails the same name"** — Detects cross-module name collisions.
- **Test: "points every name at a template that exists"** — Calls `templateFile(name)` and asserts the resolved path passes `existsSync`.
- **Test: "publishes the set the pair agreed on"** — Asserts the sorted list of all published names equals a hardcoded 18-entry array (the cross-backend contract).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Provides `templateFile()`, which appends the engine-specific extension (`.ejs`) to a bare name to produce the on-disk path. The "points every name at a template that exists" test depends on this to perform its file-existence check.
- **`tests/support/paths.ts`** — Provides `MODULES_ROOT`, the filesystem root under which `listEmailFiles()` scans for `<module>/emails.ts` files.

## Notes

- **`path.extname` is deliberately not used** for the extension check: names are dotted by design (`account.verify-request`), so `extname` would misread `.verify-request` as an extension. The regex shape check is the only reliable guard.
- **The "agreed set" list is stated, not derived.** It encodes agreement with `boilerplate-php-laravel-backend`'s `OutboxNamesTest.php`, a repository this test cannot read. Several entries (`account.setup-request`, `account.inactivity-warning`, `account.two-factor-code`, `webhooks.subscription-disabled`, `orders.order-product-unavailable`, `orders.order-paid`, `orders.order-card-expired`) exist only on the Node side so far and are not yet mirrored in the PHP twin.
- **Source-text parsing is intentional and limited.** Because the test reads raw source with regex, it can only see literal assignments. The "states every name as a literal" case exists specifically to ensure no name escapes this visibility.
- **A mistyped name now fails at send time, not at publish time.** Once `.ejs` left the name, a typo is no longer caught by the filesystem at the point the name is written — only the `existsSync(templateFile(name))` assertion in this file catches it.
