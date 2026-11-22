import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BlockList } from 'node:net';
import { parse } from 'yaml';
import { REPO_ROOT } from '@tests/paths';

/**
 * Guard: the production deployment's security posture is a property of two files, not a memory.
 *
 * `compose.production.yaml` and the `build` and `runtime` stages of `docker/Dockerfile` carry decisions that cost
 * nothing to keep and are invisible to every other check in the gate — a container gains a
 * writable root, a database publishes a port, an `--inspect` flag survives a debugging session, a
 * dependency's postinstall runs during the image build, a service mounts a secret that is not its
 * own. None of them breaks a test, a type or a lint rule. They break the deployment, in
 * production, silently.
 *
 * Each is the kind of property a human catches by reading the files, once, in review — and never
 * again once the reviewer's attention moves elsewhere. This is the same reading, on every push.
 *
 * Deliberately narrow. It asserts the properties that were actually reasoned about (one `describe`
 * each below), not an inventory of every key in the compose file — a census fails on the next
 * legitimate edit and teaches people to delete the test.
 */

/**
 * One entry of a service's `ports:`, in either spelling compose accepts — the short string
 * (`'127.0.0.1:3000:3000'`) or the long mapping, which names the interface as `host_ip`.
 * https://docs.docker.com/reference/compose-file/services/#ports
 */
type PortMapping = string | { host_ip?: string; published?: number | string };

/** The shape this file reads out of the compose YAML. Compose declares far more; none of it matters here. */
interface ComposeFile {
    /** Compose services by name, each reduced to the hardening fields checked here. */
    services: Record<
        string,
        {
            read_only?: boolean;
            cap_drop?: string[];
            cap_add?: string[];
            security_opt?: string[];
            ports?: PortMapping[];
            volumes?: string[];
            environment?: Record<string, string> | string[];
            command?: string | string[];
            /** The container memory ceiling, compose's own spelling (`1g`). */
            mem_limit?: string;
            entrypoint?: string | string[];
            secrets?: string[];
            healthcheck?: { test?: string[] };
            profiles?: string[];
            logging?: { driver?: string; options?: Record<string, string> };
            image?: string;
            user?: string;
            /** The networks a service joins: a list of names, or a map of name to its per-service options. */
            networks?: string[] | Record<string, { ipv4_address?: string } | null>;
        }
    >;
    /** Top-level secrets, each backed by a file. */
    secrets?: Record<string, { file: string }>;
    /** Top-level networks; only `ipam` matters here. */
    networks?: Record<
        string,
        { ipam?: { config?: { subnet?: string; gateway?: string; ip_range?: string }[] } } | null
    >;
}

/** Narrows what `yaml`'s `parse` hands back to the shape this file reads. */
const isComposeFile = (value: unknown): value is ComposeFile =>
    typeof value === 'object' && value !== null && 'services' in value;

/**
 * The production compose stack, parsed with merge keys APPLIED.
 *
 * `merge: true` is not the default and is load-bearing here: the file factors its shared blocks
 * into `x-hardening` and `x-app-env` and merges them with `<<: *hardening`. Without the option
 * `yaml` leaves `<<` as an ordinary key, every service reads as having no hardening at all, and
 * this whole file goes red on a refactor that changed nothing about the deployment.
 * https://eemeli.org/yaml/#yaml-1-1-merge-keys
 */
const parsedCompose: unknown = parse(
    readFileSync(path.join(REPO_ROOT, 'compose.production.yaml'), 'utf8'),
    // `maxAliasCount` guards a hostile document from expanding without bound. This is our own file, and
    // its shared blocks (logging, hardening, the Zammad service) are aliased by many services, so the
    // default of 100 is too low.
    { merge: true, maxAliasCount: 1000 }
);

if (!isComposeFile(parsedCompose))
    throw new Error('[production-topology] compose.production.yaml did not parse to an object.');

/** The production compose file, parsed. */
const compose = parsedCompose;

/** The whole multi-stage Dockerfile; the dev stage runs lifecycle scripts on purpose, so only slices of it are asserted on. */
const wholeDockerfile = readFileSync(path.join(REPO_ROOT, 'docker', 'Dockerfile'), 'utf8');

/**
 * The text of one `FROM … AS <name>` stage, up to the next `FROM`.
 *
 * @param name - the stage's alias
 * @throws {Error} when the Dockerfile has no stage of that name
 */
const stageOf = (name: string): string => {
    const start = wholeDockerfile.search(new RegExp(`^FROM .* AS ${name}$`, 'm'));
    if (start === -1)
        throw new Error(`[production-topology] no stage "${name}" in docker/Dockerfile.`);
    const next = wholeDockerfile.slice(start + 1).search(/^FROM /m);
    return next === -1
        ? wholeDockerfile.slice(start)
        : wholeDockerfile.slice(start, start + 1 + next);
};

/** The production image's build recipe, as text — the assertions below are about what it does NOT contain. */
const dockerfile = [stageOf('build'), stageOf('runtime')].join('\n');

/**
 * The five services that run this repository's own code.
 *
 * They share one image and one hardening block, so they must share one verdict: `worker`,
 * `worker-heavy`, `cron` and `setup` reach the same database and the same volumes `app` does, and a
 * write primitive in the application is a write primitive in all five.
 */
const OWN_CODE_SERVICES = ['app', 'worker', 'worker-heavy', 'cron', 'setup'] as const;

/**
 * The services that hold data or expose an unauthenticated UI: the bundled stores (`profiles:
 * [bundled]`, which a deployment may replace with managed instances but which are the crown
 * jewels while they are here) and the `monitoring` profile's four, whose Prometheus and
 * Alertmanager web UIs have no login.
 *
 * Reachable on the compose network by design, and from nowhere else.
 */
