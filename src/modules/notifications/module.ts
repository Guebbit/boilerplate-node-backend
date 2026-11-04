/**
 * @module
 * The notifications inbox: one row per message per user, kept until its owner deletes it, the
 * per-user cap pushes it out, or the account goes. Written by domain events, never by an import
 * in the other direction: nothing imports this module to send a message, which keeps the graph
 * acyclic and the producers ignorant of the inbox. Depends on the producers only for the event
 * names it subscribes to.
 *
 * It also carries work notices for staff (`audience: staff`): `./staff-routing` says who hears
 * what for the notices every project has, `access` and `users` say who that is today. A module
 * that adds notices (the shop's) writes them through `notificationsService` with its own routing.
 *
 * See: docs/modules/notifications.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { OUTBOX_EVENT_DEAD } from '@kernel/outbox';
import { TASK_ASSIGNED, TASK_OPENED, TASK_OVERDUE } from '@modules/tasks';
import { WEBHOOK_SUBSCRIPTION_AUTO_DISABLED } from '@modules/webhooks';
import { notificationsConfig } from './config';
import { router } from './routes';
import { notificationsService } from './services';

/** This module's manifest entry: routes, event subscriptions, config, and locales. */
export default {
    name: 'notifications',
    mounts: [{ basePath: '/notifications', routes: router }],
    config: [notificationsConfig.slice],
    personalData: [
        {
            section: 'notifications',
            collect: (subject) =>
                notificationsService.list(subject.userId).then((view) => view.items),
            // Joins the caller's own hard-delete transaction — see `notificationsService.removeByUserId`.
            erase: ({ userId }, session) => notificationsService.removeByUserId(userId, session)
        },
        {
            section: 'staffNotifications',
            // Erased with the first section: both are the same rows.
            collect: (subject) => notificationsService.listStaffNotices(subject.userId)
        }
    ],
    subscribe: () => {
        onDomainEvent(
            WEBHOOK_SUBSCRIPTION_AUTO_DISABLED,
            notificationsService.onWebhookSubscriptionAutoDisabled
        );
        onDomainEvent(OUTBOX_EVENT_DEAD, notificationsService.onOutboxEventDead);
        onDomainEvent(TASK_OPENED, notificationsService.onTaskOpened);
        onDomainEvent(TASK_OVERDUE, notificationsService.onTaskOverdue);
        onDomainEvent(TASK_ASSIGNED, notificationsService.onTaskAssigned);
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
