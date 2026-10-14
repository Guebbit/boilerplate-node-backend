/**
 * @module
 * Every field a request body can carry has a label, in every language — and no label is spare.
 *
 * Validation copy names the field ("Il campo email è obbligatorio"). A body property without a
 * label would fall back to the neutral phrase and read worse; a label without a property is dead
 * copy that nobody will ever delete. Both are caught here, walking the generated `*Body` schemas
 * rather than a hand-kept list, so a contract change cannot outrun the dictionary.
 *
 * Path params are deliberately outside it: a bad id 404s before validation, so they use the
 * fallback phrase. See `docs/tools/i18n.md#validation-messages`.
 */

import { z } from 'zod';
import * as schemas from '@api/schemas.zod';
import { listSupportedLocales, readLocaleDictionary } from '@infrastructure/i18n';
import { isDeployed } from '@tests/paths';

/** Query fields shared by many routes, labelled although they are not `*Body` properties. */
const SHARED_QUERY_FIELDS = ['page', 'pageSize', 'text', 'since'];

/** A JSON-Schema node, as `z.toJSONSchema` emits it. */
interface SchemaNode {
    properties?: Record<string, SchemaNode>;
    items?: SchemaNode;
    additionalProperties?: SchemaNode | boolean;
    anyOf?: SchemaNode[];
    oneOf?: SchemaNode[];
    allOf?: SchemaNode[];
}

/** Collects every property name under a node, at any depth. */
const collectNames = (node: SchemaNode | boolean | undefined, into: Set<string>): void => {
    if (typeof node !== 'object') return;
    for (const [name, child] of Object.entries(node.properties ?? {})) {
        into.add(name);
        collectNames(child, into);
    }
    collectNames(node.items, into);
    collectNames(node.additionalProperties, into);
    for (const branch of [...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])])
        collectNames(branch, into);
};

/** Every property of every generated request body. */
const bodyFields = (): Set<string> => {
    const names = new Set<string>();
    for (const [exportName, schema] of Object.entries(schemas)) {
        if (!exportName.endsWith('Body')) continue;
        collectNames(
            // Zod → JSON Schema: `io: 'input'` is the request shape; `unrepresentable: 'any'`
            // lets dates and transforms through instead of throwing.
            z.toJSONSchema(schema as z.ZodType, {
                unrepresentable: 'any',
                io: 'input'
            }) as SchemaNode,
            names
        );
    }
    return names;
};

const expected = [...new Set([...bodyFields(), ...SHARED_QUERY_FIELDS])].toSorted();

describe('validation attribute labels', () => {
    it('finds body fields to label, so the checks below are not vacuous', () => {
        // More than half the fields are the shop's; the foundation alone clears the lower floor.
        expect(expected.length).toBeGreaterThan(isDeployed('orders') ? 100 : 40);
    });

    it.each(listSupportedLocales())('%s labels exactly the fields requests carry', (locale) => {
        const dictionary = readLocaleDictionary(locale) as {
            validation: { attributes: Record<string, string> };
        };

        expect(Object.keys(dictionary.validation.attributes).toSorted()).toEqual(expected);
    });
});
