---
source: src/infrastructure/http/read-capped-body.ts
source_sha256: 3b1f7fc6c70267b6037b96dfdacdcd0ef766e1141d69ce223d4e802e92eca976
context_sha256: 2cdbc13885a7d78e5e9c4c373b9382f27efc6e045e90a5d4c27b1e474ac6b767
generated_at: 2026-11-22T02:53:22.259737+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/read-capped-body.ts

## Purpose
Reads a third party's HTTP answer without trusting its size. The built-in body readers on `Response` (the `json()` and `text()` methods) buffer whatever arrives, so a compromised, misconfigured or redirected provider could make the process hold gigabytes before parsing. These helpers stop reading once a byte cap is exceeded. They are used wherever the app calls out and reads the answer (OAuth providers, the breached-password range lookup, the antibot siteverify), always alongside `redirect: 'error'`.

## Key elements
- `DEFAULT_BODY_CAP_BYTES` — the cap every caller uses: 1 MiB (`1_048_576`).
- `readCappedBytes(stream, maxBytes)` — collects any `AsyncIterable<unknown>` (a fetch body or an `IncomingMessage`) into a `Buffer`. It throws an `Error` once the running size passes `maxBytes`, and a `TypeError` if a chunk is not a `Uint8Array`. Leaving the loop early cancels or destroys the stream.
- `readCappedText(response, maxBytes)` — reads a `Response` body as UTF-8 text through `readCappedBytes`. A null body (204, HEAD) returns `''` instead of throwing.
- `readCappedJson(response, maxBytes)` — `readCappedText` followed by `JSON.parse`. It returns `unknown`, so the caller must narrow the result. It throws if the body is too long or is not JSON.

## Relationships
- Called by the OAuth provider code (`src/modules/account/oauth/providers/client.ts`, `github.ts`), the breached-password lookup (`src/infrastructure/security/breached-passwords/index.ts`) and the antibot Turnstile adapter (`src/infrastructure/adapters/antibot-providers/turnstile.ts`), per the module doc.
- `src/infrastructure/adapters/remote-image.ts` and `src/infrastructure/config/fields.ts` are graph neighbors. Their exact use of this file isn't visible here.
- Covered by `tests/unit/infrastructure/http/read-capped-body.test.ts`.

## Notes
- The size check runs per chunk, after the chunk is received, and before it is stored. The throw ends iteration, which cancels the stream.
- The cap is on bytes, not characters.
- Callers are expected to pair these helpers with `redirect: 'error'`.
