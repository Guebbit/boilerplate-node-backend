/**
 * @module
 * In any module: what the caller may do to a record is decided here, once, so no client re-derives
 * it. Here: the keys `authorization.yaml` states (`update`, `delete`, own rows or all) are asked of
 * the kernel per row, and the domain adds the lifecycle's moves.
 *
 * Delete it if: the module has nothing a client must grey out per row.
 *
 * See: docs/theory/tactical-ddd.md#2-capabilities-the-server-answers-what-a-client-may-do
 */

import type { CallerContext, ExampleActions } from '@types';
import { permitsOnRows } from '@kernel/ability';
import { exampleActionsFor } from '../domain';
import type { ExampleStatus } from '@types';

/** The slice of a row the keys and the lifecycle read. */
interface ActionRow {
    /** The owner, which the own-rows conditions compare to the caller. */
    userId: string;
    /** Where the example is in its lifecycle. */
    status: ExampleStatus;
}

/**
 * A function from a row to its actions, for one caller: the ability is built once, then asked of
 * each row, so a page of rows costs one ability and not one per row.
 * @param context - the caller
 */
export const actionsForRows = (context: CallerContext): ((row: ActionRow) => ExampleActions) => {
    const permits = permitsOnRows(context.caller, 'Example', ['update', 'delete']);

    return (row) => exampleActionsFor(row.status, permits({ userId: row.userId }));
};
