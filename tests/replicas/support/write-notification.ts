/**
 * @module
 * A plain process that writes one notification and exits: what a cron container's sweep is, to the
 * notifications module. It shares nothing with the copies but Mongo and Redis, so a live stream on
 * a copy can only hear it through the stores. Run as `node --import tsx <this file> <userId>` with
 * the copies' environment.
 *
 * @see docs/build/replicas-testing.md#the-multi-copy-suite
 */
import '@infrastructure/config/dotenv';
// Before any model loads: Mongoose defaults are read at schema build.
import '@infrastructure/runtime/mongoose-boot';
import { Types } from 'mongoose';
import { stopPubSub } from '@infrastructure/adapters/pubsub';
import { startJob, stopDatabase } from '@infrastructure/runtime/database';
import { notificationsService } from '@modules/notifications';
import { runScript } from '../../../scripts/run-script';

/** The id of the user the notification is for, from the command line. */
const userId = process.argv[2];

// eslint-disable-next-line @typescript-eslint/no-floating-promises -- runScript never rejects (failure is reported via process.exitCode)
void runScript(
    undefined,
    () =>
        startJob().then(() =>
            notificationsService.create([
                {
                    userId: new Types.ObjectId(userId),
                    code: 'notifications.staff.outbox-dead',
                    severity: 'warning',
                    params: { eventName: 'order.paid', aggregateId: 'from-the-cron-process' }
                }
            ])
        ),
    () => Promise.all([stopDatabase(), stopPubSub()])
);
