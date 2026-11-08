---
source: src/types/server-image.ts
sha256: 962aa56472bdc7383cdabf8cb3167cfce7b8660b4940899c7051c4c13430e65c
generated_at: 2026-11-08T09:16:50.462788+00:00
model: ollama:qwen3.8:27b
---

# src/types/server-image.ts

## Purpose

Defines the server-decided image representation for write operations. It separates the "image half of a write" from client-supplied request bodies, ensuring image fields are only set by the upload pipeline and never interpreted directly from a client payload.

## Key elements

- **`ServerImageFields`** (interface) — The three image fields that change together as a unit:
  - `imageUrl?: string | null` — Path produced by the upload pipeline. `null` signals removal; absent signals "leave unchanged".
  - `thumbnailUrl?: string` — Thumbnail path; server-set only (read-only from the client's perspective).
  - `pendingImageKey?: string` — Placeholder key set alongside a pending image (see `readUploadedImage`).

- **`WithServerImage<TRequest>`** (utility type) — Takes any request type and replaces its image-related fields (those matching `keyof ServerImageFields`) with `ServerImageFields`. Used to express a validated, server-decided write shape.

## Relationships

- **`src/types/index.ts`** — Re-exports `ServerImageFields` and `WithServerImage` for consumption across the codebase.
- **`src/infrastructure/adapters/image-store.ts`** — The upload pipeline that actually produces the `imageUrl`, `thumbnailUrl`, and `pendingImageKey` values consumed by this type.
- **`src/modules/products/services/translated-write.ts`** — Applies `WithServerImage` to product write request types.
- **`src/modules/users/services/create.ts`** / **`src/modules/users/services/update.ts`** — Apply `WithServerImage` to user write request types, so user creation and update flows share the same server-decided image contract.

## Notes

- The triad `imageUrl` / `thumbnailUrl` / `pendingImageKey` is intended to change **together, never independently**. Treat them as a single unit when constructing or validating writes.
- `imageUrl` uses three states (string, `null`, absent) with distinct semantics — do not conflate `null` (remove) with a missing property (preserve).
- The `readOnly` semantics of `thumbnailUrl` are a contract convention, not a TypeScript enforcement; callers must still avoid setting it outside the upload pipeline.
