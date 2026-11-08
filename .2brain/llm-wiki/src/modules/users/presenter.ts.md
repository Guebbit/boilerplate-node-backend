---
source: src/modules/users/presenter.ts
sha256: 4a638a4b14e97c45f048df2d8a226be6fcf87823b9ea3402c6f17a23d4ef6258
generated_at: 2026-11-08T08:47:28.540929+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/presenter.ts

## Purpose

The presentation (shaping) layer that converts a stored `UserWire` record into the public `Account` or `User` contract. It enforces the "persistence wall": controllers reach account data only through `userService.toAccount`, which delegates here, never importing `./model` directly. This module is pure mapping — it contains no business rules, lookups, or `actions` logic (those live in `./services`).

## Key elements

- **`presentAccount(document, role)`** *(exported)* — Returns the `Account` shape for self-service views (`/account`, signup response). Shared fields only; no `actions` block, no staff flags.
- **`presentUser(document, role, actions)`** *(exported)* — Returns the `User` shape for staff reads/writes. Adds the caller-supplied `actions` block, `purgeAt`, and `purchaseHoldFlaggedAt` on top of shared fields.
- **`sharedFields(document, role)`** *(private)* — Maps the fields common to both contracts. ISO-stringifies the four `Date` fields redeclared in `UserWire`; omits any optional field that is absent. Performs the **only** PII decryption (phone) in the codebase.
- **`presentPurchaseHold(document)`** *(private)* — Emits the `purchaseHold` object only when a hold is still active (via `activeHoldOf`); otherwise contributes nothing. The identity of who set the hold is deliberately excluded (audit rows cover that).
- Both exports wrap their result in `carryVersion(document, …)` to stamp the persisted version.

## Relationships

- **`src/types/index.ts`** — Source of the `Account`, `User`, and `UserActions` type contracts this module produces.
- **`src/infrastructure/persistence/versioning.ts`** — Provides `carryVersion`, attached to every returned object.
- **`src/infrastructure/security/pii-encryption.ts`** — Provides `decryptPii`; used here (and only here) to decrypt the stored phone number before it reaches the wire.
- **`src/modules/users/model.ts`** — Provides the `UserWire` input type and `phoneAad` (the AAD binding for phone decryption).
- **`src/modules/users/services/purchase-hold.ts`** — Provides `activeHoldOf`, the single query this module runs to decide whether to surface a hold.
- **`src/modules/users/services/index.ts`** — The calling side: `userService.toAccount` is the documented entry point that routes controller requests into this presenter, keeping controllers away from `./model`.

## Notes

- **Phone decryption is single-point.** `sharedFields` is the only place a stored `phone` value is decrypted (using `NODE_PII_ENCRYPTION_KEY` and an AAD of the user's `id`). If you add a new read path, route it through here.
- **`role` is caller-supplied, never document-derived.** The caller resolves the tenant role from the membership store and passes it in; `null` is printed as a simple field omission.
- **Accepts `UserWire`, not `UserDocument`.** This intentionally lets lean/search-result rows (which lack password, tokens, 2FA material) flow through the same mapper without needing document methods.
- **Omitted fields are truly absent** (not `undefined`): every optional field uses the spread-omit pattern (`...(x === undefined ? {} : { x })`), so JSON serialization produces no nulls.
