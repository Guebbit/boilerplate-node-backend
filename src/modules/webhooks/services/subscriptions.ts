/**
 * @module
 * Subscription CRUD: list, get, create (mints the ring's first secret), update (url, description
 * and event filter only), the two on/off actions (`enable`/`disable`), the two secret-ring
 * actions (`createSecret`/`removeSecret`), remove. Tenant-scoped throughout —
 * every read and write narrows to `context.caller.tenantId`, which any `webhooks.*` caller always
 * carries (every key in the family is `scope: tenant` in `shared/authorization-keys.yaml`, and
 * `Caller.tenantId` is null only in platform scope — see its own doc comment).
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    fieldError,
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { auditChanges } from '@infrastructure/observability/audit-changes';
import type { TenantCallerContext } from '@types';
import type { PaginatedResult } from '@infrastructure/persistence/create-repository';
import type {
    CreateWebhookSubscriptionRequest,
    UpdateWebhookSubscriptionRequest,
    WebhookSubscription
} from '@types';
import type { WebhookSubscriptionDocument } from '../model';
import { webhookSubscriptionRepository } from '../repository';
import { liveRingEntries, mintRingSecret, removeRingSecret } from '../secrets';
import { getWebhookSubscriptionCap } from '../config';
import { resolveSafeOutboundTarget, SsrfRefusedError } from '@infrastructure/adapters/ssrf-guard';
import { clearedOrValue } from '@infrastructure/persistence/changes';
import { ERROR_CODES } from '@api/error-codes';
import { webhooksAuditActions } from '../audit';
import { unknownEventTypes } from './catalogue';
import { standingOn, viewSubscription, withSubscriptionActions } from './actions';

/** A subscription alongside whichever plaintext secrets this call just minted — shown once. */
export interface SubscriptionWithMintedSecrets {
    subscription: WebhookSubscriptionDocument;
    /** Set only by `create` — the ring's first secret. */
    secret?: string;
    /** Set only by `createSecret` — a newly added secret. */
    newSecret?: string;
}

/** How long the create/update check may spend resolving the URL's host before refusing it. */
const URL_CHECK_TIMEOUT_MS = 5000;

/**
 * Refuses a subscription URL the delivery-time SSRF guard would refuse anyway — fail fast where
 * the operator is looking (OWASP SSRF: validate on input, and again at connection). The delivery
 * check stays: DNS can change after this one passes.
 *
 * @param url - the address an operator asked deliveries to go to
 * @returns a 422 naming the URL field, or `undefined` when the URL is fine
 */
const refuseUnsafeUrl = (url: string): Promise<ResponseReject | undefined> =>
    resolveSafeOutboundTarget(url, AbortSignal.timeout(URL_CHECK_TIMEOUT_MS))
        .then((): undefined => undefined)
        .catch((error: unknown) => {
            // The caller learns only that the URL was refused: a reason or a resolved address
            // would map the internal network for whoever is probing it. The operator reads both here.
            logger.warn({
                message: 'A webhook URL was refused.',
                reason: error instanceof SsrfRefusedError ? error.reason : 'unverifiable',
                detail: error instanceof Error ? error.message : String(error)
            });
            // A timeout is not an SsrfRefusedError, but it refuses the same way: nothing
            // verified the target, so nothing is subscribed to it.
            return generateReject(422, [fieldError('url', t('webhooks.url-refused'))]);
        });

/**
 * Refuses an event filter naming something the catalogue does not list: such a subscription would
 * never fire, and the caller would only learn it by waiting (Stripe's `enabled_events` and
 * Shopify's topics refuse the same way).
 *
 * @param eventTypes - the requested filter; `undefined` on a partial update that leaves it alone
 * @returns a 422 naming the `eventTypes` field, or `undefined` when every name is known
 */
