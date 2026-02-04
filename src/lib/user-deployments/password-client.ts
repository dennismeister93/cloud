import 'server-only';

import {
  USER_DEPLOYMENTS_DISPATCHER_URL,
  USER_DEPLOYMENTS_DISPATCHER_AUTH_KEY,
} from '@/lib/config.server';
import { fetchWithTimeout } from '@/lib/user-deployments/fetch-utils';

// Types for password protection API
export type GetPasswordStatusResponse =
  | { protected: true; passwordSetAt: number }
  | { protected: false };

export type SetPasswordResponse = {
  success: true;
  passwordSetAt: number;
};

export type DeletePasswordResponse = {
  success: true;
};

/**
 * Password Protection API Client
 * Handles communication with the dispatcher worker for password protection
 */
class PasswordProtectionClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = USER_DEPLOYMENTS_DISPATCHER_URL;
  }

  /**
   * Get common headers for API requests
   */
  private getHeaders(additionalHeaders?: Record<string, string>): HeadersInit {
    return {
      Authorization: `Bearer ${USER_DEPLOYMENTS_DISPATCHER_AUTH_KEY}`,
      ...additionalHeaders,
    };
  }

  /**
   * Get the password protection status for a worker
   */
  async getPasswordStatus(workerSlug: string): Promise<GetPasswordStatusResponse> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/password/${workerSlug}`,
      { headers: this.getHeaders() },
      { maxRetries: 0 }
    );

    if (!response.ok) {
      throw new Error(`Failed to get password status: ${response.statusText}`);
    }

    return (await response.json()) as GetPasswordStatusResponse;
  }

  /**
   * Set password protection for a worker
   */
  async setPassword(workerSlug: string, password: string): Promise<SetPasswordResponse> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/password/${workerSlug}`,
      {
        method: 'PUT',
        headers: this.getHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ password }),
      },
      { maxRetries: 0 }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to set password: ${errorText}`);
    }

    return (await response.json()) as SetPasswordResponse;
  }

  /**
   * Remove password protection from a worker
   */
  async removePassword(workerSlug: string): Promise<DeletePasswordResponse> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/password/${workerSlug}`,
      {
        method: 'DELETE',
        headers: this.getHeaders(),
      },
      { maxRetries: 0 }
    );

    if (!response.ok) {
      throw new Error(`Failed to remove password: ${response.statusText}`);
    }

    return (await response.json()) as DeletePasswordResponse;
  }
}

// Export a singleton instance
export const passwordClient = new PasswordProtectionClient();
