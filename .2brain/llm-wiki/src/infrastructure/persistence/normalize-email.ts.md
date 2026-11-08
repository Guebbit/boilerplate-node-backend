---
source: src/infrastructure/persistence/normalize-email.ts
sha256: b59a9b868d16fec473caf5671951834f80a0c96d23c1ec6898f7fc188d601600
generated_at: 2026-11-08T03:43:54.725962+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/normalize-email.ts

## Purpose

Single source of truth for email normalisation across the app. Provides the two transforms the codebase uses—`normalizeEmail` (trim + lowercase, the canonical "same address" check) and `canonicalMailbox` (inbox-level key for rate/budget logic)—so that no module re-implements its own variant and the same address is never treated as two distinct callers or rows.

## Key elements

- **`normalizeEmail(email: string): string`** — Trims whitespace and lowercases. Used before storage, lookup, and comparison everywhere an email field is read or written.
- **`canonicalMailbox(email: string): string`** — Returns the deliverable mailbox for *budget* keying only: applies `normalizeEmail`, strips a `+tag` suffix (only when it follows a non-empty local part), and for `gmail.com` / `googlemail.com` removes all dots in the local part and rewrites the domain to `gmail.com`. Explicitly **not** a storage or uniqueness transform.
- **`DOT_INSENSITIVE_DOMAINS`** (module-private) — `Set` of domains (`gmail.com`, `googlemail.com`) whose providers ignore dots in the local part.

## Relationships

- **`src/modules/account/mail-budget.ts`** — Consumes `canonicalMailbox` as the budget key so that `a+1@x`, `a+2@x`, and `A@x` all hit the same counter.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Uses `canonicalMailbox` (or `normalizeEmail`) to key per-mailbox rate limits, preventing tag-spam escapes.
- **`src/modules/account/emails.ts`**, **`src/modules/account/routes.ts`**, **`src/modules/account/services/email-change.ts`** — Call `normalizeEmail` before persisting or comparing addresses so login lookups and stored values stay consistent.
- **`src/modules/account/session/device-cookie.ts`**, **`src/modules/account/session/login-observability.ts`** — Normalise the submitted address before writing session metadata or emitting login logs.
- **`src/modules/orders/repository.ts`**, **`src/modules/tasks/service.ts`** — Apply `normalizeEmail` to their own email fields so they match the `users` schema cast.
- **`tests/unit/infrastructure/persistence/normalize-email.test.ts`** — Unit tests for both exports (trim, case, `+tag`, dot, `googlemail.com` rewrite, edge cases like `+@x`).
- **`tests/cross-cutting/normalize-email-conformance.test.ts`** — Verifies that every consumer in the graph normalises identically (i.e., no module diverges from this module).

## Notes

- `canonicalMailbox` is **not** idempotent across two calls on an already-canonical string (e.g. a stored `a+shop@x` re-run through it would drop the tag). It is meant as a *key* for budget/rate-limit lookups, never written back to storage.
- The `+` is stripped only when it appears **after** at least one local-part character (`plus > 0 && plus < at`); a leading `+@x` is preserved as-is.
- `googlemail.com` is rewritten to `gmail.com` in `canonicalMailbox` output; this rewrite does **not** appear in `normalizeEmail` output, which preserves the original domain.
- The module is intentionally in `infrastructure/persistence/` (not `domain/` or `account/`) because it is a shared persistence-layer concern consumed by many modules.
