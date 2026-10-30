---
source: src/modules/account/rate-limits.generated.ts
sha256: 1ec3d1f469f50cc7ccf38cfb69b10ddcc6ee2dfe0717153b0ff210322aeb7f28
generated_at: 2026-10-29T02:38:09.404750+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/rate-limits.generated.ts

## Purpose

Auto-generated data file that declares every rate-limit budget belonging to the account module as a single typed constant. It exists so that the human-readable source of truth stays in `module.yaml` while the runtime gets a compile-time-checked `as const` object. The file is produced by `npm run regenerate` and must not be edited by hand.

## Key elements

- **`accountRateLimitData`** (exported `as const` object) — the sole export. Each key is a budget identifier whose value carries:
  - `name` / `namespace` — human label and the string key used at runtime.
  - `environmentVariable` — `NODE_*` override name for the max.
  - `defaultMax` — numeric cap when no env var is set.
  - `windowMs` — numeric window in ms, or the literal string `'shared'` indicating the budget shares a window with another (password-check, signup, reset groups).
  - `bounds` — prose explaining the threat model and sizing rationale.
  - `audited` — always `true`; signals the budget must appear in audit logs.
- Budgets cover: mail-to-recipient, credential guessing (identity / device / address / block / session), password-strength checks, signup, password reset, MFA challenge guesses, and MFA code deliveries.

## Relationships

- **`src/modules/account/rate-limits.ts`** — Consumes `accountRateLimitData`; adds the per-budget key derivation (which dimension to key on: account id, IP, device cookie, block, session) and the skip logic (e.g. familiar-device cookie exemption, success-spent vs. failure-spent semantics).
- **`src/modules/account/mail-budget.ts`** — Separate mail-delivery budget definitions; `mailRecipient` in this file bounds mails *to* a single mailbox across many account actions, while `mail-budget.ts` governs the module's own outgoing-mail volume.

## Notes

- **Do not edit.** The header comment and the `@module` tag both flag this as generated; the YAML is the source of truth.
- `windowMs: 'shared'` is a string, not a number. Any consumer must branch on the type rather than doing arithmetic on `windowMs` unconditionally.
- The `bounds` strings are intentionally verbose; they document *why* a budget exists and what it does **not** protect against. Treat them as living documentation, not just comments.
- Several budgets (signup, reset) are "spent by success" because the endpoint always returns 200 to prevent enumeration; the `bounds` text makes this explicit.
- `audited` is currently uniform (`true`) across all entries but is part of the shape, so future entries could opt out.
