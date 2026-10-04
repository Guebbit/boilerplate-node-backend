/**
 * The per-query time limit (`configureMongoose`'s `maxTimeMS`) against a real database.
 *
 * What a mock cannot say, and these cases do: that mongod itself kills a query past the limit
 * (error 50, `MaxTimeMSExpired`), for a find and for an aggregate, and that a query naming its own
 * limit keeps it. A server-side `sleep` stands in for a query that scans too much.
 */
import { model, Schema } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { configureMongoose } from '@infrastructure/runtime/database';

setupTestDb();

/** One row is enough: `$where` runs once per row, so the sleep is per document. */
const probeModel = model('TimeLimitProbe', new Schema({ name: String }));

/** The server's own code for `MaxTimeMSExpired`. https://www.mongodb.com/docs/manual/reference/error-codes/ */
const MAX_TIME_MS_EXPIRED = 50;

/** The aggregation spelling of the same stall: `$where` is refused inside `$match`, `$function` is not. */
const slowAggregateStage = (ms: number) => ({
    $match: {
        $expr: {
            $function: {
                body: `function () { sleep(${String(ms)}); return true; }`,
                args: [],
                lang: 'js'
            }
        }
    }
});

/** A filter that holds the query for `ms` — server-side JavaScript, so mongod cannot hurry it. */
const slowFilter = (ms: number) => ({ $where: `sleep(${String(ms)}) || true` });

beforeEach(async () => {
    await probeModel.create({ name: 'a' });
});

afterAll(() => {
    // Back to the suite's own ceiling (`tests/support/setup-environment.ts`) for any later file in
    // this worker.
    configureMongoose();
});

describe('maxTimeMS', () => {
    it('kills a find that runs past the limit, with the server error', async () => {
        configureMongoose(150);

        await expect(probeModel.find(slowFilter(1500)).exec()).rejects.toMatchObject({
            code: MAX_TIME_MS_EXPIRED
        });
    });

    it('kills an aggregate that runs past the limit', async () => {
        configureMongoose(150);

        await expect(probeModel.aggregate([slowAggregateStage(1500)]).exec()).rejects.toMatchObject(
            { code: MAX_TIME_MS_EXPIRED }
        );
    });

    it('leaves a query inside the limit alone', async () => {
        configureMongoose(5000);

        await expect(probeModel.find({ name: 'a' }).exec()).resolves.toHaveLength(1);
    });

    // The scheduled jobs and the export opt into more by naming their own limit on the query.
    it('lets a query that names its own limit keep it, even 0 (no limit)', async () => {
        configureMongoose(150);

        await expect(probeModel.find(slowFilter(400)).maxTimeMS(0).exec()).resolves.toHaveLength(1);
        await expect(probeModel.find(slowFilter(400)).maxTimeMS(5000).exec()).resolves.toHaveLength(
            1
        );
    });

    it('lifts the limit when the knob is 0', async () => {
        configureMongoose(0);

        await expect(probeModel.find(slowFilter(400)).exec()).resolves.toHaveLength(1);
    });
});
