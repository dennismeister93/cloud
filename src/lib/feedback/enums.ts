export const FeedbackFor = {
  Unknown: 'unknown',
  KiloPass: 'kilopass',
} as const;

export type FeedbackFor = (typeof FeedbackFor)[keyof typeof FeedbackFor];

export const FeedbackSource = {
  Web: 'web',
  Email: 'email',
  Unknown: 'unknown',
} as const;

export type FeedbackSource = (typeof FeedbackSource)[keyof typeof FeedbackSource];
