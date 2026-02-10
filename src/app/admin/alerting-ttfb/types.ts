export type TtfbAlertingDraft = {
  enabled: boolean;
  ttfbThresholdMs: string;
  minRequestsPerWindow: string;
};

export type TtfbBaseline = {
  model: string;
  p95Ttfb1d: number;
  p95Ttfb3d: number;
  p95Ttfb7d: number;
  requests1d: number;
  requests3d: number;
  requests7d: number;
};
