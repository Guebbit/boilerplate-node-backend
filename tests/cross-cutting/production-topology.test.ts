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
            security_opt?: string[];
            ports?: PortMapping[];
            environment?: Record<string, string> | string[];
            command?: string | string[];
        }
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
const BACKING_SERVICES = ['database', 'cache', 'queue'] as const;

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
