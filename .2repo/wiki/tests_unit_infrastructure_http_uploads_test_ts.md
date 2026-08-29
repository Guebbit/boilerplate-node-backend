# tests/unit/infrastructure/http/uploads.test.ts

## Purpose

Unit tests for the upload helper functions in `src/infrastructure/http/uploads.ts`. The file exists to lock down two invariants: (1) `getFormFiles` collapses all three multer request shapes (`single`, `array`, `fields`) into one uniform return type, and (2) `resolveImageUrl` reads the URL only from the image store and never falls back to a filesystem path. It also covers the small `toPosixPath` normalizer.

## Key elements

- **`requestWith(parts)`** – Test helper that casts a `Partial<Request>` to a full `Request`, keeping only the fields under test visible.
- **`uploaded(path)`** – Test helper that produces a minimal `Express.Multer.File` stub with only the `path` field.
- **`describe('getFormFiles')`** – Seven tests covering: single→array wrap, array→ordered paths, fields→flattened paths, `file`-over-`files` precedence, empty request → `undefined`, empty fields object → `undefined`, and empty array → `undefined` (the last two asserted as a pair to prove the two shapes agree).
- **`describe('resolveImageUrl')`** – Five tests covering: reading the store-recorded URL, absolute/remote URLs passed through unchanged, first-URL-only selection, empty request → `undefined`, and a staged-but-uncommitted file being ignored (no filesystem path leak).
- **`describe('toPosixPath')`** – Three tests covering: multi-separator rewrite, idempotence on already-POSIX paths, and no-separator passthrough.

## Relationships

- **`src/infrastructure/http/uploads.ts`** — The module under test. The file imports `getFormFiles`, `resolveImageUrl`, and `toPosixPath` from it and asserts each function's contract.
- **`@infrastructure/adapters/image-store`** (referenced in comments only) — The component that constructs and owns the image URL. Tests here explicitly assert that `resolveImageUrl` does *not* derive or normalize a path, because the store is the sole authority on the final URL. `image-store.test.ts` is cited as the place where URL construction is verified.
- **`express`** — Provides the `Request` type used in the test helpers.

## Notes

- The empty-normalization pair (empty fields → `undefined` and empty array → `undefined`) is kept as two separate tests on purpose: they must agree, and a single merged assertion could mask a regression in one shape.
- `resolveImageUrl` ignoring a staged file is a deliberate non-fallback. A request whose upload never reached the store has no stored image; returning the temp path would leak a filesystem path into `imageUrl`.
- The `file`-over-`files` precedence test exists to prevent a silent inversion of the check order in the implementation.
- All tests use the minimal stubs (`requestWith`, `uploaded`) rather than full Express/multer fixtures, keeping intent local and avoiding coupling to unrelated request fields.
