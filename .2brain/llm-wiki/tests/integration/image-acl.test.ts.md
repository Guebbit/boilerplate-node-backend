---
source: tests/integration/image-acl.test.ts
sha256: c092b39b41ac35d21d5e7222660ce1acc77d0ab901e470a59968b8e15cd0dad5
generated_at: 2026-10-15T12:47:22.457032+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/image-acl.test.ts

## Purpose

Integration test enforcing a cross-module security rule: a client may never supply a `imageUrl` path in a write body. It drives every route that accepts an image (account, users, products) with a malicious `imageUrl` pointing at another record's file, over both JSON and multipart encodings, and asserts the response is 422 **and** the victim's file still exists on disk. It also pins the positive contract: `imageUrl: null` removes only the record's own image, and omitting the field leaves it untouched.

## Key elements

- **`doors`** – Array of `{ name, method, route, as, body }` objects describing every write endpoint that can accept an `imageUrl` (PATCH/PUT `/account`, POST/PATCH/PUT `/users`, plus three product routes defined inline).
- **`send(door, encoding, imageUrl)`** – Builds a Supertest request in either JSON or multipart encoding, attaching `imageUrl` as the attack payload.
- **`fileExists(url)`** – Resolves a `/images/…` URL against `PUBLIC_DIRECTORY` and checks `existsSync`; the primary security assertion helper.
- **`PNG_BYTES`** – A 4×4 PNG generated via `sharp` in `beforeAll`; every upload path must accept a decodable image inline.
- **`beforeEach`** – Seeds a locale, authenticates admin + user, uploads a "victim" product image, and captures its stored URL.
- **`describe('what stays allowed')`** – Positive tests: `null` clears own image, omission preserves it, PUT is lossless without `imageUrl`, multipart `imageUpload` attachment sets the image.

## Relationships

- **`tests/support/http.ts`** – Provides `api()` (Supertest instance) and `authenticateAs()` (role-scoped bearer tokens).
- **`tests/support/file-sandbox.ts`** – `emptyFileSandbox` runs in `afterEach` to isolate filesystem state between tests.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory test database before any test runs.
- **`src/infrastructure/config/store.ts`** – `currentEnvironment().NODE_PUBLIC_PATH` resolves the public directory root used by `fileExists`.
- **`src/modules/locales/repository.ts`** – `localeRepository.create` seeds the `en` locale required by product writes.
- **`src/modules/locales/factories.ts`** – `makeLocale` builds the locale entity for that seed.
- **`src/modules/locales/services/index.ts`** – `localeService.setTranslatables` registers product translatable-field config so product writes exercise the locale pipeline.
- **`src/modules/products/repository.ts`** – `productRepository.existsById / writeTranslatedFields / markEdited` supply the hooks the locale service calls during product creation.

## Notes

- The non-null assertion on `NODE_PUBLIC_PATH!` is safe because `tests/support/setup-file-sandbox.ts` (imported by the test-runner setup, not by this file) guarantees the value is set before any top-level test code executes.
- The security assertion is deliberately on the **filesystem**, not just the 422 status: a hypothetical bug that returns 422 but still deletes the old file would be caught.
- Multipart encoding serialises every body value to a string (objects via `JSON.stringify`), mirroring how a browser form would encode them; this ensures the multipart channel is not a bypass.
- The product-route sub-test (`it.each(['POST /products', …])`) is written imperatively rather than through the `doors` table because product bodies include a `translations` object and additional required fields, making them incompatible with the uniform `send` helper.
