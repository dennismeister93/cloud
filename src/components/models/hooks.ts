import { useState, useMemo, useEffect } from 'react';
import { useOpenRouterModelsAndProviders } from '@/app/api/openrouter/hooks';
import {
  type OpenRouterProvider,
  type ProviderSelection,
  type FilterState,
  INITIAL_FILTER_STATE,
  getModelSeries,
  getWildcardModel,
  hasWildcard,
} from './util';

interface UseModelSelectorProps {
  selections: ProviderSelection[] | null;
  onChange: (selections: ProviderSelection[] | null) => void;
  disableAutoInitialization?: boolean;
}

export function useModelSelector({
  selections,
  onChange,
  disableAutoInitialization = false,
}: UseModelSelectorProps) {
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTER_STATE);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  // `null` is a meaningful value ("nothing selected"). We use `undefined` as the
  // "not captured yet" sentinel for change detection.
  const [initialSelections, setInitialSelections] = useState<
    ProviderSelection[] | null | undefined
  >(undefined);

  // Use the OpenRouter hook to get models and providers
  const { models, providers, isLoading, error } = useOpenRouterModelsAndProviders();

  // Extract unique values from data for filter options
  const filterOptions = useMemo(() => {
    const inputModalities = new Set<string>();
    const outputModalities = new Set<string>();
    const providerNames = new Set<string>();
    const supportedParameters = new Set<string>();
    const providerLocations = new Set<string>();

    // Extract from models
    models.forEach(model => {
      model.input_modalities.forEach(m => inputModalities.add(m));
      model.output_modalities.forEach(m => outputModalities.add(m));
      if (model.endpoint) {
        model.endpoint.supported_parameters.forEach(p => supportedParameters.add(p));
      }
    });

    // Extract from comprehensive provider data
    providers.forEach(provider => {
      providerNames.add(provider.displayName);
      if (provider.headquarters) {
        providerLocations.add(provider.headquarters);
      }
      // Also add datacenters as potential locations
      provider.datacenters?.forEach(dc => providerLocations.add(dc));
    });

    return {
      inputModalities: Array.from(inputModalities).sort(),
      outputModalities: Array.from(outputModalities).sort(),
      providers: Array.from(providerNames).sort(),
      supportedParameters: Array.from(supportedParameters).sort(),
      providerLocations: Array.from(providerLocations).sort(),
    };
  }, [models, providers]);

  // Filter providers and their models based on current filter state
  const filteredProviders = useMemo(() => {
    const filtered = providers
      .map(provider => {
        const filteredModels = provider.models.filter(model => {
          // Only include models with endpoints for UI display
          if (!model.endpoint) {
            return false;
          }
          // Search filter
          if (
            filters.search &&
            !model.name.toLowerCase().includes(filters.search.toLowerCase()) &&
            !model.description.toLowerCase().includes(filters.search.toLowerCase()) &&
            !provider.displayName.toLowerCase().includes(filters.search.toLowerCase())
          ) {
            return false;
          }

          // Input modalities filter
          if (
            filters.inputModalities.length > 0 &&
            !filters.inputModalities.some(m => model.input_modalities.includes(m))
          ) {
            return false;
          }

          // Output modalities filter
          if (
            filters.outputModalities.length > 0 &&
            !filters.outputModalities.some(m => model.output_modalities.includes(m))
          ) {
            return false;
          }

          // Context length filter
          if (
            model.context_length < filters.contextLengthMin ||
            model.context_length > filters.contextLengthMax
          ) {
            return false;
          }

          // Pricing filter
          if (model.endpoint) {
            const promptPrice = parseFloat(model.endpoint.pricing.prompt);
            if (promptPrice < filters.promptPricingMin || promptPrice > filters.promptPricingMax) {
              return false;
            }
          }

          // Series filter
          if (filters.series.length > 0) {
            const modelSeries = getModelSeries(model);
            if (!filters.series.includes(modelSeries)) {
              return false;
            }
          }

          // Supported parameters filter
          if (filters.supportedParameters.length > 0 && model.endpoint) {
            const endpoint = model.endpoint;
            if (!filters.supportedParameters.some(p => endpoint.supported_parameters.includes(p))) {
              return false;
            }
          }

          // Providers filter
          if (filters.providers.length > 0) {
            if (!filters.providers.includes(provider.displayName)) {
              return false;
            }
          }

          // Provider locations filter
          if (filters.providerLocations.length > 0) {
            const matchesLocation =
              (provider.headquarters &&
                filters.providerLocations.includes(provider.headquarters)) ||
              provider.datacenters?.some(dc => filters.providerLocations.includes(dc));
            if (!matchesLocation) {
              return false;
            }
          }

          // Data policy filters - use comprehensive provider data
          const dataPolicy = provider.dataPolicy;

          // Training filter
          if (filters.training !== 'all') {
            const wantsTraining = filters.training === 'yes';
            if (dataPolicy.training !== wantsTraining) {
              return false;
            }
          }

          // Retains prompts filter
          if (filters.retainsPrompts !== 'all') {
            const wantsRetainsPrompts = filters.retainsPrompts === 'yes';
            if (dataPolicy.retainsPrompts !== wantsRetainsPrompts) {
              return false;
            }
          }

          // Can publish filter
          if (filters.canPublish !== 'all') {
            const wantsCanPublish = filters.canPublish === 'yes';
            if (dataPolicy.canPublish !== wantsCanPublish) {
              return false;
            }
          }

          // Free only filter
          if (filters.showFreeOnly && model.endpoint && !model.endpoint.is_free) {
            return false;
          }

          return true;
        });

        return {
          ...provider,
          models: filteredModels,
        };
      })
      .filter(provider => provider.models.length > 0);

    // Sort by selection status if enabled
    if (filters.sortBySelected) {
      return filtered.sort((a, b) => {
        const aSelection = selections?.find(s => s.slug === a.slug);
        const bSelection = selections?.find(s => s.slug === b.slug);

        // Calculate selection scores (higher = more selected)
        const aScore = aSelection ? aSelection.models.length : 0;
        const bScore = bSelection ? bSelection.models.length : 0;

        // Sort by selection score (descending), then by name (ascending)
        if (aScore !== bScore) {
          return bScore - aScore;
        }
        return a.displayName.localeCompare(b.displayName);
      });
    }

    return filtered;
  }, [providers, filters, selections]);

  // Helper functions for selection management
  const getProviderSelection = (providerSlug: string): ProviderSelection | undefined => {
    return selections?.find(s => s.slug === providerSlug);
  };

  const isModelSelected = (providerSlug: string, modelSlug: string): boolean => {
    // Find the specific provider selection and check if the model is selected
    const selection = getProviderSelection(providerSlug);
    if (!selection) return false;
    // Wildcard means all current + future models under this provider are selected.
    if (hasWildcard(selection)) return true;
    return selection.models.includes(modelSlug);
  };

  const isProviderFullySelected = (provider: OpenRouterProvider): boolean => {
    const selection = getProviderSelection(provider.slug);
    if (!selection) return false;

    // If wildcard is present, provider is fully selected
    if (hasWildcard(selection)) return true;

    // Check against only the currently visible/filtered models
    const visibleModels = provider.models;
    if (visibleModels.length === 0) return false;

    return visibleModels.every(model => selection.models.includes(model.slug));
  };

  const isProviderPartiallySelected = (provider: OpenRouterProvider): boolean => {
    const selection = getProviderSelection(provider.slug);
    if (!selection) return false;
    if (hasWildcard(selection)) return false;

    return selection.models.length > 0 && !isProviderFullySelected(provider);
  };

  const handleProviderToggle = (provider: OpenRouterProvider) => {
    const isFullySelected = isProviderFullySelected(provider);
    const newSelections = [...(selections || [])];
    const existingIndex = newSelections.findIndex(s => s.slug === provider.slug);

    // Get all visible models for this provider
    const validModelSlugs = provider.models.map(m => m.slug);
    const wildcardModel = getWildcardModel(provider.slug);

    if (isFullySelected) {
      // Deselect all visible models in provider AND remove wildcard if present
      if (existingIndex >= 0) {
        const currentModels = newSelections[existingIndex].models;
        const remainingModels = currentModels.filter(
          modelSlug => !validModelSlugs.includes(modelSlug) && modelSlug !== wildcardModel
        );

        if (remainingModels.length > 0) {
          newSelections[existingIndex] = {
            ...newSelections[existingIndex],
            models: remainingModels,
          };
        } else {
          // Remove the provider selection entirely if no models remain
          newSelections.splice(existingIndex, 1);
        }
      }
    } else {
      // Select all visible models in provider AND enable the wildcard to include future models.
      if (existingIndex >= 0) {
        const currentModels = newSelections[existingIndex].models;
        const newModels = [...new Set([...currentModels, ...validModelSlugs, wildcardModel])];
        newSelections[existingIndex] = {
          ...newSelections[existingIndex],
          models: newModels,
        };
      } else {
        newSelections.push({
          slug: provider.slug,
          models: [...validModelSlugs, wildcardModel],
        });
      }
    }

    onChange(newSelections.length > 0 ? newSelections : []);
  };

  const handleModelToggle = (providerSlug: string, modelSlug: string) => {
    const newSelections = [...(selections || [])];
    const existingIndex = newSelections.findIndex(s => s.slug === providerSlug);

    if (existingIndex >= 0) {
      const currentModels = newSelections[existingIndex].models;
      if (currentModels.includes(modelSlug)) {
        // Remove model
        newSelections[existingIndex] = {
          ...newSelections[existingIndex],
          models: currentModels.filter(m => m !== modelSlug),
        };
      } else {
        // Add model
        newSelections[existingIndex] = {
          ...newSelections[existingIndex],
          models: [...currentModels, modelSlug],
        };
      }
    } else {
      // Create new provider selection with this model
      newSelections.push({
        slug: providerSlug,
        models: [modelSlug],
      });
    }

    onChange(newSelections);
  };

  const toggleProviderExpansion = (providerSlug: string) => {
    const newExpanded = new Set(expandedProviders);
    if (newExpanded.has(providerSlug)) {
      newExpanded.delete(providerSlug);
    } else {
      newExpanded.add(providerSlug);
    }
    setExpandedProviders(newExpanded);
  };

  const clearAllFilters = () => {
    setFilters(INITIAL_FILTER_STATE);
  };

  const toggleAllSelected = () => {
    // Get all filtered models (pass current filters)
    const allFilteredModelSlugs = filteredProviders.flatMap(provider =>
      provider.models.map(m => m.slug)
    );

    const currentlySelectedSlugs = selections?.flatMap(selection => selection.models) || [];

    // Check if all filtered models are selected
    const allFilteredSelected =
      allFilteredModelSlugs.length > 0 &&
      allFilteredModelSlugs.every(slug => currentlySelectedSlugs.includes(slug));

    if (allFilteredSelected) {
      // Deselect all filtered models
      const newSelections = (selections || [])
        .map(selection => ({
          ...selection,
          models: selection.models.filter(modelSlug => !allFilteredModelSlugs.includes(modelSlug)),
        }))
        .filter(selection => selection.models.length > 0);

      onChange(newSelections.length > 0 ? newSelections : []);
    } else {
      // Select all filtered models
      const newSelections = [...(selections || [])];

      filteredProviders.forEach(provider => {
        const validModelSlugs = provider.models.map(m => m.slug);

        const existingIndex = newSelections.findIndex(s => s.slug === provider.slug);

        if (existingIndex >= 0) {
          // Add filtered models to existing selection
          const currentModels = newSelections[existingIndex].models;
          const newModels = [...new Set([...currentModels, ...validModelSlugs])];
          newSelections[existingIndex] = {
            ...newSelections[existingIndex],
            models: newModels,
          };
        } else {
          // Create new provider selection with filtered models
          newSelections.push({
            slug: provider.slug,
            models: validModelSlugs,
          });
        }
      });

      onChange(newSelections);
    }
  };

  // Initialize all providers and models as selected by default
  useEffect(() => {
    // Only initialize if selections are null (first load, never been set) and auto-initialization is enabled
    if (selections === null && providers.length > 0 && !disableAutoInitialization) {
      // Apply the same filtering logic as the UI to ensure consistency
      const filteredProviders = providers
        .map(provider => {
          const filteredModels = provider.models.filter(model => {
            // Only include models with endpoints for UI display
            if (!model.endpoint) {
              return false;
            }

            // Apply initial filter constraints to match what the UI will show
            // Context length filter
            if (
              model.context_length < INITIAL_FILTER_STATE.contextLengthMin ||
              model.context_length > INITIAL_FILTER_STATE.contextLengthMax
            ) {
              return false;
            }

            // Pricing filter
            const promptPrice = parseFloat(model.endpoint.pricing.prompt);
            if (
              promptPrice < INITIAL_FILTER_STATE.promptPricingMin ||
              promptPrice > INITIAL_FILTER_STATE.promptPricingMax
            ) {
              return false;
            }

            return true;
          });

          return {
            ...provider,
            models: filteredModels,
          };
        })
        .filter(provider => provider.models.length > 0);

      // Create initial selections only for models that will be visible
      const initialSelections: ProviderSelection[] = filteredProviders
        .map(provider => ({
          slug: provider.slug,
          models: provider.models.map(m => m.slug),
        }))
        .filter(selection => selection.models.length > 0);

      onChange(initialSelections);
      // Set initial selections for change detection
      setInitialSelections(initialSelections);
    }
  }, [providers, selections, onChange]);

  // Capture initial selections (including `null`) coming from the parent exactly once,
  // *after* OpenRouter data is loaded.
  useEffect(() => {
    if (initialSelections !== undefined) return;
    if (isLoading) return;
    if (providers.length === 0) return;

    // When auto-initialization is enabled, `selections === null` means "not initialized yet",
    // so wait for auto-init to populate it.
    if (!disableAutoInitialization && selections === null) return;

    setInitialSelections(selections);
  }, [disableAutoInitialization, initialSelections, isLoading, providers.length, selections]);

  // Calculate totals for display
  const totalModels = filteredProviders.reduce((sum, provider) => sum + provider.models.length, 0);

  // Map of provider slug to their visible model slugs (for efficient lookups)
  const modelSlugsByProvider = useMemo(() => {
    const map = new Map<string, Set<string>>();
    filteredProviders.forEach(provider => {
      const modelSlugs = provider.models.map(m => m.slug);
      map.set(provider.slug, new Set(modelSlugs));
    });
    return map;
  }, [filteredProviders]);

  // Count only selected models that are currently visible (filtered)
  const selectedModelsCount = useMemo(() => {
    if (!selections) return 0;

    let count = 0;

    selections.forEach(selection => {
      const providerModels = modelSlugsByProvider.get(selection.slug);
      if (!providerModels) return; // Provider not in filtered list

      // Check if this selection has a wildcard (e.g., "alibaba/*")
      if (hasWildcard(selection)) {
        // Wildcard represents ALL current and future models from that provider
        count += providerModels.size;
      } else {
        // Count only the individual selected models that are visible
        selection.models.forEach(modelSlug => {
          if (providerModels.has(modelSlug)) {
            count++;
          }
        });
      }
    });

    return count;
  }, [selections, modelSlugsByProvider]);

  // Helper function to compare selections
  const selectionsEqual = (
    a: ProviderSelection[] | null,
    b: ProviderSelection[] | null | undefined
  ): boolean => {
    if (b === undefined) return true;
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    if (a.length !== b.length) return false;

    // Sort both arrays by slug for comparison
    const sortedA = [...a].sort((x, y) => x.slug.localeCompare(y.slug));
    const sortedB = [...b].sort((x, y) => x.slug.localeCompare(y.slug));

    return sortedA.every((selectionA, index) => {
      const selectionB = sortedB[index];
      if (selectionA.slug !== selectionB.slug) return false;
      if (selectionA.models.length !== selectionB.models.length) return false;

      const sortedModelsA = [...selectionA.models].sort();
      const sortedModelsB = [...selectionB.models].sort();

      return sortedModelsA.every((model, modelIndex) => model === sortedModelsB[modelIndex]);
    });
  };

  // Check if current selections differ from initial selections
  const hasUnsavedChanges = !selectionsEqual(selections, initialSelections);

  // Count selected providers
  const selectedProvidersCount = selections?.length || 0;

  return {
    // State
    filters,
    setFilters,
    expandedProviders,

    // Data
    models,
    providers,
    isLoading,
    error,
    filterOptions,
    filteredProviders,
    totalModels,
    selectedModelsCount,

    // Selection helpers
    isModelSelected,
    isProviderFullySelected,
    isProviderPartiallySelected,

    // Handlers
    handleProviderToggle,
    handleModelToggle,
    toggleProviderExpansion,
    clearAllFilters,
    toggleAllSelected,

    // Change detection
    hasUnsavedChanges,
    selectedProvidersCount,
    initialSelections,
    setInitialSelections,
  };
}
