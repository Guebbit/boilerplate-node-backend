/**
 * @module
 * The scheduled job `returns` owns: the free-text scrub.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { scrubReturnText } from './services/retention';

/** The jobs `returns` owns. */
export const returnsJobs: readonly JobDeclaration[] = [
    {
        name: 'reap:returns',
        schedule: '12 2 * * *',
        summary:
            "Unsets a return's free text (`note`, `declineReason`) once the return has not changed for its retention window.",
        run: () => scrubReturnText()
    }
];
