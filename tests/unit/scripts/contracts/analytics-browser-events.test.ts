import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import {
    browserEventFragments,
    withBrowserEvents
} from '../../../../scripts/contracts/analytics-browser-events';

/** A scratch directory for the fragments one case writes. */
const scratch = (): string => mkdtempSync(path.join(os.tmpdir(), 'browser-events-'));

/** Writes one fragment declaring the given schemas, returning its path. */
const fragment = (schemas: Record<string, unknown>): string => {
    const file = path.join(scratch(), 'openapi.browser-events.yaml');
    writeFileSync(file, stringify({ components: { schemas } }));
    return file;
};

/** An event schema naming `event` once, with one root ref to be made local. */
const eventSchema = (event: string) => ({
    type: 'object',
    required: ['event'],
    properties: {
        event: { type: 'string', enum: [event] },
        id: { $ref: '../../../shared/contracts/openapi.root.yaml#/components/schemas/Id' }
    }
});

/** A bundle holding the placeholder `analytics` declares, plus one unrelated schema. */
const bundle = (): string =>
    stringify({
        components: {
            schemas: {
                Other: { type: 'string' },
                AnalyticsEventRequest: { type: 'object' },
                Tail: { type: 'string' }
            }
        }
    });

/** The parsed schemas of an assembled bundle. */
const schemasOf = (text: string) =>
    (parse(text) as { components: { schemas: Record<string, Record<string, unknown>> } }).components
        .schemas;

describe('browserEventFragments', () => {
    it('finds the products fragment on disk', () => {
        expect(browserEventFragments().map((file) => file.split('/').at(-2))).toContain('products');
    });
});

describe('withBrowserEvents', () => {
    it('replaces the request schema with a oneOf discriminated on event', () => {
        const schemas = schemasOf(
            withBrowserEvents(bundle(), [
                fragment({ AViewed: eventSchema('a_viewed') }),
                fragment({ BSeen: eventSchema('b_seen') })
            ])
        );

        expect(schemas.AnalyticsEventRequest).toEqual({
            oneOf: [
                { $ref: '#/components/schemas/AViewed' },
                { $ref: '#/components/schemas/BSeen' }
            ],
            discriminator: {
                propertyName: 'event',
                mapping: {
                    a_viewed: '#/components/schemas/AViewed',
                    b_seen: '#/components/schemas/BSeen'
                }
            }
        });
    });

    it('adds the schemas right after the request schema and makes root refs local', () => {
        const schemas = schemasOf(
            withBrowserEvents(bundle(), [fragment({ AViewed: eventSchema('a_viewed') })])
        );

        expect(Object.keys(schemas)).toEqual(['Other', 'AnalyticsEventRequest', 'AViewed', 'Tail']);
        expect((schemas.AViewed.properties as Record<string, unknown>).id).toEqual({
            $ref: '#/components/schemas/Id'
        });
    });

    it('leaves the placeholder alone when no module declares an event', () => {
        const text = bundle();

        expect(withBrowserEvents(text, [])).toBe(text);
    });

    it('leaves a bundle without analytics alone', () => {
        const text = stringify({ components: { schemas: { Other: { type: 'string' } } } });

        expect(withBrowserEvents(text, [fragment({ AViewed: eventSchema('a_viewed') })])).toBe(
            text
        );
    });

    it('refuses an event name two schemas both declare', () => {
        expect(() =>
            withBrowserEvents(bundle(), [
                fragment({ One: eventSchema('same') }),
                fragment({ Two: eventSchema('same') })
            ])
        ).toThrow(/Two \(same\) is declared twice/);
    });

    it('refuses a schema whose event is not a one-value enum', () => {
        const loose = { type: 'object', properties: { event: { type: 'string' } } };

        expect(() => withBrowserEvents(bundle(), [fragment({ Loose: loose })])).toThrow(
            /Loose.*one-value string enum/
        );
    });
});