const refuseUnknownEvents = (
    eventTypes: readonly string[] | undefined
): ResponseReject | undefined => {
    const unknown = unknownEventTypes(eventTypes ?? []);
    if (unknown.length === 0) return undefined;
    return generateReject(422, [
        fieldError('eventTypes', t('webhooks.unknown-event-types', { names: unknown.join(', ') }))
    ]);
};

/** What `GET /webhooks/subscriptions` accepts, mirroring the query parameters `openapi.yaml` declares. */
export interface SubscriptionListFilters {
    enabled?: boolean;
    autoDisabled?: boolean;
    sort?: string[];
    page?: unknown;
    pageSize?: unknown;
}

/**
 * List this tenant's subscriptions with the caller's `actions`, newest first unless `sort` says
 * otherwise.
 *
 * `enabled` is remapped to the repository's `disabled` presence filter here: the stored fact is
 * `disabledAt`, and "enabled" is its absence.
 */
export const list = (
    context: TenantCallerContext,
    filters: SubscriptionListFilters
): Promise<PaginatedResult<WebhookSubscription>> => {
    const standing = standingOn(context.caller);
    // No explicit sort argument: the `sort` filter goes through the repository's `sortable`
    // whitelist, and an absent one falls back to the shared newest-first default.
    return webhookSubscriptionRepository
        .search(
            {
                disabled: filters.enabled === undefined ? undefined : !filters.enabled,
                autoDisabled: filters.autoDisabled,
                sort: filters.sort,
                page: filters.page,
                pageSize: filters.pageSize
            },
            { tenant: context.caller.tenantId }
        )
        .then(({ items, meta }) => ({
            items: items.map((row) => withSubscriptionActions(row, standing)),
            meta
        }));
};

/**
 * One subscription of this tenant, with the caller's `actions`.
 *
 * @returns the subscription, or `undefined` outside this tenant's rows: an unknown id and another
 *   shop's id are indistinguishable
 */
export const getById = (
    id: string,
    context: TenantCallerContext
): Promise<WebhookSubscription | undefined> =>
    webhookSubscriptionRepository
        .findByIdInTenant(id, context.caller.tenantId)
        .then((subscription) =>
            subscription ? viewSubscription(subscription, context.caller) : undefined
        );

/** The 409 both cap checks in {@link create} answer with. */
const rejectLimitReached = (): ResponseReject =>
    generateReject(409, [
        {
            code: ERROR_CODES.WEBHOOK_SUBSCRIPTION_LIMIT_REACHED,
            message: t('webhooks.subscription-cap-reached')
        }
    ]);

/**
 * This subscription's position among its tenant's rows, oldest first. `_id` is total-ordered
 * across the collection (Mongo's ObjectId embeds an insertion-time-ish counter), so counting every
 * row at-or-before this one's `_id` gives a rank that is stable even for two creates that raced
 * past the same pre-check below — whichever insert lands with the higher rank is the one over cap,
 * regardless of which caller's request reached this line first.
 */
const insertionRank = (
    subscriptionId: WebhookSubscriptionDocument['_id'],
    tenant: string
): Promise<number> =>
    webhookSubscriptionRepository.count({ tenant, _id: { $lte: subscriptionId } });

/**
 * Undo a create that turned out to be over cap once ranked against whatever else just landed —
 * the follow-up half of the race guard `create` below relies on.
 */
const rollbackOverCap = (subscription: WebhookSubscriptionDocument): Promise<ResponseReject> =>
    webhookSubscriptionRepository.deleteOne(subscription).then(rejectLimitReached);

/**
 * Finish a create once the row is written: reject and roll it back if it lands over cap once
 * ranked against whatever else just landed, otherwise audit the creation and hand back the
 * envelope.
 *
 * `async`/`await` over chaining despite the single await, against this repo's usual preference:
 * TypeScript's contextual typing of a `.then` callback does not distribute over the union this
 * returns, and silently narrows to just one branch instead — `await` checks each `return` against
 * the declared type directly and does not have the problem.
 */
