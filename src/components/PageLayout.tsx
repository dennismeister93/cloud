import type { ReactNode } from 'react';
import { PageContainer } from './layouts/PageContainer';

type PageLayoutProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
};

export function PageLayout({ title, subtitle, children, headerActions }: PageLayoutProps) {
  return (
    <PageContainer>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          {typeof title === 'string' ? (
            <h1 className="text-foreground text-3xl font-bold">{title}</h1>
          ) : (
            title
          )}
          {subtitle &&
            (typeof subtitle === 'string' ? (
              <p className="text-muted-foreground">{subtitle}</p>
            ) : (
              subtitle
            ))}
        </div>
        {headerActions && <div className="shrink-0">{headerActions}</div>}
      </div>
      {children}
    </PageContainer>
  );
}
