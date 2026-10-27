/**
 * @module
 * In any module: an action door is its own service function, not a field on update. It decides
 * with the domain (is this move on the table?), enforces with a conditional write (of two racers,
 * one lands), and does the side effects only the winner owns. Here: moving an example between
 * draft, published and archived, one door per event (`publish`, `archive`, `unarchive`). A move into `published` stamps `publishedAt` the first time,
 * announces `example.published` through the outbox and counts an analytics event.
 *
 * Delete it if: the module has no lifecycle beyond create, edit and delete.
 * Instead see: `orders` (`services/override.ts`) for a step-up-gated door.
 *
 * See: docs/tools/outbox.md
 */

import type { CallerContext, Example, ExampleStatus } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { recordAudit } from '@infrastructure/observability/audit';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { accessibleFilterFor } from '@kernel/access/query';
import { announceInTransaction } from '@kernel/outbox';
import { exampleAuditActions } from '../audit';
import { exampleAnalyticsEvents } from '../analytics';
import { EXAMPLE_PUBLISHED } from '../events';
import { canApply, isPublished, shouldStampPublishedAt, statusAfter } from '../domain';
import type { ExampleEvent } from '../domain';
import type { ExampleDocument } from '../model';
import { exampleRepository } from '../repository';
import { presentForCaller } from './owner';

/** Every answer a door gives: the moved example, or the refusal. */
type TransitionResult = ResponseSuccess<Example> | ResponseReject;

/** The 409 code and message key each event answers with when it is not on the table. */
const REFUSALS: Readonly<
    Record<ExampleEvent, { code: keyof typeof ERROR_CODES; message: string }>
> = {
    ['publish']: {
        code: 'EXAMPLE_NOT_PUBLISHABLE',
        message: 'example.not-publishable'
    },
    ['archive']: {
        code: 'EXAMPLE_NOT_ARCHIVABLE',
        message: 'example.not-archivable'
    },
    ['unarchive']: {
        code: 'EXAMPLE_NOT_UNARCHIVABLE',
        message: 'example.not-unarchivable'
    }
};

/**
 * The one 409 both refusal points answer with: an event the lifecycle does not have from this
 * status, or one a racing request got to first.
 * @param event - the event asked for
 * @param status - the status the example was read in
 */
const notAllowed = (event: ExampleEvent, status: ExampleStatus): ResponseReject =>
    generateReject(409, [
        {
            code: ERROR_CODES[REFUSALS[event].code],
            message: t(REFUSALS[event].message, { status }),
            details: { status }
        }
    ]);

/**
 * Record a publish as an analytics event. The domain event is not here: it rides the outbox, in
 * the transaction that wrote the publish.
 * @param example - the example that was just published
 * @param context - the caller, for the analytics base
 */
const analysePublished = (example: ExampleDocument, context: CallerContext): void => {
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        event: exampleAnalyticsEvents.EXAMPLE_PUBLISHED,
        properties: { example_id: String(example._id) }
    });
};

/**
 * Write the move conditionally on the status read. Into `published` it shares a transaction with
 * the outbox row, so the announcement exists exactly when the move did.
 * @param example - the loaded example, as the caller read it
 * @param to - the status to move to
 * @param context - the caller
 * @returns the saved example, or `null` when a peer changed the status first
 */
const writeMove = (
    example: ExampleDocument,
    to: ExampleStatus,
    context: CallerContext
): Promise<ExampleDocument | null> => {
    const fields = {
        status: to,
        publishedAt: shouldStampPublishedAt(to, example.publishedAt)
            ? new Date()
            : example.publishedAt
    };
    const id = String(example._id);
    if (!isPublished(to)) return exampleRepository.moveFrom(id, example.status, fields);

    return announceInTransaction(
        (session) => exampleRepository.moveFrom(id, example.status, fields, session),
        (saved) => ({
            name: EXAMPLE_PUBLISHED,
            payload: {
                exampleId: String(saved._id),
                userId: String(saved.userId),
                title: saved.title
            },
            aggregateId: String(saved._id)
        })
    ).then((saved) => {
        if (saved) analysePublished(saved, context);
        return saved;
    });
};

/**
 * Apply one lifecycle event to an example.
 *
 * Visibility is checked before legality: an example the caller may not edit is a 404, so a stranger
 * learns nothing about it. No `If-Match`: the write is conditional on the status read, so of two
 * racing moves exactly one lands and the other answers 409.
 *
 * @param event - the event to apply
 * @param id - the example's id
 * @param context - the caller; they need `update` on the example
 * @returns 404 when the caller may not edit one by that id, 409 when the event is not on the table
 *   or a peer moved it first, otherwise the moved example
 */
const applyEvent = (
    event: ExampleEvent,
    id: string,
    context: CallerContext
): Promise<TransitionResult> =>
    exampleRepository
        .findScoped(id, accessibleFilterFor(context.caller, 'Example', 'update'))
        .then((example): TransitionResult | Promise<TransitionResult> => {
            if (!example) return generateReject(404, [t('example.not-found')]);
            const from = example.status;
            if (!canApply(event, from)) return notAllowed(event, from);

            const to = statusAfter(event);
            return writeMove(example, to, context).then((saved) => {
                if (!saved) return notAllowed(event, from);
                recordAudit(context, {
                    action: exampleAuditActions.EXAMPLE_STATUS_CHANGED,
                    outcome: 'success',
                    targetType: 'example',
                    targetId: id,
                    metadata: { event, from, to }
                });
                return presentForCaller(saved, context).then((shaped) =>
                    generateSuccess(shaped, 200)
                );
            });
        });

/**
 * Publish a draft example.
 * @param id - the example's id
 * @param context - the caller; they need `update` on the example
 */
export const publishById = (id: string, context: CallerContext): Promise<TransitionResult> =>
    applyEvent('publish', id, context);

/**
 * Archive a draft or published example.
 * @param id - the example's id
 * @param context - the caller; they need `update` on the example
 */
export const archiveById = (id: string, context: CallerContext): Promise<TransitionResult> =>
    applyEvent('archive', id, context);

/**
 * Return an archived example to draft.
 * @param id - the example's id
 * @param context - the caller; they need `update` on the example
 */
export const unarchiveById = (id: string, context: CallerContext): Promise<TransitionResult> =>
    applyEvent('unarchive', id, context);
