/**
 * @module
 * In any module: the rules that decide, with no I/O. Here, the life of an example —
 * draft, published, archived — and the two small facts that hang off it.
 *
 * See: docs/theory/domain-layer.md
 */

import { ExampleStatus } from '@types';

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
 * Whether a write may move an example from one status to another. Staying where it is is always
 * fine: a PUT that restates the status must not fail.
 * @param from - the status the example holds now
 * @param to - the status the write asks for
 */
export const canTransition = (from: ExampleStatus, to: ExampleStatus): boolean =>
    from === to || TRANSITIONS[from].includes(to);

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