const BACKING_SERVICES = [
    'database',
    'cache',
    'limits',
    'queue',
    'prometheus',
    'alertmanager',
    'loki',
    'alloy'
] as const;

/**
 * The host interface a port mapping binds, or `undefined` when it names none — which is compose's
 * way of spelling "every interface on this machine".
 *
 * @param port - one entry of a service's `ports:`, in either spelling
 * @returns the interface, e.g. `127.0.0.1`
 */
const hostInterfaceOf = (port: PortMapping): string | undefined =>
    typeof port === 'string' ? /^(\[[^\]]+\]|[\d.]+):/.exec(port)?.[1] : port.host_ip;

describe('production container logs are bounded', () => {
    /**
     * Without `max-size` the default driver writes forever and a busy API fills the host's disk
     * with its own log. Every service, the one-shot ones and the data stores included: a service
     * left out is the one that fills the disk.
     */
    it.each(Object.keys(compose.services))('%s caps its log files', (name) => {
        const { logging } = compose.services[name];

        expect(logging?.driver).toBe('${CONTAINER_LOG_DRIVER:-json-file}');
        expect(logging?.options).toEqual({ 'max-size': '10m', 'max-file': '5' });
    });
});

describe('production containers are hardened', () => {
    /**
     * `read_only` turns a file-write primitive in the application into an error instead of a
     * foothold; `cap_drop: [ALL]` removes every Linux capability a Node process serving HTTP above
     * port 1024 never needs; `no-new-privileges` stops a setuid binary in the image raising
     * privilege after the drop. The three only work together — dropping capabilities while leaving
     * the root filesystem writable buys very little.
     */
    it.each(OWN_CODE_SERVICES)(
        '%s runs read-only, with no capabilities and no privilege gain',
        (name) => {
            const service = compose.services[name];

            expect(service).toBeDefined();
            expect(service.read_only).toBe(true);
            expect(service.cap_drop).toEqual(['ALL']);
            expect(service.security_opt).toContain('no-new-privileges:true');
        }
    );
});

describe('production data services are hardened, within what their entrypoints need', () => {
    /**
     * The official images start as root, `chown` their data directory and drop to their own user,
     * so unlike the three that run our code they cannot be `read_only` or capability-free. They
     * drop everything and take back only what that sequence uses; a service that keeps the full
     * default set, or may gain privilege through a setuid binary, is the regression.
     */
    it.each(['database', 'mongo-rs-init', 'cache', 'limits', 'queue'])(
        '%s drops every capability, adds back only the entrypoint set, and gains no privilege',
        (name) => {
            const service = compose.services[name];

            expect(service).toBeDefined();
            expect(service.cap_drop).toEqual(['ALL']);
            expect(service.cap_add?.toSorted()).toEqual([
                'CHOWN',
                'DAC_OVERRIDE',
                'FOWNER',
                'SETGID',
                'SETUID'
            ]);
            expect(service.security_opt).toContain('no-new-privileges:true');
        }
    );
});

describe('production publishes no data port', () => {
    /**
     * A published port on Mongo, Redis or RabbitMQ is reachable from the host's network, which on
     * a cloud box usually means the internet. These three speak to `app` over the compose network
     * and need no host mapping at all — the absence of a `ports:` key IS the defence.
     */
    it.each(BACKING_SERVICES)('%s maps no port to the host', (name) => {
        const service = compose.services[name];

        expect(service).toBeDefined();
        expect(service.ports ?? []).toEqual([]);
    });

    /**
     * `app` does publish, because something has to answer the reverse proxy. It must bind the
     * loopback interface explicitly: `'3000:3000'` listens on every interface, `'127.0.0.1:3000:3000'`
     * listens only where the proxy on the same host can reach it.
     * https://docs.docker.com/reference/compose-file/services/#ports
     */
    it('every published port binds an explicit host interface', () => {
        const published = Object.entries(compose.services).flatMap(([name, service]) =>
            (service.ports ?? []).map((port) => [name, port] as const)
        );

        // A deployment that publishes nothing at all would pass vacuously; `app` must be here.
        expect(published.map(([name]) => name)).toContain('app');

        // Keyed by service name, so a failure says WHICH service opened itself to every interface.
        const interfaces = Object.fromEntries(
            published.map(([name, port]) => [name, hostInterfaceOf(port)])
        );

        expect(interfaces).toEqual(
            Object.fromEntries(published.map(([name]) => [name, '127.0.0.1']))
        );
    });
});

describe('the bundled database can boot with wire TLS', () => {
    /**
     * mongod 8.3 refuses `--tlsMode requireTLS` without a chain of trust (SERVER-72839), which
     * `--tlsCertificateKeyFile` alone is not. `--tlsCAFile` supplies it, and
     * `--tlsAllowConnectionsWithoutCertificates` keeps the TLS one-way, so a client is not
     * asked for a certificate it does not have.
     */
    it('names a CA file and keeps client certificates optional', () => {
        const { command } = compose.services.database;

        expect(Array.isArray(command)).toBe(true);
        expect(command).toEqual(
            expect.arrayContaining([
                '--tlsCertificateKeyFile',
                '--tlsCAFile',
                '--tlsAllowConnectionsWithoutCertificates'
            ])
        );
    });
});

describe('cron refuses a bad environment before it schedules anything', () => {
    /**
     * Its healthcheck sees only supercronic, and every job judges the environment on its own: a
     * broken `.env` would read as a healthy container whose every job fails. Checking first makes
     * the container exit instead, where `ps` and the restart count show it.
     */
    it('runs config:check, and only on success starts supercronic', () => {
        const command = [compose.services.cron?.command ?? []].flat().join(' ');

        expect(command).toMatch(
            /node --import tsx scripts\/ops\/check-config\.ts && exec supercronic /
        );
    });
});

