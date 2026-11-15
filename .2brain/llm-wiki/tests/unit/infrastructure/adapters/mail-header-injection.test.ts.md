---
source: tests/unit/infrastructure/adapters/mail-header-injection.test.ts
sha256: b2e39aa812d34d28d6c807523065abfd61bc9565239daeb0e8b54607deb189a9
generated_at: 2026-11-15T00:24:36.110701+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mail-header-injection.test.ts

## Purpose

A guard test that verifies nodemailer (the mail-sending dependency) neutralises a classic header-injection payload in the `Subject` field. It exists so that a nodemailer version bump that regresses this behaviour fails CI before it reaches production, rather than relying on the application layer to strip dangerous characters.

## Key elements

- **`transport()`** – Creates a nodemailer transport configured with `streamTransport: true`, `buffer: true`, and `newline: 'unix'`, producing raw RFC 5322 text in memory instead of sending a message.
- **`headerLinesOf(raw)`** – Splits a rendered message at the first blank line and returns the header lines as an array. Used to assert on header structure.
- **`describe('a subject carrying a line break, through the real nodemailer')`** – The single test: sends a message whose subject is `'hi\r\nBcc: x@evil.test'` and asserts (a) exactly one `Subject:` header line exists, and (b) no `Bcc:` header line was injected.

## Relationships

No graph neighbours. This file is a leaf test with no imports from the project's source tree; its only external dependency is `nodemailer`.

## Notes

- This is explicitly a **learning test of a dependency**, not of application code. It is expected to go red if nodemailer changes how it escapes or folds the `Subject` header.
- The contact form upstream accepts the subject as a plain string with no stripping (see `docs/theory/defences/email.md`); nodemailer is the sole line of defence, which is what this test locks in.
- `buffer: true` is essential: without it, `sent.message` would not be a `Buffer` and the header extraction would silently produce an empty string, masking a failure.
- The payload uses `\r\n` (CRLF), the byte sequence that actually splits headers in the wire format, rather than a bare `\n`.
