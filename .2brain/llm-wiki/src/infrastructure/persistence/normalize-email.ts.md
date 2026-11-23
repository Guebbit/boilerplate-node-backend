---
source: src/infrastructure/persistence/normalize-email.ts
source_sha256: b59a9b868d16fec473caf5671951834f80a0c96d23c1ec6898f7fc188d601600
context_sha256: 64f097ff66042be026065db2b7dd6abf0733c8a40b764e4651170be9a1774ad6
generated_at: 2026-11-22T03:03:29.763364+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/normalize-email.ts

## Purpose
Defines the single email normalisation used across the app before an address is stored, looked up or compared: trim, then lowercase. It also provides a stricter "mailbox" canonicalisation used only for budgets (rate or mail limits), so that different casings or `+tag` variants of one inbox are not counted as separate callers.

## Key elements
- `normalizeEmail(email)`: returns `email.trim().toLowerCase()`. This is the only normalisation applied to stored or compared addresses.
- `canonicalMailbox(email)`: returns the `local@domain` mailbox an address delivers to. It:
  - applies `normalizeEmail` first;
  - returns the normalised string unchanged if there is no `@`, or `@` is at index 0 (`at < 1`);
  - drops a `+tag` from the local part, but only when the `+` comes after at least one character and before the `@` (so `+@x` is left as is);
  - for `gmail.com` and `googlemail.com`, removes dots from the local part and rewrites the domain to `gmail.com`;
  - leaves other domains' dots and domains untouched.
- `DOT_INSENSITIVE_DOMAINS` (module-private): the set `gmail.com`, `googlemail.com`.

## Relationships
The file imports nothing. The neighbor list gives only dependency-graph links; the source does not show which function each neighbor calls, so only the intent stated in the module doc is described here.
- The module doc says the shared normalisation is meant for `users`' schema-level cast, for an infrastructure budget keyed on a submitted address, and for other modules' own email fields.
- Consumers in the graph include `rate-limit.ts`, `job-store.ts`, `mail-budget.ts`, `email-change.ts`, `emails.ts`, `device-cookie.ts`, `login-observability.ts`, the orders repository, `contact.ts` and `personal-data-subject.ts`.
- `normalize-email.test.ts` (unit) and `normalize-email-conformance.test.ts` (cross-cutting) test it.

## Notes
- Never use `canonicalMailbox` for storage or uniqueness. `a@x` and `a+shop@x` may legitimately be separate accounts, and rewriting a stored address would change the identity the account records. It is for budgets only.
- `canonicalMailbox` finds the tag with `indexOf('+')` and the domain with `lastIndexOf('@')`, so the tag is stripped only if the first `+` falls before the last `@`.
- Gmail canonicalisation always outputs `@gmail.com`, so `googlemail.com` and `gmail.com` addresses map to the same mailbox.
