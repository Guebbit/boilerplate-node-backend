---
source: src/modules/orders/services/reencrypt.ts
sha256: 0de44feae2289de05ab028f1e3d0e67595d1fabcbb6c9051c9f203ec088b5299
generated_at: 2026-10-15T11:09:56.937409+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/reencrypt.ts

## Purpose

Domain-level re-encryption service for orders. It collects every order's encrypted PII fields (addresses and notes) and delegates to the repository to rotate them onto the newest `NODE_PII_ENCRYPTION_KEY`. Exists so the generic infrastructure re-encryption machinery (which knows *how* to swap keys) can be driven by order-specific field discovery (which knows *which* fields and *how* they are AAD-bound).

## Key elements

- **`fieldsOf(order)`** *(private)* — Maps a single `OrderDocument` to an `EncryptedField[]`. Iterates `ADDRESS_PATHS` × `ADDRESS_FIELDS` plus the optional `notes` field, producing entries with a dotted `path`, the `stored` ciphertext, a `piiBinding` built from an order-id-scoped AAD, and a human-readable `label`.
- **`reencryptOrders(dryRun?)`** *(exported)* — Calls `orderRepository.reencrypt({ ring, fieldsOf }, dryRun)`. The `dryRun` flag (default `false`) lets the caller count affected rows without writing.

## Relationships

- **`@infrastructure/security/reencrypt`** — Imports the `EncryptedField` type that defines the shape of each field entry passed down to the generic re-encryption engine.
- **`@infrastructure/security/pii-encryption`** — Imports `getPiiEncryptionKeyRing` (source of key versions) and `piiBinding` (wraps an AAD string into the binding format the engine expects).
- **`../model`** — Imports the `OrderDocument` type used to shape `fieldsOf`'s parameter.
- **`../repository`** — Calls `orderRepository.reencrypt`, which performs the actual read-rotate-write loop across all orders.
- **`../pii`** — Imports `ADDRESS_FIELDS`, `ADDRESS_PATHS`, `addressAad`, and `notesAad`, the order-specific constants and AAD builders that determine *which* paths exist and *how* each is bound to the order id.
- **`./index.ts`** — Re-exports `reencryptOrders` so consumers can import it from the services barrel.
- **`../module.ts`** — Registers the service for DI / lifecycle within the orders module.

## Notes

- `fieldsOf` is deliberately **not** exported; it is a closure-shaped helper passed as a plain function reference to the repository. This keeps the PII-field mapping co-located with orders while the generic engine stays PII-agnostic.
- AAD is scoped per order (`_id`), so the same logical field (e.g. `shipping.street`) on two different orders produces **different** ciphertexts and **different** bindings. Re-encryption must recompute the binding with the *same* AAD before decrypting with the old key.
- The module docstring points to the ops script `reencrypt` (in `@infrastructure/security/reencrypt`) as the intended entry point for triggering this in production.
