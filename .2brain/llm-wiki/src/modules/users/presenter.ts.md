---
source: src/modules/users/presenter.ts
sha256: 4a638a4b14e97c45f048df2d8a226be6fcf87823b9ea3402c6f17a23d4ef6258
generated_at: 2026-10-29T06:14:17.458229+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/presenter.ts

## Purpose

The single presentation (shaping) layer for the users module: it converts a stored `UserWire` document into the public `Account` or `User` wire contract. It enforces the persistence wall — controllers reach the model only through the service, and the service delegates the actual field-mapping here. The file is pure: no I/O, no lookups, no rule evaluation; it only reshapes already-resolved data.

## Key elements

- **`presentAccount(document, role)`** *(exported)* — Produces an `Account` (self-view, e.g. `/account`). Wraps `sharedFields` with `carryVersion`.
- **`presentUser(document, role, actions)`** *(exported)* — Produces a `User` (staff view, e.g. `/users`). Adds the `actions` block (supplied by the caller from `./services/actions`), `purgeAt`, and `purchaseHoldFlaggedAt` on top of `sharedFields`.
- **`sharedFields(document, role)`** *(private)* — Maps the fields common to both contracts, ISO-stringifying `Date`-typed wire fields and conditionally omitting `undefined`/`null` optionals.
- **`presentPurchaseHold(document)`** *(private)* — Emits `purchaseHold` only when `activeHoldOf` returns a live hold; omits the key entirely otherwise.
- **`decryptPii(document.phone, phoneAad(document.id), …)`** — Inline call inside `sharedFields`; the one and only site where a stored (encrypted) phone number is decrypted before serialization.

## Relationships

- **`src/types/index.ts`** — Imports the output contract types `Account`, `User`, `UserActions`; the file's sole job is to produce values satisfying these.
- **`src/modules/users/model.ts`** — Imports `UserWire` (the input shape) and `phoneAad` (the AAD binding for PII decryption). The module doc notes controllers must *not* import this file directly; they go through the service.
- **`src/modules/users/services/index.ts`** — The service layer (`userService.toAccount`, etc.) is the intended caller of `presentAccount`/`presentUser`; this file does not import the service.
- **`src/infrastructure/persistence/versioning.ts`** — Imports `carryVersion` to stamp optimistic-concurrency version metadata onto both exported outputs.
- **`src/infrastructure/security/pii-encryption.ts`** — Imports `decryptPii`; this file is the sole decryption site for the phone field.
- **`src/modules/users/services/purchase-hold.ts`** — Imports `activeHoldOf` to decide whether a hold is currently in force (as opposed to merely having been set).
- **`src/modules/users/tests/integration/service.test.ts`** — Exercises these exports indirectly through the service layer.

## Notes

- **Input type is `UserWire`, not `UserDocument`.** Deliberate: both fully-hydrated documents and lean `search()` result rows satisfy `UserWire`, so the same mapping works for both paths without requiring document methods.
- **`role` is always caller-supplied**, read from the membership store by the service. The document itself holds no role; passing `null` simply omits the field.
- **`actions` is opaque here.** The rules that decide which actions a caller has live in `./services/actions`; this file only splices the pre-assembled block into the response.
- **Optional fields use conditional spread** (`...(cond ? { … } : {})`) rather than setting `null`/`undefined`, so absent fields are truly absent on the wire.
- **Phone decryption is the only PII decryption in the presentation path.** Any new PII field added to the wire must add its own `decryptPii` call here.
