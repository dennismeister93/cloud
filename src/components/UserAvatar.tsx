import Image from 'next/image';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  image?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function UserAvatar({ image, name, size, className = '' }: UserAvatarProps) {
  return (
    <Image
      src={image || '/default-avatar.svg'}
      alt={name || 'User Avatar'}
      width={size}
      height={size}
      className={cn('drag-none rounded-full', className)}
      priority
      loading="eager"
    />
  );
}
