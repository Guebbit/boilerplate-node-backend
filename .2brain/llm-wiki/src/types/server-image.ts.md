---
source: src/types/server-image.ts
sha256: 9c607e5e79d6ba881837c4bc184d714059090a1ae07ca862fd3012fa36e3dd13
generated_at: 2026-10-15T12:30:16.724617+00:00
model: ollama:qwen3.8:27b
---

# src/types/server-image.ts

## Purpose

A single type-level utility that re-maps the `imageUrl` field of a request object to reflect the server's own decision (path string, `null` for removal, or absent for no change), decoupling the wire format from the upload pipeline's output.

## Key elements

- **`WithServerImage<TRequest>`** — A mapped type that strips `imageUrl` from `TRequest` and replaces it with `imageUrl?: string | null`. The three states encode intent: a string path (set), `null` (remove), or `undefined`/absent (leave unchanged).

## Relationships

- **`src/types/index.ts`** — Re-exports `WithServerImage` so consumers can import it from the barrel.
- **`src/modules/users/services/create.ts`** / **`src/modules/users/services/update.ts`** — Consume the type to type their service inputs, ensuring the `imageUrl` they receive is the post-validation path (or removal signal) produced by `readUploadedImage`, not the raw client payload.

## Notes

- The doc comment explicitly warns that this represents the *server's* view of the image, never the client body. If you see a raw request flowing through these services, it has already been transformed.
- `imageUrl` is both optional (`?`) and nullable (`| null`)—the distinction is intentional: `undefined` means "don't touch the image," `null` means "delete it." Conflating the two will silently skip removal.
- The string path is expected to come from `readUploadedImage` (the upload pipeline); this file does not validate or produce it.
