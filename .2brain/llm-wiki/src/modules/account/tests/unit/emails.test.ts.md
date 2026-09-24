---
source: src/modules/account/tests/unit/emails.test.ts
sha256: 7cc5df6ecbf4fa9760d5094539187081769ffc2f61dc5ab1bd80faa8fed75823
generated_at: 2026-09-23T18:15:31.801400+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/emails.test.ts

## Purpose

Unit tests for the six account email builders in `emails.ts`. Because the builders produce data (template names, URLs, i18n copy) rather than throwing on misconfiguration, the tests assert on the _built content itself_—correct template key, correct `frontendLink` kind, resolved copy, and correct interpolation—rather than on error paths.

## Key elements

- **`LINK_EMAILS`** — table of the four link-carrying emails (`verifyRequest`, `resetRequest`, `setupRequest`, `deleteRequest`), each paired with its expected template key and `frontendLink` kind.
- **`CONFIRM_EMAILS`** — table of the two confirmation emails (`resetConfirm`, `deleteConfirm`), paired with their template keys.
- **`copySlots(content)`** — helper that extracts every string slot from a built email's `subject` + `data`, excluding `locale`, `pageMetaLinks`, and `linkUrl`.
- **`describe("the template each one names")`** — asserts each builder's `.template` matches its key and that all six templates are unique.
- **`describe("the action links")`** — asserts each link email delegates to `frontendLink(kind, {locale, token})`, that the three flow-specific URLs are distinct, and that locale propagates into the URL path.
- **`describe("the copy")`** — asserts all copy slots resolve to non-empty strings (not i18next key fallbacks), `{name}` interpolates, locale reaches both the payload and the translation, `pageMetaLinks` is `[]` (not `undefined`), and all six emails share a single non-empty `footer`.

## Relationships

- **`src/modules/account/emails.ts`** — the module under test; all six builder functions are imported and exercised here.
- **`src/infrastructure/http/frontend-link.ts`** — imported to compute the _expected_ URL in the action-link assertions. The test verifies the builder delegates to this function with the correct kind, locale, and token, but does not re-test `frontendLink`'s own URL construction (that lives in `frontend-link.test.ts`).

## Notes

- `setupRequestEmail` deliberately shares the `'reset'` kind with `resetRequestEmail`—both spend a `password`-type token at `POST /account/reset-confirm`. It is therefore excluded from the "each token to its own kind" uniqueness assertion (which only checks verify, reset, and delete).
- The `pageMetaLinks: []` assertion exists because the template renderer _iterates_ that field; `undefined` would crash the render rather than produce an empty `<head>`.
- The "distinct template" test guards against a copy-paste where two builders point at the same template—individual per-builder assertions would still pass in that scenario.
- The "i18next key fallback" check (`/^account\.email\./`) catches the case where a translation key is missing and i18next echoes the key itself as the value.
