---
source: shared/rules/log-redaction.yaml
sha256: fd14fa26c99795ff265fc1efde27771c2ae90bea4443a5db5c13fae8ce6ade2c
generated_at: 2026-11-08T03:09:44.079011+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/log-redaction.yaml

## Purpose
Declarative rule-set that enumerates which field names, key fragments, and URL parameters must never appear in clear text in log lines or trace spans. It exists so every service redacts the same data with a single source of truth, and so the distinction between *credentials* (always redacted) and *personal data* (redaction mode is configurable) stays explicit.

## Key elements
- **`sensitiveFields`** – Exact (normalised) field names for credentials, tokens, API keys, and payment data. Matched after lowercasing and stripping `_` / `-`, so one entry covers all common spellings. The list is *supplemented at runtime* by the `secret: true` rows from `cookies.yaml` (union).
- **`sensitiveKeyFragments`** – Substring patterns (e.g. `password`, `secret`, `token`, `signature`, `otpauth`, `backupcode`) that catch multiply-spelled secret keys like `resetToken` or `webhookSecret`. Deliberately excludes generic words like `code`.
- **`personalFields`** – PII (email, IP, phone, address, etc.) kept separate from credentials; the actual treatment (hash, redact, or plain) is governed by the `NODE_LOG_PERSONAL_FIELDS` environment variable rather than being hard-coded here.
- **`traceUrlSecrets`** – Query parameters (`code`, `state`) that must be stripped from any URL recorded in a trace span (OAuth one-time code, CSRF state).

## Relationships
- **`shared/rules/semantic-log-names.yaml`** – Described in the file comments as the "twin" rules file; both apply the same cookies.yaml union and work together to define the full redaction policy.
- **`cookies.yaml`** (referenced in comments) – Its `secret: true` rows are UNION-ed into `sensitiveFields` at evaluation time, extending this list without duplication.

## Notes
- Normalisation is applied *before* matching: lowercase, drop `_` and `-`. `new_password`, `newPassword`, and `new-password` all hit the same entry.
- `key`, `linkurl`, and `challenge` appear as **exact names only** in `sensitiveFields`. Listing them in `sensitiveKeyFragments` would over-match unrelated fields like `idempotencyKey` or `statusCode`.
- `code` is intentionally absent from `sensitiveKeyFragments` (it is the first thing a debugger looks for) but *is* listed in `traceUrlSecrets` for URL contexts.
- Redaction replaces values with a marker; values are never hashed-and-retained.