describe('cron mounts every volume app mounts', () => {
    /**
     * Same image, same code, same paths: a mount only `app` has is a path cron's jobs see empty.
     * The orphan sweep and a cron-run erasure's file step then succeed having touched nothing.
     * Derived from `app`'s own list, so a new or renamed mount needs no edit here.
     */
    it('lists every app mount verbatim in cron', () => {
        const appVolumes = compose.services.app?.volumes ?? [];
        const cronVolumes = compose.services.cron?.volumes ?? [];

        expect(appVolumes.length).toBeGreaterThan(0);
        expect(appVolumes.filter((volume) => !cronVolumes.includes(volume))).toEqual([]);
    });
});

describe('worker is the queue consumer, in its own container', () => {
    /**
     * `app` only publishes, so a `worker` that ran the web entry would leave every job unconsumed
     * and a `worker` missing its volumes would fail every mail attachment and image digest.
     */
    it('runs the worker entry, not the web one', () => {
        expect([compose.services.worker?.command ?? []].flat().join(' ')).toBe(
            'node --import tsx src/worker.ts'
        );
    });

    it('lists every app mount verbatim, like cron', () => {
        const appVolumes = compose.services.app?.volumes ?? [];
        const workerVolumes = compose.services.worker?.volumes ?? [];

        expect(appVolumes.filter((volume) => !workerVolumes.includes(volume))).toEqual([]);
    });

    it('publishes no port: its health listener is loopback-only', () => {
        expect(compose.services.worker?.ports ?? []).toEqual([]);
    });
});

describe('worker-heavy is the same entry under the heavy role, with a memory cap', () => {
    /**
     * A heavy worker without the role would take mail; one without the cap would let a decode
     * take the host's memory, which is what the split exists to prevent.
     */
    it('runs the worker entry with NODE_WORKER_ROLE=heavy', () => {
        expect([compose.services['worker-heavy']?.command ?? []].flat().join(' ')).toBe(
            'node --import tsx src/worker.ts'
        );
        expect(compose.services['worker-heavy']?.environment).toMatchObject({
            NODE_WORKER_ROLE: 'heavy'
        });
    });

    it('is capped below the host, in the container and in the V8 heap', () => {
        expect(compose.services['worker-heavy']?.mem_limit).toBe('1g');
        expect(compose.services['worker-heavy']?.environment).toMatchObject({
            NODE_OPTIONS: '--max-old-space-size=640'
        });
    });

    it('leaves the standard worker without the role override', () => {
        expect(compose.services.worker?.environment).not.toHaveProperty('NODE_WORKER_ROLE');
    });

    it('lists every worker mount verbatim', () => {
        const workerVolumes = compose.services.worker?.volumes ?? [];
        const heavyVolumes = compose.services['worker-heavy']?.volumes ?? [];

        expect(workerVolumes.filter((volume) => !heavyVolumes.includes(volume))).toEqual([]);
    });
});

describe('the production image carries no package manager, so nothing starts through one', () => {
    /**
     * npm, corepack and yarn ship in the Node base image with their own CVEs, and a running
     * container never needs them. The runtime stage removes them, so a command that still says
     * `npm` would fail at boot instead of in review.
     */
    it('starts the web process with node, not npm', () => {
        expect(dockerfile).toContain('CMD ["node", "--import", "tsx", "src/main.ts"]');
    });

    it('removes npm, npx, corepack and yarn from the runtime stage', () => {
        const runtimeStage = stageOf('runtime');

        for (const removed of [
            '/usr/local/lib/node_modules/npm',
            '/usr/local/bin/npx',
            '/opt/yarn-v*'
        ])
            expect(runtimeStage).toContain(removed);
    });

    it.each(OWN_CODE_SERVICES)('has %s run no npm command', (service) => {
        const command = [compose.services[service]?.command ?? []].flat().join(' ');

        expect(command).not.toMatch(/\bnpm\b/);
    });
});

describe('production runs no debugger', () => {
    /**
     * `--inspect` opens a port that grants arbitrary code execution inside the process, with no
     * authentication beyond reaching it. It arrives by being left behind after a debugging
     * session, which is why this reads the files rather than trusting that nobody would.
     *
     * Three places can introduce it: the image's own CMD/ENTRYPOINT, a `command:` override in
     * compose, and `NODE_OPTIONS` in either. The compose file is checked as raw text so an
     * anchor, an override and an env file default are all covered by one match.
     */
    it('no --inspect flag survives in the production image or stack', () => {
        const composeText = readFileSync(path.join(REPO_ROOT, 'compose.production.yaml'), 'utf8');

        expect(dockerfile).not.toMatch(/--inspect/);
        expect(composeText).not.toMatch(/--inspect/);
    });
});

describe('the production image installs no lifecycle scripts', () => {
    /**
     * A dependency's `postinstall` runs with the build's privileges and network, during a step
     * that produces the artifact you deploy — the shape of every npm supply-chain compromise.
     * `--ignore-scripts` refuses them all; this repo's own `postinstall` is then run by name on
     * the line after, which is the difference between trusting one script and trusting the tree.
     * https://docs.npmjs.com/cli/v10/using-npm/scripts#ignore-scripts
     */
    it('every npm ci in the production build ignores scripts', () => {
        /**
         * Comment lines out first: this Dockerfile explains its own `npm ci` choice in prose, and
         * a prose mention is not an install step.
         */
        const instructions = dockerfile
            .split('\n')
            .filter((line) => !line.trimStart().startsWith('#'))
            .join('\n');
        const installs = instructions.match(/npm ci[^\n]*/g) ?? [];

        expect(installs.length).toBeGreaterThan(0);
        for (const install of installs) expect(install).toContain('--ignore-scripts');
    });
});

