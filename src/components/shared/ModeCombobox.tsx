'use client';

import { useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentMode } from '@/components/cloud-agent/types';

/**
 * Mode options for cloud agent sessions.
 * Same as MODES in ResumeConfigModal but exported for shared use.
 */
export const MODE_OPTIONS = [
  { value: 'code' as const, label: 'Code', description: 'Write and modify code' },
  { value: 'architect' as const, label: 'Architect', description: 'Plan and design solutions' },
  { value: 'ask' as const, label: 'Ask', description: 'Get answers and explanations' },
  { value: 'debug' as const, label: 'Debug', description: 'Find and fix issues' },
  {
    value: 'orchestrator' as const,
    label: 'Orchestrator',
    description: 'Coordinate complex tasks',
  },
] as const;

export type ModeComboboxProps = {
  label?: string;
  helperText?: string;
  value?: AgentMode;
  onValueChange: (value: AgentMode) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Compact variant for inline use (e.g., chat footer) - hides label, helper text, and uses smaller styling */
  variant?: 'full' | 'compact';
  /** Optional className for the trigger button */
  className?: string;
};

export function ModeCombobox({
  label = 'Mode',
  helperText,
  value = 'code',
  onValueChange,
  isLoading,
  disabled,
  placeholder = 'Select mode',
  variant = 'full',
  className,
}: ModeComboboxProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedMode = MODE_OPTIONS.find(mode => mode.value === value);
  const isCompact = variant === 'compact';
  const showLabel = !isCompact && label;

  if (isLoading) {
    if (isCompact) {
      return <Skeleton className={cn('h-9 w-28', className)} />;
    }
    return (
      <div className="space-y-2">
        {showLabel && <Label>{label}</Label>}
        <Skeleton className="h-9 w-full" />
        <p className="text-muted-foreground text-xs">Loading...</p>
      </div>
    );
  }

  // Compact variant - just the popover trigger without wrapper
  if (isCompact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('h-9 justify-between gap-1.5', className)}
            ref={triggerRef}
          >
            <span className="truncate">{selectedMode?.label ?? placeholder}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-0" align="start">
          <Command>
            <CommandList className="max-h-64 overflow-auto">
              <CommandGroup>
                {MODE_OPTIONS.map(mode => (
                  <CommandItem
                    key={mode.value}
                    value={mode.value}
                    onSelect={() => {
                      onValueChange(mode.value);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <div className="flex flex-col truncate">
                      <span className="truncate">{mode.label}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {mode.description}
                      </span>
                    </div>
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4 shrink-0',
                        mode.value === value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  // Full variant with label and helper text
  return (
    <div className="space-y-2">
      {showLabel && <Label htmlFor="mode-combobox">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="mode-combobox"
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-full justify-between', className)}
            ref={triggerRef}
          >
            <span className="truncate">{selectedMode?.label ?? placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0"
          align="start"
          style={{ width: triggerRef.current?.offsetWidth }}
        >
          <Command>
            <CommandList className="max-h-64 overflow-auto">
              <CommandGroup>
                {MODE_OPTIONS.map(mode => (
                  <CommandItem
                    key={mode.value}
                    value={mode.value}
                    onSelect={() => {
                      onValueChange(mode.value);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <div className="flex flex-col truncate">
                      <span className="truncate">{mode.label}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {mode.description}
                      </span>
                    </div>
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4 shrink-0',
                        mode.value === value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!isCompact && helperText && <p className="text-muted-foreground text-xs">{helperText}</p>}
    </div>
  );
}
