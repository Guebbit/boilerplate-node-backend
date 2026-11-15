---
source: tests/integration/image-acl.test.ts
sha256: 92c8bb8ac37e4732cb181eff21fd9de0bd56a80a890ff229d019087ae8792a96
generated_at: 2026-11-14T23:14:27.137173+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/image-acl.test.ts

## Purpose

Integration test enforcing the cross-module rule that a client may never name a path in the image store via `imageUrl`. For every write endpoint that accepts an image, it verifies the server rejects a body pointing at another record's file (422) and that the victim's file survives on disk. It also confirms the allowed behaviors: `imageUrl: null` deletes only the record's own image, omitting `imageUrl` preserves it, and multipart uploads still work.

## Key elements

- **`Door` interface + `doors` array** — Table-driven definition of five account/user endpoints (PATCH/PUT `/account`, POST/PATCH/PUT `/users`) with method, route, auth role, and minimal valid body. Each is exercised via `describe.each`.
- **`fileExists(url)`** — Resolves a stored `/images/<name>` URL against `PUBLIC_DIRECTORY` and checks `existsSync`. This is the primary assertion target.
- **`send(door, encoding, imageUrl)`** — Builds a supertest request in either JSON or multipart encoding, attaching `imageUrl` as the malicious field. Multipart encodes objects as `JSON.stringify` and booleans via `String()`.
- **Products block** (`POST/PUT/PATCH /products`) — Separate `it.each` that creates a target product first, then attempts to inject `imageUrl` pointing at the victim's file through both encodings.
- **"What stays allowed" suite** — Four tests confirming null-clears-own, omit-preserves, PUT-lossless-with-null-removal, and multipart-upload-sets behaviors on `/account`.
- **`beforeEach` setup** — Creates a victim product with an attached PNG upload; records the resulting `imageUrl` as the target for all attack tests.

## Relationships

- **`tests/support/http.ts`** — Supplies `api()` (supertest wrapper) and `authenticateAs` for admin/user bearer tokens used in every request.
- **`tests/support/file-sandbox.ts`** — Supplies `emptyFileSandbox`, called in `afterEach` to reset the on-disk image store between tests.
- **`tests/support/images.ts`** — Supplies `decodablePng()` (a valid PNG buffer for `sharp` to digest) and `publicDirectory()` (the writable directory the sandbox populates).
- **`tests/support/setup-test-db.ts`** — Supplies `setupTestDb()`, called once at module level to prepare a clean database.
- **`src/modules/locales/tests/factories.ts`** — Supplies `givenLocale('en')`, called in `beforeEach` so locale-dependent validation is satisfied before the victim product is created.

## Notes

- `publicDirectory()` is called with a non-null assertion at module top level because the file-sandbox setup (imported transitively) assigns it before any test file's own top-level code executes; the `!` is purely a compiler narrowing.
- The multipart path is tested explicitly because the JSON schema is shared: a `imageUrl` text part in a multipart body is the same injection vector as a JSON field. The test encodes booleans as `"true"`/`"false"` and objects as `JSON.stringify` to mirror what a browser form would send.
- The critical assertion is always `fileExists(victimUrl)` **after** the rejected write — the HTTP 422 alone doesn't prove the "delete old image" side-effect never fired.
- The products tests are outside the `doors` table because they require a pre-existing product ID and a fuller body (categories, tags, flags), making them structurally different from the account/user doors.
