/**
 * @module
 * In any module: the rules that decide, with no I/O.
 * Here: the life of an example — draft, published, archived — the moves it has, the actions a caller
 * may take on it, and the two small facts that hang off it.
 *
 * See: docs/theory/domain-layer.md
 */

import { ExampleStatus } from '@types';
import type { ExampleActions } from '@types';

/**
 * Which status each status may move to. Archived goes back to draft and nowhere else: a published
 * example is withdrawn by archiving it, never by pretending it was never published.
 */
const TRANSITIONS: Readonly<Record<ExampleStatus, readonly ExampleStatus[]>> = {
    [ExampleStatus.draft]: [ExampleStatus.published, ExampleStatus.archived],
    [ExampleStatus.published]: [ExampleStatus.archived],
    [ExampleStatus.archived]: [ExampleStatus.draft]
};

/** The status every new example starts at. */
export const initialExampleStatus: ExampleStatus = ExampleStatus.draft;

/**
 * Whether the lifecycle has this move. Staying where it is is not a move.
 * @param from - the status the example holds now
 * @param to - the status the move asks for
 */
export const canTransition = (from: ExampleStatus, to: ExampleStatus): boolean =>
    TRANSITIONS[from].includes(to);

/**
 * Every status an example in `status` may move to, in the contract's order, its own status
 * excluded.
 * @param status - the status the example holds now
 */
export const statusesReachableFrom = (status: ExampleStatus): readonly ExampleStatus[] =>
    TRANSITIONS[status];

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
    transitions: permits.update ? [...statusesReachableFrom(status)] : [],
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
