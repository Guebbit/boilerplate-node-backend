---
source: src/modules/addresses/openapi.yaml
sha256: 0dbfd92fe645e115134fe9f500da9b6a622c1b0abc0110408e909e6f1bd3f399
generated_at: 2026-09-27T14:39:00.933271+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the **addresses** module. It specifies the REST surface for managing a per-user address book (list, add, replace, patch, remove) and encodes the module's core invariant: a non-empty book always has exactly one entry flagged `default`, which is the slot checkout ships to when no explicit `addressId` is supplied.

## Key elements

- **`/account/addresses`**
  - `GET` (`getAddresses`) — returns the full address book (`AddressesEnvelope`).
  - `POST` (`addAddress`) — appends an entry via `AddressInput`; first entry auto-defaults, later ones claim the slot only with `default: true`.
- **`/account/addresses/{addressId}`**
  - `PUT` (`replaceAddress`) — full replacement per RFC 9110 §9.3.4; body is `ReplaceAddressRequest`.
  - `PATCH` (`updateAddress`) — partial merge per RFC 7396; body is `UpdateAddressRequest` (all fields optional, `null` clears optional fields).
  - `DELETE` (`removeAddress`) — removes the entry; if it was the default, the oldest remaining entry is promoted.
- **Schemas (local to this spec):** `Address`, `AddressInput`, `UpdateAddressRequest`, `ReplaceAddressRequest` — all use `additionalProperties: false` and reference shared types for `id` and `country`.
- **Default-slot semantics** are documented inline on every operation: `true` claims, `false`/absent leaves the assignment unchanged (prevents accidentally demoting without a successor).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — every error response (`401`, `404`, `422`, `500`), the `Id` schema, and the `CountryCode` schema are `$ref`-imported from this file. This spec never redefines them.
- **`src/modules/cart/module.ts`** — the cart/checkout flow is the primary consumer of the default-address contract defined here: the `GET` description explicitly names the checkout use-case ("the one checkout ships to when no `addressId` is named"), tying the `default` flag on `Address` to cart behavior.

## Notes

- **PUT ≠ PATCH.** `ReplaceAddressRequest` requires all writable identity fields (omitting one clears it, per RFC 9110); `UpdateAddressRequest` leaves omitted fields untouched (RFC 7396). Do not interchange the two request bodies.
- **Nullable vs. optional in PATCH.** Only `label` and `phone` are `nullable: true`. The required fields (`fullName`, `street`, `city`, `zip`, `country`) are deliberately *not* nullable — sending `null` for them is a `422`, not a clear.
- **Cross-tenant 404, not 403.** A well-formed `addressId` that belongs to another user returns the same `404` as a fabricated id; there is no distinct "forbidden" path.
- **`default` is API-managed.** Clients never set the flag to `false` to "demote"; the invariant is enforced server-side on create, replace, update, and delete.
