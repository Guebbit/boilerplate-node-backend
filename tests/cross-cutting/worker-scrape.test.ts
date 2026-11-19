/**
 * The worker is scraped, and every place that names its port names the same one.
 *
 * Two alert counters (`queue_jobs_dead_lettered_total`, `webhook_delivery_attempts_total`) move
 * only in the worker process. A Prometheus config with no `worker` job, or one whose target port
 * drifted from `NODE_WORKER_PORT`, leaves `QueueJobsParked` and `WebhookDeliveriesFailingEverywhere`
 * silent with nothing to say so.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '@tests/paths';
import { serverConfig } from '@infrastructure/runtime/config';

/** The shape read out of a Prometheus config: only the scrape jobs. */
interface PrometheusConfig {
    /** The scrape jobs, in file order. */
    scrape_configs: {
        /** The job's name, the `job` label every alert selects on. */
        job_name: string;
        /** Where on the target the scrape is served. */
        metrics_path?: string;
        /** The bearer credential the scrape sends. */
        authorization?: { type: string; credentials_file: string };
        /** The targets, `host:port`. */
        static_configs?: { targets: string[] }[];
    }[];
}

/**
 * Reads a file of the repo as text.
 *
 * @param relative - the path from the repo root
 */
const text = (relative: string): string => readFileSync(path.join(REPO_ROOT, relative), 'utf8');

/**
 * One Prometheus config's scrape job by name.
 *
 * @param file - the config, from the repo root
 * @param job - the job name
 */
const jobOf = (file: string, job: string) => {
    const config = parse(text(file)) as PrometheusConfig;
    return config.scrape_configs.find(({ job_name: name }) => name === job);
};

/** The port the worker listens on, from the one declaration. */
const workerPort = String(serverConfig().NODE_WORKER_PORT);

describe.each([
    'docker/observability/prometheus.config.yaml',
    'docker/observability/prometheus.production.config.yaml'
])('%s', (file) => {
    it('scrapes the worker at its own port, on the API scrape path with the API token', () => {
        const worker = jobOf(file, 'worker');
        const api = jobOf(file, 'api');

        expect(worker?.static_configs?.[0]?.targets).toEqual([`worker:${workerPort}`]);
        expect(worker?.metrics_path).toBe(api?.metrics_path);
        expect(worker?.authorization).toEqual(api?.authorization);
    });
});

/** The alert rules, by alert name: only what the mirror below compares. */
interface AlertRules {
    /** The rule groups. */
    groups: {
        rules: { alert?: string; expr?: string; for?: string; labels?: { severity?: string } }[];
    }[];
}

describe('WorkerDown', () => {
    const rules = (
        parse(text('docker/observability/prometheus.alert-rules.yaml')) as AlertRules
    ).groups.flatMap(({ rules: group }) => group);
    const apiDown = rules.find(({ alert }) => alert === 'ApiDown');
    const workerDown = rules.find(({ alert }) => alert === 'WorkerDown');

    it('mirrors ApiDown on the worker job: the same wait and the same severity', () => {
        expect(workerDown?.expr).toBe('up{job="worker"} == 0');
        expect(workerDown?.for).toBe(apiDown?.for);
        expect(workerDown?.labels?.severity).toBe(apiDown?.labels?.severity);
    });
});

describe('the worker port in the places that spell it out', () => {
    it('is the one the compose health checks probe', () => {
        for (const file of ['compose.production.yaml', 'compose.override.yaml'])
            expect(text(file)).toContain(`:\${NODE_WORKER_PORT:-${workerPort}}/livez`);
    });

    it('is the one the Kubernetes worker declares', () => {
        const documents = text('k8s/base/worker.yaml').split('\n---\n');
        const ports = documents.flatMap((document) =>
            [...document.matchAll(/(?:containerPort|port): (\d+)/g)].map(([, port]) => port)
        );

        expect(new Set(ports)).toEqual(new Set([workerPort]));
    });
});
