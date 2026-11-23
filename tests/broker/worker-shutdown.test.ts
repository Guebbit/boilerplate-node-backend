/**
 * What a worker does with the job it is running when SIGTERM arrives: finish it, ack it, leave
 * nothing behind on the broker, and exit 0 inside the grace period.
 *
 * `src/worker.ts` is spawned as a real process, the way a kubelet runs it, because the thing under
 * test is the signal handler, `stop` and `process.exit` together: none of them runs under jest.
 * The job is a real mail job (`worker.email.send`); the slow part is a fake SMTP server that
 * withholds its final answer (`./support/held-smtp.ts`), so no demo or test code lives in `src/`.
 *
 * The case, in order:
 *   1. worker A boots alone and is the only consumer, so the job reaches it;
 *   2. the job is published and A is stuck on the SMTP answer;
 *   3. worker B boots (the rolling-update replacement), then A gets SIGTERM;
 *   4. once A has logged the signal and the lame-duck delay has passed, the SMTP answer is released: the
 *      job finishes while `stopQueue` is waiting for running jobs;
 *   5. A exits 0 inside the grace period; nothing is left ready, unacked, in retry or parked; the mail was
 *      sent once, so no redelivery reached B.
 *
 * Needs a broker with the management plugin: see `./support/rabbitmq.ts`.
 *
 * @see docs/build/broker-testing.md#the-worker-shutdown-case
 */

import { spawn, type ChildProcess } from 'node:child_process';
import amqplib from 'amqplib';
import { retryUntil } from '@tests/eventually';
import { REPO_ROOT } from '@tests/paths';
import { bootableEnvironment, createMarkerCounter, freePort, stopChild } from '@tests/spawned-app';
import { startHeldSmtp, type HeldSmtp } from './support/held-smtp';
import { startRabbitMq, type TestRabbitMq } from './support/rabbitmq';

/** Booting two processes and waiting on a broker's stats is slower than jest's default. */
jest.setTimeout(180_000);

/** What `src/app/worker-process.ts` logs once its listener is bound: boot finished, consumers bound. */
const READY_MARKER = 'Worker listening on port';

/** What `createShutdownHandler` logs when the signal reaches the process. */
const SIGNAL_MARKER = 'starting graceful shutdown';

/**
 * The worker's own deadline for the teardown, after the lame-duck delay: the grace period.
 * 30 s, not the default 15: `stopQueue` waits for running jobs 20 % of it (6 s), so a slow runner
 * still keeps about 4.8 s of margin between the release and the end of that wait.
 */
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;

/** The lame-duck delay before teardown starts; short, because no load balancer is watching. */
const SHUTDOWN_DELAY_MS = 500;

/** The management API refreshes its counters on this interval (RabbitMQ's default is 5 s). */
const MANAGEMENT_STATS_INTERVAL_MS = 5000;

/** How long to poll the counters for: a quorum queue's stats lag about two intervals, plus slack. */
const MANAGEMENT_STATS_SETTLE_MS = MANAGEMENT_STATS_INTERVAL_MS * 4;

/** The mail queue the email consumer reads (`EMAIL_QUEUE` in `queue.ts`). */
const MAIL_QUEUE = 'worker.email.send';

/** The throwaway RabbitMQ the suite runs against. */
let broker: TestRabbitMq;

/** The fake SMTP server the mail job talks to. */
let smtp: HeldSmtp;

/** Every worker a case started; stopped after it, whatever it asserted. */
const workers: Worker[] = [];

/** One spawned worker process and what it has logged. */
interface Worker {
    /** The process, for the signal. */
    child: ChildProcess;
    /** Counts the ready line, to know the consumers are bound. */
    ready: ReturnType<typeof createMarkerCounter>;
    /** Counts the shutdown line, to know the signal arrived. */
    signalled: ReturnType<typeof createMarkerCounter>;
    /** The last output, shown when boot fails. */
    output: string[];
}

beforeAll(() =>
    startRabbitMq()
        .then((started) => {
            broker = started;
            return startHeldSmtp();
        })
        .then((started) => {
            smtp = started;
        })
);

afterAll(() => smtp.stop().then(() => broker.stop()));

afterEach(() => Promise.all(workers.splice(0).map(({ child }) => stopChild(child))));

