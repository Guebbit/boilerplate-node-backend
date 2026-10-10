/**
 * @module
 * `dependency_up`: one gauge per backing service, 1 serving and 0 not, fed by the same memory read
 * `GET /observability/health` folds (`dependencyHealth`). Built for `DependencyUnavailable`
 * (`docs/tools/prometheus.md`): with Mongo down the job and outbox gauges stop reporting, so every
 * rule that reads them goes blind exactly when it matters, and nothing else says a dependency died.
 */

import { Gauge } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';
import { dependencyHealth } from './services/dependency-health';

/**
 * Whether each backing service is serving, by `dependency` (`database`, `cache`, `queue`).
 *
 * Read at scrape time, so it costs no I/O (`dependencyHealth` is a memory read) and answers even
 * when the dependency itself is unreachable. `connecting` is 0: not serving yet, and the rule's
 * `for` clause rides out a normal start. A `disabled` dependency (Redis or RabbitMQ not
 * configured) is left unset rather than reported 0: absence is a supported deployment, not a fault.
 */
const _dependencyUp = new Gauge({
    name: 'dependency_up',
    help: 'Whether each backing service is serving (1) or not (0). Unconfigured services are not reported.',
    labelNames: ['dependency'],
    registers: [metricsRegistry],
    collect() {
        this.reset();
        for (const [dependency, status] of Object.entries(dependencyHealth()))
            if (status !== 'disabled') this.set({ dependency }, status === 'ready' ? 1 : 0);
    }
});
