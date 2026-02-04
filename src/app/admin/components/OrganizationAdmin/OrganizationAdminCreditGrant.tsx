'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign } from 'lucide-react';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useGrantOrganizationCredit } from '@/app/admin/api/organizations/hooks';
import { toast } from 'sonner';

export function OrganizationAdminCreditGrant({ organizationId }: { organizationId: string }) {
  const { data: session } = useSession();
  const grantCreditMutation = useGrantOrganizationCredit();

  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  const parsedAmount = parseFloat(amount);
  const isNegative = parsedAmount < 0;
  const isFormValid =
    !isNaN(parsedAmount) && parsedAmount !== 0 && (!isNegative || description.trim().length > 0);

  const handleGrantCredit = async () => {
    if (!isFormValid) return;

    try {
      const finalDescription = description.trim()
        ? `${description.trim()} (${session?.user?.name || session?.user?.email || 'Admin'})`
        : undefined;

      await grantCreditMutation.mutateAsync({
        organizationId,
        amount_usd: parsedAmount,
        description: finalDescription,
      });

      toast.success(`Successfully granted $${amount} credits to organization`);
      setAmount('');
      setDescription('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to grant credit');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Grant Credits
        </CardTitle>
        <CardDescription>Grant promotional credits to this organization</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async e => {
            e.preventDefault();
            await handleGrantCredit();
          }}
        >
          <div className="flex flex-row flex-wrap justify-between gap-4">
            <div>
              <Label className="text-muted-foreground text-sm font-medium" htmlFor="amount">
                Amount ($) (Required)
              </Label>
              <Input
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                step="0.01"
                id="amount"
                required
              />
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-sm font-medium" htmlFor="description">
              Description {isNegative ? '(Required)' : '(Optional)'}
            </Label>
            <Input
              type="text"
              placeholder={
                isNegative
                  ? 'Enter credit description (required)'
                  : 'Enter credit description (optional)'
              }
              value={description}
              onChange={e => setDescription(e.target.value)}
              id="description"
            />
          </div>

          <Button
            disabled={!isFormValid || grantCreditMutation.isPending}
            className="w-full sm:w-auto"
            type="submit"
          >
            {grantCreditMutation.isPending ? 'Granting...' : 'Grant Credit'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
