/**
 * @module
 * This module's services, re-published in one place for the barrel: the live SSE feed
 * (`stream.ts`), the full `GET /observability/health` payload (`health.ts`, built from
 * `job-health.ts`'s lease side, `dependency-health.ts`'s adapter side and `parked-jobs.ts`'s queue
 * side), and the one process reader every payload here shares (`process-snapshot.ts`).
 */

import { buildObservabilityPayload, streamObservabilityMetrics } from './stream';
import { buildObservabilityHealth } from './health';
import { jobHealth } from './job-health';
import { dependencyHealth, overallStatus } from './dependency-health';
import { processSnapshot } from './process-snapshot';
import { queueHealth } from './parked-jobs';

export type { DependencyHealth } from './dependency-health';
export type { ProcessMemorySnapshot, ProcessSnapshot } from './process-snapshot';

/** The module's one door — every payload and probe the readiness and telemetry routes serve. */
export const observabilityService = {
    buildObservabilityPayload,
    streamObservabilityMetrics,
    buildObservabilityHealth,
    jobHealth,
    dependencyHealth,
    overallStatus,
    processSnapshot,
    queueHealth
};
