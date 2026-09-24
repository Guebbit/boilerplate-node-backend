---
source: tests/unit/infrastructure/adapters/image-store.test.ts
sha256: 6669a757e825432a333ed88010a9af4159fc683cec8fc22c65fa199c0a910f15
generated_at: 2026-09-23T20:17:32.511719+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/image-store.test.ts

## Purpose

Unit tests for `filesystemImageStore`, the sole module that translates `imageUrl` strings into filesystem paths. Tests use real files in a real temp directory (via `mkdtemp`) rather than mocking `node:fs`, because the critical property under test is _which_ path string gets passed to `unlink`/`writeFile`, not merely that a call was made.

## Key elements

- **`makeImage(name)`** — helper that writes a placeholder file under `<root>/images/` and returns both the absolute `file` path and the stored `imageUrl` (`/images/<name>`).
- **`makeThumbnail(stem)`** — helper that writes a placeholder under `<root>/images/thumbs/v1/<stem>.webp` to simulate a derivative.
- **`stageUpload(name, contents)`** — helper that creates a file in `<root>/staging/`, standing in for a pre-validated upload.
- **`beforeEach` / `afterEach`** — create/tear down a fresh temp root and set/restore `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH` env vars.
- **`describe('filesystemImageStore.quarantine', …)`** — verifies the staged file is moved (not copied) into the quarantine dir, the quarantine dir is created on demand, and the returned key is the bare filename.
- **`describe('filesystemImageStore.readQuarantined', …)`** — round-trip read after quarantine; rejects on missing key.
- **`describe('filesystemImageStore.removeQuarantined', …)`** — deletes the quarantined file; returns `false` for unknown keys.
- **`describe('filesystemImageStore.promote', …)`** — writes digested bytes under the public images dir; asserts MIME→extension mapping (`png`, `jpg`, `webp`); asserts the return value is a URL (no backslashes, starts with `/`); asserts idempotent overwrite for identical stems; asserts the images directory is created on demand.
- **`describe('filesystemImageStore.putDerivative', …)`** — writes a thumbnail to `images/thumbs/v1/<stem>.webp` regardless of the main image's extension; creates the thumbs directory on demand.
- **`describe('filesystemImageStore.remove', …)`** — the largest block. Verifies: deletion by stored URL; `false` for missing files; thumbnail cleanup alongside the main image; graceful handling of `undefined`/empty-string input; rejection of absolute remote URLs (`https://`, `http://`, `//`); and **path-traversal containment** (e.g. `/../outside.png`, `/images/../../outside.png`) — each such attempt must resolve to `false` and leave the target file intact. A dedicated test pins the protocol-relative branch of `isRemoteUrl` using `//images/flat.png`, which would land inside the public dir if treated as a local path.

## Relationships

- **`src/infrastructure/adapters/image-store.ts`** — the module under test. The test imports `filesystemImageStore` from `@infrastructure/adapters/image-store` and exercises every one of its exported methods (`quarantine`, `readQuarantined`, `removeQuarantined`, `promote`, `putDerivative`, `remove`).

## Notes

- No mocking of `node:fs`. The file header comment explicitly justifies this: a mocked `fs` would only assert that `unlink` was called with _a_ string, not that it was called with the _correct_ string.
- Env vars `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH` are saved at module load and restored in `afterEach`; forgetting to restore would leak into sibling test files running in the same process.
- The `promote` idempotency test documents an intentional design choice: a redelivered job or reclaimed lease that re-runs with the same digest stem must not fail with a "file exists" error.
- The path-traversal tests create a real `outside.png` _outside_ the temp root and assert it still exists after the rejected call; a `finally` block cleans it up regardless of assertion outcome.
- The protocol-relative URL test (`//images/flat.png`) is singled out in a long comment because it is the _only_ remote-URL case that would actually resolve to a valid local path if `isRemoteUrl`'s protocol-relative check regressed — all other remote-URL cases (`https://cdn.example.com/…`) are caught independently by the images-directory containment check.
