} as const;

/** Any name declared above. */
export type TSharedAnalyticsEventName = (typeof analyticsEvents)[keyof typeof analyticsEvents];
