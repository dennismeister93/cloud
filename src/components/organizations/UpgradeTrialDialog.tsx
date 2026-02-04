'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { PlanCard } from './subscription/PlanCard';
import { Button } from '@/components/Button';
import type { OrganizationPlan } from '@/lib/organizations/organization-types';
import {
  TEAM_SEAT_PRICE_MONTHLY_USD,
  ENTERPRISE_SEAT_PRICE_MONTHLY_USD,
} from '@/lib/organizations/constants';
import {
  useOrganizationSubscriptionLink,
  useOrganizationWithMembers,
} from '@/app/api/organizations/hooks';
import { usePostHog } from 'posthog-js/react';

export const TEAMS_FEATURES = [
  'All the features from open source',
  'Centralized billing',
  'Team management dashboard',
  'Project-level usage analytics and reporting',
  'AI Adoption Score',
  'Shared Modes',
  'Role-based access permissions',
  'Control data collection policy',
];

export const ENTERPRISE_FEATURES = [
  'All the features from teams',
  'Limit models and/or providers',
  'Audit logs',
  'SSO, OIDC, & SCIM support',
  'SLA commitments',
  'Dedicated support channels',
];

type UpgradeTrialDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName: string;
  currentPlan: OrganizationPlan;
  container?: HTMLElement | null;
};

export function UpgradeTrialDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName,
  currentPlan,
  container,
}: UpgradeTrialDialogProps) {
  const [selectedPlan, setSelectedPlan] = useState<OrganizationPlan>(currentPlan);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const { data: orgData } = useOrganizationWithMembers(organizationId);
  const subscriptionLink = useOrganizationSubscriptionLink();
  const hog = usePostHog();

  const handleSelectPlan = (plan: OrganizationPlan) => {
    setSelectedPlan(plan);
  };

  const handlePurchase = async () => {
    if (!orgData) return;

    setIsPurchasing(true);
    hog?.capture('trial_upgrade_purchase_clicked', {
      organizationId,
      selectedPlan,
      seatCount: orgData.members.length,
    });

    try {
      const result = await subscriptionLink.mutateAsync({
        organizationId,
        seats: orgData.members.length,
        cancelUrl: window.location.href,
        plan: selectedPlan,
      });

      if (result.url) {
        window.location.href = result.url;
      }
    } catch (error) {
      console.error('Failed to create subscription link:', error);
      setIsPurchasing(false);
    }
  };

  const planName = selectedPlan === 'teams' ? 'Teams' : 'Enterprise';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent container={container} showCloseButton={true} className="sm:max-w-3xl">
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <DialogTitle className="text-2xl font-bold text-white">
              Upgrade {organizationName}
            </DialogTitle>
            <p className="text-muted-foreground mt-2">
              Subscribe to continue using {planName} features
            </p>
          </div>

          {/* Plan Cards */}
          <div className="flex justify-center gap-4">
            <PlanCard
              plan="teams"
              pricePerMonth={TEAM_SEAT_PRICE_MONTHLY_USD}
              features={TEAMS_FEATURES}
              isSelected={selectedPlan === 'teams'}
              currentPlan={currentPlan}
              onSelect={() => handleSelectPlan('teams')}
            />

            <PlanCard
              plan="enterprise"
              pricePerMonth={ENTERPRISE_SEAT_PRICE_MONTHLY_USD}
              features={ENTERPRISE_FEATURES}
              isSelected={selectedPlan === 'enterprise'}
              currentPlan={currentPlan}
              onSelect={() => handleSelectPlan('enterprise')}
            />
          </div>

          {/* Purchase Button */}
          <div className="flex flex-col items-center gap-3">
            <Button
              onClick={handlePurchase}
              disabled={isPurchasing || !orgData}
              className="w-full max-w-md bg-blue-600 py-4 text-lg font-semibold text-white hover:bg-blue-700"
            >
              {isPurchasing ? 'Processing...' : `Purchase ${planName} Plan`}
            </Button>
            <p className="text-center text-xs text-gray-400">
              You'll be redirected to Stripe to complete your purchase
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
