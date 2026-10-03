/**
 * @module
 * In any module: the service is the one door (`./index.ts` composes it). Controllers and sibling modules call it; it applies
 * the domain rules, talks to the repository and to other modules' barrels, and announces what
 * happened (audit, metric, event). Here: create, read, search, edit and delete.
 *
 * Who may see or change which row is not decided by hand: `accessibleFilterFor` compiles the
 * caller's keys (`authorization.yaml`) into the query, so a row you may not touch is simply not found.
 *
 * See: docs/theory/layers.md
 */

import type {
    CallerContext,
    CreateExampleRequest,
    Example,
    SearchExamplesRequest,
    UpdateExampleRequest
} from '@types';
import { ExampleStatus } from '@types';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { recordAudit } from '@infrastructure/observability/audit';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { imageStore } from '@infrastructure/adapters/image-store';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { accessibleFilterFor } from '@kernel/access/query';
import { emitDomainEvent } from '@kernel/events';
import { exampleAuditActions } from '../audit';
import { exampleAnalyticsEvents } from '../analytics';
import { exampleCreatedTotal } from '../metrics';
import { exampleConfig } from '../config';
import { EXAMPLE_PUBLISHED } from '../events';
import {
    canTransition,
    fitsBodyLength,
    initialExampleStatus,
    isPublished,
    shouldStampPublishedAt
} from '../domain';
import type { ExampleDocument } from '../model';
import { presentExampleRow } from '../presenter';
import { ownerNamesOf, presentWithOwner } from './owner';
import { exampleRepository } from '../repository';

/** Every answer a write gives: the example as the contract shapes it, or the refusal. */
type ExampleResult = ResponseSuccess<Example> | ResponseReject;

/**
 * The filter fragment a caller's keys compile to for one action: `{}` for someone who may touch
 * every row, a filter matching nothing for someone who holds no key at all.
 * @param context - the caller
 * @param action - which action's keys to compile
 */
const scopeOf = (context: CallerContext, action: 'read' | 'update' | 'delete') =>
    accessibleFilterFor(context.caller, 'Example', action);

/**
 * The refusal for a body over this deployment's ceiling, or `undefined` when it fits. The
 * ceiling is an environment setting (`config.ts`), so it can sit below the contract's own.
 * @param body - the text a write carries, if it carries one
 */
const bodyTooLong = (body: string | undefined): ResponseReject | undefined => {
    const maximum = exampleConfig().NODE_EXAMPLE_BODY_MAX_LENGTH;
    return body !== undefined && !fitsBodyLength(body, maximum)
        ? generateReject(422, [t('example.error-body-too-long', { maximum })])
        : undefined;
};

/**
 * Announce a publish: the domain event (a webhook and the owner's mail listen to it) and the
 * analytics event. Fire and forget — a listener's failure never undoes the edit.
 * @param example - the example that was just published
 * @param context - the caller, for the analytics base
 */
const announcePublished = (example: ExampleDocument, context: CallerContext): void => {
    void emitDomainEvent(EXAMPLE_PUBLISHED, {
        exampleId: String(example._id),
        userId: String(example.userId),
        title: example.title
    });
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        event: exampleAnalyticsEvents.EXAMPLE_PUBLISHED,
        properties: { example_id: String(example._id) }
    });
};

/**
 * Create a draft owned by the caller.
 *
 * @param payload - the validated body
 * @param context - the caller; their id becomes the owner
 */
export const create = (
    payload: CreateExampleRequest,
    context: CallerContext
): Promise<ExampleResult> => {
    const { id: userId } = context.caller;
    if (userId === null) return Promise.resolve(generateReject(401));

    const refusal = bodyTooLong(payload.body);
    if (refusal) return Promise.resolve(refusal);

    return exampleRepository
        .create({
            userId: toObjectId(userId),
            title: payload.title.trim(),
            body: payload.body.trim(),
            status: initialExampleStatus
        })
        .then((created) => {
            exampleCreatedTotal.inc();
            recordAudit(context, {
                action: exampleAuditActions.EXAMPLE_CREATED,
                outcome: 'success',
                target_type: 'example',
                target_id: String(created._id)
            });
            return presentWithOwner(created);
        })
        .then((example) => generateSuccess(example, 201, t('example.created')));
};

