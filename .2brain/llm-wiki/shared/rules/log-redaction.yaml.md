---
source: shared/rules/log-redaction.yaml
sha256: 55d00882ea7d6762eef3e2c8761feb65a6e299714a97417fddcfb257ce1bad9f
generated_at: 2026-11-14T17:46:08.050022+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/log-redaction.yaml

## Purpose

Declarative rule set that defines which fields, key fragments, and URL parameters must never appear in cleartext in log lines or trace spans. It separates **credentials** (always replaced with a redaction marker) from **personal data** (handling governed by the `NODE_LOG_PERSONAL_FIELDS` env var: hash, redact, or plain).

## Key elements

- **`sensitiveFields`** — Exact-match list of credential field names (passwords, tokens, API keys, card numbers, IBAN, etc.). Matching is case-insensitive and ignores `_`/`-` (e.g. `new_password`, `newPassword`, `new-password` all hit one entry). On match the value is replaced with a marker; it is **never** hashed-and-kept.
- **`sensitiveKeyFragments`** — Substring matches (`password`, `secret`, `token`, `signature`, `otpauth`, `backupcode`) that catch compound names like `resetToken`, `webhookSecret`, `x-hub-signature`, `otpauthUrl`. Deliberately excludes `code` and any broad `code|key|link` pattern to avoid false positives on `idempotencyKey`, `statusCode`, `linkCount`.
- **`personalFields`** — PII fields (`email`, `ip`, `phone`, `street`, `zip`, `fullname`). Treated differently from credentials: the log mode (`NODE_LOG_PERSONAL_FIELDS`) decides whether they are hashed, redacted, or left plain.
- **`traceUrlSecrets`** — Query parameters (`code`, `state`, `email`) that a trace span must never record in its URL, covering OAuth callback one-time codes, CSRF state, and staff-search emails.

## Relationships

- **`shared/rules/semantic-log-names.yaml`** — Described in this file's comments as the "twin" rule set. Both files form the same union with the `secret: true` rows of `cookies.yaml` to produce the full redaction list. Keep the two in sync when adding or removing fields.

## Notes

- `key` in `sensitiveFields` is an **exact** name only. Adding it to `sensitiveKeyFragments` would redact benign fields like `idempotencyKey`, `statusCode`, `linkCount`.
- `code` is intentionally **absent** from `sensitiveKeyFragments` (debuggers rely on reading it) but **present** in `traceUrlSecrets` (OAuth/CSRF one-time values must not leak into span URLs).
- The `to` field (mail transition/diff key `{ from, to }`) is deliberately left readable and not listed under `personalFields`.
- Cookie names are **not** listed here; per the file's comments they are pulled in from `cookies.yaml` (`secret: true` rows) at runtime.
