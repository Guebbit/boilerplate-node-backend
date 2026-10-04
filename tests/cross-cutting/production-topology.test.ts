import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/**
 * Guard: the production deployment's security posture is a property of two files, not a memory.
 *
 * `docker-compose.production.yml` and `docker/Dockerfile.production` carry four decisions that
 * cost nothing to keep and are invisible to every other check in the gate — a container gains a
 * writable root, a database publishes a port, an `--inspect` flag survives a debugging session, a
 * dependency's postinstall runs during the image build. None of them breaks a test, a type or a
 * lint rule. They break the deployment, in production, silently.
 *
 * Each is the kind of property a human catches by reading the files, once, in review — and never
 * again once the reviewer's attention moves elsewhere. This is the same reading, on every push.
 *
 * Deliberately narrow. It asserts the four properties that were actually reasoned about, not an
 * inventory of every key in the compose file — a census fails on the next legitimate edit and
 * teaches people to delete the test.
 */

const ROOT = path.join(__dirname, '..', '..');

/**
 * One entry of a service's `ports:`, in either spelling compose accepts — the short string
 * (`'127.0.0.1:3000:3000'`) or the long mapping, which names the interface as `host_ip`.
 * https://docs.docker.com/reference/compose-file/services/#ports
 */
type PortMapping = string | { host_ip?: string; published?: number | string };

/** The shape this file reads out of the compose YAML. Compose declares far more; none of it matters here. */
interface ComposeFile {
    services: Record<
        string,
        {
            read_only?: boolean;
            cap_drop?: string[];
            cap_add?: string[];
            security_opt?: string[];
            ports?: PortMapping[];
            environment?: Record<string, string> | string[];
            command?: string | string[];
            entrypoint?: string | string[];
            secrets?: string[];
            healthcheck?: { test?: string[] };
        }
    >;
    secrets?: Record<string, { file: string }>;
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
    readFileSync(path.join(ROOT, 'docker-compose.production.yml'), 'utf8'),
    { merge: true }
);
if (!isComposeFile(parsedCompose))
    throw new Error(
        '[production-topology] docker-compose.production.yml did not parse to an object.'
    );

const compose = parsedCompose;

/** The production image's build recipe, as text — the assertions below are about what it does NOT contain. */
const dockerfile = readFileSync(path.join(ROOT, 'docker', 'Dockerfile.production'), 'utf8');

/**
 * The three services that run this repository's own code.
 *
 * They share one image and one hardening block, so they must share one verdict: `cron` and `setup`
 * reach the same database and the same volumes `app` does, and a write primitive in the
 * application is a write primitive in all three.
 */
const OWN_CODE_SERVICES = ['app', 'cron', 'setup'] as const;

/**
 * The bundled backing services, which hold the data.
 *
 * They are reachable on the compose network by design and must not be reachable from anywhere
 * else — `profiles: [bundled]` means a deployment may replace them with managed instances, but
 * while they are here they are the crown jewels.
 */
const BACKING_SERVICES = ['database', 'cache', 'limits', 'queue'] as const;

/**
 * The host interface a port mapping binds, or `undefined` when it names none — which is compose's
 * way of spelling "every interface on this machine".
 *
 * @param port - one entry of a service's `ports:`, in either spelling
 * @returns the interface, e.g. `127.0.0.1`
 */
const hostInterfaceOf = (port: PortMapping): string | undefined =>
    typeof port === 'string' ? /^(\[[^\]]+]|[\d.]+):/.exec(port)?.[1] : port.host_ip;

describe('production containers are hardened', () => {
    /*
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
    /*
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
    /*
     * A published port on Mongo, Redis or RabbitMQ is reachable from the host's network, which on
     * a cloud box usually means the internet. These three speak to `app` over the compose network
     * and need no host mapping at all — the absence of a `ports:` key IS the defence.
     */
    it.each(BACKING_SERVICES)('%s maps no port to the host', (name) => {
        const service = compose.services[name];

        expect(service).toBeDefined();
        expect(service.ports ?? []).toEqual([]);
    });

    /*
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
    /*
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

describe('production runs no debugger', () => {
    /*
     * `--inspect` opens a port that grants arbitrary code execution inside the process, with no
     * authentication beyond reaching it. It arrives by being left behind after a debugging
     * session, which is why this reads the files rather than trusting that nobody would.
     *
     * Three places can introduce it: the image's own CMD/ENTRYPOINT, a `command:` override in
     * compose, and `NODE_OPTIONS` in either. The compose file is checked as raw text so an
     * anchor, an override and an env file default are all covered by one match.
     */
    it('no --inspect flag survives in the production image or stack', () => {
        const composeText = readFileSync(path.join(ROOT, 'docker-compose.production.yml'), 'utf8');

        expect(dockerfile).not.toMatch(/--inspect/);
        expect(composeText).not.toMatch(/--inspect/);
    });
});

describe('the production image installs no lifecycle scripts', () => {
    /*
     * A dependency's `postinstall` runs with the build's privileges and network, during a step
     * that produces the artifact you deploy — the shape of every npm supply-chain compromise.
     * `--ignore-scripts` refuses them all; this repo's own `postinstall` is then run by name on
     * the line after, which is the difference between trusting one script and trusting the tree.
     * https://docs.npmjs.com/cli/v10/using-npm/scripts#ignore-scripts
     */
    it('every npm ci in the production build ignores scripts', () => {
        // Comment lines out first: this Dockerfile explains its own `npm ci` choice in prose, and
        // a prose mention is not an install step.
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

describe('each service gets only its own secrets', () => {
    /*
     * The Mongo root account is for creating the app's own user and for starting the replica set.
     * Code execution in the app must not be able to read it, so only the two containers that do
     * those jobs mount it. This is the property a shared `env_file:` used to break.
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

    /*
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

        // Exact count: a vacuous pass on an empty list would prove nothing.
        expect(declared).toHaveLength(12);
        expect(declared).toEqual(mounted);
        for (const secret of Object.values(compose.secrets ?? {}))
            expect(secret.file).toMatch(
                /^\.\/clients\/\$\{COMPOSE_PROJECT_NAME[^}]*\}\/secrets\/[a-z_]+$/
            );
    });

    /*
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
    /*
     * Eviction is per Redis INSTANCE. A rate-limit counter or a spent single-use claim on the
     * evicting cache is a budget that resets and a solution that replays, so they live on their own
     * instance that can only refuse a write, never drop a key.
     * https://redis.io/docs/latest/develop/reference/eviction/
     */
    it('evicts on the cache, never on the limits', () => {
        expect(commandLineOf('cache')).toMatch(
            /--maxmemory-policy \$\{NODE_REDIS_MAXMEMORY_POLICY:-allkeys-lru}/
        );
        expect(commandLineOf('cache')).toMatch(/--maxmemory \$\{NODE_REDIS_MAXMEMORY:-256mb}/);
        expect(commandLineOf('limits')).toMatch(/--maxmemory-policy noeviction/);
        expect(commandLineOf('limits')).toMatch(/--maxmemory \S+/);
    });

    it('gives the limits its own password, held only by the services that dial it', () => {
        const holders = Object.entries(mountedSecrets())
            .filter(([, secrets]) => secrets.includes('limits_password'))
            .map(([name]) => name);

        expect(holders.toSorted()).toEqual(['app', 'cron', 'limits']);
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
