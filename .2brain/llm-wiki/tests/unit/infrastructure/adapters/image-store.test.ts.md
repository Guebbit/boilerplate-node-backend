---
source: tests/unit/infrastructure/adapters/image-store.test.ts
sha256: 29f5274090d03d46f31c939d5395f23fac1451b16391ac7fb4b559d7326d082f
generated_at: 2026-10-15T13:06:12.844467+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image-store.test.ts

## Purpose

Unit tests for `filesystemImageStore`, verifying that the single module responsible for translating `imageUrl` strings to filesystem paths does so correctly. Tests use a real temp directory (not a mocked `fs`) because the property under test is *which* path string is produced, not merely that a string is produced.

## Key elements

- **`makeImage(name)`** – Helper that writes a file at `<root>/images/<name>` and returns both the absolute path and the stored URL (`/images/<name>`).
- **`makeThumbnail(stem)`** – Helper that creates `<root>/images/thumbs/v1/<stem>.webp` to simulate a derivative.
- **`stageUpload(name, contents)`** – Helper that places a file in `<root>/staging/`, standing in for an unvalidated upload.
- **`beforeEach` / `afterEach`** – Create a fresh `mkdtemp` root, set `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH` via `setEnvironment`, and tear down the temp tree after each test.
- **`describe('filesystemImageStore.quarantine')`** – Verifies the staged file is moved (not copied) into the quarantine directory and the key is returned.
- **`describe('filesystemImageStore.readQuarantined')`** – Round-trip read after quarantine; rejection for missing keys.
- **`describe('filesystemImageStore.removeQuarantined')`** – Deletion and boolean return for missing keys.
- **`describe('filesystemImageStore.promote')`** – MIME-to-extension mapping (png/jpg/webp), URL (not path) return shape, idempotent overwrite for duplicate stems, directory creation on demand, and absence of leftover temp files.
- **`describe('filesystemImageStore.putDerivative')`** – Thumbnail always written as `.webp` under `images/thumbs/v1/`.
- **`describe('filesystemImageStore.remove')`** – Deletion of the main image *and* its thumbnail; `false` for missing/undefined/empty/remote/protocol-relative URLs; path-traversal containment (refuses `../` escapes); refusal to delete the public directory itself.

## Relationships

- **`src/infrastructure/adapters/image-store.ts`** – The module under test. Provides `filesystemImageStore` (all method suites above) and `applyImageWriteback` (imported; exercised indirectly if at all in the truncated portion).
- **`tests/support/environment.ts`** – Supplies `setEnvironment`, used in `beforeEach` to point `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH` at the per-test temp root so the adapter resolves paths against the test fixture rather than a real deployment path.

## Notes

- **Why real `fs`:** The file's header comment explains that a mocked `fs` would only assert "unlink was called with a string," missing the actual invariant (the correct string). All assertions read/write real bytes.
- **Protocol-relative URL pin (`//images/flat.png`):** This single case is the *only* test that isolates the `isRemoteUrl` guard. Other remote URLs (e.g. `https://cdn…`) would also be caught by the images-directory check if that guard were removed, so they do not pin the protocol-relative logic.
- **Security contract:** `imageUrl` is client-supplied and typed as `uri-reference`. The path-traversal and remote-URL tests encode the guarantee that no caller can cause deletion outside `<publicPath>/images/`.
- **`remove()` is the sole cleanup point for thumbnails:** The test asserting thumbnail deletion alongside the main image encodes that no other call site is expected to clean `thumbs/v1/`.
- **`promote` idempotency:** Two promotes with the same stem overwrite silently (last writer wins); this is what makes redelivered digest jobs harmless.
