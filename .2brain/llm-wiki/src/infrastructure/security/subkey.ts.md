---
source: src/infrastructure/security/subkey.ts
sha256: 96a03a49b40e0cbef03b1362524a8b07c92e3bfacef693525708112565ac9a81
generated_at: 2026-10-14T08:17:48.414632+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/subkey.ts

## Purpose

Single entry point for deriving purpose-bound subkeys from a root secret via HKDF-SHA256 (RFC 5869). Enforces key separation (one root key never directly serves two purposes, per NIST SP 800-57 §5.2) by binding each derived key to an explicit `info` label. Caches results to avoid re-derivation on the request path.

## Key elements

- **`deriveSubkey(root: string, info: string): KeyObject`** — the sole export. Runs `hkdfSync('sha256', root, '', info, 32)` and wraps the output in an immutable `KeyObject` via `createSecretKey`. Returns the same instance for repeated calls with the same arguments.
- **`derived: Map<string, Map<string, KeyObject>>`** — module-level cache keyed by root string → info string. Never invalidated; lives for the process lifetime.
- Uses only `node:crypto` (`createSecretKey`, `hkdfSync`); no external dependencies.

## Relationships

- **`src/infrastructure/security/pseudonymise.ts`** — caller; imports `deriveSubkey` to obtain a pseudonymisation key from a shared root.
- **`src/infrastructure/security/versioned-secret.ts`** — caller; derives a versioned-encryption subkey.
- **`src/modules/account/two-factor/delivered-codes.ts`** — caller; derives the key used to seal delivered 2FA codes.
- **`tests/unit/infrastructure/security/subkey.test.ts`** — unit test; exercises `deriveSubkey` across multiple root/info combinations.

## Notes

- The salt is intentionally empty (`''`) because the root secrets are already high-entropy; `info` carries all separation.
- Returns a `KeyObject`, not a `Buffer` — it is immutable and directly consumable by `createHmac` / `createCipheriv` without re-wrapping.
- The file sits on jest's `globalSetup` chain and `pseudonymise.ts` is a transitive dependency; the doc comment flags this as the reason for the **relative-imports-only** convention (avoid circular or absolute-import resolution issues under the jest config).
- Cache is never cleared. If a test mutates the root secret between cases it must use a *different* root string; mutating the same string in place will return a stale key.
