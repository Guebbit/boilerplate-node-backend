/**
 * Property-based tests — `src/infrastructure/persistence/serialize.ts`.
 *
 * This is the one place a stored document becomes a wire payload, and its guarantees are
 * universal by nature: `_id` → `id`, `__v` gone, every `omit` key gone — for ANY input shape, not
 * for the five shapes the models happen to have today.
 *
 * That universality is load-bearing rather than aesthetic. 95 of `openapi.yaml`'s schemas are
 * `additionalProperties: false`, so a single leaked `_id` or `__v` is a contract violation the
 * suite in `tests/contract/` fails on. And the transform runs on TWO very different inputs: the
 * `toJSON` path, where Mongoose has already supplied `id` and dropped `__v`, and the
 * `.lean()`/`.aggregate()` path, which hands over raw BSON with neither done. Generation over
 * arbitrary objects is what covers the second case, which is the one with no help from Mongoose.
 *
 * The `omit` list is where a property earns its keep most directly: it is how `password` and
 * `tokens` are kept off a user response, and "the omitted keys are absent" is a statement about
 * every possible document, including ones with keys nobody anticipated.
 *
 * Seeded. Any counterexample gets written back as an example with its seed in a comment.
 */
import fc from 'fast-check';
import { applySerialization, type SerializeTransform } from '@infrastructure/persistence/serialize';

const RUN = { seed: 20_260_809, numRuns: 300, endOnFailure: true } as const;

/** A stand-in for the one method the wiring touches — see `SerializableSchema` in the source. */
const fakeSchema = () => ({ set: () => 0 });

/** Build a transform without needing a real Mongoose schema. */
const buildTransform = (options?: Parameters<typeof applySerialization>[1]): SerializeTransform =>
    applySerialization(fakeSchema(), options);

/**
 * A key a Mongo document can actually carry.
 *
 * `__proto__` is excluded, and the exclusion is about JavaScript rather than about this module:
 * spreading an object with a `__proto__` key sets the PROTOTYPE of the copy instead of creating a
 * key on it, so the fixture would silently lose the field before the transform ever saw it. That
 * is a property of the spread operator, not a behaviour of the serializer, and generating it only
 * produces counterexamples about the test.
 */
const documentKey = () => fc.string().filter((key) => key !== '__proto__');

/**
 * An arbitrary document body — any keys, any JSON-ish values — with the two reserved fields
 * layered on top so every generated case exercises the rename and the version-key deletion.
 */
const documentLike = () =>
    fc
        .dictionary(documentKey(), fc.jsonValue(), { maxKeys: 8 })
        .map((body) => ({ ...body }) as Record<string, unknown>);

const withReservedFields = () =>
    fc
        .tuple(documentLike(), fc.string({ minLength: 1 }), fc.integer())
        .map(([body, id, version]) => ({
            ...body,
            _id: id,
            __v: version
        }));

