---
source: src/modules/notifications/emails.ts
sha256: 3286d09a8eef38d69d952c0cb835f3ad054357488b573a335a20980326ded35e
generated_at: 2026-10-29T04:28:23.558611+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/emails.ts

## Purpose

Builds the `EmailContent` payload for the two staff-facing emails a work notice can produce: a single "what happened" notification and the daily digest. Only codes whose route declares `email: 'now'` get a one-off mail here; summary codes are batched into the digest. All copy is resolved through the recipient's locale before the mail is handed to the adapter.

## Key elements

- **`staffNoticeEmail(locale, body)`** — Returns an `EmailContent` for a single work-notice mail. Resolves the i18n wording via a code-path swap (`notifications.staff.*` → `notifications.staff-mail.*`), interpolates ticket-specific words (`what`) where applicable, and attaches a frontend link built by `staffLinkOf`.
- **`staffDigestEmail(locale, items)`** — Returns an `EmailContent` for the daily digest. Each `DigestItem` row becomes one `{ text, link }` line; the line text is pluralised via the `{ n }` i18n parameter.
- **`DigestItem`** (interface) — `{ code: StaffSummaryCode; count: number }`; the row shape passed into the digest.
- **`ticketWhat(t, parameters)`** (internal) — Renders the human-readable "what" for ticket codes: kind label plus, for contact tickets, the category label (or an "uncategorised" fallback).
- **`wordsOf(t, body)`** (internal) — Switches on `body.code` to return the extra i18n parameters each code's template expects (e.g. `{ what }` for ticket codes, `{}` otherwise).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type; this file's exports conform to that shape.
- **`src/infrastructure/i18n/index.ts`** — Imports `translator` to resolve every string at build time.
- **`src/infrastructure/http/frontend-link.ts`** — Imports `frontendLink` to produce the deep-link URL embedded in each mail.
- **`src/modules/notifications/staff-routing.ts`** — Imports `staffLinkOf` (template + params for the target screen) and the `StaffNoticeBody` type.
- **`src/modules/notifications/model.ts`** — Imports `StaffSummaryCode` (used in `DigestItem`).
- **`src/modules/notifications/services/staff.ts`** — Consumer; calls `staffNoticeEmail` when dispatching an immediate mail.
- **`src/modules/notifications/services/digest.ts`** — Consumer; calls `staffDigestEmail` when composing the daily batch.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Exercises the rendered templates that this file fills.

## Notes

- The i18n dictionary path is derived by string replacement (`'notifications.staff.'` → `'notifications.staff-mail.'`). Adding a new code requires a matching key under `notifications.staff-mail.*` in the locale files; there is no compile-time check for this.
- `ticketWhat` is the only place visitor-supplied data (category) reaches the mail, and it is constrained to a closed set of category codes — free-text is never interpolated.
- Summary-code branches in `wordsOf` intentionally return `{}`; the digest mail handles their wording separately. A new summary code added to `model.ts` will silently get an empty-params mail unless it is also handled in `staffDigestEmail`'s line mapping.
