/**
 * @module
 * The scheduled job `returns` owns: the free-text scrub.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { JobDeclaration } from '@kernel/registry';
import { returnsJobData } from './jobs.generated';
import { scrubReturnText } from './services/retention';

/** The jobs `returns` owns. */
export const returnsJobs: readonly JobDeclaration[] = [
    {
        ...returnsJobData.reapReturns,
        run: () => scrubReturnText()
    }
];
