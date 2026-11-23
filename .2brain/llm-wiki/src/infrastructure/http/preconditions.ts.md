---
source: src/infrastructure/http/preconditions.ts
source_sha256: 5d347ce06d1b81015b15b8bff3900921b7b17fce687908e7d68481ec969b2a60
context_sha256: 57762cbeebc80374ebe9f3afa98f59c5d95c3ecc4fd7a9d114699f442fdad9f0
generated_at: 2026-11-22T02:53:11.152301+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/preconditions.ts

## Purpose
The HTTP half of conditional writes (RFC 9110 §13.1.1). It reads `If-Match` off a write request, opens the precondition scope that the repository checks, and puts a real `ETag` on responses. The version itself and the check live in `src/infrastructure/persistence/versioning.ts`. This file knows nothing about what a row looks like.

## Key elements
- `preconditionOf(request, id)`: parses `If-Match` into a `Precondition` for one row.
  - It returns `undefined` when there is no header, which makes the write unconditional.
  - `*` becomes `etags: 'any'`.
  - A valid tag list keeps each tag's `W/` prefix, so weak tags never match.
  - A malformed header becomes an empty tag list, so the write is refused with 412 instead of running unconditionally.
- `withIfMatch(request, id, work)`: runs a module's write inside `runWithPrecondition(preconditionOf(...), work)`.
- `setEtag(response, row)`: wraps the response's JSON-sending method so that, when the body is sent, it sets `ETag` to `etagOf(version, digestOf(body))`.
  - The tag has the form `"<editRevision>.<digest>"`, where the digest is a 16-character base64url prefix of the sha256 of `JSON.stringify(body)`.
  - It does nothing if `versionOf(row)` is `undefined`.
  - Express then answers `If-None-Match` with a 304 on a whole-tag match.
- `keepEtag(response)`: marks a response's `ETag` as one this API made. It is for tags set outside `setEtag`, for example an idempotent replay that restores the stored tag.
- `answerAsResource(response, row, uri)`: calls `setEtag` for a versioned row. For non-GET/HEAD requests it also sets `Content-Location` to `uri`. Rows with no version are answered untagged.
- `dropUnownedValidators`: an Express `RequestHandler` that wraps `writeHead` on non-GET/HEAD requests.
  - On PUT it removes `ETag` and `Last-Modified`.
  - On other writes it removes `ETag` unless the response was marked via `setEtag` or `keepEtag`.

## Relationships
- **`src/infrastructure/persistence/versioning.ts`**: supplies `etagOf`, `versionOf`, `runWithPrecondition` and the `Precondition` type. This file adapts HTTP onto them.
- **Surface controllers** (`create-item-controller.ts`, `create-update-controller.ts`, `create-delete-controller.ts`, `create-restore-controller.ts`) and **module controllers** (account, cart, delivery, example): these are the callers. They sit in the write path, so they are the natural users of `withIfMatch`, `setEtag` and `answerAsResource`.
- **`src/infrastructure/http/middlewares/idempotency.ts`**: the `keepEtag` doc names an idempotent replay as the case that restores the first answer's stored tag.
- **`src/app/security.ts`**: not covered by anything in the file; the dependency graph lists it only as a neighbor.
- **`scripts/docs/generate-role-matrix.ts`**: the graph lists it as a neighbor; the file shows no direct interaction.

## Notes
- The `setEtag` wrapper is installed after the Redis cache's, so it runs first and the cache stores the tag.
- The digest assumes Express's `json spaces`, `replacer` and `escape` settings are unset anywhere in `src`. Only then does `JSON.stringify` match the bytes sent.
- A write's `If-Match` compares only the edit-revision part of the tag (see `src/infrastructure/persistence/versioning.ts`). Reads compare the whole tag.
- `dropUnownedValidators` hand-wraps `writeHead` because `on-headers` is not a dependency. It catches Express's own content-hash tag, which `res.send` stamps just before the head is written.
- `If-Match` is still honoured on the way in. Only the answer loses its validators.
