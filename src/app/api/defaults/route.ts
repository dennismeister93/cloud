import { chooseAndStoreDefaultModelForUser } from './chooseAndStoreDefaultModelForUser';
import { NextResponse } from 'next/server';
import { getUserFromAuth } from '@/lib/user.server';
import { getFirstFreeModel } from '@/lib/models';

type DefaultsResponse = {
  defaultModel: string;
  defaultFreeModel: string;
};

export async function GET(): Promise<NextResponse<DefaultsResponse>> {
  const { user } = await getUserFromAuth({ adminOnly: false });
  const defaultFreeModel = getFirstFreeModel();
  return NextResponse.json({
    defaultModel: user ? await chooseAndStoreDefaultModelForUser(user) : defaultFreeModel,
    defaultFreeModel,
  });
}
