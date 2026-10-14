---
source: src/infrastructure/persistence/normalize-email.ts
sha256: b59a9b868d16fec473caf5671951834f80a0c96d23c1ec6898f7fc188d601600
generated_at: 2026-10-14T08:10:39.077067+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/normalize-email.ts

## Purpose

Single source of truth for email normalisation across the app. Provides two levels of canonicalisation—a minimal trim + lowercase for storage/lookup, and a delivery-mailbox form for budgeting—so that no module reinvents the casing, subtag, or dot-stripping rules and two spellings of the same address never produce two rows or two budget slots.

## Key elements

- **`normalizeEmail(email: string): string`** — Trims whitespace and lowercases. Used wherever an email is stored, looked up, or compared (schema casts, login lookups, uniqueness checks).
- **`canonicalMailbox(email: string): string`** — Returns the *delivery mailbox*: lowercased, `+tag` stripped (only when a non-empty local part precedes it), dots removed for Gmail/Googlemail, and `googlemail.com` mapped to `gmail.com`. Intended solely for budget/limit keying—never for storage or identity.
- **`DOT_INSENSITIVE_DOMAINS`** (module-private) — `Set` containing `gmail.com` and `googlemail.com`; the only domains whose local-part dots are stripped.

## Relationships

- **`src/modules/account/mail-budget.ts`** — Consumes `canonicalMailbox` to derive the budget key from a submitted address, preventing bypass via `+tag` or case variants.
- **`src/modules/account/emails.ts`** — Likely calls `normalizeEmail` when validating or storing account email addresses.
- **`src/modules/account/services/email-change.ts`** — Applies `normalizeEmail` when a user changes their email, ensuring the new value matches the stored format.
- **`src/modules/orders/repository.ts`**, **`src/modules/feedback/service.ts`** — Apply `normalizeEmail` to their own email fields so lookups are consistent with account records.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — May use `normalizeEmail`/`canonicalMailbox` to key per-email rate limits.
- **`src/modules/users/tests/integration/model.test.ts`** — Exercises the normalization path through the user model.
- **`tests/unit/infrastructure/persistence/normalize-email.test.ts`** — Unit tests for both exported functions.

## Notes

- `normalizeEmail` is intentionally minimal (trim + lowercase). It does **not** strip `+tags` or dots; doing so at the storage layer would change the user's visible identity (GitHub, Google, and Shopify all allow `a@x` and `a+shop@x` as distinct accounts).
- `canonicalMailbox` guards against the `+` appearing before the `@` (i.e. `+@x` is left untouched) and only strips a tag when a non-empty local part precedes it.
- Dot-stripping and the `googlemail.com → gmail.com` rewrite apply exclusively to the two domains in `DOT_INSENSITIVE_DOMAINS`; all other domains keep their dots.
- The two functions are deliberately separate: callers must choose whether they need a *stored identity* (`normalizeEmail`) or a *delivery target* (`canonicalMailbox`). Mixing them up will either create phantom budget slots or rewrite a user's email.
