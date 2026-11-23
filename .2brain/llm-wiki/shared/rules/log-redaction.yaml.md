---
source: shared/rules/log-redaction.yaml
source_sha256: 55d00882ea7d6762eef3e2c8761feb65a6e299714a97417fddcfb257ce1bad9f
context_sha256: 5eaac92c499bf7c07c429aaadf99faaa8bd62e8f8f7d183f0a8135f6fecfbc79
generated_at: 2026-11-22T02:26:17.880224+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/log-redaction.yaml

## Purpose
Declares what a log line or trace span may never carry in clear. It is a data-only rule list: key names (and URL query parameters) that must be redacted or treated as personal data. Matching is done after normalisation (lowercase, `_` and `-` dropped), so one entry covers `new_password`, `newPassword` and `new-password`.

## Key elements
- `sensitiveFields`: exact key names for credentials (passwords, tokens, `authorization`, `cookie`, `set-cookie`, `x-api-key`, `otp`, `jwt`, `secret`, `api_key`, `private_key`, `client_secret`, card data such as `credit_card`/`card_number`/`cvv`, `ssn`, `iban`, etc.). These are replaced with a marker, never hashed-and-kept. The generic names `key`, `linkurl`, `challenge`, `verifier` are exact-match only.
- `sensitiveKeyFragments`: substrings that flag a key as secret: `password`, `secret`, `token`, `signature`, `otpauth`, `backupcode`. Covers spellings such as `resetToken`, `webhookSecret`, `x-hub-signature`.
- `personalFields`: `email`, `ip`, `phone`, `street`, `zip`, `fullname`. These are not credentials; the log mode `NODE_LOG_PERSONAL_FIELDS` decides whether they are hashed, redacted or left plain.
- `traceUrlSecrets`: query parameters no trace span may carry: `code` (OAuth callback one-time code), `state` (CSRF), `email` (staff search).

## Relationships
- `shared/rules/cookies.yaml`: cookie names are intentionally not listed here. Its `secret: true` rows are added to `sensitiveFields`, so effective redaction is this file UNION those rows. The comment says the "twin" implementation does the same.
- `shared/rules/semantic-log-names.yaml`: no interaction is visible in this file's content.

## Notes
- Credentials and personal data are kept in separate lists on purpose, because only personal data is affected by the log mode.
- Broad patterns are deliberately avoided. `key` is exact-only so it does not catch `idempotencyKey`, `statusCode` or `linkCount`. `code` is left out of the fragments because it is "the first thing a debugger reads", and no broad `code|key|link` pattern is used.
- `to` is deliberately not personal data. It is the transition/diff key (`{ from, to }`) and stays readable, while a mail recipient is logged as `email`.
- `code` and `state` are redacted only in trace URLs (`traceUrlSecrets`), not as general log keys.
