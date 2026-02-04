import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

/**
 * Hook to extract organization ID from the current URL pathname.
 * Returns null if not viewing an organization page.
 */
export function useUrlOrganizationId(): string | null {
  const pathname = usePathname();
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);

  useEffect(() => {
    const orgMatch = pathname.match(
      /^\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (orgMatch) {
      setCurrentOrgId(orgMatch[1]);
    } else {
      setCurrentOrgId(null);
    }
  }, [pathname]);

  return currentOrgId;
}
