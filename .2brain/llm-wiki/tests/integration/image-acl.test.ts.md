---
source: tests/integration/image-acl.test.ts
sha256: d9aff6d95e0d8628e5f45a31bba526df96f1a7c3c548a5def8a31ba465336ae9
generated_at: 2026-11-08T09:39:08.481653+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/image-acl.test.ts

## Purpose

Integration test that proves a client can never set `imageUrl` to a path of its own choosing (i.e., another record's stored file). It drives every write endpoint that accepts an image (`/account`, `/users`, `/products`) in both JSON and multipart encodings, asserts a 422, and—critically—asserts the victim's file still exists on disk. It also guards the inverse: legitimate image management (null-clear, omit-keeps, multipart upload) still works.

## Key elements

- **`doors` array** – Table of five route/method/auth/body combinations (PATCH/PUT `/account`, POST/PATCH/PUT `/users/{id}`) used to parameterize the "refuses" tests.
- **`send(door, encoding, imageUrl)`** – Builds either a `.send(json)` or `.field(...)` multipart request with the injected `imageUrl`.
- **`beforeEach`** – Creates a "victim" product via a real multipart upload so its `imageUrl` points to a file that actually exists.
- **`beforeAll` → `PNG_BYTES`** – Generates a sharp-decodable PNG once; required because uploads without a broker are digested inline.
- **`fileExists(url)`** – Resolves the URL against `PUBLIC_DIRECTORY` and checks `existsSync`; the primary security assertion.
- **`describe.each(doors)` + `it.each(['json','multipart'])`** – 5 doors × 2 encodings = 10 "refuses" cases.
- **Product-endpoint block** – Three additional cases (POST, PUT, PATCH `/products`) with both encodings, 6 assertions total.
- **"what stays allowed" block** – Four positive tests: `null` clears own image, omitting `imageUrl` preserves it, PUT-without-imageUrl keeps it while PUT-with-null clears it, and multipart `imageUpload` sets the image.

## Relationships

- **`tests/support/http.ts`** – Provides `api()` (supertest wrapper) and `authenticateAs()` for bearer-token requests.
- **`tests/support/file-sandbox.ts`** – `emptyFileSandbox` is the `afterEach` hook that wipes the temp public directory so each test starts with a clean filesystem.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` resets the test database at module load; also assigns `publicDirectory` before any test code runs.
- **`src/modules/locales/tests/factories.ts`** – `givenLocale('en')` seeds the locale record required by product and account creation.
- **`tests/support/images.ts`** – `decodablePng()` yields a valid PNG buffer; `publicDirectory()` returns the sandbox path used by `fileExists`.

## Notes

- The **file-system assertion** (`fileExists(victimUrl) === true`) is the real security check; a 422 alone would not catch a handler that deletes before validating.
- `PUBLIC_DIRECTORY` uses a `!` non-null assertion because `setupTestDb` (called at top level) guarantees the value is set before any test executes.
- Multipart encoding is tested explicitly because the multipart channel validates against the **same** JSON schema—an `imageUrl` text field in a multipart form is the identical attack surface.
- The "what stays allowed" section exists to prevent the validation fix from being over-broad (e.g., rejecting a valid `imageUrl: null` or breaking the omit-means-keep contract on PUT).