const finalizeCreate = async (
    subscription: WebhookSubscriptionDocument,
    plaintext: string,
    tenant: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<SubscriptionWithMintedSecrets> | ResponseReject> => {
    const rank = await insertionRank(subscription._id, tenant);
    if (rank > getWebhookSubscriptionCap()) return rollbackOverCap(subscription);

    recordAudit(context, {
        action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_CREATED,
        outcome: 'success',
        targetType: 'webhook_subscription',
        targetId: String(subscription._id)
    });
    return generateSuccess({ subscription, secret: plaintext }, 201);
};

/**
 * Create a subscription. Mints the ring's first secret and hands the plaintext back once — the
 * only response that ever carries it (see `openapi.yaml`'s `WebhookSubscriptionCreated`).
 *
 * The cap is enforced twice: a `count` before the insert rejects the common case (already over
 * cap, nothing racing) without writing a row at all, and {@link insertionRank} after the insert
 * closes the actual race — two callers both reading a `count` just under the cap can both pass
 * this first check and both insert, but only `getWebhookSubscriptionCap()` of the resulting rows
 * can ever rank within it, so exactly one guard's-worth of rows survives regardless of how many
 * creates land in the same instant.
 *
 * @returns a 409 `WEBHOOK_SUBSCRIPTION_LIMIT_REACHED` once this tenant is at
 *   `getWebhookSubscriptionCap()` (deleting one lets the same request through) — the fan-out
 *   guard this module exists for: one event x N subscriptions is N deliveries.
 */
export const create = (
    body: CreateWebhookSubscriptionRequest,
    context: TenantCallerContext
): Promise<ResponseSuccess<SubscriptionWithMintedSecrets> | ResponseReject> => {
    const tenant = context.caller.tenantId;
    const unknownEvents = refuseUnknownEvents(body.eventTypes);
    if (unknownEvents) return Promise.resolve(unknownEvents);

    return webhookSubscriptionRepository.count({ tenant }).then(async (count) => {
        if (count >= getWebhookSubscriptionCap()) return rejectLimitReached();

        const refusal = await refuseUnsafeUrl(body.url);
        if (refusal) return refusal;

        const { entry, plaintext } = mintRingSecret();
        // A pointer, not a copy: who configured the integration, never their email.
        // `context.caller.id` absent (a stranger, never reachable through this tenant-scoped
        // route in practice) leaves it unset.
        return webhookSubscriptionRepository
            .create({
                tenant,
                url: body.url,
                description: body.description,
                eventTypes: body.eventTypes,
                ownerUserId: context.caller.id ?? undefined,
                secrets: [entry]
            })
            .then((subscription) => finalizeCreate(subscription, plaintext, tenant, context));
    });
};

/**
 * The fields an update is audited for. The event filter is configuration, so it is recorded by
 * value; the url is a bearer secret (a receiver's address can carry a token) and the description
 * is free text, so both are recorded by name only.
 */
const AUDITED_FIELDS = {
    valued: ['eventTypes'],
    named: ['url', 'description']
} as const;

/**
 * Update a subscription: any of url/description/eventTypes. The secret ring is never touched here
 * (see {@link createSecret}/{@link removeSecret}), and neither is whether the subscription is on
 * (see {@link enable}/{@link disable}).
 *
 * @returns a 404 outside this tenant's subscriptions
 */
export const update = (
    id: string,
    body: UpdateWebhookSubscriptionRequest,
    context: TenantCallerContext
): Promise<ResponseSuccess<WebhookSubscriptionDocument> | ResponseReject> =>
    webhookSubscriptionRepository
        .findByIdInTenant(id, context.caller.tenantId)
        .then(async (subscription) => {
            if (!subscription) return generateReject(404, [t('generic.error-not-found')]);

            const unknownEvents = refuseUnknownEvents(body.eventTypes);
            if (unknownEvents) return unknownEvents;

            // Only a URL that CHANGES is worth a lookup: an edit to the description must not
            // start failing because the host's DNS is down today.
            if (body.url !== undefined && body.url !== subscription.url) {
                const refusal = await refuseUnsafeUrl(body.url);
                if (refusal) return refusal;
            }

            // Read before the assignments below overwrite what it compares against.
            const metadata = auditChanges(subscription, body, AUDITED_FIELDS);

            if (body.url !== undefined) subscription.url = body.url;
            // `null` clears the description — $unset on save.
            if (body.description !== undefined)
                subscription.description = clearedOrValue(body.description);
            if (body.eventTypes !== undefined) subscription.eventTypes = body.eventTypes;

            return webhookSubscriptionRepository.save(subscription).then((saved) => {
                recordAudit(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_UPDATED,
                    outcome: 'success',
                    targetType: 'webhook_subscription',
                    targetId: id,
                    metadata
                });
                return generateSuccess(saved);
            });
        });

