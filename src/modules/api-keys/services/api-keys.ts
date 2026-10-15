/**
 * @module
 * Credential CRUD: list, mint (validates the subset, mints, audits), revoke (soft, audits).
 * Tenant-scoped throughout — every read and write narrows to `context.caller.tenantId`, which any
 * `apikeys.*` caller always carries (every key in the family is `scope: tenant` in
 * `shared/authorization-keys.yaml`, and `Caller.tenantId` is null only in platform scope).
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    fieldError,
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { getDefaultLocale } from '@infrastructure/i18n';
import { userService } from '@modules/users';
import type { TenantCallerContext } from '@types';
import type { PaginatedResult } from '@infrastructure/persistence/create-repository';
import { readAll, MAX_CONFIGURED_PAGE_SIZE } from '@infrastructure/persistence/search';
import { heldRules } from '@kernel/ability';
import { findRule, systemCallerContext } from '@kernel/permissions';
import type { Caller } from '@types';
import type { MintApiKeyRequest, ApiKeyCreated, ApiKey } from '@types';
import { apiKeyRepository } from '../repository';
import { mintApiKey, displayIdOf } from '../credentials';
import { apiKeysAuditActions } from '../audit';
import { ERROR_CODES } from '@api/error-codes';
import { presentApiKey } from '../presenter';
import { apiKeyMintedEmail, apiKeysRevokedEmail } from '../emails';
import type { SessionsRevokedReason } from '@modules/account';
import type { ApiKeyDocument } from '../model';

/**
 * Is the rule `id` something `caller` may hand out on a credential?
 *
 * Five conditions, all required: the rule must be DECLARED (an invented string grants nothing
 * while looking like it does — `assertDeclared`'s own reasoning), TENANT-scoped (a credential is
 * tenant-scoped only, see `docs/tools/security.md#machine-to-machine-credentials`), free of a
 * STEP-UP tier (a credential can never re-authenticate, so it would hold a permission that is
 * always refused), one a credential can use at all (`credential: false` marks the rules whose
 * routes are session-only), and actually HELD by the minter right now.
 *
 * `heldRules` is the literal rules the ability was built from, so a minter holding the own-rows
 * `read:Order` cannot mint a credential for the staff `display:Order` they lack.
 */
const isMintable = (id: string, caller: Caller): boolean => {
    const declared = findRule(id);
    return (
        declared?.scope === 'tenant' &&
        declared.stepUp === undefined &&
        declared.credential !== false &&
        heldRules(caller).has(id)
    );
};

/**
 * The latest moment a credential may expire at: one year from `now`. A calendar year, not a count
 * of days, so "one year" means what a person reading the contract thinks it means.
 *
 * @param now - the clock, injectable for tests
 */
export const latestExpiry = (now: Date = new Date()): Date => {
    const limit = new Date(now);
    limit.setFullYear(limit.getFullYear() + 1);
    return limit;
};

/**
 * Tell the minter, out of band, that a credential now exists. Fire-and-forget: the key already
 * exists, and a queue that is briefly down must not turn a mint into an error. The address is
 * resolved fresh from the minter's id, never stored on the key.
 *
 * @param minterId - who minted it
 * @param apiKey - the stored credential
 */
const notifyMinted = (minterId: string, apiKey: ApiKeyDocument): void => {
    void userService
        .getById(minterId)
        .then((minter) => {
            if (!minter) return;
            const locale = minter.locale ?? getDefaultLocale();
            // Intl: a long, locale-aware date, so the mail reads the way the recipient's own does.
            // https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
            const expires = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
                apiKey.expiresAt
            );
            const mail = apiKeyMintedEmail(
                locale,
                apiKey.name,
                displayIdOf(apiKey.publicPrefix),
                expires
            );
            return enqueueEmail(
                { to: minter.email, subject: mail.subject },
                mail.template,
                mail.data
            );
        })
        .catch((error: unknown) => {
            logger.warn({ message: 'Could not mail the minter of a new API key.', error });
        });
};

/**
 * Every credential this account minted, newest first — for the account's own data export.
 * Metadata only, never a secret — the same transform the admin list already applies
 * (`model.ts#applyApiKeyTransform` omits `hash`) drops the secret here too; nothing
 * module-specific to redact beyond what the wire shape already never carries. Unpaginated on
 * purpose: an export is a one-time full answer, not a listing a client pages through.
 *
 * @param userId - the caller's own id
 */
export const findOwnApiKeys = (userId: string): Promise<ApiKey[]> =>
    readAll(
        (page) =>
            apiKeyRepository
                .search(
                    { page, pageSize: MAX_CONFIGURED_PAGE_SIZE },
                    { createdByUserId: userId },
                    { createdAt: -1 }
                )
                .then((result) => result.items),
        MAX_CONFIGURED_PAGE_SIZE
    );

