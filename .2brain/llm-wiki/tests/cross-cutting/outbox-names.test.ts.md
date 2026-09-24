---
source: tests/cross-cutting/outbox-names.test.ts
sha256: 657b2658d82d04ffd972df804e2235095a8edc2eee7eab3a54e5bc8c6d3c6970
generated_at: 2026-09-23T19:57:59.334285+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/outbox-names.test.ts

## Purpose

Guards the **outbox name** convention: every email template identifier published by this backend must be a stable, backend-agnostic string (`<module>.<event>`, kebab-case) that the paired PHP/Blade twin can match verbatim, and that resolves to a real template file at send time.

## Key elements

- **`listEmailFiles()`** – Discovers every `src/modules/<name>/emails.ts` on disk rather than maintaining a hardcoded list.
- **`namesIn(source)`** – Extracts literal string values from `template: '…'` assignments via regex.
- **`publishedNames()`** – Flattens all modules into a `{ module, name }[]` array used by every test case.
- **`it('finds the mails it means to check')`** – Canary assertion; fails if discovery silently returns an empty list.
- **`it('states every name as a literal…')`** – Forbids computed/variable `template:` values so the source-reading tests can't miss them.
- **`it('keeps the names free of a file extension')`** – Enforces the `^[a-z][\da-z-]*\.[a-z][\da-z-]*$` shape (exactly two kebab-case segments, no dot-suffix like `.ejs`).
- **`it('gives no two mails the same name')`** – Detects name collisions across modules.
- **`it('points every name at a template that exists')`** – Calls `templateFile(name)` and asserts the resulting path exists on disk.
- **`it('publishes the set the pair agreed on')`** – Asserts the exact, sorted list of 16 names matches the agreed cross-backend set.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** – Imports `templateFile`, the single function that appends the `.ejs` suffix and resolves a name to a filesystem path. The "template exists" test depends on this to verify the suffix-adding logic produces a real file.

## Notes

- `path.extname` is explicitly **not** used for validation because names are dotted by design (`account.reset-request` would be misread as extension `reset-request`).
- The agreed-set test hard-codes the list rather than deriving it, because the contract is with a _different repository_ (the PHP twin) that this test cannot read.
- Several names in the agreed set (`account.setup-request`, `account.inactivity-warning`, `account.two-factor-code`, `webhooks.subscription-disabled`, `orders.order-product-unavailable`) are Node-only at the time of writing and do not yet exist in the PHP twin's test.
- The file-extension ban is stated as a **shape** constraint (two segments) rather than a blacklist of forbidden suffixes, so a third templating engine won't slip through.
