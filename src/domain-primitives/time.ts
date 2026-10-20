/**
 * @module
 * The one place "a day in milliseconds" is spelled. Retention windows, cooldowns and lifetimes
 * across the codebase are written in terms of it, so a window reads as `7 * DAY_MS`. It lives here,
 * below every tier, so `domain/` files can count whole UTC days with it as well. The shop-day key
 * and the shop-zone day boundaries sit beside it for the same reason: a rule that groups by day, or
 * ends a deadline at the end of a printed day, needs them without importing a module.
 */

/** One day, in milliseconds. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The last millisecond of the UTC day an instant falls in.
 *
 * A deadline that is printed as a date must not fall before the end of that date, or a buyer reading
 * "until the 5th" is cut off at the 5th's first hour. Withdrawal windows and answer deadlines both
 * end this way.
 * @param instant - any moment of the day
 * @returns `23:59:59.999` UTC of that day
 */
export const endOfUtcDay = (instant: Date): Date =>
    new Date(
        Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate() + 1) - 1
    );

/**
 * The calendar day an instant falls in, on the wall clock of `timeZone`, as `YYYY-MM-DD`.
 *
 * Why not `toISOString().slice(0, 10)`: 00:30 on the 5th in Rome is still the 4th in UTC, and a
 * day a staff member typed is the shop's day, not the server's.
 * @param instant - the moment
 * @param timeZone - canonical IANA zone name, e.g. `Europe/Rome`
 * @returns the day, sortable as text
 */
export const dayInZone = (instant: Date, timeZone: string): string => {
    // Intl: `2-digit` month and day keep the key sortable; `gregory` and `latn` pin the calendar
    // and digits; the parts come back in the host locale's order, so each is read by its type.
    // https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
    const parts = new Intl.DateTimeFormat('en', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        calendar: 'gregory',
        numberingSystem: 'latn'
    }).formatToParts(instant);
    const field = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find((part) => part.type === type)?.value ?? '';
    return `${field('year')}-${field('month')}-${field('day')}`;
};

/**
 * The wall-clock digits of an instant in a zone, read as if they were UTC. The difference between
 * the two is the zone's offset at that instant, DST included.
 * @param instant - the moment
 * @param timeZone - canonical IANA zone name
 */
const wallClockAsUtc = (instant: Date, timeZone: string): number => {
    // Intl: `h23` keeps midnight as 00 (not 24); `latn` and `gregory` pin the digits and calendar.
    const parts = new Intl.DateTimeFormat('en', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        calendar: 'gregory',
        numberingSystem: 'latn'
    }).formatToParts(instant);
    const field = (type: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find((part) => part.type === type)?.value);
    return Date.UTC(
        field('year'),
        field('month') - 1,
        field('day'),
        field('hour'),
        field('minute'),
        field('second')
    );
};

/**
 * The instant a calendar day starts on the shop's wall clock: local midnight.
 *
 * The offset is read twice, once at the UTC guess and once at the corrected instant, so a day
 * whose midnight sits on the far side of a DST change still lands on the right one. A midnight
 * that does not exist (a zone that springs forward AT midnight) lands on the first instant after
 * the gap.
 *
 * @param year - the year
 * @param month - 1 to 12
 * @param day - the day of the month
 * @param timeZone - canonical IANA zone name
 * @returns the instant of that day's first moment in the zone
 */
export const zonedStartOfDay = (
    year: number,
    month: number,
    day: number,
    timeZone: string
): Date => {
    const wall = Date.UTC(year, month - 1, day);
    const offsetAt = (instant: number): number =>
        wallClockAsUtc(new Date(instant), timeZone) - Math.floor(instant / 1000) * 1000;
    const guess = wall - offsetAt(wall);
    return new Date(wall - offsetAt(guess));
};

/**
 * The last millisecond of the calendar day an instant falls in on the wall clock of `timeZone`,
 * optionally some calendar days on.
 *
 * A deadline that is printed as a date, in the shop's zone, must end at the end of THAT date: with
 * the UTC day the printed day and the enforced day drift apart by the zone's offset, a day later
 * east of Greenwich and an evening early west of it. Counting calendar days and not 24 hours keeps
 * a day of 23 or 25 hours (DST) from moving the boundary.
 * @param instant - any moment of the starting day
 * @param timeZone - canonical IANA zone name, e.g. `Europe/Rome`
 * @param plusDays - whole calendar days to move on first (default 0)
 * @returns `23:59:59.999` on the wall clock of that day
 */
export const endOfDayInZone = (instant: Date, timeZone: string, plusDays = 0): Date => {
    const [year = 0, month = 0, day = 0] = dayInZone(instant, timeZone).split('-').map(Number);
    // Plain calendar arithmetic on the civil date: Date.UTC rolls month and year over.
    const next = new Date(Date.UTC(year, month - 1, day + plusDays + 1));
    return new Date(
        zonedStartOfDay(
            next.getUTCFullYear(),
            next.getUTCMonth() + 1,
            next.getUTCDate(),
            timeZone
        ).getTime() - 1
    );
};
