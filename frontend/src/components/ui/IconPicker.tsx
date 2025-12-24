import { ICON_LIBRARY } from '../../utils/iconLibrary';
import { CategoryIcon } from './CategoryIcon';

interface Props {
  selectedIcon: string;
  onSelect: (icon: string) => void;
}

export function IconPicker({ selectedIcon, onSelect }: Props) {
  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
      {ICON_LIBRARY.map((iconName) => {
        const isActive = iconName === selectedIcon;
        return (
          <button
            key={iconName}
            type="button"
            onClick={() => onSelect(iconName)}
            className={`flex h-12 w-12 items-center justify-center rounded-lg border bg-[var(--input-bg)] text-[var(--text)] transition ${
              isActive ? 'border-primary ring-2 ring-primary' : 'border-[var(--card-border)] hover:border-primary'
            }`}
            aria-label={`Icono ${iconName}`}
          >
            <CategoryIcon name={iconName} size={18} />
          </button>
        );
      })}
    </div>
  );
}
