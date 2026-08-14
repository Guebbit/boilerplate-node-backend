import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/**
 * The operator-facing view of the running service: health, a metrics overview, the live SSE
 * stream, the Prometheus scrape endpoint, and the audit trail.
 *
 * Depends on `audit-logs` because `GET /observability/audit` reads that collection. The rest of
 * what it serves comes from `infrastructure/observability`, which measures the process rather than any
 * domain — so this module reads its own numbers off `infrastructure` and owns no collection of its own.
 *
 * Every route here is authenticated, and the three authentication styles are not interchangeable:
 * `routes.ts` documents why the SSE stream uses a cookie and the scrape endpoint a static
 * credential. Deleting this module removes the dashboard, not the measurements.
 *
 * There is deliberately no `index.ts`. A barrel is a promise to sibling modules, and this one has
 * nothing to promise: it owns URLs, not data, and nothing in the app reaches into it. With no
 * barrel the boundary lint makes that structural — a sibling cannot import this module at all,
 * rather than being asked politely not to.
 */
export default {
    name: 'observability',
    basePath: '/observability',
    routes: router,
    dependsOn: ['audit-logs'],
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
