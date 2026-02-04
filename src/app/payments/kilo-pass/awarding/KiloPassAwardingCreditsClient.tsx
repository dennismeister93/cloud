'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import BigLoader from '@/components/BigLoader';
import { PageContainer } from '@/components/layouts/PageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTRPC } from '@/lib/trpc/utils';

const POLL_INTERVAL_MS = 1000;
const TIMEOUT_MS = 90_000;
const REDIRECT_SECONDS = 5;

export function KiloPassAwardingCreditsClient() {
  const trpc = useTRPC();
  const router = useRouter();
  const [didTimeout, setDidTimeout] = useState(false);
  const [redirectSecondsRemaining, setRedirectSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    const timerId = setTimeout(() => {
      setDidTimeout(true);
    }, TIMEOUT_MS);

    return () => {
      clearTimeout(timerId);
    };
  }, []);

  const query = useQuery({
    ...trpc.kiloPass.getCheckoutReturnState.queryOptions(),
    refetchInterval: query => {
      const data = query.state.data;
      if (didTimeout) return false;
      if (data?.creditsAwarded === true) return false;
      return POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: true,
    retry: false,
  });

  const isReady = query.data?.creditsAwarded === true;
  const hasSubscription = query.data?.subscription != null;

  useEffect(() => {
    if (!isReady) return;

    setRedirectSecondsRemaining(REDIRECT_SECONDS);

    const intervalId = setInterval(() => {
      setRedirectSecondsRemaining(previous => {
        if (previous == null) return previous;
        if (previous <= 0) return 0;
        return previous - 1;
      });
    }, 1000);

    const timeoutId = setTimeout(() => {
      router.replace('/profile');
    }, REDIRECT_SECONDS * 1000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [isReady, router]);

  if (query.isError) {
    return (
      <PageContainer>
        <div className="flex min-h-[70vh] items-center justify-center">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Something went wrong
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="text-muted-foreground text-sm">
                We couldn't confirm your subscription status. This is usually temporary.
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => router.replace('/profile')}>
                  Go to profile
                </Button>
              </div>

              <div className="text-muted-foreground text-sm">
                If this keeps happening, contact support at{' '}
                <a href="https://kilo.ai/support" className="text-primary underline">
                  https://kilo.ai/support
                </a>
                .
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  if (didTimeout && !isReady) {
    return (
      <PageContainer>
        <div className="flex min-h-[70vh] items-center justify-center">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Still processing
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="text-muted-foreground text-sm">
                We haven't finished awarding your credits yet. Your payment may still be processing
                on Stripe.
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => router.replace('/profile')}>
                  Go to profile
                </Button>
              </div>

              <div className="text-muted-foreground text-sm">
                If your credits don't show up, contact support at{' '}
                <a href="https://kilo.ai/support" className="text-primary underline">
                  https://kilo.ai/support
                </a>
                .
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  if (isReady) {
    const secondsToShow = redirectSecondsRemaining ?? REDIRECT_SECONDS;

    return (
      <PageContainer>
        <div className="flex min-h-[70vh] items-center justify-center">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Credits awarded
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="text-muted-foreground text-sm">
                Your Kilo Pass is active and your credits are ready.
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={() => router.replace('/profile')}>
                  Continue to profile
                </Button>
                <div className="text-muted-foreground text-sm">
                  Redirecting to profile in {secondsToShow} seconds.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  const loaderTitle = hasSubscription ? 'Awarding your credits' : 'Finalizing your subscription';
  const loaderDescription = hasSubscription
    ? 'This can take a few seconds while we confirm payment and issue credits.'
    : 'This can take a few seconds while Stripe confirms your checkout.';

  return (
    <PageContainer>
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <BigLoader title={loaderTitle} />
        <div className="text-muted-foreground max-w-xl text-center text-sm">
          {loaderDescription}
        </div>
      </div>
    </PageContainer>
  );
}