/** The 409 a repeated {@link enable} or {@link disable} answers with. */
const rejectAlready = (
    code:
        | typeof ERROR_CODES.WEBHOOK_SUBSCRIPTION_ALREADY_ENABLED
        | typeof ERROR_CODES.WEBHOOK_SUBSCRIPTION_ALREADY_DISABLED,
    messageKey: string
): ResponseReject => generateReject(409, [{ code, message: t(messageKey) }]);

/**
 * Switch a subscription back on, whatever switched it off: clears both timestamps and resets the
 * failure streak, so the guard counts from zero.
 *
 * @returns a 404 outside this tenant's subscriptions; a 409 `WEBHOOK_SUBSCRIPTION_ALREADY_ENABLED`
 *   when it is already on, so a healthy subscription's streak is never reset by a repeated call
 */
export const enable = (
    id: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<WebhookSubscriptionDocument> | ResponseReject> =>
    webhookSubscriptionRepository
        .findByIdInTenant(id, context.caller.tenantId)
        .then((subscription) => {
            if (!subscription) return generateReject(404, [t('generic.error-not-found')]);
            if (!subscription.disabledAt)
                return rejectAlready(
                    ERROR_CODES.WEBHOOK_SUBSCRIPTION_ALREADY_ENABLED,
                    'webhooks.already-enabled'
                );

            subscription.disabledAt = undefined;
            subscription.autoDisabledAt = undefined;
            subscription.consecutiveFailures = 0;
            // A fresh streak: the age floor protects subscribers from OUR outages, so the old
            // streak's start date must not carry over (`domain/backoff.ts`).
            subscription.failingSince = undefined;

            return webhookSubscriptionRepository.save(subscription).then((saved) => {
                recordAudit(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_ENABLED,
                    outcome: 'success',
                    targetType: 'webhook_subscription',
                    targetId: id
                });
                return generateSuccess(saved);
            });
        });

/**
 * Pause a subscription by hand. `autoDisabledAt` stays absent, which is how a pause is told from
 * the failure guard's work; the streak is left as it is.
 *
 * @returns a 404 outside this tenant's subscriptions; a 409 `WEBHOOK_SUBSCRIPTION_ALREADY_DISABLED`
 *   when it is already off
 */
export const disable = (
    id: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<WebhookSubscriptionDocument> | ResponseReject> =>
    webhookSubscriptionRepository
        .findByIdInTenant(id, context.caller.tenantId)
        .then((subscription) => {
            if (!subscription) return generateReject(404, [t('generic.error-not-found')]);
            if (subscription.disabledAt)
                return rejectAlready(
                    ERROR_CODES.WEBHOOK_SUBSCRIPTION_ALREADY_DISABLED,
                    'webhooks.already-disabled'
                );

            subscription.disabledAt = new Date();

            return webhookSubscriptionRepository.save(subscription).then((saved) => {
                recordAudit(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_DISABLED,
                    outcome: 'success',
                    targetType: 'webhook_subscription',
                    targetId: id
                });
                return generateSuccess(saved);
            });
        });

