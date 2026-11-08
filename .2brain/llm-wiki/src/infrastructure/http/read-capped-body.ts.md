---
source: src/infrastructure/http/read-capped-body.ts
sha256: 3b1f7fc6c70267b6037b96dfdacdcd0ef766e1141d69ce223d4e802e92eca976
generated_at: 2026-11-08T03:33:55.735865+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/read-capped-body.ts

## Purpose

Safe body-reading helpers that cap how many bytes are consumed from a `Response` or any `AsyncIterable` before returning. They exist so that a compromised, misconfigured, or redirected upstream host cannot force the process to buffer unbounded data; every call-out site in the app uses them instead of raw `response.json()` / `response.text()`.

## Key elements

- **`DEFAULT_BODY_CAP_BYTES`** — `1_048_576` (1 MiB). The single cap constant shared by all callers; real payloads (OAuth tokens, user records, breached-password ranges) are kilobytes, so 1 MiB is generous but still a hard ceiling.
- **`readCappedBytes(stream, maxBytes)`** — Core primitive. Async-iterates a byte stream, accumulates `Uint8Array` chunks, and throws the instant the running total exceeds `maxBytes`. Also rejects non-`Uint8Array` chunks with a `TypeError`. Returns a single `Buffer`.
- **`readCappedText(response, maxBytes)`** — Thin wrapper: if `response.body` is null (204, HEAD) resolves `''`; otherwise delegates to `readCappedBytes` and decodes UTF-8.
- **`readCappedJson(response, maxBytes)`** — Reads via `readCappedText`, then `JSON.parse`s. Returns `unknown`; the caller is responsible for narrowing.

## Relationships

- **`src/modules/account/oauth/providers/client.ts`** and **`github.ts`** — OAuth token/user responses are read through `readCappedJson` / `readCappedText` so a hostile redirect cannot flood memory.
- **`src/infrastructure/security/breached-passwords/index.ts`** — Range-lookup HTTP responses are read with the capped helpers.
- **`src/infrastructure/adapters/antibot-providers/turnstile.ts`** — Cloudflare siteverify responses are read with the capped helpers.
- **`src/infrastructure/adapters/remote-image.ts`** — Consumes `readCappedBytes` directly on an `IncomingMessage` stream (no `Response` wrapper).
- **`src/infrastructure/config/fields.ts`** — Provides configuration fields that callers combine with `DEFAULT_BODY_CAP_BYTES` when constructing requests (e.g. endpoint URLs) alongside these helpers.
- **`tests/unit/infrastructure/http/read-capped-body.test.ts`** — Unit tests covering the cap-enforcement, non-byte rejection, and bodiless-response paths.

## Notes

- The module doc states these helpers are *always* paired with `redirect: 'error'` at the call site — the cap handles size, but redirect-avoidance is the caller's responsibility.
- `readCappedBytes` accepts any `AsyncIterable<unknown>`; the `Uint8Array` type-guard is the only shape check. Passing a `ReadableStream` (browser) or `IncomingMessage` (Node) both work because both are async-iterable.
- The throw inside the `for await` loop cancels/destroys the underlying stream (per the MDN async-iteration semantics noted in the code), so no further data is pulled.
- `readCappedJson` returns `unknown` intentionally — the caller must validate the shape; the helper does no schema checking.
