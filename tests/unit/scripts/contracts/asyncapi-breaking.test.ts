import { breakingChanges } from '../../../../scripts/contracts/asyncapi-breaking';

/** A small but real AsyncAPI 3 document, one channel and one message. */
const document = (version: string, channels?: Record<string, unknown>) => ({
    asyncapi: '3.0.0',
    info: { title: 'Events', version },
    channels: channels ?? { 'order.created': {} }
});

describe('breakingChanges', () => {
    it('does not call an edit of info.version breaking', () => {
        expect(breakingChanges(document('0.1.0'), document('0.2.0'))).toEqual([]);
    });

    it('does not call a version going from 2.0.0 to 0.1.0 breaking', () => {
        expect(breakingChanges(document('2.0.0'), document('0.1.0'))).toEqual([]);
    });

    it('still reports a channel a subscriber depended on being removed', () => {
        const changes = breakingChanges(
            document('0.1.0'),
            document('0.1.0', { 'order.shipped': {} })
        );

        expect(changes.map(({ path }) => path)).toContain('/channels/order.created');
    });

    it('reports the removal even when the version moved in the same change', () => {
        const changes = breakingChanges(document('0.1.0'), document('0.2.0', {}));

        expect(changes.map(({ path }) => path)).toEqual(['/channels/order.created']);
    });
});
