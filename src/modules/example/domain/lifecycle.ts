/**
 * @module
 * In any module: the rules that decide, with no I/O.
 * Here: the life of an example — draft, published, archived — the events it has, the actions a caller
 * may take on it, and the two small facts that hang off it.
 *
 * See: docs/theory/domain-layer.md
 */

import { ExampleStatus } from '@types';
import type { ExampleActions } from '@types';

/** One of the example's lifecycle events, named like the door that makes it. */
export type ExampleEvent = 'publish' | 'archive' | 'unarchive';

/** Where an event may be taken from, and where it leaves the example. */
interface EventRule {
    /** The statuses the event may start in. Staying where it is is not a move. */
    from: readonly ExampleStatus[];
    /** The status the event leaves the example in. */
    to: ExampleStatus;
}

/**
 * The lifecycle, keyed by event as `orders` keys its own: each is a door,
 * `POST /examples/{id}/<event>`. A published example is withdrawn by archiving it, never by
 * pretending it was never published, so only an archived one goes back to draft.
 */
export const EXAMPLE_EVENTS: Readonly<Record<ExampleEvent, EventRule>> = {
    publish: { from: [ExampleStatus.draft], to: ExampleStatus.published },
    archive: { from: [ExampleStatus.draft, ExampleStatus.published], to: ExampleStatus.archived },
    unarchive: { from: [ExampleStatus.archived], to: ExampleStatus.draft }
};

/** The status every new example starts at. */
export const initialExampleStatus: ExampleStatus = ExampleStatus.draft;

/**
 * Whether the lifecycle has this event from this status.
 * @param event - the event asked for
 * @param status - the status the example holds now
 */
export const canApply = (event: ExampleEvent, status: ExampleStatus): boolean =>
    EXAMPLE_EVENTS[event].from.includes(status);

/**
 * The status an event leaves an example in.
 * @param event - the event applied
 */
export const statusAfter = (event: ExampleEvent): ExampleStatus => EXAMPLE_EVENTS[event].to;

/**
 * What a caller may do to an example in `status`, given what their keys allow on that row. The
 * moves are the lifecycle's; whether this caller may make any is the `update` key's.
 * @param status - the status the example holds now
 * @param permits - the caller's keys on this row, answered by the kernel
 */
export const exampleActionsFor = (
    status: ExampleStatus,
    permits: { update: boolean; delete: boolean }
): ExampleActions => ({
    publish: permits.update && canApply('publish', status),
    archive: permits.update && canApply('archive', status),
    unarchive: permits.update && canApply('unarchive', status),
    update: permits.update,
    delete: permits.delete
});

/**
 * Whether anyone, signed in or not, may read an example.
 * @param status - the example's status
 */
export const isPublished = (status: ExampleStatus): boolean => status === ExampleStatus.published;

/**
 * Whether a write should stamp `publishedAt`: the first time an example reaches `published`,
 * never again, so re-publishing after an archive does not move the original date.
 * @param nextStatus - the status the write leaves the example in
 * @param alreadyPublishedAt - the stamp the example already carries, if any
 */
export const shouldStampPublishedAt = (
    nextStatus: ExampleStatus,
    alreadyPublishedAt: Date | undefined
): boolean => nextStatus === ExampleStatus.published && alreadyPublishedAt === undefined;

/**
 * Whether a body is within the deployment's own ceiling, which may sit below the contract's.
 * @param body - the text to check
 * @param maximum - the longest body allowed, in characters
 */
export const fitsBodyLength = (body: string, maximum: number): boolean => body.length <= maximum;
