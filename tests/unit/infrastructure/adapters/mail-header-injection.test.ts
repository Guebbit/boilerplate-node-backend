import { createTransport } from 'nodemailer';

/**
 * The real nodemailer, building a message in memory.
 * `streamTransport` + `buffer` hands back the raw RFC 5322 text instead of sending it.
 * https://nodemailer.com/transports/stream/
 */
const transport = () => createTransport({ streamTransport: true, buffer: true, newline: 'unix' });

/**
 * The header block of a rendered message: everything before the first blank line.
 * A header injected through a subject would appear here as a line of its own.
 */
const headerLinesOf = (raw: string): string[] => raw.split('\n\n', 1)[0].split('\n');

/**
 * A learning test of a dependency we rely on: the contact form takes a visitor's subject as a
 * plain string and does no stripping of its own (docs/theory/defences/email.md). The stop for
 * header injection is nodemailer, so a bump that changed it must turn this red.
 */
describe('a subject carrying a line break, through the real nodemailer', () => {
    it('stays one Subject header and never grows a Bcc header', async () => {
        const sent = await transport().sendMail({
            from: 'shop@example.com',
            to: 'staff@example.com',
            subject: 'hi\r\nBcc: x@evil.test',
            text: 'body'
        });
        // `buffer: true` makes `message` a Buffer; anything else would leave no Subject line and fail below.
        const headers = headerLinesOf(
            sent.message instanceof Buffer ? sent.message.toString() : ''
        );

        expect(headers.filter((line) => /^subject:/i.test(line))).toHaveLength(1);
        expect(headers.some((line) => /^bcc:/i.test(line))).toBe(false);
    });
});
