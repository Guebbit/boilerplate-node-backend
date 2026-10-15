---
source: tests/unit/infrastructure/http/uploads.test.ts
sha256: 0c2831b60aeb7a6e5110f56e943d8d5f575df469952c6765fecb59174735cd9d
generated_at: 2026-10-15T13:15:59.168562+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/uploads.test.ts

## Purpose
Unit test suite for the three upload helpers exported by `src/infrastructure/http/uploads.ts` (`getFormFiles`, `readUploadedImage`, `writeWithUploadedImage`). It verifies that filesystem paths never leak into response payloads, that pending (quarantined) and promoted (stored) uploads follow distinct read/undo paths, and that the `uploadClaimed` flag is set only on a successful write.

## Key elements
- **`jest.mock('@infrastructure/adapters/image-store', …)`** — replaces `imageStore` with `{ remove: jest.fn(), removeQuarantined: jest.fn() }` so no test touches disk.
- **`uploaded(path)`** — builds a minimal `Express.Multer.File` stub (`{ path }`).
- **`requestWith(parts)`** — builds a partial `Request` with `body` defaulted to `{}` to exercise the `readUploadedImage` fallback branch safely.
- **`withUpload(parts)`** — like `requestWith` but also resets `storedThumbnailUrls` to `undefined`, modelling a fresh upload-middleware record.
- **`promoted()`** — returns a request carrying a promoted upload (`storedImageUrls`) with `uploadClaimed: false`.
- **`store`** — `jest.mocked(imageStore)` cast for typed call assertions.
- **`describe('getFormFiles')`** — two cases: wraps `request.file` in a single-element array; returns `undefined` when no file is present.
- **`describe('readUploadedImage')`** (first block) — url passthrough (relative & absolute), first-url-only selection, `undefined` when nothing uploaded, and the guard that a staged temp path is **not** used as a fallback.
- **`describe('readUploadedImage — the pending and promoted paths')`** — asserts placeholder URLs + `pendingImageKey` for quarantine entries; `deleteUpload()` calls `removeQuarantined` for pending and `remove` for promoted; body-string `imageUrl` yields a no-op undo; body `null` is preserved; upload always beats body; missing body doesn't throw.
- **`describe('writeWithUploadedImage — claim on success…')`** — sets `uploadClaimed = true` only when the write resolves with `success: true`; leaves the flag untouched on refusal or thrown error; passes `imageUrl: null` when nothing was uploaded; upload URL beats the `null` fill for both promoted and pending cases.

## Relationships
- **`src/infrastructure/http/uploads.ts`** — module under test; all three exported functions are imported and exercised.
- **`src/infrastructure/adapters/image-store.ts`** — fully mocked; tests assert *which* method (`remove` vs `removeQuarantined`) is invoked and with what argument, never the filesystem.
- **`src/infrastructure/http/config.ts`** — `uploadConfig()` is imported for its `NODE_PENDING_IMAGE_URL` / `NODE_PENDING_THUMBNAIL_URL` values, used in assertions to confirm the pending-path placeholders.

## Notes
- The `requestWith` helper defaults `body` to `{}` specifically so the `body.imageUrl` fallback branch inside `readUploadedImage` sees an object rather than `undefined`; `getFormFiles` cases are unaffected because they never read `body`.
- The "staged file the store never committed" test is an intentional regression guard: if `readUploadedImage` ever fell back to `request.file.path`, a raw filesystem path would persist into `imageUrl` — the exact invariant the store exists to prevent.
- `uploadClaimed` is mutated in-place on the request object; the `writeWithUploadedImage` tests rely on that shared reference to verify the flag transition.
- The `deleteUpload()` no-op case (body-string imageUrl) asserts `resolves.toBe(false)`, confirming the method signals "nothing was deleted" rather than throwing.