/**
 * One example the caller may read: their own, or any when they hold `examples.any.read`.
 *
 * @param id - the example's id
 * @param context - the caller
 * @returns the example, or `null` when there is none the caller may see
 */
export const getById = (id: string, context: CallerContext): Promise<Example | null> =>
    exampleRepository
        .findScoped(id, scopeOf(context, 'read'))
        .then((example) => (example ? presentWithOwner(example) : null));

/**
 * One PUBLISHED example, for anyone. The status is part of the query, so a draft and a missing
 * id are the same answer.
 *
 * @param id - the example's id
 * @returns the example, or `null` when it does not exist or is not published
 */
export const getPublishedById = (id: string): Promise<Example | null> =>
    exampleRepository
        .findScoped(id, { status: ExampleStatus.published })
        .then((example) => (example ? presentWithOwner(example) : null));

/**
 * Search the examples the caller may read, paginated.
 *
 * @param filters - the validated query; `page`/`pageSize` may still be strings off a query string
 * @param context - the caller
 */
export const search = (
    filters: Omit<SearchExamplesRequest, 'page' | 'pageSize'> & {
        page?: string | number;
        pageSize?: string | number;
    },
    context: CallerContext
): Promise<{ items: Example[]; meta: PaginatedMeta }> =>
    // `status` rides as a scope, not a search field: a closed enum has no free-text spelling.
    exampleRepository
        .search(filters, {
            ...scopeOf(context, 'read'),
            ...(filters.status ? { status: filters.status } : {})
        })
        .then(({ items, meta }) =>
            ownerNamesOf(items.map((row) => row.userId)).then((names) => ({
                items: items.map((row) => presentExampleRow(row, names.get(row.userId) ?? '')),
                meta
            }))
        );

/**
 * Apply a change to an example the caller may edit — PUT and PATCH both end here.
 *
 * @param id - the example's id
 * @param changes - the validated body; an omitted field stays as it is
 * @param context - the caller
 * @returns 404 when the caller may not edit one by that id, 422 for an illegal status move or an
 *   over-long body, otherwise the saved example
 */
export const update = (
    id: string,
    changes: UpdateExampleRequest,
    context: CallerContext
): Promise<ExampleResult> => {
    const refusal = bodyTooLong(changes.body);
    if (refusal) return Promise.resolve(refusal);

    return exampleRepository.findScoped(id, scopeOf(context, 'update')).then((example) => {
        if (!example) return generateReject(404, [t('example.not-found')]);

        const before = example.status;
        const next = changes.status ?? before;
        if (!canTransition(before, next))
            return generateReject(422, [t('example.error-transition', { from: before, to: next })]);

        if (changes.title !== undefined) example.title = changes.title.trim();
        if (changes.body !== undefined) example.body = changes.body.trim();
        example.status = next;
        if (shouldStampPublishedAt(next, example.publishedAt)) example.publishedAt = new Date();

        return exampleRepository.save(example).then((saved) => {
            recordAudit(context, {
                action: exampleAuditActions.EXAMPLE_UPDATED,
                outcome: 'success',
                target_type: 'example',
                target_id: id,
                metadata: { status: next }
            });
            if (!isPublished(before) && isPublished(next)) announcePublished(saved, context);
            return presentWithOwner(saved).then((shaped) =>
                generateSuccess(shaped, 200, t('example.updated'))
            );
        });
    });
};

/**
 * Permanently delete an example the caller may delete, and its cover image with it.
 *
 * @param id - the example's id
 * @param context - the caller
 * @returns 404 when the caller may not delete one by that id
 */
export const remove = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    exampleRepository.findScoped(id, scopeOf(context, 'delete')).then((example) => {
        if (!example) return generateReject(404, [t('example.not-found')]);

        return exampleRepository
            .deleteOne(example)
            .then(() => imageStore.remove(example.imageUrl))
            .then(() => {
                recordAudit(context, {
                    action: exampleAuditActions.EXAMPLE_DELETED,
                    outcome: 'success',
                    target_type: 'example',
                    target_id: id
                });
                return generateSuccess(undefined, 200, t('example.deleted'));
            });
    });
