/**
 * @module
 * The job half of `GET /observability/health`: every lease-guarded job's last observed outcome,
 * read straight off its `leases` document. Unlike `dependency-health.ts` this DOES do I/O — one
 * `leases` query — because there is no in-memory copy anywhere in the process of when last
 * night's `reap:orders` finished, or whether it did.
 *
 * See: docs/reference/ops.md#scheduled-jobs
 */

import type { ObservabilityHealthJob } from '@types';
import { listLeaseSummaries } from '@infrastructure/persistence/lease';

/**
 * Every lease-guarded job's last observed outcome, in the wire shape `ObservabilityHealth.jobs`
 * declares — dates as ISO-8601 strings, matching every other timestamp this endpoint reports.
 */
export const jobHealth = (): Promise<ObservabilityHealthJob[]> =>
    listLeaseSummaries().then((summaries) =>
        summaries.map((summary) => ({
            name: summary.name,
            lastSuccessAt: summary.lastSuccessAt?.toISOString(),
            lastError: summary.lastError
        }))
    );
