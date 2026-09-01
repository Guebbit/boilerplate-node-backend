# tests/unit/infrastructure/adapters/image-store.test.ts

## Purpose

Unit tests for `filesystemImageStore` — the sole module that maps a client-supplied `imageUrl` to a filesystem path and performs create/read/delete operations on it. Because a wrong translation deletes the wrong file, these tests use real files in a real temp directory rather than a mocked `fs`, asserting on *which* path is touched rather than that a path was touched.

## Key elements

- **`makeImage(name)`** – helper that writes a file under `<root>/images/` and returns both the absolute path and the stored URL (`/images/<name>`).
- **`makeThumbnail(stem)`** – helper that creates `images/thumbs/v1/<stem>.webp`, the derivative `remove()` is expected to clean up.
- **`stageUpload(name, contents?)`** – helper that writes a file into a `staging/` directory outside the public root, simulating an unvalidated upload awaiting quarantine.
- **`describe('filesystemImageStore.quarantine')`** – verifies the staged file is moved (not copied) into `quarantine/`, that the directory is created on demand, and that the returned key is the bare filename.
- **`describe('filesystemImageStore.readQuarantined')` / `removeQuarantined`** – round-trip and delete of quarantined entries; rejects/returns `false` for unknown keys.
- **`describe('filesystemImageStore.promote')`** – writes digested bytes under the public images dir, returns a URL (never a raw path), creates the directory on demand.
- **`describe('filesystemImageStore.putDerivative')`** – writes a thumbnail to `images/thumbs/v1/<stem>.webp`, always `.webp` regardless of the source extension.
- **`describe('filesystemImageStore.readImage')`** – reads by stored URL; allows subdirectory reads (e.g. `images/seed/`); rejects URLs outside the public directory and any non-local (http/https/protocol-relative) URL.
- **`describe('filesystemImageStore.remove')`** – deletes the main image **and** its `thumbs/v1/` derivative; returns `false` (no-op) for missing files, empty/undefined input, remote URLs, and path-traversal attempts that would escape the public directory.

## Relationships

- **`src/infrastructure/adapters/image-store.ts`** – the module under test. This file exercises every public method of `filesystemImageStore` against a real temp filesystem, covering the security-critical URL→path translation and the thumbnail-cleanup coupling in `remove()`.

No direct interaction with `tests/unit/scripts/spec-identity.test.ts` is visible in this file's content.

## Notes

- Env vars `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH` are set in `beforeEach` and restored in `afterEach`. Any test that runs in the same process without this setup will see stale values.
- The file deliberately does **not** mock `node:fs`. The docstring explains that a mock would assert "unlink was called with a string" without verifying *which* string — the property that actually matters.
- `readImage` and `remove` have **different** subdirectory policies: `readImage` allows reads from `images/seed/` (committed fixtures), while `remove` is strictly limited to the top-level `images/` directory. This asymmetry is intentional and tested.
- Remote URL rejection (`https://…`, `http://…`, `//…`) is tested for both `readImage` and `remove`. The comments note these correspond to `NODE_DEFAULT_IMAGE_USER` / `NODE_DEFAULT_IMAGE_PRODUCT` values and a future S3-backed store.
- Path-traversal tests (`/../…`, `/images/../../…`) verify the store resolves and contains the path within the public root before acting.
