/**
 * @module
 * Who hears what: for each work notice, the permission sets whose holders do that work, whether it
 * is worth an email, and where the notice points. One file to read to audit "who is told".
 *
 * The mail rule: `now` only where someone must act soon (money, a legal clock, security). Every
 * other code is inbox-only, so the bell is the default and the mailbox is the exception.
 *
 * See: docs/modules/notifications.md#work-notices-for-staff
 */

import { NotificationSeverity } from '@types';
import type { Caller } from '@types';
import { holds } from '@kernel/ability';
import { findRule, PERMISSION_SETS } from '@kernel/permissions';
import type { NotificationBody, StaffNotificationCode } from './model';

/** One work notice's routing: its audience, its mail class and how loud it is. */
export interface StaffRoute {
    /**
     * Permission sets whose holders are told, plus every unrestricted role. Empty means
     * administrators only.
     */
    sets: readonly string[];
    /** `now`: one mail per recipient when the notice is first written. `none`: the bell only. */
    email: 'now' | 'none';
    severity: NotificationSeverity;
}

/** Every work notice code and its routing. A code missing here does not compile. */
export const STAFF_ROUTES: Readonly<Record<StaffNotificationCode, StaffRoute>> = {
    // Abuse defence: a bot or a loop is placing and cancelling orders, and a person steps in soon.
    'notifications.staff.purchase-hold-placed': {
        sets: ['UserBanning'],
        email: 'now',
        severity: NotificationSeverity.warning
    },
    // Fix the endpoint and re-enable it: worth a look, not worth waking anyone.
    'notifications.staff.webhook-disabled': {
        sets: ['WebhookManagement'],
        email: 'none',
        severity: NotificationSeverity.warning
    }
};

/** The body of a work notice: a staff code with its own params. */
export type StaffNoticeBody = Extract<NotificationBody, { code: StaffNotificationCode }>;

/** A page of the paired frontend: the path template (no locale) and its placeholder values. */
export interface StaffLink {
    template: string;
    parameters: Record<string, string>;
}

/**
 * The frontend screen a notice points at: the account for a hold, the subscription for a disabled
 * webhook. Ids only, as the params carry; the screen has the rest.
 *
 * @param body - the notice
 */
export const staffLinkOf = (body: StaffNoticeBody): StaffLink => {
    switch (body.code) {
        case 'notifications.staff.purchase-hold-placed': {
            return { template: 'users/{id}', parameters: { id: body.params.userId } };
        }
        case 'notifications.staff.webhook-disabled': {
            return {
                template: 'webhooks/subscriptions/{id}',
                parameters: { id: body.params.subscriptionId }
            };
        }
    }
};

/**
 * Does the caller hold one of these permission sets right now? Read at the moment of asking, so a
 * member who lost the role stops seeing the notice, and an administrator sees every one.
 *
 * A set is held when every rule it bundles is. An empty list is for administrators alone.
 *
 * @param caller - the reader, in tenant scope
 * @param sets - the notice's `sets`
 */
export const callerHoldsAnySet = (caller: Caller, sets: readonly string[]): boolean =>
    caller.unrestricted ||
    PERMISSION_SETS.filter((set) => sets.includes(set.name)).some((set) =>
        set.rules.every((id) => {
            const rule = findRule(id);
            return rule !== undefined && holds(caller, rule.action, rule.subject);
        })
    );
