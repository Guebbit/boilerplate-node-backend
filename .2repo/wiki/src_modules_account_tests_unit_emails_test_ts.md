# src/modules/account/tests/unit/emails.test.ts

## Purpose

Unit tests for the six account email builder functions. They exist because the integration tier only asserts that mail was *sent*, not what it contained, leaving template names, link URLs, i18n interpolation, and structural fields unguarded at a lower cost. This file pins every field to a concrete expected value.

## Key elements

- **`LINK_EMAILS`** — const tuple array of the three link-carrying builders (`verifyRequestEmail`, `resetRequestEmail`, `deleteRequestEmail`) paired with their expected template key and route segment. Drives table-driven `it.each` assertions.
- **`CONFIRM_EMAILS`** — const tuple array of the three confirmation builders (`registrationConfirmEmail`, `resetConfirmEmail`, `deleteConfirmEmail`) paired with their expected template key.
- **`copySlots`** — helper that extracts every copy-bearing field from a built email's `content`, excluding `locale`, `pageMetaLinks`, and `linkUrl`, for uniform "is it real copy?" checks.
- **`describe('…template each one names')`** — asserts each builder returns the correct `template` key and that all six templates are distinct.
- **`describe('…action links')`** — asserts `linkUrl` is the full `account/<route>/<TOKEN>` path, that the three tokens never cross routes, that `NODE_URL` joining doesn't double or drop slashes, and that a missing `NODE_URL` yields a bare relative path (not the literal string `"undefined"`).
- **`describe('…copy')`** — asserts every i18n slot resolves to a non-empty string that isn't the raw key (i18next key-echo), that `{ name }` interpolation actually contains the recipient's name, that `locale` propagates to both `data.locale` and translated copy, that `pageMetaLinks` is an empty array (not `undefined`), and that all six emails share one identical `footer`.

## Relationships

- **`src/modules/account/emails.ts`** — the sole import target; all six builder functions tested here are exported from that module. This file is the only consumer in the test suite that inspects the *content* of the built emails rather than just delivery.

## Notes

- `NODE_URL` is read via `process.env.NODE_URL` at build time (not import time), so the "no base URL" test deletes the env var, calls the builder, then restores it in a `finally` block.
- The footer-distinctness test asserts a `Set` size of **1** (all identical), while the template-distinctness test asserts size **6** (all different). Both are intentional invariants.
- `copySlots` excludes `linkUrl` from the copy checks because it's covered separately by the link-URL tests; including it there would double-check a non-copy field.
- The `t()` slot guard (`expect(value).not.toMatch(/^account\.email\./)`) catches the specific failure mode where i18next falls back to returning the translation key string when a key is missing from the locale file.
