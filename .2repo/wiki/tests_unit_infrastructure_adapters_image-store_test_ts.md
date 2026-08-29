# tests/unit/infrastructure/adapters/image-store.test.ts

## Purpose
Integration-style unit tests for `filesystemImageStore`, exercising `put` and `remove` against a real temporary directory rather than a mocked `fs`. The file exists to pin down the one code path that translates a client-supplied `imageUrl` into a filesystem path — a translation where a mistake deletes the wrong file or allows path traversal.

## Key elements
- **`makeImage(name)`** – helper that writes a file at `<root>/images/<name>` and returns both the real path and the expected `/images/<name>` URL.
- **`stageUpload(name, contents?)`** – helper that creates a file in `<root>/staging/<name>`, simulating an incoming upload outside the public directory.
- **`describe('filesystemImageStore.put')`** – verifies that `put` moves the staged file into the public images directory, returns a forward-slash URL (never a backslash path), deletes the staged copy, round-trips with `remove`, and rejects when the images directory is missing.
- **`describe('filesystemImageStore.remove')`** – the bulk of the file. Covers:
  - Deletion of an existing flat file, and `false` for missing/empty/`undefined` URLs.
  - **Remote-URL safety** – `https://`, `http://`, and protocol-relative (`//`) URLs must never resolve to a local path.
  - **Path-traversal rejection** – `../` sequences in the URL must not escape the public root.
  - **Subdirectory guard** – files under `images/seed/` (or any subdirectory) are not written by this store and must not be deletable.
  - **Windows-shaped and slashless URLs** – `\images\windows.png` and `images/slashless.png` must still resolve to the correct flat file.
  - **Late env resolution** – `NODE_PUBLIC_PATH` is read at call time, not import time.
  - **`./public` fallback** – with `NODE_PUBLIC_PATH` deleted and `process.chdir(root)`, the `?? 'public'` default resolves relative to the working directory.

## Relationships
- **`src/infrastructure/adapters/image-store.ts`** – the module under test; this file imports `filesystemImageStore` and asserts its observable filesystem and return-value behavior.
- **`tests/unit/scripts/spec-identity.test.ts`** – listed as a graph neighbor, but no direct import, shared helper, or shared fixture is present in this file. Any relationship is indirect (both test the same infrastructure adapter surface) and not exercised here.

## Notes
- **No `fs` mocking.** The file's own doc comment explains that a mocked `fs` would only prove the code *calls* `unlink`, not that it passes the *correct* string. Real files in `mkdtemp` are intentional.
- **`NODE_PUBLIC_PATH` is set in `beforeEach` and restored in `afterEach`.** One test (`falls back to ./public`) deliberately *deletes* the variable and calls `process.chdir`; it restores both in a `finally`.
- **The protocol-relative test (`//images/flat.png`) is the only one that uniquely pins `isRemoteUrl`.** Other remote-URL tests would still pass if that guard were removed, because the containment check catches them as subdirectory paths. The comment in the file calls this out explicitly.
- **The subdirectory guard protects committed demo fixtures** (`images/seed/`), not just arbitrary subdirs. Deleting them would break re-seeds and remove version-controlled assets.
- **The `put` test for a missing images directory expects a rejection (thrown error),** not a `false` return — the asymmetry with `remove`'s soft-fail contract is intentional and called out in the inline comment.
