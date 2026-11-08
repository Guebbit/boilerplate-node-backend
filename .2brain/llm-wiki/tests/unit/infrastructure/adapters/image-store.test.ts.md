---
source: tests/unit/infrastructure/adapters/image-store.test.ts
sha256: 82809248ded09eef152920e037b3c23457b8e7b212b386349cbe2aa93f837a91
generated_at: 2026-11-08T10:07:08.493662+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image-store.test.ts

## Purpose

Unit tests for the filesystem image store adapter, verifying that the `imageUrl` → filesystem-path translation produces the *correct* path for every operation (quarantine, promote, putDerivative, remove). Uses real files in a real `mkdtemp` directory rather than a mocked `fs`, because the property under test is *which* string reaches `unlink`/`readFile`/`writeFile`, not merely that they were called.

## Key elements

- **`makeImage(name)`** — helper; writes a placeholder file at `<root>/images/<name>` and returns both the real path and the stored URL (`/images/<name>`).
- **`makeThumbnail(stem)`** — helper; creates the `images/thumbs/v1/<stem>.webp` derivative that `remove()` should clean up.
- **`stageUpload(name, contents?)`** — helper; writes a file in `<root>/staging/` simulating an unvalidated upload outside the public root.
- **`beforeEach` / `afterEach`** — creates a fresh temp dir, sets `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH` via `setEnvironment`; tears down with recursive `rm`.
- **`describe('filesystemImageStore.quarantine')`** — verifies the staged file is moved (not copied) into the quarantine directory, the key is returned, and the quarantine dir is created on demand.
- **`describe('filesystemImageStore.readQuarantined')`** — round-trips bytes through quarantine → read; rejects missing keys.
- **`describe('filesystemImageStore.removeQuarantined')`** — deletes a quarantined file; returns `false` for absent keys.
- **`describe('filesystemImageStore.promote')`** — writes digested bytes under the public images dir; checks MIME-to-extension mapping (png/jpg/webp); asserts the return value is a URL (no backslashes, leading `/`); creates `images/` on demand; confirms idempotent overwrite for the same stem; asserts no temp-file residue.
- **`describe('filesystemImageStore.putDerivative')`** — writes a thumbnail at `images/thumbs/v1/<stem>.webp` regardless of source extension; creates the directory tree on demand.
- **`describe('filesystemImageStore.remove')`** — the largest suite: deletes the named file, reports `false` for missing/`undefined`/empty URLs, co-deletes the matching thumbnail, rejects remote and protocol-relative URLs, refuses path-traversal escapes (`/../…`), and refuses to delete the public directory itself.

## Relationships

- **`src/infrastructure/adapters/image-store.ts`** — the module under test. The test imports `filesystemImageStore` (all `describe` blocks exercise its methods) and `applyImageWriteback` (referenced in the import; likely exercised in the truncated portion).
- **`tests/support/environment.ts`** — provides `setEnvironment`, used in `beforeEach` to point `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH` at the per-test temp root so the adapter resolves paths against the test sandbox.

## Notes

- **Why real fs, not a mock:** the file's own header comment explains that a mocked `fs` would only assert "unlink was called with a string"; the meaningful assertion is *which* string (i.e., that path traversal or a wrong base directory is impossible).
- **Protocol-relative URL pin:** the `//images/flat.png` test is deliberately crafted so that it would pass even if `isRemoteUrl` were removed (the images-directory guard would still catch most remote URLs, but this one, read as a local path, lands exactly at `<public>/images/flat.png`). It is the only test that truly pins the protocol-relative half of the remote-URL guard.
- **Thumbnail co-deletion is `remove()`'s sole responsibility:** no other call site knows a document's image is going away, so if `remove()` didn't also delete `thumbs/v1/<stem>.webp`, every hard-delete or image replacement would leak the derivative.
- **Traversal test cleanup:** the "outside" file written by the path-traversal cases is removed in a `finally` block to avoid leaking into sibling test runs or the repo.
- **`applyImageWriteback` is imported** but its usage is in the truncated portion of the file; do not assume it is untested.
