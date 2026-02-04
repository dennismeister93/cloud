'use client';

import { useOrganizationWithMembers } from '@/app/api/organizations/hooks';
import {
  useOpenRouterModels,
  useOpenRouterModelsAndProviders,
  useOpenRouterProviders,
} from '@/app/api/openrouter/hooks';
import type { OpenRouterProvider } from '@/lib/organizations/organization-types';
import { isModelAllowedProviderAwareClient } from '@/lib/model-allow.client';

export type ConfigurationData = {
  allModelsSelected: boolean;
  allProvidersSelected: boolean;
  displayModelAllowList: string[];
  displayProviderAllowList: string[];
  getProviderNames: (slugs: string[]) => string[];
  getModelNames: (modelIds: string[]) => string[];
};

export function useOrganizationConfiguration(organizationId: string) {
  const { data: organizationData, isLoading: orgLoading } =
    useOrganizationWithMembers(organizationId);
  const { data: modelsData, isLoading: modelsLoading } = useOpenRouterModels();
  const { data: providersData, isLoading: providersLoading } = useOpenRouterProviders();
  const { providers: openRouterProviders, isLoading: providersSnapshotLoading } =
    useOpenRouterModelsAndProviders();

  const isLoading = orgLoading || modelsLoading || providersLoading || providersSnapshotLoading;

  if (isLoading || !organizationData || !modelsData?.data || !providersData?.data) {
    return {
      isLoading,
      organizationData,
      configurationData: null,
    };
  }

  const settings = organizationData.settings;
  const savedModelAllowList = settings?.model_allow_list || [];
  const savedProviderAllowList = settings?.provider_allow_list || [];

  // Use the same dual-mode logic as OrganizationModelSelector
  let allModelsSelected = true;
  let allProvidersSelected = true;
  let displayModelAllowList = savedModelAllowList;
  let displayProviderAllowList = savedProviderAllowList;

  const allModelIds = modelsData.data.map(model => model.id);
  const allProviderSlugs = providersData.data.map(provider => provider.slug);

  // Empty array means "all selected" for auto-inclusion of new models/providers
  if (savedModelAllowList.length === 0) {
    allModelsSelected = true;
    displayModelAllowList = []; // No exclusions
  } else {
    const allowedModelCount = allModelIds.filter(modelId =>
      isModelAllowedProviderAwareClient(modelId, savedModelAllowList, openRouterProviders)
    ).length;
    const modelAllowRatio = allowedModelCount / allModelIds.length;
    // If more than 50% are allowed, treat as "all selected" mode with exclusions
    if (modelAllowRatio > 0.5) {
      allModelsSelected = true;
      displayModelAllowList = allModelIds.filter(
        id => !isModelAllowedProviderAwareClient(id, savedModelAllowList, openRouterProviders)
      );
    } else {
      allModelsSelected = false;
      displayModelAllowList = savedModelAllowList;
    }
  }

  // Empty array means "all selected" for auto-inclusion of new providers
  if (savedProviderAllowList.length === 0) {
    allProvidersSelected = true;
    displayProviderAllowList = []; // No exclusions
  } else {
    const providerAllowRatio = savedProviderAllowList.length / allProviderSlugs.length;
    // If more than 50% are allowed, treat as "all selected" mode with exclusions
    if (providerAllowRatio > 0.5) {
      allProvidersSelected = true;
      displayProviderAllowList = allProviderSlugs.filter(
        slug => !savedProviderAllowList.includes(slug)
      );
    } else {
      allProvidersSelected = false;
      displayProviderAllowList = savedProviderAllowList;
    }
  }

  // Get provider names for display
  const getProviderNames = (slugs: string[]) => {
    if (!providersData?.data) return slugs;
    return slugs.map(slug => {
      const provider = providersData.data.find((p: OpenRouterProvider) => p.slug === slug);
      return provider?.displayName || provider?.name || slug;
    });
  };

  // Get model names for display (just use the model IDs as they are already human-readable)
  const getModelNames = (modelIds: string[]) => {
    return modelIds;
  };

  const configurationData: ConfigurationData = {
    allModelsSelected,
    allProvidersSelected,
    displayModelAllowList,
    displayProviderAllowList,
    getProviderNames,
    getModelNames,
  };

  return {
    isLoading,
    organizationData,
    configurationData,
  };
}
