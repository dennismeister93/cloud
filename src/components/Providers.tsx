'use client';

import { Toaster } from '@/components/ui/sonner';
import { TRPCContext } from '@/lib/trpc/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { SignInHintEmailSyncer } from '@/components/auth/SignInHintEmailSyncer';

export function Providers({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  );

  return (
    <>
      <QueryClientProvider client={queryClient}>
        <TRPCContext>
          <SessionProvider>
            <SignInHintEmailSyncer />
            {children}
          </SessionProvider>
        </TRPCContext>
      </QueryClientProvider>

      <Toaster />
    </>
  );
}
