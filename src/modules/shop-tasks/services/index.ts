/**
 * @module
 * The shop-tasks service: the event handlers `module.ts` subscribes, gathered in one object so the
 * barrel has one door. `tasks.ts` opens and clears to-dos, `notices.ts` writes messages and staff
 * notices, `delayed.ts` is the one event both care about, `digest.ts` is the scheduled summary.
 */

import { runStaffDigest } from './digest';
import { onFulfillmentOrderDelayed } from './delayed';
import { shopNotices } from './notices';
import { shopTasks } from './tasks';

/** The service's public surface. */
export const shopTasksService = {
    ...shopTasks,
    ...shopNotices,
    onFulfillmentOrderDelayed,
    runStaffDigest
};