/**
 * Every secret each service mounts, by service name.
 *
 * @returns service name to the secret names its `secrets:` lists
 */
const mountedSecrets = (): Record<string, string[]> =>
    Object.fromEntries(
        Object.entries(compose.services).map(([name, service]) => [name, service.secrets ?? []])
    );

/**
 * A service's `environment:` as a name-to-value map, whichever of compose's two spellings it used.
 *
 * @param name - the service
 */
const environmentOf = (name: string): Record<string, string> => {
    const { environment } = compose.services[name] ?? {};
    if (Array.isArray(environment))
        return Object.fromEntries(
            environment.map((entry) => [
                entry.slice(0, entry.indexOf('=')),
                entry.slice(entry.indexOf('=') + 1)
            ])
        );
    return environment ?? {};
};

describe('the monitoring profile', () => {
    const MONITORING = ['prometheus', 'alertmanager', 'loki', 'alloy'];

    /** Off by default: a plain `up` must not start four more services. */
    it.each(MONITORING)('%s starts only under the monitoring profile', (name) => {
        expect(compose.services[name].profiles).toEqual(['monitoring']);
    });

    it.each(MONITORING)('%s drops every capability and gains no privilege', (name) => {
        expect(compose.services[name].cap_drop).toEqual(['ALL']);
        expect(compose.services[name].security_opt).toContain('no-new-privileges:true');
    });

    /**
     * No target, no off-host copy: the optional audit-forward file defaults to /dev/null (a valid,
     * do-nothing Alloy config), so nothing leaves the host until an operator names a file.
     */
    it('mounts no audit target by default', () => {
        const volumes = (compose.services.alloy as { volumes?: string[] }).volumes ?? [];
        const auditMount = volumes.find((volume) => volume.endsWith('/audit-forward.alloy:ro'));

        expect(auditMount).toBe(
            '${ALLOY_AUDIT_FORWARD_CONFIG:-/dev/null}:/etc/alloy/conf.d/audit-forward.alloy:ro'
        );
    });

    /** One credential, one rotation: Prometheus reads the file the app reads its own token from. */
    it('hands the metrics token to Prometheus, and its own secrets to Alertmanager', () => {
        const holders = Object.entries(mountedSecrets())
            .filter(([name, secrets]) => MONITORING.includes(name) && secrets.length > 0)
            .map(([name, secrets]) => [name, secrets]);

        expect(holders).toEqual([
            ['prometheus', ['metrics_token']],
            [
                'alertmanager',
                [
                    'smtp_password',
                    'alert_webhook_url',
                    'alert_heartbeat_token',
                    'alert_ntfy_url',
                    'alert_ntfy_token',
                    'alert_telegram_bot_token',
                    'alert_pushover_user_key',
                    'alert_pushover_token'
                ]
            ]
        ]);
    });

    /**
     * Alloy runs as root over the engine's whole container directory and Loki stores what it ships.
     * A secret mounted into either would sit inside what the log shipper can read.
     */
    it('mounts no secret into the log shipper or the log store', () => {
        const { alloy, loki } = mountedSecrets();

        expect(alloy ?? []).toEqual([]);
        expect(loki ?? []).toEqual([]);
    });
});

describe('each service gets only its own secrets', () => {
    /**
     * The Mongo root account is for creating the app's own user and for starting the replica set.
     * Code execution in the app must not be able to read it, so only the two containers that do
     * those jobs mount it. This is the property a shared `env_file:` would break.
     */
    it('mounts the Mongo root password only in database and mongo-rs-init', () => {
        const holders = Object.entries(mountedSecrets())
            .filter(([, secrets]) => secrets.includes('mongo_root_password'))
            .map(([name]) => name);

        expect(holders.toSorted()).toEqual(['database', 'mongo-rs-init']);
    });

    it('keeps the cache, limits and broker passwords out of the one-shot setup', () => {
        const { setup } = mountedSecrets();

        expect(setup).not.toContain('redis_password');
        expect(setup).not.toContain('limits_password');
        expect(setup).not.toContain('rabbitmq_password');
        expect(setup).toContain('mongo_app_password');
    });

    /**
     * Every `NODE_X_FILE=/run/secrets/y` must name a secret the same service mounts, or the app
     * dies at boot on a path that is not there; and every declared secret must be used, or a
     * file is demanded of the operator for nothing.
     */
    it('points every *_FILE variable at a secret its own service mounts', () => {
        const dangling = Object.keys(compose.services).flatMap((name) =>
            Object.entries(environmentOf(name))
                .filter(([variable]) => variable.endsWith('_FILE'))
                .filter(
                    ([, value]) =>
                        !mountedSecrets()[name]?.includes(value.replace('/run/secrets/', ''))
                )
                .map(([variable]) => `${name}: ${variable}`)
        );

        expect(dangling).toEqual([]);
    });

    it('declares exactly the secrets some service mounts, each under the client directory', () => {
        const declared = Object.keys(compose.secrets ?? {}).toSorted();
        const mounted = [...new Set(Object.values(mountedSecrets()).flat())].toSorted();

        expect(declared).toEqual(mounted);
        for (const secret of Object.values(compose.secrets ?? {}))
            expect(secret.file).toMatch(
                /^\.\/clients\/\$\{COMPOSE_PROJECT_NAME[^}]*\}\/secrets\/[a-z_]+$/
            );
    });

    /**
     * A password on a command line shows in `ps`, in `/proc/<pid>/cmdline` and in `docker inspect`.
     */
    it('puts no password on any command line or in any environment variable', () => {
        const text = Object.entries(compose.services).flatMap(([name, service]) => [
            `${name}: ${JSON.stringify(service.command ?? '')}`,
            `${name}: ${JSON.stringify(service.healthcheck?.test ?? '')}`,
            ...Object.keys(environmentOf(name)).map((variable) => `${name}: ${variable}`)
        ]);

        expect(text.join('\n')).not.toMatch(/--requirepass|redis-cli.* -a |PASSWORD(?!_FILE)/);
    });

    /**
     * A variable that carries a secret value shows in `docker inspect`. A `_FILE` name never ends
     * in these words, so a service that is handed a value rather than a path is caught by its name.
     */
    it('hands no secret value to any service through its environment', () => {
        const valueCarriers = Object.keys(compose.services).flatMap((name) =>
            Object.keys(environmentOf(name))
                .filter((variable) =>
                    /(?:PASS|PASSWORD|SECRET|TOKEN)$|^ALERT_(?:WEBHOOK_URL|NTFY_URL|PUSHOVER_USER_KEY)$/.test(
                        variable
                    )
                )
                .map((variable) => `${name}: ${variable}`)
        );

        expect(valueCarriers).toEqual([]);
    });
});