/**
 * What a hard account deletion owes this collection — the `personalData.erase` hook (see
 * `module.ts`'s manifest), joining the caller's own hard-delete transaction.
 */
export const apiKeysDeleteByUserId = (userId: string, session: ClientSession): Promise<void> =>
    apiKeyRepository.deleteByUserId(userId, session);

/** List this tenant's credentials, newest first. Never returns a secret — see `model.ts`'s transform. */
export const list = (
    context: TenantCallerContext,
    filters: { page?: unknown; pageSize?: unknown }
): Promise<PaginatedResult<ApiKey>> =>
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
    // A credential that never expires is one that is never rotated: bounded at mint, not at use.
    if (new Date(body.expiresAt) > latestExpiry())
        return Promise.resolve(
            generateReject(422, [fieldError('expiresAt', t('api-keys.expiry-too-far'))])
        );

    const invalid = body.permissions.filter((key) => !isMintable(key, context.caller));
    if (invalid.length > 0)
        return Promise.resolve(
            // `permissions` beside `field`: a client gives each refused key its own message.
            generateReject(422, [
                fieldError(
                    'permissions',
                    t('api-keys.permission-not-mintable'),
                    ERROR_CODES.VALIDATION_ERROR,
                    { permissions: invalid }
                )
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
            // `router.use(getAuth, isAuth)` demands a live session before any route here is
            // reached, so `id` is never the stranger case `Caller` otherwise allows for.
            createdByUserId: context.caller.id!,
            expiresAt: new Date(body.expiresAt)
        })
        .then((apiKey) => {
            notifyMinted(context.caller.id!, apiKey);
            recordAudit(context, {
                action: apiKeysAuditActions.ADMIN_API_KEY_MINTED,
                outcome: 'success',
                targetType: 'api_key',
                targetId: String(apiKey._id),
                metadata: { permissions: body.permissions }
            });
            return generateSuccess(
                {
                    ...presentApiKey(apiKey),
                    secret: plaintext
                },
                201
            );
        });
};

/**
 * Revoke a credential. Idempotent: revoking an already-revoked key is a no-op success, not a 404.
 *
 * Not protected like a staff account: revoking only takes access away, so an administrator may
 * revoke a fellow administrator's leaked key. Stripe and GitHub let any org admin do the same.
 * The route's own key and the tenant check are the whole gate.
 */
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
            recordAudit(context, {
                action: apiKeysAuditActions.ADMIN_API_KEY_REVOKED,
                outcome: 'success',
                targetType: 'api_key',
                targetId: id,
                metadata: { credential: displayIdOf(apiKey.publicPrefix) }
            });
            return generateSuccess(undefined);
        });
    });

/**
 * Tell the owner which credentials just stopped working, and why. Fire-and-forget like
 * {@link notifyMinted}: the revocation already holds.
 *
 * @param userId - the minter
 * @param reason - which event revoked them
 * @param revoked - the credentials that were live and are now revoked
 */
const notifyRevoked = (
    userId: string,
    reason: SessionsRevokedReason,
    revoked: readonly ApiKeyDocument[]
): Promise<void> =>
    userService
        .getById(userId)
        .then((owner) => {
            if (!owner) return;
            const mail = apiKeysRevokedEmail(
                owner.locale ?? getDefaultLocale(),
                reason,
                revoked.map((key) => `${key.name} (${displayIdOf(key.publicPrefix)})`)
            );
            return enqueueEmail(
                { to: owner.email, subject: mail.subject },
                mail.template,
                mail.data
            );
        })
        .catch((error: unknown) => {
            logger.warn({
                message: 'Could not mail the owner of revoked API keys.',
                userId,
                error
            });
        });

/**
 * Revoke every live credential a person minted — what `account` asks for when their sessions are
 * ended wholesale (logout everywhere, a password reset): both mean "I may be compromised", and a
 * key outlives every session. Audited as the system's act, then the owner is mailed the list.
 * A person with nothing live gets neither.
 *
 * @param userId - the minter
 * @param reason - which `account` event asked for this
 */
export const revokeAllMintedBy = (userId: string, reason: SessionsRevokedReason): Promise<void> =>
    apiKeyRepository.findActiveByMinter(userId).then((live) => {
        if (live.length === 0) return undefined;

        return apiKeyRepository
            .revokeMany(
                live.map((key) => String(key._id)),
                new Date()
            )
            .then(() => {
                recordAudit(systemCallerContext('ApiKey'), {
                    action: apiKeysAuditActions.SYSTEM_API_KEYS_REVOKED_ON_COMPROMISE,
                    outcome: 'success',
                    targetType: 'user',
                    targetId: userId,
                    metadata: { count: live.length, reason }
                });
                return notifyRevoked(userId, reason, live);
            });
    });
