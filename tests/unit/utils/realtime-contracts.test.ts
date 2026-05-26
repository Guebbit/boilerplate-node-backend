import {
    DEFAULT_CHAT_ROOM,
    OBSERVABILITY_SSE_EVENTS,
    type IChatJoinedEvent
} from '@utils/realtime-contracts';

describe('realtime contracts', () => {
    it('keeps generated constants aligned with AsyncAPI', () => {
        expect(DEFAULT_CHAT_ROOM).toBe('general');
        expect(OBSERVABILITY_SSE_EVENTS).toEqual({
            SNAPSHOT: 'metrics.snapshot',
            UPDATE: 'metrics.updated',
            HEARTBEAT: 'heartbeat'
        });
    });

    it('includes the chat joined server event contract', () => {
        const joinedEvent: IChatJoinedEvent = {
            type: 'chat:joined',
            payload: { username: 'alice', room: 'general' }
        };

        expect(joinedEvent.type).toBe('chat:joined');
    });
});
