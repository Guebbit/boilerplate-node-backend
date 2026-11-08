---
source: src/modules/users/emails.ts
sha256: c64f06fd49ef9934aa5270710661eeedc56ceaf61355cf273213100c2794382b
generated_at: 2026-11-08T08:45:24.187171+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/emails.ts

## Purpose

Produces the single email the `users` module sends to a buyer when a purchase hold is placed on their account. It resolves all copy into finished, locale-aware strings (via i18n) and returns an `EmailContent` object whose template only interpolates — no logic lives in the template. Follows the same "finished-text, not template" rule as `@modules/account/emails`.

## Key elements

- **`PurchaseHoldNotice`** (exported interface) — the data the sender must supply: `until` (Date), `reason` (`PurchaseHoldReason`), optional `cancelCount`/`windowDays` (only for `repeated_cancellations`), optional staff `note`, and the two mandatory URLs (`contactUrl`, `privacyUrl`).
- **`purchaseHoldPlacedEmail(locale, notice)`** (exported) — builds and returns the full `EmailContent` object for template `users.purchase-hold-placed`. Translates every string, formats the hold end date, and wires the GDPR objection paragraph as a distinct block.
- **`untilText(locale, date)`** (module-private) — formats a `Date` as a readable UTC timestamp with the zone name spelled out (`Intl.DateTimeFormat` with explicit fields, since `dateStyle`/`timeStyle` reject `timeZoneName`).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports the `EmailContent` type; the returned object is shaped to be consumed by that adapter.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — imports `translator(locale)` to produce the localized `t` function.
- **`src/types/index.ts`** — imports the `PurchaseHoldReason` union type used in `PurchaseHoldNotice.reason`.
- **`src/modules/users/services/purchase-hold.ts`** — the service that places holds; the caller that assembles a `PurchaseHoldNotice` and invokes `purchaseHoldPlacedEmail`.
- **`src/modules/users/index.ts`** — re-exports this module so other modules can import the email builder.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — exercises the `users.purchase-hold-placed` template that this file targets.

## Notes

- **UTC is hard-coded.** `users` is a foundation module and may not read the shop's timezone; the end date is therefore always rendered in UTC with a `short` zone name. Don't "fix" this to local time without a timezone source.
- **GDPR structure is intentional.** The objection notice (Art. 21(4)) is a separate, standalone paragraph (`objectionTitle` / `objection`), not merged into the summary. Recital 71 requires the reason and a way to contact a human.
- **`cancelCount` / `windowDays`** are only meaningful when `reason === 'repeated_cancellations'`; for `staff` holds they default to `0` and the `reason-staff` translation should not reference them.
- **`note`** may be empty string (staff left no note); the template must handle the blank case.
- Same convention as `@modules/account/emails`: language is an argument, output is finished text, the template behind it only interpolates.
