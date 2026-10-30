---
source: src/modules/tickets/tests/unit/emails.test.ts
sha256: 8ec44ffe1145759828a723f3b101e6599ed13012a049914cde1817017807a1a9
generated_at: 2026-10-29T06:08:46.765770+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/unit/emails.test.ts

## Purpose

Unit tests for the `contactRequestEmail` builder — the operator-facing notification email generated when a customer submits a ticket contact request. The suite pins down subject composition, field pass-through, locale-sensitive fallbacks, and that all human-readable strings are resolved translations rather than raw i18n keys.

## Key elements

- **`REQUEST: ContactRequest`** — shared fixture (name, email, subject, message, createdAt) used by every test case.
- **`describe('contactRequestEmail')`** — single suite containing seven `it` blocks:
  - *template* — asserts the returned template name is `'tickets.contact'`.
  - *subject* — asserts the mail subject ends with `: <ticket subject>` and is not equal to the bare subject.
  - *pass-through* — asserts `data.name`, `.email`, `.subject`, `.message`, `.createdAt` are returned unchanged (they serve as reply-to / content).
  - *category* — with a value present it is passed through; with none, a non-empty resolved string is supplied (not `undefined`, not a `tickets.*` key).
  - *name fallback* — `name: undefined` and `name: ''` both yield the same non-empty translated placeholder (documents the `||`-not-`??` contract).
  - *labels* — iterates over `labelName`, `labelEmail`, `labelSubject`, `labelMessage`, `labelCategory`, `labelCreatedAt`; each must be non-empty and not match `/^tickets\./`.
  - *locale* — calls with `'en'` and `'it'`, asserts `data.locale` carries the code and `data.title` differs between locales.

## Relationships

- **`src/modules/tickets/emails.ts`** — the sole import target; provides the `contactRequestEmail` function under test and the `ContactRequest` type used to shape the fixture. No other module is referenced.

## Notes

- The module doc block at the top of the file explains *why* certain decisions exist (operator audience → subject appended after a prefix; fallback resolved in the builder rather than the template). Read it before modifying assertions.
- The name-fallback test deliberately exercises both `undefined` and `''` to lock in `||` semantics; switching the implementation to `??` would make the blank-string case fail.
- Several assertions check `.not.toMatch(/^tickets\./)` — a guard that the i18n lookup actually resolved rather than leaking a raw key into operator mail. New fields added to the template should add a matching assertion.
- All tests run against the `'en'` locale except the final pair; locale-specific copy is not asserted verbatim, only that it *differs* from English.
