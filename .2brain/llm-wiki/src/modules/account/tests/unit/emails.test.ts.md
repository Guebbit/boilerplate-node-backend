---
source: src/modules/account/tests/unit/emails.test.ts
sha256: d4d8ecc02169aea6bfff9b0ff9b53b2c9415f367f5313e6efa42320f82406128
generated_at: 2026-09-27T14:36:31.047066+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/emails.test.ts

## Purpose

Unit tests for the six account email builders in `emails.ts`. They assert the *content* of each built email—template name, action-link URL, copy-slot values, interpolation, and locale plumbing—because the failure modes here are silent: a wrong template renders someone else's copy, a wrong kind 404s the link, a swapped token routes a reset to the wrong flow, and none of those throw.

## Key elements

- **`LINK_EMAILS`** — `as const` array pairing each of the four link-carrying builders (`verifyRequestEmail`, `resetRequestEmail`, `setupRequestEmail`, `deleteRequestEmail`) with its expected `template` string and its `accountFrontendLink` kind (`verify` / `reset` / `reset` / `delete`).
- **`CONFIRM_EMAILS`** — Same pattern for the two no-link confirmations (`resetConfirmEmail`, `deleteConfirmEmail`).
- **`copySlots(content)`** — Helper that flattens `subject` + `data` entries, filtering out `locale`, `pageMetaLinks`, and `linkUrl`, returning the remaining key/value pairs for iteration in copy-resolution assertions.
- **`describe('…the template each one names')`** — Verifies each builder returns its expected template and that all six templates are mutually distinct.
- **`describe('…the action links')`** — Verifies each link builder delegates to `accountFrontendLink` with the correct kind, that each token maps to a unique URL, and that the recipient's locale is embedded in the URL pathname.
- **`describe('…the copy')`** — Verifies every slot resolves to a non-empty string that is not an unresolved i18next key, that `{ name }` interpolation actually inserts the recipient's name, that locale reaches both the payload and the rendered copy, that `pageMetaLinks` is `[]` (not missing), and that all six emails share one identical footer.

## Relationships

- **`src/modules/account/emails.ts`** — The module under test; all six builder functions are imported and exercised here.
- **`src/modules/account/config.ts`** — `accountFrontendLink` is imported to compute the *expected* link URL, so the test asserts the builder delegates to the same kind/locale/token contract that `config.ts` defines.

## Notes

- `setupRequestEmail` intentionally shares the `reset` kind with `resetRequestEmail` (both spend a `password`-type token at `POST /account/reset-confirm`). It is excluded from the "each token to its own kind" uniqueness assertion.
- The copy-slot checks guard against i18next's key-echo behavior: a missing translation returns the key itself (e.g. `account.email.verify-request.intro`), which would pass a simple "non-empty" check. The `/^account\.email\./` regex catches this.
- `pageMetaLinks` must be `[]`, not `undefined`—the email renderer iterates it, so `undefined` crashes the template rather than producing an empty `<head>`.
- Link-URL correctness is scoped to "builder picked the right kind and passed through locale + token." The internals of `accountFrontendLink`/`frontendLink` are covered in their own suites (`config.test.ts`, `frontend-link.test.ts`).
