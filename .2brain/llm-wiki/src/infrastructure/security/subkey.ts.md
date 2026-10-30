---
source: src/infrastructure/security/subkey.ts
sha256: 16449650c05e8ccddea05e4c8a4abc0e0e4860fee009ab94d9f07b0ab6c756f4
generated_at: 2026-10-29T02:16:29.627922+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/subkey.ts

## Purpose

Single-purpose module that derives a 32-byte HKDF-SHA256 subkey from a root secret, binding the result to a specific use via the `info` parameter (per NIST SP 800-57 §5.2 key-separation guidance). Caches results so repeated derivations on the request path are cheap.

## Key elements

- **`deriveSubkey(root: string, info: string): KeyObject`** — the sole export. Runs `hkdfSync('sha256', root, '', info, 32)` (empty salt, since roots are already high-entropy) and wraps the bytes in a `KeyObject` via `createSecretKey`. Returns the cached instance for identical `(root, info)` pairs.
- **`derived` (module-private)** — a `Map<string, Map<string, KeyObject>>` keyed first by root string, then by `info`. Exists because tests mutate the environment between cases and HKDF, while cheap, runs on the request path.
- **`KeyObject` return type** — immutable, and directly consumable by `createHmac` / `createCipheriv` without a `Buffer` round-trip.

## Relationships

- **`src/infrastructure/security/pseudonymise.ts`** — imports `deriveSubkey` to obtain a purpose-bound key for pseudonymisation. This import is why the module uses only relative imports (it sits on jest's `globalSetup` dependency chain).
- **`tests/unit/infrastructure/security/subkey.test.ts`** — unit-tests the derivation output and cache behavior.
- **`tests/cross-cutting/crypto-conformance.test.ts`** — exercises this module alongside other crypto primitives to verify conformance (e.g., RFC 5869 test vectors).

## Notes

- Salt is always the empty string. Do **not** pass a salt here; the design assumes the root is already high-entropy and the `info` label carries the separation.
- Cache is unbounded (no eviction). The key space is small in practice (few roots × few purposes), but a long-lived process with many distinct roots would grow this map.
- The `KeyObject` is immutable after creation; safe to share across async boundaries.
- `info` should be a stable, purpose-specific label (optionally including a scheme version). Changing the string invalidates the cached entry and yields a different key.