/**
 * Add a new secret to the ring, alongside the newest existing one — the ring then carries both
 * until {@link removeSecret} drops the old one, or the overlap window ends. A ring holds at most
 * two: adding a third drops the oldest.
 *
 * @returns a 404 outside this tenant's subscriptions
 */
export const createSecret = (
    id: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<SubscriptionWithMintedSecrets> | ResponseReject> =>
    webhookSubscriptionRepository
        .findByIdInTenant(id, context.caller.tenantId)
        .then((subscription) => {
            if (!subscription) return generateReject(404, [t('generic.error-not-found')]);

            const minted = mintRingSecret();
            // Prune what has expired, and keep only the newest survivor beside the new secret:
            // the ring never holds more than two, however often it is rotated.
            subscription.secrets = [
                ...liveRingEntries(subscription.secrets).slice(-1),
                minted.entry
            ];

            return webhookSubscriptionRepository.save(subscription).then((saved) => {
                recordAudit(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_SECRET_ROTATED,
                    outcome: 'success',
                    targetType: 'webhook_subscription',
                    targetId: id
                });
                return generateSuccess({ subscription: saved, newSecret: minted.plaintext });
            });
        });

/**
 * Drop one entry from the ring by id — the other half of a rotation, once every consumer has
 * switched.
 *
 * @returns a 404 outside this tenant's subscriptions, or when `secretId` isn't in this ring; a
 *   422 if removing it would empty the ring
 */
export const removeSecret = (
    id: string,
    secretId: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<WebhookSubscriptionDocument> | ResponseReject> =>
    webhookSubscriptionRepository
        .findByIdInTenant(id, context.caller.tenantId)
        .then((subscription) => {
            if (!subscription) return generateReject(404, [t('generic.error-not-found')]);

            const remaining = removeRingSecret(subscription.secrets, secretId);
            // An id the ring doesn't carry filters out nothing — same length back. Nothing was
            // removed, so this is a 404, not a silent success.
            if (remaining.length === subscription.secrets.length)
                return generateReject(404, [t('generic.error-not-found')]);
            // Never let this empty the ring — a subscription with no secret can never sign a
            // delivery. The schema's own `validate` (`../model.ts`) is the second guard; this is
            // the one that answers 422 instead of a save-time throw.
            if (remaining.length === 0)
                return generateReject(422, [t('webhooks.ring-cannot-be-empty')]);
            subscription.secrets = liveRingEntries(remaining);

            return webhookSubscriptionRepository.save(subscription).then((saved) => {
                recordAudit(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_SECRET_REMOVED,
                    outcome: 'success',
                    targetType: 'webhook_subscription',
                    targetId: id
                });
                return generateSuccess(saved);
            });
        });

/** Permanently remove a subscription. Its delivery log is left in place — see `openapi.yaml`. */
export const remove = (
    id: string,
    context: TenantCallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    webhookSubscriptionRepository
        .findByIdInTenant(id, context.caller.tenantId)
        .then((subscription) => {
            if (!subscription) return generateReject(404, [t('generic.error-not-found')]);

            return webhookSubscriptionRepository.deleteOne(subscription).then(() => {
                recordAudit(context, {
                    action: webhooksAuditActions.ADMIN_WEBHOOK_SUBSCRIPTION_DELETED,
                    outcome: 'success',
                    targetType: 'webhook_subscription',
                    targetId: id
                });
                return generateSuccess(undefined);
            });
        });

/**
 * `personalData.erase` hook: forget the owner of every subscription an erased staff member
 * configured. Same rule as the order timeline's actor: the row stays, the person goes.
 *
 * @param userId - the erased account's id
 * @param session - the erasure's transaction
 */
export const forgetOwner = (userId: string, session: ClientSession): Promise<void> =>
    webhookSubscriptionRepository.forgetOwner(userId, session);