/**
 * The command a service runs, flattened to one string whichever way compose spelled it.
 *
 * @param name - the service
 */
const commandLineOf = (name: string): string => {
    const { entrypoint, command } = compose.services[name] ?? {};
    return [entrypoint, command].flat().filter(Boolean).join(' ');
};

describe('the cache and the limits are two Redis instances', () => {
    /**
     * Eviction is per Redis INSTANCE. A rate-limit counter or a spent single-use claim on the
     * evicting cache is a budget that resets and a solution that replays, so they live on their own
     * instance that can only refuse a write, never drop a key.
     * https://redis.io/docs/latest/develop/reference/eviction/
     */
    it('evicts on the cache, never on the limits', () => {
        expect(commandLineOf('cache')).toMatch(
            /--maxmemory-policy \$\{NODE_REDIS_MAXMEMORY_POLICY:-allkeys-lru\}/
        );
        expect(commandLineOf('cache')).toMatch(/--maxmemory \$\{NODE_REDIS_MAXMEMORY:-256mb\}/);
        expect(commandLineOf('limits')).toMatch(/--maxmemory-policy noeviction/);
        expect(commandLineOf('limits')).toMatch(/--maxmemory \S+/);
    });

    it('gives the limits its own password, held only by the services that dial it', () => {
        const holders = Object.entries(mountedSecrets())
            .filter(([, secrets]) => secrets.includes('limits_password'))
            .map(([name]) => name);

        expect(holders.toSorted()).toEqual(['app', 'cron', 'limits', 'worker', 'worker-heavy']);
    });

    it('points the limiter at the limits service, never at the cache', () => {
        const appEnvironment = environmentOf('app');

        expect(appEnvironment.NODE_RATE_LIMIT_REDIS_URL).toContain('redis://limits:6379');
        expect(appEnvironment.NODE_RATE_LIMIT_REDIS_URL).not.toContain('cache');
        expect(appEnvironment.NODE_RATE_LIMIT_REDIS_PASSWORD_FILE).toBe(
            '/run/secrets/limits_password'
        );
    });
});

describe('compose.yaml shares names, builds and pins, and nothing the production verdicts read', () => {
    /**
     * Production runs as `-f compose.yaml -f compose.production.yaml`, and every assertion above reads
     * `compose.production.yaml` alone. That is only sound while the base file sets none of the keys those
     * assertions reason about: then the merge cannot change a verdict, and this file needs no compose-merge
     * logic of its own.
     */
    const GUARDED_KEYS = new Set([
        'ports',
        'environment',
        'command',
        'secrets',
        'read_only',
        'cap_drop',
        'cap_add',
        'security_opt',
        'logging',
        'healthcheck',
        'profiles'
    ]);

    const parsedBase: unknown = parse(readFileSync(path.join(REPO_ROOT, 'compose.yaml'), 'utf8'), {
        merge: true
    });
    if (!isComposeFile(parsedBase))
        throw new Error('[production-topology] compose.yaml did not parse to an object.');

    it('lists at least one service to check', () => {
        expect(Object.keys(parsedBase.services).length).toBeGreaterThan(0);
    });

    it.each(Object.entries(parsedBase.services))('sets no guarded key on %s', (_name, service) => {
        expect(Object.keys(service).filter((key) => GUARDED_KEYS.has(key))).toEqual([]);
    });

    it('names in production every service it lists', () => {
        expect(
            Object.keys(parsedBase.services).filter((name) => !(name in compose.services))
        ).toEqual([]);
    });
});

/**
 * `NODE_*_FILE` variables of an env file, as variable to the secret file's name (the last path segment).
 *
 * @param text - a dotenv-style file: `NAME=value` lines, `#` comments
 */
const secretFilesOfEnv = (text: string): Map<string, string> =>
    new Map(
        text
            .split('\n')
            .map((line) => /^(NODE_[A-Z0-9_]+_FILE)=\/run\/secrets\/(\S+)$/.exec(line))
            .filter((match) => match !== null)
            .map((match) => [match[1] ?? '', match[2] ?? ''])
    );

/**
 * The words of every `for name in <words>; do` list in a shell script, backslash continuations joined.
 *
 * @param script - the script's text
 */
const forNameLists = (script: string): string[] =>
    [...script.replaceAll('\\\n', ' ').matchAll(/for name in ([^;]+); do/g)].flatMap((match) =>
        (match[1] ?? '').split(/\s+/).filter(Boolean)
    );

