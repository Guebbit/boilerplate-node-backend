# src/modules/account/tests/unit/emails.test.ts

## Purpose

Unit tests for the six account email builders (four link-delivery, two action-confirmation). The tests assert the *built output*—template name, link URL, interpolated copy—because the builders fail silently (a wrong template or link doesn't throw), making content-level assertions the only safety net.

## Key elements

- **`LINK_EMAILS`** — tuple list of the four link-bearing builders (`verifyRequestEmail`, `resetRequestEmail`, `setupRequestEmail`, `deleteRequestEmail`) paired with their expected template ID and route segment.
- **`CONFIRM_EMAILS`** — tuple list of the two link-free builders (`resetConfirmEmail`, `deleteConfirmEmail`) paired with their template ID.
- **`copySlots`** — helper that flattens `subject` and `data` into `[key, value]` pairs, excluding `locale`, `pageMetaLinks`, and `linkUrl`.
- **`describe('…the template each one names')`** — asserts each builder returns the correct template string and that all six templates are mutually distinct.
- **`describe('…the action links')`** — asserts `linkUrl` contains the full `/account/<route>/<token>` path, that each token maps to its own route, that `NODE_URL` joining doesn't double-slash, and that a missing `NODE_URL` still yields a usable relative path.
- **`describe('…the copy')`** — asserts every copy slot is a non-empty resolved string (not a raw i18n key), that `{ name }` interpolation actually inserts the recipient, that locale is threaded into both the payload and the rendered copy, that `pageMetaLinks` is `[]` (not `undefined`), and that all six emails share a single footer string.

## Relationships

- **`src/modules/account/emails.ts`** — the sole import target. Provides all six builder functions (`verifyRequestEmail`, `resetRequestEmail`, `setupRequestEmail`, `resetConfirmEmail`, `deleteRequestEmail`, `deleteConfirmEmail`) that this file exercises.

## Notes

- `setupRequestEmail` and `resetRequestEmail` deliberately share the `reset` route segment (both spend a `password`-type token at `POST /account/reset-confirm`), so the "each token to its own route" test excludes `setupRequestEmail` and only checks verify/reset/delete.
- The test file reads and deletes `process.env.NODE_URL` in one test to simulate an unconfigured base URL; it restores the value in a `finally` block.
- The `copySlots` filter excludes `linkUrl` from the "is it a real string" sweep because `linkUrl` is a URL, not translatable copy.
- The distinct-template test exists because two builders could point at the same template and still pass every per-email assertion if that template happens to be correct for both.
