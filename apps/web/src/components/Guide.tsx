import { Check, Compass, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function Guide({
  title = 'Qué puedes hacer aquí',
  children,
  items,
  icon: Icon = Compass,
}: {
  title?: string;
  children: ReactNode;
  items?: string[];
  icon?: LucideIcon;
}) {
  return (
    <div className="guide">
      <div className="guide-icon" aria-hidden>
        <Icon className="icon" />
      </div>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
        {items && items.length > 0 && (
          <ul>
            {items.map((item) => (
              <li key={item}>
                <Check className="icon icon-sm" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
