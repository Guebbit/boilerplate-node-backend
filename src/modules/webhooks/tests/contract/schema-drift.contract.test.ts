/**
 * @module
 * `WebhookSubscriptionCreated` restates `WebhookSubscription` flat instead of composing it with
 * `allOf`, because two sibling schemas each declaring `additionalProperties: false` is a JSON
 * Schema trap ajv can't see through — see the comment on `WebhookSubscriptionCreated` in
 * `../../openapi.yaml`. `unevaluatedProperties` would let the composition stay closed without the
 * restatement, but the judge of this repo's contract tests is the orval-generated Zod schemas
 * (`tests/support/response-contract.ts`), which cannot compose two closed siblings either.
 *
 * So the two property lists exist twice, by hand, with nothing else keeping them in sync. This
 * test is that: it reads the module's own `openapi.yaml` fragment, never the generated root
 * bundle, and fails the moment `WebhookSubscription` gains, loses or renames a field that
 * `WebhookSubscriptionCreated` doesn't mirror.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/** Fields `WebhookSubscriptionCreated` legitimately adds on top of `WebhookSubscription`. */
const CREATED_ONLY_FIELDS = new Set(['secret', 'newSecret']);

interface ObjectSchema {
    properties: Record<string, unknown>;
    required?: string[];
}

const spec = parse(readFileSync(path.resolve(__dirname, '../../openapi.yaml'), 'utf8')) as {
    components: { schemas: Record<string, ObjectSchema> };
};

const subscription = spec.components.schemas.WebhookSubscription;
const created = spec.components.schemas.WebhookSubscriptionCreated;

describe('WebhookSubscriptionCreated mirrors WebhookSubscription', () => {
    it('carries every WebhookSubscription property', () => {
        const missing = Object.keys(subscription.properties).filter(
            (field) => !(field in created.properties)
        );

        expect(missing).toEqual([]);
    });

    it('adds no property beyond the known secret-reveal fields', () => {
        const unexpected = Object.keys(created.properties).filter(
            (field) => !(field in subscription.properties) && !CREATED_ONLY_FIELDS.has(field)
        );

        expect(unexpected).toEqual([]);
    });

    it('requires the same fields as WebhookSubscription', () => {
        expect(new Set(created.required)).toEqual(new Set(subscription.required));
    });
});
