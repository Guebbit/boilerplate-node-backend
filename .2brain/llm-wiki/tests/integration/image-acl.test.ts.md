---
source: tests/integration/image-acl.test.ts
sha256: 6d041aca7f7ec85ba8239ad4c44d0073ed1d8b666e8a44e99a27cb9d79c19565
generated_at: 2026-10-29T06:55:51.059349+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/image-acl.test.ts

## Purpose

Integration test that enforces a cross-module security rule: a client may never supply a path in the image store via the `imageUrl` body field. It verifies that every write endpoint that accepts an image rejects a body naming *another* record's file (returning 422) while confirming on disk that the victim's file is untouched. It also pins the legitimate behaviours: `imageUrl: null` clears only the record's own image, omitting the field preserves it, and multipart upload still works.

## Key elements

- **`PUBLIC_DIRECTORY`** – resolved from `publicDirectory()` at module top; the on-disk root for `/images/…` URLs.
- **`PNG_BYTES`** – a decodable PNG generated once in `beforeAll`; every upload without a broker is digested inline, so sharp must accept it.
- **`fileExists(url)`** – small helper that checks `existsSync` under `PUBLIC_DIRECTORY`; used as the primary assertion target.
- **`Door` interface / `doors` array** – a table of the five account/user write endpoints (PATCH/PUT `/account`, POST `/users`, PATCH/PUT `/users/{id}`) with method, route resolver, auth role, and minimal valid body. Drives the `describe.each` parametric tests.
- **`send(door, encoding, imageUrl)`** – builds a supertest request in either JSON or multipart encoding, attaching `imageUrl` as a plain string field for multipart.
- **`beforeEach`** – creates a "victim" product via multipart upload, captures its `imageUrl`, and asserts the file is on disk. Also seeds locales and authenticates admin + user.
- **`describe.each(doors)` block** – for every door × encoding (json, multipart): expects 422, a body mentioning `imageUrl`, and the victim file still present.
- **Product endpoint tests** – same 422 + file-survives assertions for `POST /products`, `PUT /products/{id}`, `PATCH /products/{id}`.
- **"what stays allowed" block** – four positive tests: null removes own image, omitting preserves it, PUT-without-`imageUrl` is lossless, multipart upload sets the image.

## Relationships

- **`tests/support/http.ts`** – supplies `api()` (supertest wrapper) and `authenticateAs()` used in every request.
- **`tests/support/file-sandbox.ts`** – `emptyFileSandbox` is the `afterEach` cleaner; the sandbox also assigns `publicDirectory` before this file's top-level code runs.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the test database for the file.
- **`src/modules/locales/tests/factories.ts`** – `givenLocale('en')` seeds the locale required by product/account endpoints.
- **`tests/support/images.ts`** – `decodablePng()` produces the upload bytes; `publicDirectory()` returns the images root.

## Notes

- The security assertion is **filesystem-level** (victim file still exists), not merely an HTTP status check.
- Both JSON and multipart encodings are tested because the multipart channel validates against the same JSON schema—an `imageUrl` text part is the same vector.
- Multipart bodies encode objects via `JSON.stringify` and booleans via `String(value)`; the test mirrors how a real form would serialize them.
- `PUBLIC_DIRECTORY` uses a non-null assertion (`!`) because `setup-file-sandbox.ts` guarantees it is set before this file executes; the `!` exists only to satisfy the type checker.
- The `doors` table deliberately uses the *minimal valid body* so that a 422 can only be attributable to `imageUrl`, not to a missing required field.
