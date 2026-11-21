#!/usr/bin/env tsx
/**
 * @module
 * The rig's drill: a rolling restart of `app` under steady traffic, then a live stream across pods.
 * Run by `k8s/rig.sh drill` against the kind cluster `rig.sh up` made; exits 1 when a check fails.
 *
 * Checks:  no request fails during the restart; every old pod exits 0 inside its grace period with
 *          no forced-exit log line; each old pod leaves the Service's ready endpoints well before
 *          it stops; a stream held on an old pod gets the drain `retry:`; a stream held on a new
 *          pod receives a frame caused by a write on another pod; a pod with no allow rule cannot
 *          open a connection to app, mongo or cache, while the worker, worker-heavy and cron
 *          labels still reach mongo and cache (NetworkPolicy, k8s/base/networkpolicy.yaml).
 * Reuses:  the replicas suite's client and stream reader (`tests/replicas/support`).
 *
 * @see docs/build/kubernetes-testing.md
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { retryUntil } from '@tests/eventually';
import { call, jsonHeaders, signUpAndLogIn } from '../tests/replicas/support/client';
import { openNotificationStream } from '../tests/replicas/support/event-stream';

/** Where the rig lives, from `rig.sh`. */
const KUBECONFIG = process.env.RIG_KUBECONFIG ?? '';

/** The kubectl context of the rig: every call names it, so the drill can never reach another cluster. */
const CONTEXT = process.env.RIG_CONTEXT ?? '';

/** The namespace the stack runs in. */
const NAMESPACE = process.env.RIG_NAMESPACE ?? 'boilerplate';

/** The host port the edge answers on. */
const EDGE = `http://127.0.0.1:${process.env.RIG_PORT ?? '3072'}`;

/** `terminationGracePeriodSeconds` of `app` (k8s/base/app.yaml), as milliseconds. */
const GRACE_MS = 30_000;

/** Requests in flight at once during the restart, each followed by a short pause. */
const LOADERS = 4;

/** Pause between one loader's requests. */
const LOADER_PAUSE_MS = 20;

/** A pod must leave the ready endpoints at least this long before its container exits. */
const MIN_DRAIN_GAP_MS = 1000;

/** How often the Service's endpoints are sampled. */
const ENDPOINT_SAMPLE_MS = 250;

/**
 * Prints a line to stdout: this is a command-line tool, and its output is the product.
 *
 * @param line - what to print
 */
const say = (line: string): void => {
    process.stdout.write(`${line}\n`);
};

/** One verdict of the drill. */
interface Check {
    /** What was checked. */
    name: string;
    /** Whether it held. */
    ok: boolean;
    /** The numbers behind the verdict. */
    detail: string;
}

/** What a pod's watch has shown so far. */
interface PodRecord {
    /** The last exit code seen on its container, when it has terminated. */
    exitCode?: string;
    /** When that exit was seen (ms since the epoch). */
    exitAt?: number;
    /** When a sample first saw the pod outside the ready endpoints, after seeing it inside. */
    droppedAt?: number;
    /** Everything its log stream printed. */
    log: string;
}

/**
 * Runs kubectl against the rig and resolves with its stdout.
 *
 * @param arguments_ - kubectl arguments after the context flags
 */
const kubectl = (arguments_: string[]): Promise<string> =>
    new Promise((resolve, reject) => {
        execFile(
            'kubectl',
            ['--kubeconfig', KUBECONFIG, '--context', CONTEXT, '-n', NAMESPACE, ...arguments_],
            { maxBuffer: 64 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error)
                    reject(
                        new Error(`kubectl ${arguments_.join(' ')}: ${stderr || error.message}`)
                    );
                else resolve(stdout);
            }
        );
    });

/**
 * Starts a long-running kubectl and hands each stdout line to `onLine`.
 *
 * @param arguments_ - kubectl arguments after the context flags
 * @param onLine - called with every complete stdout line
 * @returns the child, so the caller can kill it
 */
