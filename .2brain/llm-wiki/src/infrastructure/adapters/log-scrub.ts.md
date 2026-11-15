---
source: src/infrastructure/adapters/log-scrub.ts
sha256: ce578243f5c6b0f512de20b13e195b111acc39f9bf130ff58925269b0d9acd48
generated_at: 2026-11-14T17:53:46.007014+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/log-scrub.ts

## Purpose

Provides two redaction utilities for log message *text* — the part that key-name-based redaction never inspects. `scrubError` strips data-bearing fields (message, raw stack) from known error classes while preserving identifying fields; `maskMessage` replaces every email and IP address in arbitrary text with a caller-supplied pseudonym so the line stays correlatable with the hashed `email`/`ip` log fields.

## Key elements

- **`scrubError(error: Error): Record<string, unknown> | undefined`** (exported) — Returns a reduced error record for two known shapes:
  - *Database (Mongo/Mongoose/BSON)*: keeps `name`, `code`, and stack **frames only** (lines matching `^\s+at `); the message is dropped entirely.
  - *Nodemailer* (detected structurally via `command`, `responseCode`, `response`): keeps `name`, `code`, `responseCode`, `command`, and the message with the SMTP server's reply (`: <response>`) stripped.
  - Returns `undefined` for any other error, signalling the caller to keep it whole.
- **`maskMessage(text: string, pseudonym: (address: string) => string): string`** (exported) — Replaces every email, IPv6 (full, compressed, IPv4-mapped), and IPv4 address in `text` with `pseudonym(address.toLowerCase())`.
- **`isDatabaseError(error: Error): boolean`** (internal) — Walks the prototype chain and tests each `constructor.name` against `DATABASE_ERROR_NAME`; avoids `instanceof` to survive duplicate `mongodb`/`bson` copies.
- **`ADDRESS`** (internal) — A single compiled `RegExp` (`giu`) that matches emails, IPv6, and IPv4 in one pass (no double-matching). Email rule excludes `logo@2x.png`-style false positives; IPv4 validates octets 0–255; IPv6 requires `::` or all eight groups to spare clock times.
- **`DATABASE_ERROR_NAME`** (internal) — Regex matching known MongoDB/Mongoose/BSON error class names (`Mongo*Error`, `ValidationError`, `CastError`, `BSONError`, etc.).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports and calls `scrubError` / `maskMessage` when formatting log lines. The two files are siblings; `log-scrub` uses only relative imports because `logger.ts` imports it and the pair sits on Jest's `globalSetup` chain.
- **`src/app/error-handling.ts`** — Upstream consumer that produces the `Error` objects later passed through `scrubError`.
- **`src/infrastructure/runtime/otel-sdk.ts`** — The OTEL SDK's span/log attributes flow through the same logger pipeline, so its message text is subject to `maskMessage`.

## Notes

- The redaction *expressions* are intentionally **not** shared between backends. The expected behaviour is pinned by `shared/cases/log-redaction.cases.yaml` (`kind: message`), which a PHP twin also runs, but each language writes its own regex/logic.
- `maskMessage` lowercases the matched address before calling `pseudonym`, so a message quoting `Ada@Example.com` hashes identically to the stored (lowercase) `email` field.
- Database-error detection is by **constructor name**, not `instanceof`, specifically to tolerate a second copy of `mongodb`/`bson` in the dependency tree.
- For database errors the stack is rebuilt by filtering lines that match `^\s+at ` rather than simply dropping the first line, because the error message can span multiple lines.
- See `docs/theory/defences/disclosure.md` for the broader disclosure-prevention model this module implements.
