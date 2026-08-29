# src/infrastructure/adapters/image-store.ts

## Purpose

Port that owns the single mapping between a persisted `imageUrl` value and a concrete filesystem location. Nothing outside this file is permitted to turn an `imageUrl` into a path, so that swapping the storage backend (e.g. to an S3/CDN bucket) is a one-file change rather than a five-file change. The one implemented backend stores files under `NODE_PUBLIC_PATH/images/` and serves them via `express.static`.

## Key elements

- **`ImageStore` (interface)** — the contract: `put(stagedPath) → Promise<string>` (consume a staged upload, return the persistable URL) and `remove(imageUrl?) → Promise<boolean>` (best-effort delete; never throws).
- **`filesystemImageStore`** — the local-disk implementation of `ImageStore`.
  - `put` moves the file into `<publicRoot>/images/<basename>` and returns `/images/<name>` (literal `/` join, not `path.join`, to stay URL-safe on Windows).
  - `remove` resolves the URL against the public root, enforces two containment checks (target stays under `<public>/` AND its parent directory is exactly `<public>/images/`), then calls `deleteFile`. Returns `false` (no-op) for remote URLs, `undefined`, or anything outside the flat `images/` directory.
- **`imageStore`** — the singleton the rest of the app imports. Currently aliased to `filesystemImageStore`; deliberately no backend switch exists yet.
- **`isRemoteUrl`** — regex check for absolute (`scheme://…`) or protocol-relative (`//…`) URLs; used to short-circuit `remove` so it never tries to unlink a path like `public/https://…`.
- **`IMAGES_SEGMENT`** (`'images'`) and **`publicRoot()`** — shared constants for the directory name, URL segment, and base path; kept together so they stay in sync.

## Relationships

- **`src/infrastructure/adapters/filesystem.ts`** — imported for `deleteFile` and `moveFile`; the only actual filesystem I/O this module performs.
- **`src/infrastructure/http/uploads.ts`** — imported for `toPosixPath` (normalises backslashes on Windows before path resolution).
- **Callers** (`post-signup`, `put-account`, `write-products`, `write-users`, `products/service`) — each calls `imageStore.put` on successful upload and `imageStore.remove` on update/delete of a record. They only ever see the `ImageStore` interface, never a path.
- **`tests/unit/infrastructure/adapters/image-store.test.ts`** — unit tests for `filesystemImageStore`.
- **`src/infrastructure/adapters/storage.ts`** / **`image-signatures.ts`** — adjacent infrastructure; not imported here but part of the same adapter layer.

## Notes

- `put` **throws** on failure (the request must abort); `remove` **never throws** (it runs on already-failing code paths and must not mask the original error).
- The `remove` containment logic has two layers: a coarse `startsWith(root)` check and a strict `dirname === <root>/images` check. The second is the load-bearing one today; the first is kept as a stated invariant that becomes critical if nested key prefixes are ever added.
- Files in subdirectories of `images/` (e.g. `images/seed/` for demo fixtures) are explicitly **not** deletable through this store, even though they live under the public root.
- `URL.canParse` is deliberately not used for the remote-URL check: it accepts `mailto:` and other irrelevant schemes, and rejects the protocol-relative `//host/…` form that does need to be caught.
- Rebuilding the container loses all uploads (no volume by default). The file's docblock flags this and notes that the durable fix is a second `ImageStore` implementation, not a config flag.
