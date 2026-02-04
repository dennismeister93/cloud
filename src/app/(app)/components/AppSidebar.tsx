'use client';

import type { Sidebar } from '@/components/ui/sidebar';
import { useUrlOrganizationId } from '@/hooks/useUrlOrganizationId';
import PersonalAppSidebar from './PersonalAppSidebar';
import OrganizationAppSidebar from './OrganizationAppSidebar';

export default function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const currentOrgId = useUrlOrganizationId();

  // Render organization sidebar if viewing an organization
  if (currentOrgId) {
    return <OrganizationAppSidebar organizationId={currentOrgId} {...props} />;
  }

  // Otherwise render personal sidebar
  return <PersonalAppSidebar {...props} />;
}
