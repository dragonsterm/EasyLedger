type AppIconName = 'dashboard' | 'ledger' | 'catalog' | 'voice' | 'add' | 'grid' | 'list';

export default function Icon({ name, size = 16 }: { name: AppIconName; size?: number }) {
  return (
    <svg className="app-icon" width={size} height={size} aria-hidden="true" focusable="false">
      <use href={`/assets/ui-icons.svg#${name}`} />
    </svg>
  );
}
