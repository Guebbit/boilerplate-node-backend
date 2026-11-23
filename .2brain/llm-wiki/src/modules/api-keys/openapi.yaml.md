---
source: src/modules/api-keys/openapi.yaml
source_sha256: be7c9da6feae42fc24a44c64b08e4671605f881f8ad1aca71667bd47af3f6ff8
context_sha256: c6372bee225338e111c35c74b68ba93cf882b70434f5b3e1405c399969260e83
generated_at: 2026-11-22T04:22:16.671301+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/openapi.yaml

## Purpose
OpenAPI 3.1 contract for the `api-keys` module (version `0.1.0`). It defines the endpoints for listing, minting, reading and revoking machine-to-machine credentials (`sk_<prefix>_<secret>`), along with the schemas those endpoints use. It also contributes this module's section of the account data export.

## Key elements
- **Tag `ApiKeys`** (`x-family: Core`): groups all operations in this module.
- **`x-personal-data.apiKeys`**: an array of `ExportApiKey`. The bundler adds it to `AccountExportResponse` for `POST /account/export`. It carries metadata only, with no `hash` and no secret.
- **`GET /api-keys`** (`listApiKeys`, `read:ApiKey`):
  - Paginated through the shared `PageParam` and `PageSizeParam`.
  - Takes a `sort` query parameter (`ApiKeySort`) that is comma-separated (`form`, `explode: false`).
  - Newest first by default.
  - Never returns the secret.
- **`POST /api-keys`** (`createApiKey`, `create:ApiKey`):
  - Returns `201` with `ApiKeyCreated` and a `Location` header. This is the only response that carries the plaintext secret.
  - `permissions` must be a non-empty subset of the caller's current tenant permissions.
  - `expiresAt` is required and at most one year ahead.
  - It needs a critically fresh session (`401 REAUTH_REQUIRED`).
  - It refuses permissions no credential can use. Examples are permissions that demand a freshly proved session, and session-only ones such as `read:Stats`, the inbox and the key list itself. The refusal is a `422`.
- **`GET /api-keys/{id}`** (`getApiKey`, `read:ApiKey`): returns one `ApiKey`. Another shop's key, an unknown id and a malformed id all give the same `404`.
- **`DELETE /api-keys/{id}`** (`revokeApiKey`, `delete:ApiKey`): a soft revoke that stamps `revokedAt` and takes effect immediately. It returns `204`, and the row and its audit history stay readable.
- **Schemas**:
  - `ApiKeySort`: an array of 1–3 entries from `createdAt`, `expiresAt` and `lastUsedAt`, each optionally prefixed with `-`.
  - `ApiKeyStatus`: `active`, `expired`, `revoked` or `suspended`.
  - `ApiKey`: a closed object with `id`, `name`, `publicPrefix`, `status`, `permissions`, the timestamps and `actions`.
  - `ApiKeyActions`: holds `revoke`, a server-computed boolean for the caller.
  - `ExportApiKey`: the same as `ApiKey` but without `actions`.
  - `CreateApiKeyRequest`, `ApiKeyCreated` and `ApiKeysResponse` are referenced by the paths. Their definitions are not visible in the excerpt.

## Relationships
- Neighbor `src/modules/api-keys/authorization.yaml` is not referenced directly in the visible content. The operations' `bearerAuth` scopes (`read:ApiKey`, `create:ApiKey`, `delete:ApiKey`) use the `<action>:<Subject>` form, which that file may define.

## Notes
- The operations also `$ref` shared parameters, responses, a header and the `Id` schema from a common root contract file (`PageParam`, `PageSizeParam`, `IdPathParam`, `Unauthorized`, `Forbidden`, `NotFound`, `ValidationError`, `NoContent`, `Location`, `Id`).
- `ApiKeyStatus` is evaluated in the order revoked, expired, then suspended. A revoked key never reads as `suspended`.
- `suspended` means the minter is banned, soft-deleted or erased. Such a key gets `401`, and it comes back by itself if the minter is restored or unbanned.
- A key's permissions are re-floored against the minter's current permissions on every request. `ApiKey.permissions` is only the snapshot from mint time.
- The key list and key reads are described as never exposing the secret.
- Keys are revoked automatically when their minter logs out everywhere, resets their password or reports an email change as not theirs. A staff member's keys are revoked when they lose their last authenticator app.
- The `createApiKey` operation has an empty `x-error-codes:` entry.
