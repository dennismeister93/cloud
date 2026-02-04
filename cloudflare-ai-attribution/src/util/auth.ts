/**
 * Authentication utilities for validating Kilo API tokens
 */

import { createMiddleware } from 'hono/factory';
import jwt from 'jsonwebtoken';
import { logger } from './logger';
import type { HonoContext } from '../ai-attribution.worker';
import { OrganizationJWTPayload } from '../schemas';

/**
 * Validates a Kilo API JWT token
 */
export function validateKiloToken(
  authHeader: string | null,
  secret: string
):
  | ({ success: true; token: string } & Pick<
      OrganizationJWTPayload,
      'organizationId' | 'organizationRole' | 'kiloUserId'
    >)
  | { success: false; error: string } {
  // Check header exists and has Bearer format
  if (!authHeader) {
    return { success: false, error: 'Missing Authorization header' };
  }

  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { success: false, error: 'Invalid Authorization header format' };
  }

  const token = authHeader.substring(7).trim();

  try {
    // Verify JWT signature and decode
    const payload = OrganizationJWTPayload.parse(
      jwt.verify(token, secret, {
        algorithms: ['HS256'],
      })
    );

    // Token is valid
    return {
      success: true,
      kiloUserId: payload.kiloUserId,
      token,
      organizationId: payload.organizationId,
      organizationRole: payload.organizationRole,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return { success: false, error: 'Token expired' };
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return { success: false, error: 'Invalid token signature' };
    }
    return { success: false, error: 'Token validation failed' };
  }
}

/**
 * Hono middleware for authenticating requests with Kilo API tokens
 */
export const authMiddleware = createMiddleware<HonoContext>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const result = validateKiloToken(authHeader || null, await c.env.NEXTAUTH_SECRET.get());

  if (!result.success) {
    logger.warn('Authentication failed', { error: result.error });
    return c.json({ success: false, error: result.error }, 401);
  }

  // Set user context in Hono variables
  c.set('user_id', result.kiloUserId);
  c.set('token', result.token);
  c.set('organization_id', result.organizationId);
  c.set('organization_role', result.organizationRole);

  logger.info('Request authenticated', {
    userId: result.kiloUserId,
    organizationId: result.organizationId,
    organizationRole: result.organizationRole,
  });

  await next();
});
