---
source: src/modules/addresses/controllers/update-address.ts
sha256: ec56413bf28e88b964b4117d8ae539746255937dafa3e66bd7b113409b525cfc
generated_at: 2026-09-27T14:38:36.241287+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/update-address.ts

## Purpose

Defines the two HTTP handlers for `/account/addresses/:addressId` — a full **PUT** (replace) and a partial **PATCH** (merge) — by calling the shared `createUpdateController` factory once and destructuring the two resulting handlers.

## Key elements

- **`replaceAddress`** – The PUT handler. Validates the body against `ReplaceAddressBody` (Zod) and delegates to `addressUpdate` for a full overwrite of the entry.
- **`updateAddress`** – The PATCH handler. Validates the body against `UpdateAddressBody` (Zod) and delegates to `addressUpdate` for a partial merge.
- **`idFrom`** – Inline extractor that reads `request.params.addressId` (not the factory's default `:id`) and wraps it in `String()` to satisfy Express's `string | string[]` param typing.
- **`present`** – Identity function; the service's return value is forwarded to the response unchanged.

## Relationships

- **`create-update-controller.ts`** – Supplies the `createUpdateController` factory that assembles the PUT/PATCH pair (schema validation, param extraction, error shaping) from the options passed here.
- **`routes.ts`** – Consumes the exported `replaceAddress` and `updateAddress` and wires them to the `PUT` and `PATCH` methods on the address route.
- **`service.ts`** – Provides `addressUpdate`, the domain logic that performs the actual upsert. The controller passes the caller's id (`request.authContext!.id`), the entry id, and the (validated) changes object.

## Notes

- **Ownership is invisible to the client.** A non-owned entry returns the same 404 as a non-existent one; the check lives in `addressUpdate`, and leaking a distinct "exists but not yours" status would confirm the id belongs to someone.
- **No ObjectId validation.** `updateEntry` matches by plain string comparison, so a malformed id simply misses every entry and yields the standard 404.
- **`request.authContext!`** relies on upstream middleware to guarantee auth is populated; the non-null assertion is a contract, not a runtime guard.
