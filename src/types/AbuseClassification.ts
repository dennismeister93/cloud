export type AbuseClassification = (typeof ABUSE_CLASSIFICATION)[keyof typeof ABUSE_CLASSIFICATION];
export const ABUSE_CLASSIFICATION = {
  NOT_ABUSE: -100,
  CLASSIFICATION_ERROR: -50, //Anything lower than this value means: probably not abuse.
  NOT_CLASSIFIED: 0, //anything higher than this value means: probably abuse.
  LIKELY_ABUSE: 200,
} as const;
