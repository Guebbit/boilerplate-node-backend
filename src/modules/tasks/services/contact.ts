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
import { contactRequestEmail, contactWaitingEmail, type ContactReminder } from '../emails';
import { initialTaskStatus, CONTACT_ROUTE_SET } from '../domain';
import { tasksConfig } from '../config';
import { TASK_OPENED, taskFactOf } from '../events';
import { contactDelivery, supportMailboxIsHelpdesk } from '../contact-delivery';

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
 * Which signal, if any, marks the message as suspected spam: a filled honeypot, or a refused
 * address (`checkEmailPolicy`, off by default).
 *
 * Honeypot:   `payload.website` is a field a real browser always submits empty and a bot reliably
 *             fills, declared in the contract but never persisted (see `TaskDocument`) or read
 *             back. It wins when both fire, and it never leaves this module.
 * Disposable: a disposable-inbox domain is treated the same way. A visible refusal would tell a
 *             spam script exactly which signal caught it. A help desk may file this one itself.
 *
 * @param payload - the form
 * @param email - the normalised address
 * @see docs/understand/defences/automation-and-abuse.md#the-ladder
 */
const spamSignal = (
    payload: CreateContactTaskRequest,
    email: string
): Promise<'honeypot' | 'email' | undefined> =>
    checkEmailPolicy(email).then((verdict) => {
        if (payload.website?.trim()) return 'honeypot';
        return verdict === 'refused' ? 'email' : undefined;
    });

/**
 * Store the message as a contact to-do and announce it as `task.opened`, unless it is spam.
 *
 * Both halves live here because "a customer asked us something" is one event, not a write plus a
 * thing the HTTP layer remembers to do afterwards. Who is told, and how, is `notifications`'
 * business: it hears the event.
 *
 * @param payload - the form
 * @param email - the normalised address
 * @param suspectedSpam - filed as `spam`, closed at birth, announcing nothing: the bot still gets
 *   its `202`, so it learns nothing, but nobody's inbox hears about it
 * @param subjectId - the signed-in sender's account, so the export and the erasure follow the
 *   task to the person; absent for an anonymous sender
 */
const storeContactTask = (
    payload: CreateContactTaskRequest,
    email: string,
    suspectedSpam: boolean,
    subjectId?: string
): Promise<TaskDocument> => {
    const now = new Date();

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
};

/**
 * Record a contact request as a to-do and announce it as `task.opened`: basic mode, always
 * available. The route calls {@link submit}, which offers the message to a help desk first; a help
 * desk that gave up calls this to fall back.
 *
 * @param payload - the form
 * @param subjectId - the signed-in sender's account, absent for an anonymous sender
 */
export const create = (
    payload: CreateContactTaskRequest,
    subjectId?: string
): Promise<TaskDocument> => {
    const email = normalizeEmail(payload.email);
    return spamSignal(payload, email).then((signal) =>
        storeContactTask(payload, email, signal !== undefined, subjectId)
    );
};

/**
 * What `POST /tasks` does: screen the message, offer it to the help desk port when one is on, and
 * file the basic-mode to-do when none takes it. A honeypot catch never reaches the port: it stays
 * local, as in basic mode. An email-check catch is offered with `suspectedSpam`, so a help desk can
 * file it closed; a port that declines leaves it local too.
 *
 * @param payload - the form
 * @param subjectId - the signed-in sender's account, absent for an anonymous sender
 */
export const submit = (payload: CreateContactTaskRequest, subjectId?: string): Promise<void> => {
    const email = normalizeEmail(payload.email);
    return spamSignal(payload, email).then((signal) => {
        const spam = signal !== undefined;
        const port = signal === 'honeypot' ? undefined : contactDelivery();
        const taken = port
            ? port.accept({
                  ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
                  email,
                  subject: payload.subject.trim(),
                  message: payload.message.trim(),
                  ...(payload.category ? { category: payload.category } : {}),
                  ...(payload.orderNumber?.trim()
                      ? { orderNumber: payload.orderNumber.trim() }
                      : {}),
                  ...(subjectId ? { subjectId } : {}),
                  ...(signal === 'email' ? { suspectedSpam: true as const } : {}),
                  receivedAt: new Date()
              })
            : Promise.resolve(false);
        return taken.then((accepted) =>
            accepted
                ? undefined
                : storeContactTask(payload, email, spam, subjectId).then(() => undefined)
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

        /**
         * A help desk mailbox gets the link-only mail: no customer data, no `Reply-To`. The to-do
         * exists only because the hand-over failed, so the visitor's own words stay in the admin.
         */
        const helpdesk = supportMailboxIsHelpdesk();
        const mail = helpdesk
            ? contactWaitingEmail(getDefaultLocale(), { id: String(task._id), reminder })
            : contactRequestEmail(getDefaultLocale(), {
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
                ...(helpdesk ? { noReplyTo: true } : { replyTo: task.email }),
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
