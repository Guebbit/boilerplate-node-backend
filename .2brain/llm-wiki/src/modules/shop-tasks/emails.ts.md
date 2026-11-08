---
source: src/modules/shop-tasks/emails.ts
sha256: 22a57ef8da7c7e591c736efc6b14ef2af7a2e0de284734586cad0b6d59164514
generated_at: 2026-11-08T08:14:43.571420+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/emails.ts

## Purpose

Builds the content of the daily staff-digest email: one line per summary that appeared or grew, each carrying a localized label and a link to the corresponding frontend page. The file is a pure content-builder — it produces an `EmailContent` object but never sends anything.

## Key elements

- **`DigestItem`** (interface) — a single row in the digest: a `SummaryCode` and its `count`.
- **`staffDigestEmail(locale, items)`** (exported function) — returns an `EmailContent` with:
  - `template: 'shop-tasks.staff-digest'`
  - `subject` / `pageMetaTitle` / `title` translated via the i18n translator for the recipient's locale.
  - `data.lines` — an array of `{ text, link }` objects, one per item. `text` is the translated label with the count interpolated; `link` is a frontend URL built from the summary's route template and parameters.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — supplies the `EmailContent` type that `staffDigestEmail` returns.
- **`src/infrastructure/i18n/index.ts`** (and its `context.ts`) — provides `translator`, used to resolve every human-readable string in the email.
- **`src/infrastructure/http/frontend-link.ts`** — provides `frontendLink`, which assembles the per-item page URL from a route template, locale, and parameters.
- **`src/modules/shop-tasks/staff-routing.ts`** — provides `summaryLinkOf(code)` (route template + parameters) and the `SummaryCode` type used by `DigestItem`.
- **`src/modules/shop-tasks/services/digest.ts`** — the likely caller that gathers `DigestItem[]` data and passes it to `staffDigestEmail`.
- **`src/modules/shop-tasks/index.ts`** — module barrel; re-exports this file's public surface.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — validates the `shop-tasks.staff-digest` template contract that this file's `EmailContent` must satisfy.

## Notes

- The `code` field of `DigestItem` is not just an identifier; it doubles as an i18n dictionary path. The mapping `shop-tasks.staff.<n>` → `shop-tasks.staff-mail.digest.<n>` is done inline via a `replace` call — adding a new summary requires adding a matching key under both namespaces.
- `items` is documented as "never empty" (no empty-state handling in the email body).
- Privacy: the email intentionally contains only counts and links — no staff names or addresses.
