import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  name: string;
  size?: number;
  className?: string;
}

export function CategoryIcon({ name, size = 18, className }: Props) {
  // @ts-expect-error - Dynamic access to icon library
  const IconComponent = (Icons[name] as LucideIcon) || Icons.Tag;

  return <IconComponent size={size} className={className} />;
}
