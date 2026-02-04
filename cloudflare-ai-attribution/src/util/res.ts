export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export function resSuccess<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

export function resError(message: string): ApiResponse<never> {
  return {
    success: false,
    error: message,
  };
}
