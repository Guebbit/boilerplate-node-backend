} as const;

/** Any name declared above. */
export type SharedAnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];
