---
source: tests/unit/infrastructure/adapters/mail-transport-flags.test.ts
sha256: 5d67fb643fb5007f2f2d10e6320e1fc8ed99199f2d12c9a625e17d7ec11ea0f4
generated_at: 2026-11-08T10:08:12.347581+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mail-transport-flags.test.ts

## Purpose

Verifies that a nodemailer transport configured with `disableFileAccess: true` and `disableUrlAccess: true` (as done in `smtp-transport.ts`) correctly rejects path-based and URL-based attachments while still accepting in-memory (Buffer) attachments. Exists to guard the security property that message data cannot read local files or fetch URLs once those flags are on.

## Key elements

- **`transport()`** — factory that calls `nodemailer.createTransport` with `jsonTransport: true`, `disableFileAccess: true`, and `disableUrlAccess: true`. Mirrors the production wiring in `smtp-transport.ts`.
- **`describe('a transport with file and URL access disabled', …)`** — single suite containing three cases:
  - *refuses a file-path attachment* — sends an attachment with `path: '/etc/passwd'` and asserts rejection matching `/access rejected/i`.
  - *refuses a URL attachment* — sends an attachment with `path` pointing at the AWS IMDS endpoint (`169.254.169.254`) and asserts the same rejection.
  - *still sends a byte-carried attachment* — sends an attachment with `content: Buffer.from('hello')` and asserts successful delivery.

## Relationships

No graph neighbors are recorded for this file. It imports only `createTransport` from the `nodemailer` package and is self-contained.

## Notes

- The test uses `jsonTransport: true` (in-memory SMTP) rather than a real mail server, so "sends" means the nodemailer internal pipeline completes; no network call is made.
- The `disableFileAccess` / `disableUrlAccess` flags are the mechanism under test; the assertions depend on nodemailer throwing with the string "access rejected." If nodemailer changes that error message, the regex match will break.
- The IMDS URL in the second test is an explicit SSRF guard case, not a generic "some URL" check.
