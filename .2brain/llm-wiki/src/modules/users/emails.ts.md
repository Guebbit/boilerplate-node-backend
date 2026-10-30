---
source: src/modules/users/emails.ts
sha256: c64f06fd49ef9934aa5270710661eeedc56ceaf61355cf273213100c2794382b
generated_at: 2026-10-29T06:12:19.161850+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/emails.ts

## Purpose

Resolves the single outbound email the `users` module can send (purchase-hold notice) into finished, localized strings. The recipient's locale is an argument; the return value is ready-to-interpolate text. Follows the same "resolved strings, not templates" rule as `@modules/account/emails`.

## Key elements

- **`PurchaseHoldNotice`** (exported interface) — input shape: hold end date, reason (`repeated_cancellations` | `staff`), optional rule numbers, optional staff note, and the two required URLs.
- **`untilText`** (private) — formats a `Date` as a single unambiguous UTC string (year/month/day/hour/minute + `UTC` zone name) via `Intl.DateTimeFormat`. Field-by-field options are used because `dateStyle`/`timeStyle` drop `timeZoneName`.
- **`purchaseHoldPlacedEmail(locale, notice)`** (exported) — builds and returns an `EmailContent` object with `template: 'users.purchase-hold-placed'`, a localized subject, and a `data` payload containing every field the mailer template interpolates (greeting, summary with resolved date, reason line with count/days, optional staff note, contact links, objection paragraph, privacy link, footer).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — provides the `EmailContent` return type; the object returned here is what the mailer adapter later queues and interpolates.
- **`src/infrastructure/i18n/context.ts` / `src/infrastructure/i18n/index.ts`** — source of the `translator(locale)` factory used to resolve every `t('…')` key.
- **`src/modules/users/services/purchase-hold.ts`** — the service that decides *when* a hold is placed and *calls* `purchaseHoldPlacedEmail`; this file is the "what the buyer reads" half of that flow (see `docs/modules/users.md#purchase-hold`).
- **`src/types/index.ts`** — defines `PurchaseHoldReason`, the discriminated union used in `PurchaseHoldNotice.reason`.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — asserts the shape and key set of the `data` object this module produces for the `users.purchase-hold-placed` template.

## Notes

- **UTC is mandatory.** `users` is a foundation module and may not read the shop's configured timezone, so `untilText` hard-codes `timeZone: 'UTC'` and `timeZoneName: 'short'`. Do not "fix" this to local time.
- **GDPR structure is intentional.** The objection paragraph (Art. 21(4)) is a separate `data` field (`objectionTitle` / `objection`) so the mailer template can render it apart from the rest, as the Article requires. Do not merge it into `summary` or `reason`.
- **`cancelCount` / `windowDays` are only meaningful when `reason === 'repeated_cancellations'`.** The function still passes them (defaulted to `0`) so the i18n string always has values to interpolate; the `staff`-reason string ignores them.
- **`note` may be absent.** The code coalesces to `''` before passing to `t`, so the template should treat an empty string as "no staff note."
