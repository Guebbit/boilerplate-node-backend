/**
 * @module
 * The contact form's creation, announced on the bus as `task.opened`, and the mail that carries
 * the visitor's own words to the main mailbox.
 *
 * @see docs/modules/tasks.md#the-story
 */

import { TaskCategory, TaskKind, TaskResolution, TaskSource } from '@types';
import { HOUR_MS, oneCalendarMonthLaterUtc } from '@domain-primitives/time';
import type { CreateContactTaskRequest } from '@types';
import { getDefaultLocale } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { supportEmail } from '@infrastructure/adapters/config';
import { announceInTransaction } from '@kernel/outbox';
import { logger } from '@infrastructure/adapters/logger';
import { checkEmailPolicy } from '@infrastructure/adapters/antibot';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';
import type { TaskDocument } from '../model';
import { taskRepository } from '../repository';
import { contactRequestEmail, type ContactReminder } from '../emails';
import { initialTaskStatus, CONTACT_ROUTE_SET } from '../domain';
import { tasksConfig } from '../config';
import { TASK_OPENED, taskFactOf } from '../events';

/**
 * When a contact message is due. A privacy request owes an answer within one calendar month
 * (GDPR Art. 12(3)); every other message waits the configured SLA.
 *
 * @param category - what the visitor said the message is about
 * @param now - when it arrived
 */
const contactDueAt = (category: string | undefined, now: Date): Date =>
    category === TaskCategory.privacy
        ? oneCalendarMonthLaterUtc(now)
        : new Date(now.getTime() + tasksConfig().NODE_TASKS_CONTACT_SLA_HOURS * HOUR_MS);

/**
 * Record a contact request and announce it as `task.opened` — unless the honeypot caught it.
 *
 * Both halves live here because "a customer asked us something" is one event, not a write plus a
 * thing the HTTP layer remembers to do afterwards. Who is told, and how, is `notifications`'
 * business: it hears the event.
 *
 * Honeypot:   `payload.website` is a field a real browser always submits empty and a bot reliably
 *             fills, declared in the contract but never persisted (see `TaskDocument`)
 *             or read back. A non-empty value writes the row as `spam` and announces nothing
 *             — the bot still gets its `202`, so it learns nothing, but nobody's inbox hears
 *             about it.
 * Account:    `subjectId` is the signed-in sender's account, so the export and the erasure follow the
 *             task to the person; absent for an anonymous sender.
 * Disposable: a disposable-inbox domain (`checkEmailPolicy`, off by default) is treated the same
 *             way — filed as `spam`, not announced, still a `202`. A visible refusal would
 *             tell a spam script exactly which signal caught it.
 */
export const create = (
    payload: CreateContactTaskRequest,
    subjectId?: string
): Promise<TaskDocument> => {
    const email = normalizeEmail(payload.email);
    const now = new Date();
    const honeypotFilled = Boolean(payload.website?.trim());

    return checkEmailPolicy(email).then((verdict) => {
        const suspectedSpam = honeypotFilled || verdict === 'refused';

        /**
         * The message and its `task.opened` row commit together. Suspected spam is stored
         * (closed at birth) but announces nothing: contact spam tells nobody.
         */
        return announceInTransaction(
            (session) =>
                taskRepository.create(
                    {
                        name: payload.name?.trim() || undefined,
                        ...(subjectId ? { subjectId: toObjectId(subjectId) } : {}),
                        email,
                        subject: payload.subject.trim(),
                        message: payload.message.trim(),
                        ...(payload.category ? { category: payload.category } : {}),
                        ...(payload.orderNumber?.trim()
                            ? { orderNumber: payload.orderNumber.trim() }
                            : {}),
                        source: TaskSource.visitor,
                        kind: TaskKind.contact,
                        routeSet: CONTACT_ROUTE_SET,
                        status: initialTaskStatus(suspectedSpam),
                        // Spam is closed at birth: it ages from now and never owes work.
                        ...(suspectedSpam
                            ? { closedAt: now, resolution: TaskResolution.spam }
                            : { dueAt: contactDueAt(payload.category, now) })
                    },
                    session
                ),
            (created) =>
                suspectedSpam
                    ? []
                    : {
                          name: TASK_OPENED,
                          payload: taskFactOf(created),
                          aggregateId: String(created._id)
                      }
        );
    });
};

/**
 * Mail the contact message to the main mailbox, `NODE_SUPPORT_EMAIL`, every time. The one mail
 * that carries the visitor's own words: staff answer it from that mailbox, and it carries
 * `Reply-To: <the visitor>` so pressing Reply reaches them. A no-op for a task that is gone or
 * not a contact message.
 *
 * It goes to the operator, not to the sender, so it renders in `NODE_DEFAULT_LOCALE` and takes no
 * `CallerContext`. A failed queue is logged, never raised: the task is already stored.
 *
 * @param taskId - the contact task
 * @param reminder - word it as that reminder, not as a new message
 */
export const mailMainMailbox = (taskId: string, reminder?: ContactReminder): Promise<void> => {
    const mailbox = supportEmail();

    return taskRepository.findById(taskId).then((task) => {
        if (!task?.email || task.kind !== TaskKind.contact) return;

        const mail = contactRequestEmail(getDefaultLocale(), {
            id: String(task._id),
            orderNumber: task.orderNumber,
            name: task.name,
            email: task.email,
            subject: task.subject,
            message: task.message,
            category: task.category,
            createdAt: task.createdAt?.toISOString(),
            reminder
        });

        /**
         * The first mail's id is derived from the task, so the reminder can name it as its parent
         * without anything stored. `<task-<id>@<support domain>>`.
         */
        const domain = mailbox.slice(mailbox.lastIndexOf('@') + 1);
        const firstId = `<task-${String(task._id)}@${domain}>`;

        return enqueueEmail(
            /**
             * `replyTo`: the bare address only (already normalised on create), never a display
             * name: the visitor's free-text name must not reach a header.
             */
            {
                to: mailbox,
                subject: mail.subject,
                text: mail.text,
                replyTo: task.email,
                ...(reminder
                    ? {
                          messageId: `<task-${String(task._id)}-${reminder}@${domain}>`,
                          inReplyTo: firstId
                      }
                    : { messageId: firstId })
            },
            mail.template,
            mail.data
        )
            .then(() => undefined)
            .catch((error: unknown) => {
                // Stryker disable all
                logger.error({ message: 'task main mailbox email failed', error });
                // Stryker restore all
            });
    });
};