const kubectlStream = (arguments_: string[], onLine: (line: string) => void): ChildProcess => {
    const child = spawn(
        'kubectl',
        ['--kubeconfig', KUBECONFIG, '--context', CONTEXT, '-n', NAMESPACE, ...arguments_],
        { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    let pending = '';
    child.stdout.on('data', (chunk: Buffer) => {
        const lines = (pending + String(chunk)).split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) onLine(line);
    });
    return child;
};

/**
 * The names of the app pods that are Running and Ready now.
 *
 * @returns pod names, oldest first
 */
const readyPods = (): Promise<string[]> =>
    kubectl([
        'get',
        'pods',
        '-l',
        'app.kubernetes.io/name=app',
        '--sort-by=.metadata.creationTimestamp',
        '-o',
        String.raw`jsonpath={range .items[?(@.status.containerStatuses[0].ready==true)]}{.metadata.name}{"\n"}{end}`
    ]).then((out) => out.split('\n').filter((name) => name !== ''));

/**
 * The pods behind the `app` Service that are ready, from its EndpointSlices.
 *
 * @returns pod names
 */
const readyEndpoints = (): Promise<Set<string>> =>
    kubectl([
        'get',
        'endpointslices',
        '-l',
        'kubernetes.io/service-name=app',
        '-o',
        String.raw`jsonpath={range .items[*].endpoints[?(@.conditions.ready==true)]}{.targetRef.name}{"\n"}{end}`
    ]).then((out) => new Set(out.split('\n').filter((name) => name !== '')));

/**
 * Forwards a random local port to a pod's HTTP port, so a request reaches THAT pod and no other.
 *
 * @param pod - the pod name
 * @returns the base URL and the child to kill
 */
const portForward = (pod: string): Promise<{ base: string; child: ChildProcess }> =>
    new Promise((resolve, reject) => {
        const child = kubectlStream(
            ['port-forward', '--address', '127.0.0.1', `pod/${pod}`, ':3000'],
            (line) => {
                // kubectl prints "Forwarding from 127.0.0.1:<port> -> 3000" once it is listening.
                const port = /127\.0\.0\.1:(\d+) ->/.exec(line)?.[1];
                if (port) resolve({ base: `http://127.0.0.1:${port}`, child });
            }
        );
        child.on('error', reject);
        child.on('exit', () =>
            reject(new Error(`port-forward to ${pod} ended before it listened`))
        );
    });

/** What the steady traffic saw, and the handle to stop it. */
interface Traffic {
    /** Status of every answered request. */
    statuses: number[];
    /** Requests that got no answer at all. */
    errors: unknown[];
    /** Stops the loaders and resolves once the last request is done. */
    stop: () => Promise<void>;
}

/**
 * Sends `GET /` through the edge from several loaders until stopped.
 *
 * @param base - the edge's base URL
 */
const startTraffic = (base: string): Traffic => {
    const statuses: number[] = [];
    const errors: unknown[] = [];
    let running = true;
    const loop = (): Promise<void> =>
        running
            ? call(base, '/')
                  .then(
                      (answer) => void statuses.push(answer.status),
                      (error: unknown) => void errors.push(error)
                  )
                  .then(() => new Promise((done) => setTimeout(done, LOADER_PAUSE_MS)))
                  .then(loop)
            : Promise.resolve();
    const loaders = Array.from({ length: LOADERS }, loop);
    return {
        statuses,
        errors,
        stop: () => {
            running = false;
            return Promise.all(loaders).then(() => undefined);
        }
    };
};

/**
 * Watches what the cluster does to the old pods: their exit codes, their logs and the moment each
 * leaves the ready endpoints. Everything lands in `records`.
 *
 * @param oldPods - pods that exist before the restart
 * @param records - filled in as events arrive
 * @returns the children to kill and the endpoint sampler's stop function
 */
const watchOldPods = (
    oldPods: string[],
    records: Map<string, PodRecord>
): { children: ChildProcess[]; stopSampling: () => void } => {
    for (const pod of oldPods) records.set(pod, { log: '' });
    const children = oldPods.map((pod) =>
        kubectlStream(['logs', '-f', '--tail=0', `pod/${pod}`], (line) => {
            const record = records.get(pod);
            if (record) record.log += `${line}\n`;
        })
    );
    // One line per pod update (kubectl pads the columns with spaces): name, then the container's exit code once it has terminated.
    children.push(
        kubectlStream(
            [
                'get',
                'pods',
                '-l',
                'app.kubernetes.io/name=app',
                '--watch',
                '-o',
                String.raw`jsonpath={.metadata.name}{"\t"}{.status.containerStatuses[0].state.terminated.exitCode}{"\n"}`
            ],
            (line) => {
                const [pod, exitCode] = line.trim().split(/\s+/, 2);
                const record = records.get(pod);
                if (!record || !exitCode) return;
                record.exitCode = exitCode;
                record.exitAt = Date.now();
            }
        )
    );
    const seenReady = new Set<string>();
    let sampling = true;
    const sample = (): Promise<void> =>
        sampling
            ? readyEndpoints()
                  .then((ready) => {
                      for (const pod of ready) seenReady.add(pod);
                      for (const pod of seenReady) {
                          const record = records.get(pod);
                          if (record?.droppedAt === undefined && record && !ready.has(pod))
                              record.droppedAt = Date.now();
                      }
                  })
                  .catch(() => undefined)
                  .then(() => new Promise((done) => setTimeout(done, ENDPOINT_SAMPLE_MS)))
                  .then(sample)
            : Promise.resolve();
    sample().catch(() => undefined);
    return {
        children,
        stopSampling: () => {
            sampling = false;
        }
    };
};

/**
 * Compares what happened to each old pod with what the rollout promises.
 *
 * @param records - what the watchers saw
 */
const checkOldPods = (records: Map<string, PodRecord>): Check[] => {
    const rows = [...records];
    const badExit = rows.filter(([, record]) => record.exitCode !== '0').map(([pod]) => pod);
    const forced = rows
        .filter(([, record]) => record.log.includes('Graceful shutdown timeout'))
        .map(([pod]) => pod);
    const gaps = rows.map(([pod, record]) => ({
        pod,
        gap: (record.exitAt ?? NaN) - (record.droppedAt ?? NaN)
    }));
    const late = gaps.filter(({ gap }) => !(gap >= MIN_DRAIN_GAP_MS));
    return [
        {
            name: `every old pod exits 0 inside the ${String(GRACE_MS / 1000)} s grace period`,
            ok: badExit.length === 0,
            detail:
                badExit.length === 0
                    ? `${String(rows.length)} pods, all exit 0`
                    : `not 0: ${badExit.join(', ')}`
        },
        {
            name: 'no old pod logs "Graceful shutdown timeout"',
            ok: forced.length === 0,
            detail: forced.length === 0 ? 'none' : `forced: ${forced.join(', ')}`
        },
        {
            name: `each old pod leaves the ready endpoints ≥ ${String(MIN_DRAIN_GAP_MS)} ms before it exits`,
            ok: late.length === 0,
            detail: gaps.map(({ pod, gap }) => `${pod}: ${String(gap)} ms`).join('; ')
        }
    ];
};

/**
 * Marks the account's inbox read through `viaBase` until `stream` (held by ANOTHER pod) has the
 * frame: the subscriber opens with the stream, so a first write can precede it.
 *
 * @param viaBase - base URL of the pod that writes
 * @param bearer - the access token
 * @param stream - the held stream
 */
const writeUntilHeard = (
    viaBase: string,
    bearer: string,
    stream: Awaited<ReturnType<typeof openNotificationStream>>
): Promise<void> =>
    retryUntil(
        () =>
            call(viaBase, '/notifications/read-all', {
                method: 'POST',
                headers: jsonHeaders(bearer)
            }).then(() => stream.waitForEvent('notifications.read', 500)),
        30_000,
        50
    );

/** Seconds a connection attempt may hang before the probe calls it dropped. */
const PROBE_TIMEOUT_S = 5;

/**
 * Opens one TCP connection from a throwaway pod inside the namespace and says what happened.
 * A NetworkPolicy drops the packets silently, so a blocked target is a timeout, not a refusal.
 *
 * @param name - the pod's name suffix, unique per probe
 * @param role - the `app.kubernetes.io/name` the pod carries: it decides which allow rules match
 * @param image - an image with `node` in it (the app's own, already loaded on the node)
 * @param target - `host:port` to connect to
 * @returns `OPEN`, `TIMEOUT` or `ERROR <code>`
 */
const probeFrom = (name: string, role: string, image: string, target: string): Promise<string> => {
    const [host, port] = target.split(':', 2);
    // Node's net.connect with a socket timeout: https://nodejs.org/api/net.html#netconnectoptions-connectlistener
    const script = `const s=require('node:net').connect({host:'${host}',port:${port},timeout:${String(PROBE_TIMEOUT_S * 1000)}});s.on('connect',()=>{console.log('OPEN');process.exit(0)});s.on('timeout',()=>{console.log('TIMEOUT');process.exit(0)});s.on('error',(e)=>{console.log('ERROR '+e.code);process.exit(0)})`;
    return kubectl([
        'run',
        `netpol-probe-${name}`,
        '--rm',
        '-i',
        '--quiet',
        '--restart=Never',
        `--image=${image}`,
        // The image is on the node already; the node has no registry for `localhost/…`.
        '--image-pull-policy=Never',
        `--labels=app.kubernetes.io/name=${role}`,
        '--command',
        '--',
        'node',
        '-e',
        script
    ]).then((out) => out.trim().split('\n').at(-1) ?? '');
};

/**
 * The NetworkPolicy checks: a pod that matches no allow rule is dropped at app, mongo and cache,
 * and the worker, worker-heavy and cron labels still reach mongo and cache (so the probe itself works).
 * Run after the restart: a pod labelled `app` would join the Service's endpoints. The `worker`,
 * `worker-heavy` and `cron` labels join no Service the drill uses.
 */
const checkNetworkPolicy = async (): Promise<Check[]> => {
    const image = await kubectl([
        'get',
        'deployment/app',
        '-o',
        'jsonpath={.spec.template.spec.containers[0].image}'
    ]).then((out) => out.trim());
    const stamp = Date.now().toString(36);
    const cases = [
        { role: 'netpol-stranger', target: 'app:3000', expected: 'TIMEOUT' },
        { role: 'netpol-stranger', target: 'mongo:27017', expected: 'TIMEOUT' },
        { role: 'netpol-stranger', target: 'cache:6379', expected: 'TIMEOUT' },
        { role: 'worker', target: 'mongo:27017', expected: 'OPEN' },
        { role: 'worker', target: 'cache:6379', expected: 'OPEN' },
        { role: 'worker-heavy', target: 'mongo:27017', expected: 'OPEN' },
        { role: 'worker-heavy', target: 'cache:6379', expected: 'OPEN' },
        { role: 'cron', target: 'mongo:27017', expected: 'OPEN' },
        { role: 'cron', target: 'cache:6379', expected: 'OPEN' }
    ];
    return Promise.all(
        cases.map(({ role, target, expected }, index) =>
            probeFrom(`${stamp}-${String(index)}`, role, image, target).then(
                (got): Check => ({
                    name: `a ${role} pod reaching ${target}: ${expected}`,
                    ok: got === expected,
                    detail: `got ${got}`
                }),
                (error: unknown): Check => ({
                    name: `a ${role} pod reaching ${target}: ${expected}`,
                    ok: false,
                    detail: String(error)
                })
            )
        )
    );
};

/** Prints the verdicts and returns the exit code. */
const report = (checks: Check[]): number => {
    for (const { name, ok, detail } of checks)
        say(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
    return checks.every(({ ok }) => ok) ? 0 : 1;
};

/** The whole drill; resolves the verdicts. */
const drill = async (): Promise<Check[]> => {
    const cleanups: (() => unknown)[] = [];
    try {
        const name = `rig-${Date.now().toString(36)}`;
        say(`signing ${name} up and in through the edge ${EDGE}`);
        const { bearer, cookie } = await signUpAndLogIn(EDGE, name);

        const oldPods = await readyPods();
        say(`old pods: ${oldPods.join(', ')}`);
        const records = new Map<string, PodRecord>();
        const watchers = watchOldPods(oldPods, records);
        cleanups.push(() => {
            watchers.stopSampling();
            for (const child of watchers.children) child.kill();
        });

        // A stream held on ONE old pod through the restart (port-forward names the pod).
        const held = await portForward(oldPods[0]);
        cleanups.push(() => held.child.kill());
        const heldStream = await openNotificationStream(held.base, cookie);
        cleanups.push(() => heldStream.close());

        const traffic = startTraffic(EDGE);
        say('kubectl rollout restart deployment/app, under steady traffic');
        await kubectl(['rollout', 'restart', 'deployment/app'])
            .then(() => kubectl(['rollout', 'status', 'deployment/app', '--timeout=360s']))
            .finally(() => traffic.stop());
        // The old pods finish terminating after the rollout reports done.
        await retryUntil(
            () =>
                [...records.values()].every((record) => record.exitCode !== undefined)
                    ? Promise.resolve()
                    : Promise.reject(
                          new Error(
                              `an old pod has not exited yet: ${JSON.stringify([...records].map(([pod, record]) => [pod, record.exitCode, record.droppedAt, record.log.length]))}`
                          )
                      ),
            GRACE_MS + 30_000,
            500
        );
        watchers.stopSampling();

        const checks: Check[] = [
            {
                name: 'no request failed during the restart (every answer 2xx, no reset connection)',
                ok:
                    traffic.errors.length === 0 &&
                    traffic.statuses.length > 100 &&
                    traffic.statuses.every((status) => status >= 200 && status < 300),
                detail: `${String(traffic.statuses.length)} requests, non-2xx: ${String(
                    traffic.statuses.filter((status) => status < 200 || status >= 300).length
                )}, no answer: ${String(traffic.errors.length)}`
            },
            ...checkOldPods(records)
        ];

        await retryUntil(
            () =>
                heldStream.received().includes('retry:')
                    ? Promise.resolve()
                    : Promise.reject(new Error('no retry: frame yet')),
            10_000,
            100
        ).then(
            () =>
                checks.push({
                    name: 'a stream held on an old pod got the drain retry:',
                    ok: true,
                    detail: heldStream.received().trim().split('\n').slice(-2).join(' | ')
                }),
            () =>
                checks.push({
                    name: 'a stream held on an old pod got the drain retry:',
                    ok: false,
                    detail: `received: ${heldStream.received()}`
                })
        );

        // The client's reconnect: a stream on one NEW pod, a write through ANOTHER new pod.
        const [reader, writer] = await readyPods();
        const readerForward = await portForward(reader);
        const writerForward = await portForward(writer);
        cleanups.push(
            () => readerForward.child.kill(),
            () => writerForward.child.kill()
        );
        const reconnected = await openNotificationStream(readerForward.base, cookie);
        cleanups.push(() => reconnected.close());
        await writeUntilHeard(writerForward.base, bearer, reconnected).then(
            () =>
                checks.push({
                    name: `a frame caused on ${writer} reaches the stream held on ${reader}`,
                    ok: true,
                    detail: 'notifications.read received'
                }),
            (error: unknown) =>
                checks.push({
                    name: `a frame caused on ${writer} reaches the stream held on ${reader}`,
                    ok: false,
                    detail: String(error)
                })
        );
        checks.push(...(await checkNetworkPolicy()));
        return checks;
    } finally {
        await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
    }
};

drill()
    .then((checks) => {
        process.exitCode = report(checks);
    })
    .catch((error: unknown) => {
        process.stderr.write(
            `DRILL ABORTED: ${error instanceof Error ? error.message : String(error)}\n`
        );
        process.exitCode = 1;
    });
