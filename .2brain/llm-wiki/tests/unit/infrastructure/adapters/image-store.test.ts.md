---
source: tests/unit/infrastructure/adapters/image-store.test.ts
sha256: b41ae19e64a33e7262650982f7f94b39f3dc312144a7f3ac16401012905e6e7d
generated_at: 2026-09-27T16:03:38.761706+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image-store.test.ts

## Purpose

Unit tests for the `filesystemImageStore` adapter, exercising every public method against a **real** temporary directory rather than a mocked `fs`. The explicit rationale (in the file's docblock) is that the critical property under test is *which* path string gets resolved, not that `unlink` was called at all — a mock cannot verify that.

## Key elements

- **`makeImage(name)`** – helper that writes a file under `<root>/images/<name>` and returns both the absolute path and the public `/images/<name>` URL.
- **`makeThumbnail(stem)`** – helper that creates `images/thumbs/v1/<stem>.webp`, the derivative `remove()` must clean up.
- **`stageUpload(name, contents)`** – helper that writes a file into a `<root>/staging` directory, simulating a pre-publication upload.
- **`describe('filesystemImageStore.quarantine')`** – verifies the staged file is moved into `<root>/quarantine/`, the original is consumed (no copy remains), and the quarantine directory is created on demand.
- **`describe('filesystemImageStore.readQuarantined')`** – round-trip read after quarantine; rejection for unknown keys.
- **`describe('filesystemImageStore.removeQuarantined')`** – deletion of a quarantined file; `false` for missing keys.
- **`describe('filesystemImageStore.promote')`** – writes digested bytes under `images/`, derives extension from MIME type (png/jpg/webp), returns a URL (never a path), creates the directory on demand, is idempotent for duplicate stems, and leaves no temp-file residue.
- **`describe('filesystemImageStore.putDerivative')`** – writes a thumbnail at `images/thumbs/v1/<stem>.webp` regardless of the source extension.
- **`describe('filesystemImageStore.remove')`** – the largest block: deletes the named file, returns `false` for missing/empty/`undefined` URLs, deletes the co-located thumbnail, tolerates a missing thumbnail, **refuses absolute/protocol-relative remote URLs** (e.g. `https://…`, `//…`), and **refuses path-traversal payloads** (`/../…`) that would escape the public directory.

## Relationships

- **`src/infrastructure/adapters/image-store.ts`** – the module under test. The file imports `filesystemImageStore` from `@infrastructure/adapters/image-store` and exercises every method on that object. All assertions are about its observable filesystem side-effects and return values.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** – listed as a graph neighbor, but no direct import or interaction with this file is visible in the source.

## Notes

- **No `fs` mocking.** The file deliberately uses `node:fs/promises` against a real `mkdtemp` directory. If you refactor the adapter, you must keep the real-fs contract or the security tests (path traversal, remote-URL rejection) become meaningless.
- **Environment variables are mutated and restored.** `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH` are set in `beforeEach` and restored in `afterEach`. Running this suite in parallel with other tests that read those vars will cause flakiness.
- **The protocol-relative URL test (`//images/flat.png`)** is called out in its own comment as the *only* remote-URL case that would fail if the `isRemoteUrl` guard were removed, because it happens to resolve to a valid local subdirectory. The other remote-URL cases (`https://cdn…`) would be caught by the images-directory check regardless.
- **`promote` idempotency test** documents that a duplicate digest run (redelivered job, reclaimed lease) must silently overwrite, not throw a "file exists" error.
- **`remove` thumbnail-cleanup test** asserts that the thumbnail stem is derived from the image key's stem (e.g. `stored.jpg` → `stored.webp`), not from the file extension.
