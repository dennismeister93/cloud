# Device Auth Client Update Prompt

## Context

The backend device authentication endpoints have been restructured to follow RESTful conventions. The client implementation needs to be updated to use the new endpoint structure.

## Old Endpoint Structure

```
POST /api/device-auth/initiate
GET  /api/device-auth/poll?code={code}
POST /api/device-auth/authorize
```

## New Endpoint Structure

```
POST   /api/device-auth/codes
GET    /api/device-auth/codes/:code
POST   /api/device-auth/tokens
DELETE /api/device-auth/codes/:code
```

## Required Changes

### 1. Initiate Device Auth (Create Code)

**Old:**

```typescript
POST / api / device - auth / initiate;
```

**New:**

```typescript
POST / api / device - auth / codes;
```

**Response remains the same:**

```json
{
  "code": "ABC123",
  "verificationUrl": "https://app.kilocode.com/device-auth?code=ABC123",
  "expiresIn": 600
}
```

### 2. Poll Device Auth Status

**Old:**

```typescript
GET /api/device-auth/poll?code=ABC123
```

**New:**

```typescript
GET / api / device - auth / codes / ABC123;
```

**Response remains the same:**

- `202` - Pending
- `200` - Approved (with token data)
- `403` - Denied
- `410` - Expired

### 3. Approve Device Auth

**Old:**

```typescript
POST /api/device-auth/authorize
Body: { code: "ABC123", approved: true }
```

**New:**

```typescript
POST / api / device - auth / tokens;
Body: {
  code: 'ABC123';
}
```

### 4. Deny Device Auth

**Old:**

```typescript
POST /api/device-auth/authorize
Body: { code: "ABC123", approved: false }
```

**New:**

```typescript
DELETE / api / device - auth / codes / ABC123;
```

## Implementation Instructions

Update your client code to:

1. Change the initiate endpoint from `/api/device-auth/initiate` to `/api/device-auth/codes`
2. Change the poll endpoint from `/api/device-auth/poll?code={code}` to `/api/device-auth/codes/{code}`
3. Split the authorize logic:
   - For approval: Use `POST /api/device-auth/tokens` with body `{ code: string }`
   - For denial: Use `DELETE /api/device-auth/codes/{code}` with no body
4. Update any error handling to account for the new endpoint paths

## Example Client Code

```typescript
// Initiate device auth
const initiateDeviceAuth = async () => {
  const response = await fetch('/api/device-auth/codes', {
    method: 'POST',
  });
  return response.json();
};

// Poll device auth status
const pollDeviceAuth = async (code: string) => {
  const response = await fetch(`/api/device-auth/codes/${code}`, {
    method: 'GET',
  });
  return response.json();
};

// Approve device auth
const approveDeviceAuth = async (code: string) => {
  const response = await fetch('/api/device-auth/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return response.json();
};

// Deny device auth
const denyDeviceAuth = async (code: string) => {
  const response = await fetch(`/api/device-auth/codes/${code}`, {
    method: 'DELETE',
  });
  return response.json();
};
```

## Testing

After updating the client:

1. Test the full device auth flow:
   - Initiate a new device auth request
   - Poll for status
   - Approve the request
   - Verify the token is returned

2. Test the denial flow:
   - Initiate a new device auth request
   - Deny the request
   - Verify the request is properly denied

3. Test error cases:
   - Invalid codes
   - Expired codes
   - Unauthorized access
