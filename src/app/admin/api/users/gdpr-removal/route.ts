import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getUserFromAuth } from '@/lib/user.server';
import { deleteUserFromExternalServices } from '@/lib/external-services';
import { deleteUserDatabaseRecords, findUserById } from '@/lib/user';

export async function POST(
  request: NextRequest
): Promise<NextResponse<{ error: string } | { success: boolean; message: string }>> {
  const { authFailedResponse } = await getUserFromAuth({ adminOnly: true });
  if (authFailedResponse) return authFailedResponse;

  const { userId } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  const user = await findUserById(userId);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await deleteUserFromExternalServices(user);
  await deleteUserDatabaseRecords(userId);

  return NextResponse.json({
    success: true,
    message: `All data for user ${user.google_user_email} has been permanently deleted`,
  });
}
