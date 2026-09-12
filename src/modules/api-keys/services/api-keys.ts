/**
 * @module
 * Credential CRUD: list, mint (validates the subset, mints, audits), revoke (soft, audits).
 * Tenant-scoped throughout — every read and write narrows to `context.caller.tenantId`, which an
 * `apikeys.read`/`apikeys.manage` caller always carries (both keys are `scope: tenant` in
 * `shared/authorization-keys.yaml`, and `Caller.tenantId` is null only in platform scope).
 */

import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import type { TenantCallerContext } from '@infrastructure/http/request';
import type { PaginatedResult } from '@infrastructure/persistence/create-repository';
import { holdsKey } from '@kernel/ability';
import { findKey } from '@kernel/permissions';
import type { Caller } from '@types';
import type { MintApiKeyRequest, ApiKeyCreated } from '@types';
import type { ApiKeyDocument } from '../model';
import { apiKeyRepository } from '../repository';
import { mintApiKey, displayIdOf } from '../credentials';
import { apiKeysAuditActions } from '../audit';

/**
 * Is `key` something `caller` may hand out on a credential?
 *
 * Three conditions, all required: the key must be DECLARED (an invented string grants nothing
 * while looking like it does — `assertDeclared`'s own reasoning), TENANT-scoped (a credential is
 * tenant-scoped only, see `docs/tools/security.md#machine-to-machine-credentials`), and actually
 * HELD by the minter right now. `holdsKey` rather than a raw `permissions.includes` — a caller
 * holding the wildcard (`all.manage`) may mint a key naming any one specific key beneath it, the
 * same way every other permission check in this codebase already resolves `manage`.
 */
const isMintable = (key: string, caller: Caller): boolean =>
    findKey(key)?.scope === 'tenant' && holdsKey(caller, key);

/** List this tenant's credentials, newest first. Never returns a secret — see `model.ts`'s transform. */
export const list = (
    context: TenantCallerContext,
    filters: { page?: unknown; pageSize?: unknown }
): Promise<PaginatedResult<ApiKeyDocument>> =>
    apiKeyRepository.search(
        filters,
        { tenant: context.caller.tenantId },
        { createdAt: -1, _id: -1 }
    );

/**
 * Mint a credential. `body.permissions` must be a non-empty subset of what the minter currently
 * holds — enforced here, at mint time; re-checked again on every request the key later makes
 * (`module.ts`'s `CredentialResolver`), so a minter demoted after the fact cannot leave a
 * key behind that still reaches further than they now can.
 *
 * @returns a 422 naming the offending keys when `permissions` asks for anything the minter
 *   doesn't hold, or isn't a declared tenant key at all
 */
export const mint = (
    body: MintApiKeyRequest,
    context: TenantCallerContext
): Promise<ResponseSuccess<ApiKeyCreated> | ResponseReject> => {
    const invalid = body.permissions.filter((key) => !isMintable(key, context.caller));
    if (invalid.length > 0)
        return Promise.resolve(
            generateReject(422, [
                {
                    code: 'VALIDATION_ERROR',
                    message: t('api-keys.permission-not-mintable'),
                    details: { permissions: invalid }
                }
            ])
        );

    const { plaintext, publicPrefix, hash } = mintApiKey();

    return apiKeyRepository
        .create({
            tenant: context.caller.tenantId,
            name: body.name,
            publicPrefix,
            hash,
            permissions: body.permissions,
            createdByUserId: context.caller.id!,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined
        } as Partial<ApiKeyDocument>)
        .then((apiKey) => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: apiKeysAuditActions.ADMIN_API_KEY_MINTED,
                    outcome: 'success',
                    target_type: 'api_key',
                    target_id: String(apiKey._id),
                    metadata: { permissions: body.permissions }
                })
            );
            return generateSuccess(
                {
                    ...(apiKey.toJSON() as ApiKeyCreated),
                    secret: plaintext
                },
                201
            );
        });
};

/** Revoke a credential. Idempotent: revoking an already-revoked key is a no-op success, not a 404. */
export const revoke = (
    id: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    apiKeyRepository.findById(id).then((apiKey) => {
        if (apiKey?.tenant !== context.caller.tenantId)
            return generateReject(404, [t('generic.error-not-found')]);

        if (apiKey.revokedAt) return generateSuccess(undefined);

        apiKey.revokedAt = new Date();
        return apiKeyRepository.save(apiKey).then(() => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: apiKeysAuditActions.ADMIN_API_KEY_REVOKED,
                    outcome: 'success',
                    target_type: 'api_key',
                    target_id: id,
                    metadata: { credential: displayIdOf(apiKey.publicPrefix) }
                })
            );
            return generateSuccess(undefined);
        });
    });
