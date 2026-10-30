---
source: src/types/server-image.ts
sha256: 962aa56472bdc7383cdabf8cb3167cfce7b8660b4940899c7051c4c13430e65c
generated_at: 2026-10-29T06:37:04.622493+00:00
model: ollama:qwen3.8:27b
---

# src/types/server-image.ts

## Purpose

Defines the server-side shape of image fields on a write operation. It exists to separate "what the server actually stored" from "what the client sent," so service handlers receive a contract that can only be fulfilled by the upload pipeline, never by a raw request body.

## Key elements

- **`ServerImageFields`** — interface with three fields that change as a unit:
  - `imageUrl?: string | null` — `null` means "remove the image"; absent means "leave it"; a string is a validated path produced by the upload pipeline.
  - `thumbnailUrl?: string` — always server-set; the contract marks it `readOnly` for clients.
  - `pendingImageKey?: string` — placeholder set when an image is still being processed (see `readUploadedImage`).

- **`WithServerImage<TRequest>`** — mapped type: `Omit<TRequest, keyof ServerImageFields> & ServerImageFields`. Replaces any client-facing image fields on an arbitrary request type with the server-decided triple, so services type-safe against the pipeline's output.

## Relationships

- **`src/types/index.ts`** — re-exports `ServerImageFields` and `WithServerImage` for the rest of the codebase.
- **`src/modules/users/services/create.ts`** and **`src/modules/users/services/update.ts`** — accept a `WithServerImage<…>` request so user image fields are governed by this contract.
- **`src/modules/products/services/translated-write.ts`** — same pattern for product writes.
- **`src/infrastructure/adapters/image-store.ts`** — the upload pipeline that *produces* the values this type expects (paths, thumbnail, pending key) before they flow into the services above.

## Notes

- The three `ServerImageFields` members are treated as an atomic group: the upload pipeline sets them together; they never change independently. Code that spreads or partially mutates this object should treat it as a unit.
- `imageUrl` uses a tri-state (`string` | `null` | `absent`). Distinguishing `null` (delete) from `undefined` (leave unchanged) is the intended semantics—coalescing them with `??` or `||` will silently break one of the two.
- `thumbnailUrl` and `pendingImageKey` are optional at the type level but are *always* server-authored; client code should never attempt to set them.
