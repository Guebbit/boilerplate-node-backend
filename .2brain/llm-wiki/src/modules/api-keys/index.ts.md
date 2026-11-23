---
source: src/modules/api-keys/index.ts
source_sha256: d2f7cbef75b497ebc0663df243e7e8503c1f12bc795df69dd01bc368ff56658d
context_sha256: 5f3a5fb4a7262d8f951f501ee3a895ce3bde3aef005f7a18b9314590013efb99
generated_at: 2026-11-22T04:21:29.368697+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/index.ts

## Purpose
Public barrel for the api-keys module. It is the only surface sibling modules may import from. It re-exports the module's services, email helpers, and model types. Per its header comment, credential minting and verification stays internal to the module and is deliberately not exported here.

## Key elements
- `export * from './services'`: re-exports the module's service layer.
- `export * from './emails'`: re-exports the email-related exports.
- `export type * from './model'`: re-exports model types only, with no runtime values.

## Relationships
- `src/modules/api-keys/services/index.ts`: its exports are passed through to consumers.
- `src/modules/api-keys/emails.ts`: its exports are passed through to consumers.
- `src/modules/api-keys/model.ts`: only its types are exposed.

## Notes
- Only add exports here if they are meant to be part of the module's public surface. Other modules must not reach into the module's internals.
- The header comment says credential handling is kept out of this barrel and that a `CredentialResolver` is wired from an `onRegistered` hook elsewhere in the module. Neither is imported here.