/** Resolves once `check` stops throwing, polling; rejects after `timeoutMs` with `what` in the message. */
const waitFor = (check: () => void, what: string, timeoutMs: number): Promise<void> =>
    retryUntil(() => Promise.resolve().then(check), timeoutMs, 100).catch((error: unknown) => {
        throw new Error(`Timed out waiting for ${what}: ${String(error)}`);
    });

/**
 * Spawns `src/worker.ts` as its own process, pointed at the run's broker, mongod and SMTP server,
 * and resolves once the mail queue has `consumersAfterBoot` consumers on it.
 *
 * `node --import tsx`, not `npx tsx`: the pid signalled is the worker's own, one SIGTERM, as a
 * kubelet sends it.
 *
 * @param consumersAfterBoot - how many consumers the queue holds once this worker is bound
 */
const bootWorker = async (consumersAfterBoot: number): Promise<Worker> => {
    const port = await freePort();
    const child = spawn('node', ['--import', 'tsx', 'src/worker.ts'], {
        cwd: REPO_ROOT,
        env: {
            ...bootableEnvironment({
                port,
                // The shared in-memory mongod `jest.config.broker.js`'s globalSetup starts.
                dbUri: process.env.NODE_TEST_MONGO_URI ?? ''
            }),
            NODE_WORKER_PORT: String(port),
            // The worker mounts the metrics scrape, and `NODE_ENV=development` refuses a short or placeholder token.
            NODE_METRICS_TOKEN: 'c4f1a9d27b3e8a05e6d9b2c71f4a8e30d5b7c9a1e2f4863b0d7a5c9e1f2b3a46',
            NODE_RABBITMQ_URL: broker.url,
            NODE_MAIL_TRANSPORT: 'smtp',
            NODE_SMTP_HOST: '127.0.0.1',
            NODE_SMTP_PORT: String(smtp.port),
            NODE_SMTP_USER: 'worker@example.com',
            NODE_SMTP_PASS: 'not-a-secret',
            NODE_SMTP_SENDER: 'Shutdown test <worker@example.com>',
            NODE_SHUTDOWN_DELAY_MS: String(SHUTDOWN_DELAY_MS),
            NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS: String(GRACEFUL_SHUTDOWN_TIMEOUT_MS)
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const worker: Worker = {
        child,
        ready: createMarkerCounter(READY_MARKER),
        signalled: createMarkerCounter(SIGNAL_MARKER),
        output: []
    };
    workers.push(worker);
    const capture = (chunk: Buffer | string): void => {
        const text = String(chunk);
        worker.output.push(text);
        worker.ready.feed(text);
        worker.signalled.feed(text);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);

    await waitFor(
        () => {
            if (worker.ready.count() === 0) throw new Error('not ready yet');
        },
        'a worker to boot',
        90_000
    )
        .then(() =>
            /**
             * The ready line comes BEFORE the consumer is bound (`consumeFromQueue` only records a
             * binding while the channel is still opening), and a job published into that gap goes
             * to a queue that does not exist yet: dropped, never delivered. So wait on the broker.
             */
            retryUntil(
                () =>
                    consumersOnMailQueue().then((count) => {
                        if (count < consumersAfterBoot)
                            throw new Error(`${String(count)} consumers`);
                    }),
                30_000,
                200
            )
        )
        .catch((error: unknown) => {
            throw new Error(`${String(error)}\nThe worker's output:\n${worker.output.join('')}`);
        });
    return worker;
};

/**
 * Consumers bound to the mail queue right now, read live (a passive declare; the management API's
 * counters lag by their stats interval). Rejects while the queue does not exist yet.
 */
const consumersOnMailQueue = (): Promise<number> =>
    amqplib.connect(broker.url).then((connection) =>
        connection
            .createChannel()
            .then((channel) => {
                // A passive declare of a missing queue closes the channel with a 404; the rejection below is the answer.
                channel.on('error', () => undefined);
                return channel.checkQueue(MAIL_QUEUE);
            })
            .then((declared) => declared.consumerCount)
            .finally(() => connection.close())
    );

/**
 * A mail job as `enqueueEmail` publishes it: a template name and the finished copy it prints.
 *
 * Published through a raw channel, in the adapter's own envelope: the producer side is not what
 * this case tests, and importing it would drag the web process's boot in.
 */
const publishMailJob = (): Promise<void> =>
    amqplib.connect(broker.url).then((connection) =>
        connection
            .createConfirmChannel()
            .then(
                (channel) =>
                    new Promise<void>((resolve, reject) => {
                        channel.sendToQueue(
                            MAIL_QUEUE,
                            Buffer.from(
                                JSON.stringify({
                                    request: {
                                        to: 'ana@example.com',
                                        subject: 'Held in flight'
                                    },
                                    templateName: 'account.reset-request',
                                    data: {
                                        locale: 'en',
                                        pageMetaTitle: 'Reset your password',
                                        greeting: 'Hi Ana,',
                                        intro: 'Use the link to choose a new password.',
                                        linkLabel: 'Choose a password',
                                        linkUrl: 'https://example.com/reset#token=abc',
                                        ignore: 'Ignore this if it was not you.',
                                        footer: 'Sent by the shutdown test.'
                                    }
                                })
                            ),
                            { persistent: true, contentType: 'application/json' },
                            (error) => {
                                if (error)
                                    reject(
                                        error instanceof Error ? error : new Error(String(error))
                                    );
                                else resolve();
                            }
                        );
                    })
            )
            .finally(() => connection.close())
    );

describe('a worker that gets SIGTERM while it runs a job', () => {
    it('finishes the job, acks it, leaves nothing on the broker and exits 0 inside the grace period', async () => {
        const stopping = await bootWorker(1);
        await publishMailJob();
        // The job is now inside nodemailer, waiting on an answer the fake server will not give yet.
        await Promise.race([
            smtp.held(),
            new Promise<never>((_resolve, reject) => {
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                `The mail job never reached the SMTP server. The worker's output:\n${stopping.output.join('')}`
                            )
                        ),
                    30_000
                ).unref();
            })
        ]);

        const replacement = await bootWorker(2);
        const signalledAt = Date.now();
        const exited = stopChild(stopping.child);

        await waitFor(
            () => {
                if (stopping.signalled.count() === 0) throw new Error('no signal logged yet');
            },
            'the worker to log the signal',
            10_000
        );
        /**
         * Released only after the lame-duck delay, so the job is still running when `stopQueue`
         * starts waiting for running jobs: that wait is what this case is for. Released at once,
         * the job would be acked before the wait began and the guard would never be exercised.
         */
        await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_DELAY_MS + 1000));
        smtp.release();

        expect(await exited).toBe(0);
        expect(Date.now() - signalledAt).toBeLessThan(
            SHUTDOWN_DELAY_MS + GRACEFUL_SHUTDOWN_TIMEOUT_MS
        );
        expect(smtp.accepted()).toBe(1);

        /**
         * The management counters lag by their stats interval, and a quorum queue's lag more than
         * once over, so one read after a fixed sleep can still show the job. Poll until all six
         * counters settle at zero; the last read is the failure message. The first wait outlasts
         * the lag, so an all-zero read that is merely stale cannot pass a message still unacked.
         */
        await new Promise((resolve) =>
            setTimeout(resolve, MANAGEMENT_STATS_INTERVAL_MS * 2 + 1000)
        );
        await retryUntil(
            () =>
                Promise.all([
                    broker.management.queue(MAIL_QUEUE),
                    broker.management.queue(`${MAIL_QUEUE}.retry`),
                    broker.management.queue(`${MAIL_QUEUE}.dead`)
                ]).then(([work, retry, dead]) => {
                    // A handler that threw during shutdown is acked and republished to retry/dead, so an empty work queue alone proves nothing.
                    expect([
                        work.messages_ready,
                        work.messages_unacknowledged,
                        retry.messages_ready,
                        retry.messages_unacknowledged,
                        dead.messages_ready,
                        dead.messages_unacknowledged
                    ]).toEqual([0, 0, 0, 0, 0, 0]);
                }),
            MANAGEMENT_STATS_SETTLE_MS,
            1000
        );
        /**
         * A job finished inside the wait is not redelivered: the documented promise, not
         * exactly-once in general (a job that outlives the wait is redelivered by design). A
         * redelivery to the replacement is answered at once now, so it would count a second mail.
         */
        expect(smtp.accepted()).toBe(1);
        // The replacement is the one consumer left: it is up and bound, not a casualty of the roll.
        expect(replacement.child.exitCode).toBeNull();
        expect(await consumersOnMailQueue()).toBe(1);
    });
});