describe('the Kubernetes manifests, compose, the rig and boot-check name the same secret files', () => {
    const k8sFiles = secretFilesOfEnv(
        readFileSync(path.join(REPO_ROOT, 'k8s', 'base', 'app.env'), 'utf8')
    );
    const rigScript = readFileSync(path.join(REPO_ROOT, 'k8s', 'rig.sh'), 'utf8');
    const bootCheck = readFileSync(path.join(REPO_ROOT, 'docker', 'boot-check.sh'), 'utf8');

    /**
     * The passwords of the backing services. The rig runs Mongo, Redis and no broker, all without
     * auth (k8s/base/app.env says so), so it has no file for them. Everything else is shared.
     */
    const BACKING_PASSWORDS = [
        'NODE_DB_PASSWORD_FILE',
        'NODE_REDIS_PASSWORD_FILE',
        'NODE_RATE_LIMIT_REDIS_PASSWORD_FILE',
        'NODE_RABBITMQ_PASSWORD_FILE'
    ];
    const composeFiles = secretFilesOfEnv(
        Object.entries(environmentOf('app'))
            .map(([variable, value]) => `${variable}=${value}`)
            .join('\n')
    );
    for (const variable of BACKING_PASSWORDS) composeFiles.delete(variable);

    /**
     * boot-check.sh names its throwaway files short (`totp`, `pii`) and sets only the variables the
     * production gate needs to boot. The map is explicit: the short name is not derivable from the variable.
     */
    const BOOT_CHECK_FILE_NAMES: Record<string, string> = {
        NODE_TOKEN_ACCESS_FILE: 'token_access',
        NODE_TOKEN_REFRESH_FILE: 'token_refresh',
        NODE_TOTP_ENCRYPTION_KEY_FILE: 'totp',
        NODE_PII_ENCRYPTION_KEY_FILE: 'pii',
        NODE_WEBHOOK_SECRET_ENCRYPTION_KEY_FILE: 'webhook',
        NODE_PSEUDONYM_KEY_FILE: 'pseudonym',
        NODE_METRICS_TOKEN_FILE: 'metrics',
        NODE_DEVICE_COOKIE_SECRET_FILE: 'device_cookie'
    };
    const bootCheckFiles = secretFilesOfEnv(
        [...bootCheck.matchAll(/-e (NODE_[A-Z0-9_]+_FILE=\/run\/secrets\/\S+)/g)]
            .map((match) => match[1])
            .join('\n')
    );

    // A parity test over two empty sets passes; this one cannot.
    it('reads a non-empty set from every source', () => {
        expect(k8sFiles.size).toBeGreaterThan(0);
        expect(composeFiles.size).toBeGreaterThan(0);
        expect(forNameLists(rigScript).length).toBeGreaterThan(0);
        expect(bootCheckFiles.size).toBeGreaterThan(0);
    });

    it('gives the manifests and the production compose the same variables, each on the same file', () => {
        expect(Object.fromEntries(k8sFiles)).toEqual(Object.fromEntries(composeFiles));
    });

    it('has the rig create exactly the secret files the manifests mount', () => {
        expect(forNameLists(rigScript).toSorted()).toEqual([...k8sFiles.values()].toSorted());
    });

    it('declares in the production compose every secret file the manifests mount', () => {
        expect(Object.keys(compose.secrets ?? {})).toEqual(
            expect.arrayContaining([...k8sFiles.values()])
        );
    });

    it('has boot-check set only variables the manifests set, on the file it generates', () => {
        const generated = forNameLists(bootCheck);
        const wrong = [...bootCheckFiles].filter(
            ([variable, file]) =>
                !k8sFiles.has(variable) || BOOT_CHECK_FILE_NAMES[variable] !== file
        );

        expect(wrong).toEqual([]);
        expect(generated.toSorted()).toEqual(Object.values(BOOT_CHECK_FILE_NAMES).toSorted());
        expect(Object.keys(BOOT_CHECK_FILE_NAMES).toSorted()).toEqual(
            [...bootCheckFiles.keys()].toSorted()
        );
    });
});

/**
 * The names of the networks a service joins, whichever of compose's two spellings it used.
 *
 * @param name - the service
 */
const networksOf = (name: string): string[] => {
    const { networks } = compose.services[name] ?? {};
    return Array.isArray(networks) ? networks : Object.keys(networks ?? {});
};

/**
 * The default of a `${VARIABLE:-default}` interpolation, which is the value a stack without an override runs.
 *
 * @param text - a compose value
 * @throws {Error} when the value is not of that form
 */
const defaultOf = (text: string): string => {
    const match = /^\$\{[A-Z_]+:-([^}]*)\}$/.exec(text);
    if (!match) throw new Error(`[production-topology] "${text}" is not a \${VARIABLE:-default}.`);
    return match[1] ?? '';
};

/**
 * The services that mount a secret, sorted.
 *
 * @param secret - the secret's name
 */
const holdersOf = (secret: string): string[] =>
    Object.entries(mountedSecrets())
        .filter(([, secrets]) => secrets.includes(secret))
        .map(([name]) => name)
        .toSorted();

/**
 * The fixed address a service takes on a network.
 *
 * @param name - the service
 * @param network - the network the address is looked up on
 * @throws {Error} when the service lists its networks as bare names, so it can have no fixed address
 */
const fixedAddressOn = (name: string, network: string): string => {
    const { networks } = compose.services[name] ?? {};
    if (networks === undefined || Array.isArray(networks))
        throw new Error(`[production-topology] ${name} lists no per-network options.`);
    return networks[network]?.ipv4_address ?? '';
};

/** The Zammad services: everything the `helpdesk` profile starts. */
const ZAMMAD_SERVICES = Object.keys(compose.services).filter((name) => name.startsWith('zammad-'));

