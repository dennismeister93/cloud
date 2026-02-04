import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '@/lib/trpc/init';
import { rootRouter } from '@/routers/root-router';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: rootRouter,
    createContext: createTRPCContext,
  });

export { handler as GET, handler as POST };