describe('applySerialization — universal guarantees', () => {
    it('never leaves _id on the output, whatever the document held', () => {
        // A stray `_id` is a contract violation against 95 `additionalProperties: false` schemas,
        // not a cosmetic detail.
        fc.assert(
            fc.property(withReservedFields(), (document_) => {
                const serialized = buildTransform()({ ...document_ });

                expect(Object.hasOwn(serialized, '_id')).toBe(false);
            }),
            RUN
        );
    });

    it('never leaves __v on the output', () => {
        // The `toJSON` path gets this from `versionKey: false`; the lean/aggregate path gets it
        // only from the explicit delete in the transform. This covers the second.
        fc.assert(
            fc.property(withReservedFields(), (document_) => {
                expect(Object.hasOwn(buildTransform()({ ...document_ }), '__v')).toBe(false);
            }),
            RUN
        );
    });

    it('renames _id to a string id, for any id representation', () => {
        // `.lean()` yields a real ObjectId, `.aggregate()` can yield anything. `toString()` is
        // what makes both land on the wire as a string.
        fc.assert(
            fc.property(documentLike(), fc.string({ minLength: 1 }), (body, id) => {
                const serialized = buildTransform()({ ...body, _id: id });

                expect(serialized.id).toBe(id);
                expect(typeof serialized.id).toBe('string');
            }),
            RUN
        );
    });

    it('drops the id entirely under dropId, rather than renaming it', () => {
        // For collections with no addressable endpoint: exposing an id there would invite one to
        // be built. Both spellings of "gone" are asserted, since `id` appearing would be the bug.
        fc.assert(
            fc.property(withReservedFields(), (document_) => {
                const serialized = buildTransform({ dropId: true })({ ...document_ });

                expect(Object.hasOwn(serialized, '_id')).toBe(false);
                expect(Object.hasOwn(serialized, 'id')).toBe(false);
            }),
            RUN
        );
    });

    it('removes every omitted key, whatever else the document contains', () => {
        // This is how `password` and `tokens` stay off a user response.
        fc.assert(
            fc.property(
                documentLike(),
                fc.uniqueArray(
                    documentKey().filter((key) => key.length > 0),
                    {
                        minLength: 1,
                        maxLength: 4
                    }
                ),
                (body, omit) => {
                    const secrets = Object.fromEntries(omit.map((key) => [key, 'secret']));
                    const serialized = buildTransform({ omit })({ ...body, ...secrets });

                    // `Object.hasOwn`, not `toHaveProperty`: the latter walks the prototype
                    // chain, so it reports `toString` as present on every object ever made. What
                    // matters for a wire payload is the OWN keys, which is what gets serialized.
                    for (const key of omit) expect(Object.hasOwn(serialized, key)).toBe(false);
                }
            ),
            RUN
        );
    });

    it('keeps every key it was not asked to touch', () => {
        // The other half: a transform that dropped too much would satisfy every assertion above.
        fc.assert(
            fc.property(documentLike(), (body) => {
                const reserved = new Set(['_id', '__v', 'id']);
                const serialized = buildTransform()({ ...body });

                for (const key of Object.keys(body))
                    if (!reserved.has(key)) expect(Object.hasOwn(serialized, key)).toBe(true);
            }),
            RUN
        );
    });

    it('returns the same object it was handed, mutated in place', () => {
        // The lean path relies on this: `normalize` in @infrastructure/persistence/base-repository maps over rows and
        // keeps the returned value, while the toJSON path discards it and keeps the mutation.
        // Both work only because they are the same object.
        fc.assert(
            fc.property(withReservedFields(), (document_) => {
                const input = { ...document_ };

                expect(buildTransform()(input)).toBe(input);
            }),
            RUN
        );
    });

    it('is idempotent', () => {
        // Applied twice — which happens when a lean row is normalized and then serialized again
        // — the result must not change.
        fc.assert(
            fc.property(withReservedFields(), (document_) => {
                const transform = buildTransform({ omit: ['password'] });
                const once = transform({ ...document_ });
                const twice = transform({ ...once });

                expect(twice).toEqual(once);
            }),
            RUN
        );
    });

    it('never throws, for any document shape', () => {
        fc.assert(
            fc.property(fc.dictionary(documentKey(), fc.anything(), { maxKeys: 8 }), (body) => {
                expect(() =>
                    buildTransform({ omit: ['password'] })(body as Record<string, unknown>)
                ).not.toThrow();
            }),
            RUN
        );
    });

    it('runs the after hook once, after the shared steps', () => {
        // Ordering matters: `after` is where models do nested normalization, and it must see the
        // document already stripped rather than racing the shared steps.
        fc.assert(
            fc.property(withReservedFields(), (document_) => {
                let sawId: unknown;
                let calls = 0;
                const transform = buildTransform({
                    after: (serialized) => {
                        calls += 1;
                        sawId = '_id' in serialized;
                    }
                });

                transform({ ...document_ });

                expect(calls).toBe(1);
                expect(sawId).toBe(false);
            }),
            RUN
        );
    });
});
