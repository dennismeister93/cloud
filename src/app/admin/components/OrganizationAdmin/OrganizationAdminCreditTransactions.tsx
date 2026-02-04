import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BooleanBadge } from '@/components/ui/boolean-badge';
import { useOrganizationCreditTransactions } from '@/app/api/organizations/hooks';
import { ErrorCard } from '@/components/ErrorCard';
import { LoadingCard } from '@/components/LoadingCard';
import { FormattedMicrodollars } from '@/components/organizations/FormattedMicrodollars';
import { Receipt } from 'lucide-react';

export function OrganizationAdminCreditTransactions({
  organizationId,
}: {
  organizationId: string;
}) {
  const {
    data: credit_transactions = [],
    isLoading,
    error,
    refetch,
  } = useOrganizationCreditTransactions(organizationId);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return <LoadingCard title="Credit Transactions" description="Loading credit transactions..." />;
  }

  if (error) {
    return (
      <ErrorCard
        title="Credit Transactions"
        description="Error loading credit transactions"
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Receipt className="mr-2 inline h-5 w-5" />
          Credit Transactions ({credit_transactions.length})
        </CardTitle>
        <CardDescription>Recent credit transactions for this organization</CardDescription>
      </CardHeader>
      <CardContent>
        {credit_transactions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No credit transactions found</p>
        ) : (
          <div className="space-y-4">
            {credit_transactions.slice(0, 10).map(transaction => (
              <div
                key={transaction.id}
                className="flex items-center justify-between border-b pb-4 last:border-b-0"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <BooleanBadge positive={transaction.amount_microdollars > 0}>
                      {transaction.amount_microdollars > 0 ? '+' : ''}
                      <FormattedMicrodollars
                        microdollars={transaction.amount_microdollars}
                        className="inline whitespace-nowrap"
                        inline={true}
                        decimalPlaces={2}
                      />
                    </BooleanBadge>
                    {transaction.is_free && (
                      <Badge variant="secondary" className="text-xs">
                        Free
                      </Badge>
                    )}
                    {transaction.credit_category && (
                      <Badge variant="outline" className="text-xs">
                        {transaction.credit_category}
                      </Badge>
                    )}
                  </div>
                  {transaction.description && (
                    <p className="text-muted-foreground text-sm">{transaction.description}</p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {formatDate(transaction.created_at)}
                  </p>
                  {transaction.expiry_date && (
                    <p className="text-muted-foreground text-xs">
                      Expires: {formatDate(transaction.expiry_date)}
                    </p>
                  )}
                </div>
                <div className="text-muted-foreground text-right text-xs">
                  <p>ID: {transaction.id.slice(0, 8)}...</p>
                  {transaction.stripe_payment_id && (
                    <p title={transaction.stripe_payment_id}>
                      Stripe: {transaction.stripe_payment_id}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {credit_transactions.length > 10 && (
              <p className="text-muted-foreground text-center text-sm">
                Showing 10 of {credit_transactions.length} transactions
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