/** The two Zammad services nginx proxies to, which share `helpdesk-edge` with it. */
const EDGE_NEIGHBOURS = ['zammad-nginx', 'zammad-railsserver', 'zammad-websocket'];

/** The services that call Zammad or dump its database, so they join `helpdesk`. */
const HELPDESK_CLIENTS = ['app', 'cron', 'worker', 'worker-heavy', 'backup', 'restore-drill'];

describe('the helpdesk profile: images', () => {
    /**
     * The pin is what makes an upgrade a decision: a floating tag would run a migration on the next
     * restart, with no backup taken first, and Zammad has no downgrade.
     */
    it.each([
        ...ZAMMAD_SERVICES.filter((name) => name !== 'zammad-nginx'),
        'restore-drill-helpdesk-db'
    ])('%s runs an image pinned by tag and digest', (name) => {
        const [reference = '', digest = ''] = (compose.services[name]?.image ?? '').split('@', 2);

        expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
        // A tag too: the digest alone says nothing to a reader, and Dependabot moves the two together.
        expect(reference.slice(reference.lastIndexOf('/') + 1)).toContain(':');
    });

    /**
     * 7.2.1 fixed a critical bypass of Zammad's two-factor layer and 7.2.3 a brute-force of it; staff
     * sign-in rests on that layer, so the pin never goes below the fix.
     */
    it('pins Zammad at 7.2.3 or later', () => {
        const tag = /:(\d+)\.(\d+)\.(\d+)(?:-\d+)?@/.exec(
            compose.services['zammad-railsserver']?.image ?? ''
        );
        const [major, minor, patch] = (tag?.slice(1, 4) ?? []).map(Number);

        // A pin in a shape this reads wrongly must fail, not pass vacuously.
        expect(tag).not.toBeNull();
        expect([major, minor, patch]).not.toContain(undefined);
        expect(
            (major ?? 0) * 1_000_000 + (minor ?? 0) * 1000 + (patch ?? 0)
        ).toBeGreaterThanOrEqual(7_002_003);
    });

    it('runs every Zammad process from the one image', () => {
        const images = new Set(
            [
                'zammad-init',
                'zammad-railsserver',
                'zammad-scheduler',
                'zammad-websocket',
                'zammad-nginx'
            ].map((name) => compose.services[name]?.image)
        );

        expect(images.size).toBe(1);
    });

    it('keeps Zammad on the same Postgres major as the backup image reads', () => {
        const dockerfileBackup = readFileSync(
            path.join(REPO_ROOT, 'docker', 'Dockerfile.backup'),
            'utf8'
        );

        expect(compose.services['zammad-postgres']?.image).toMatch(/\/postgres:17\./);
        expect(dockerfileBackup).toContain('postgresql-client-17');
    });

    it('ships no Elasticsearch', () => {
        const withSearch = ZAMMAD_SERVICES.filter(
            (name) => environmentOf(name).ELASTICSEARCH_ENABLED === 'true'
        );

        expect(Object.keys(compose.services).filter((name) => /elasticsearch/i.test(name))).toEqual(
            []
        );
        expect(withSearch).toEqual([]);
        expect(environmentOf('zammad-railsserver').ELASTICSEARCH_ENABLED).toBe('false');
    });
});

describe('the helpdesk profile: what starts, and what is exposed', () => {
    it('lists the Zammad services it expects', () => {
        // A census of one: with none found, every `it.each` below would pass over nothing.
        expect(ZAMMAD_SERVICES.toSorted()).toEqual([
            'zammad-init',
            'zammad-memcached',
            'zammad-nginx',
            'zammad-postgres',
            'zammad-railsserver',
            'zammad-redis',
            'zammad-scheduler',
            'zammad-websocket'
        ]);
    });

    it.each(ZAMMAD_SERVICES)('%s starts only under the helpdesk profile', (name) => {
        expect(compose.services[name]?.profiles).toEqual(['helpdesk']);
    });

    it.each(ZAMMAD_SERVICES)('%s drops every capability and gains no privilege', (name) => {
        expect(compose.services[name]?.cap_drop).toEqual(['ALL']);
        expect(compose.services[name]?.security_opt).toContain('no-new-privileges:true');
    });

    it('runs no Zammad service as root', () => {
        expect(
            ZAMMAD_SERVICES.filter((name) =>
                /^(?:root|0)(?::|$)/.test(compose.services[name]?.user ?? '')
            )
        ).toEqual([]);
    });

    /** One door: the browser's. Everything else is reached over a network the host cannot see. */
    it('publishes exactly one port, nginx, on loopback', () => {
        const published = ZAMMAD_SERVICES.filter(
            (name) => (compose.services[name]?.ports ?? []).length > 0
        );

        expect(published).toEqual(['zammad-nginx']);
        expect(hostInterfaceOf(compose.services['zammad-nginx']?.ports?.[0] ?? '')).toBe(
            '127.0.0.1'
        );
        expect(compose.services['zammad-nginx']?.ports?.[0]).toContain('${ZAMMAD_PORT:-3060}');
    });

    it('has the backup mount Zammad read-only, and no helpdesk container other than the throwaway in the drill', () => {
        expect(compose.services.backup?.volumes).toContain(
            'zammad-storage:/data/zammad-storage:ro'
        );
        expect(compose.services['restore-drill-helpdesk-db']?.profiles).toEqual(['restore-drill']);
        expect(compose.services['restore-drill-helpdesk-db']?.ports ?? []).toEqual([]);
    });

    /**
     * Two roles, two secrets: the bootstrap superuser's file is mounted by the database alone, so code
     * execution in a Zammad process or in the backup container never holds a superuser login.
     */
    it('keeps the Postgres superuser password in zammad-postgres alone', () => {
        expect(holdersOf('zammad_postgres_superuser_password')).toEqual(['zammad-postgres']);
        expect(environmentOf('zammad-postgres').POSTGRES_PASSWORD_FILE).toBe(
            '/run/secrets/zammad_postgres_superuser_password'
        );
        expect(environmentOf('zammad-postgres').ZAMMAD_DB_PASS_FILE).toBe(
            '/run/secrets/zammad_postgres_password'
        );
    });

    it('hands the Zammad API token to the four services that call Zammad and to `setup`, which checks the whole configuration, and the database password to its own', () => {
        expect(holdersOf('zammad_api_token')).toEqual([
            'app',
            'cron',
            'setup',
            'worker',
            'worker-heavy'
        ]);
        expect(holdersOf('zammad_postgres_password')).toEqual([
            'backup',
            'zammad-init',
            'zammad-postgres',
            'zammad-railsserver',
            'zammad-scheduler',
            'zammad-websocket'
        ]);
    });
});

