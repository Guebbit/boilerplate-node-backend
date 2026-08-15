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
    /*
     * Health, metrics and a dashboard over them. Interchangeable with any off-the-shelf equivalent,
     * and measured against the process rather than the business — there is no domain here to model.
     */
    subdomain: 'generic',
    language: {
        Health: 'Whether the process can serve. A liveness answer, not a correctness one.',
        Overview:
            'The numbers a human reads. Assembled from `infrastructure/observability`, owned by nobody.',
        Stream: 'The live SSE feed of those numbers. Cookie-authenticated, because an EventSource cannot set a header.',
        Scrape: 'The Prometheus endpoint. Static credential, because the caller is a machine with no session.'
    },
    basePath: '/observability',
    routes: router,
    dependsOn: [
        {
            module: 'audit-logs',
            as: 'conformist',
            because:
                'Renders audit entries exactly as that module stores them; `GET /observability/audit` adds a URL, not a model.'
        }
    ],
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
