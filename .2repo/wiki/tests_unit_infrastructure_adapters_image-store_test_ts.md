# tests/unit/infrastructure/adapters/image-store.test.ts

## Purpose

Unit tests for `filesystemImageStore` that exercise every public method (`quarantine`, `readQuarantined`, `removeQuarantined`, `promote`, `putDerivative`, `remove`) against a real temp directory. The tests deliberately use actual filesystem I/O rather than a mocked `fs` because the critical property under test is *which path* is computed and operated on, not merely that a call was made.

## Key elements

- **`makeImage(name)`** — helper that writes a fake image file under `<root>/images/<name>` and returns both the absolute path and the stored URL string.
- **`makeThumbnail(stem)`** — helper that creates the `images/thumbs/v1/<stem>.webp` derivative file so `remove()` tests can verify cleanup.
- **`stageUpload(name, contents)`** — helper that places a file in `<root>/staging/` to simulate a staged upload for quarantine tests.
- **`describe('filesystemImageStore.quarantine')`** — verifies the staged file is moved (not copied) into the quarantine directory, that the directory is created on demand, and that the original staging path is consumed.
- **`describe('filesystemImageStore.readQuarantined')`** / **`removeQuarantined`** — round-trip read and deletion of quarantined bytes; both reject gracefully for missing keys.
- **`describe('filesystemImageStore.promote')`** — writes digested bytes under `images/`, returns a URL (never a path), creates the images directory on demand.
- **`describe('filesystemImageStore.putDerivative')`** — writes a thumbnail as `.webp` under `images/thumbs/v1/`, creates the directory on demand.
- **`describe('filesystemImageStore.remove')`** — the largest suite; covers normal deletion, thumbnail cleanup, no-op for `undefined`/`''`, refusal of remote/protocol-relative URLs, path-traversal containment, refusal to delete the public directory itself, and refusal to delete files in subdirectories (e.g. seed fixtures).
- **`beforeEach` / `afterEach`** — creates a fresh `mkdtemp` root, sets `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH`, then tears everything down and restores the original env values.

## Relationships

- **`src/infrastructure/adapters/image-store.ts`** — the module under test. The test imports `filesystemImageStore` directly and calls every exported method. All assertions are about the observable filesystem effects of those calls.
- **`tests/unit/scripts/spec-identity.test.ts`** — no direct interaction visible in this file's content; the shared graph link is likely due to a common import or test-harness dependency outside what is shown here.

## Notes

- Real `fs` is used intentionally: a mocked `fs` would only prove `unlink` was called, not that the correct string was passed. The file's docblock calls this out explicitly.
- The `remove()` suite includes a **protocol-relative URL** test (`//images/flat.png`) that is singled out in a comment as the *only* remote-URL case that would pass if the `isRemoteUrl` guard were removed, because it resolves to a valid local path. The other remote-URL examples (`https://…`) would be caught by the images-directory check regardless.
- Path-traversal tests write a sentinel file *outside* the temp root and assert it survives `remove()`. Cleanup is in a `finally` block so a test failure doesn't leak the file.
- `NODE_PUBLIC_PATH` and `NODE_QUARANTINE_PATH` are set per-test and restored in `afterEach`; they are not isolated via `jest.isolateModules` or similar.
- The seed-fixture guard (`images/seed/`) is documented inline: those files are committed to the repo and a `remove()` that reached them would cause permanent 404s on re-seed.