describe('the helpdesk profile: networks', () => {
    /**
     * Zammad makes outbound calls (mail, webhooks), so it must not sit on the network Mongo and both
     * Redis instances share. The file had no explicit networks before, so every OTHER service now
     * names `default`: leaving one out would move it onto a network of its own.
     */
    it.each(ZAMMAD_SERVICES)('%s is not on the default network', (name) => {
        expect(networksOf(name)).not.toContain('default');
        expect(networksOf(name).length).toBeGreaterThan(0);
    });

    it('names the default network on every service that is not Zammad', () => {
        const without = Object.keys(compose.services)
            .filter((name) => !ZAMMAD_SERVICES.includes(name))
            .filter((name) => !networksOf(name).includes('default'));

        expect(without).toEqual([]);
    });

    it('lets exactly the services that call Zammad or dump it join helpdesk', () => {
        const joined = Object.keys(compose.services)
            .filter((name) => !ZAMMAD_SERVICES.includes(name))
            .filter((name) => networksOf(name).includes('helpdesk'));

        expect(joined.toSorted()).toEqual(HELPDESK_CLIENTS.toSorted());
    });

    /**
     * A fixed subnet on a network every stack creates makes a second client stack on the host fail to
     * come up (two stacks on one host: docs/operate/two-client-stacks.md). The fixed one is
     * `helpdesk-edge`, which only Zammad's own proxy tier joins, so a stack without the profile never
     * creates it.
     */
    it('puts a fixed subnet only on helpdesk-edge, and only the proxy tier joins it', () => {
        const fixed = Object.entries(compose.networks ?? {})
            .filter(([, network]) => (network?.ipam?.config ?? []).length > 0)
            .map(([name]) => name);
        const onEdge = Object.keys(compose.services).filter((name) =>
            networksOf(name).includes('helpdesk-edge')
        );

        expect(fixed).toEqual(['helpdesk-edge']);
        expect(onEdge.toSorted()).toEqual(EDGE_NEIGHBOURS.toSorted());
    });

    /**
     * Zammad can only strip a trusted proxy from `X-Forwarded-For` by exact address, so Rails must
     * trust exactly nginx's own address and the gateway that the engine's port forwarder arrives
     * from, and both must be where the network puts them. At the default, every per-address limit
     * (password reset, 2FA) becomes one shared bucket a single attacker can empty.
     */
    describe('the trusted proxies', () => {
        const edge = compose.networks?.['helpdesk-edge']?.ipam?.config?.[0];
        const nginxAddress = defaultOf(fixedAddressOn('zammad-nginx', 'helpdesk-edge'));
        const subnet = defaultOf(edge?.subnet ?? '');
        const gateway = defaultOf(edge?.gateway ?? '');

        it('are exactly nginx and the gateway', () => {
            const trusted = environmentOf('zammad-railsserver').RAILS_TRUSTED_PROXIES;

            const [first = '', second = '', ...rest] = (trusted ?? '').split(',');

            // Exactly two, each a variable with a default, and the defaults are what the network assigns.
            expect(rest).toEqual([]);
            expect(first).toContain('ZAMMAD_EDGE_NGINX_IP');
            expect(second).toContain('ZAMMAD_EDGE_GATEWAY');
            expect([defaultOf(first), defaultOf(second)]).toEqual([nginxAddress, gateway]);
        });

        it('sit inside the edge subnet, and nginx sits outside the range other services draw from', () => {
            const [network, bits] = subnet.split('/', 2);
            const block = new BlockList();
            block.addSubnet(network ?? '', Number(bits));
            const range = defaultOf(edge?.ip_range ?? '').split('/', 2);
            const dynamic = new BlockList();
            dynamic.addSubnet(range[0] ?? '', Number(range[1]));

            expect(block.check(nginxAddress)).toBe(true);
            expect(block.check(gateway)).toBe(true);
            expect(dynamic.check(nginxAddress)).toBe(false);
            expect(dynamic.check(gateway)).toBe(false);
        });

        /**
         * All five processes that start from Zammad's image carry the list: a service that dropped it
         * would fall back to trusting loopback only, and only that one would see one shared address.
         */
        it('give every Zammad process the same list', () => {
            const processes = [
                'zammad-init',
                'zammad-railsserver',
                'zammad-scheduler',
                'zammad-websocket',
                'zammad-nginx'
            ];
            const expected = environmentOf('zammad-railsserver').RAILS_TRUSTED_PROXIES;

            expect(expected).toBeTruthy();
            expect(
                Object.fromEntries(
                    processes.map((name) => [name, environmentOf(name).RAILS_TRUSTED_PROXIES])
                )
            ).toEqual(Object.fromEntries(processes.map((name) => [name, expected])));
        });
    });
});
