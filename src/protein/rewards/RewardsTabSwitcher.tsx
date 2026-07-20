/**
 * RewardsTabSwitcher — refined segmented control with a sliding active
 * indicator (CSS transform transition, no extra dependency). Generic over
 * a string key so it can drive any tab union the caller defines.
 */

export interface RewardsTabSwitcherItem<T extends string> {
  key: T;
  label: string;
}

export interface RewardsTabSwitcherProps<T extends string> {
  items: RewardsTabSwitcherItem<T>[];
  active: T;
  onChange: (key: T) => void;
  trackColor: string;
  activeSurface: string;
  activeText: string;
  inactiveText: string;
}

export default function RewardsTabSwitcher<T extends string>({
  items, active, onChange, trackColor, activeSurface, activeText, inactiveText,
}: RewardsTabSwitcherProps<T>) {
  const activeIndex = Math.max(0, items.findIndex(i => i.key === active));

  return (
    <div style={{ position: 'relative', display: 'flex', background: trackColor, borderRadius: 12, padding: 3 }}>
      {/* Sliding active indicator */}
      <div style={{
        position: 'absolute', top: 3, bottom: 3, left: 3,
        width: `calc(${100 / items.length}% - 3px)`,
        transform: `translateX(${activeIndex * 100}%)`,
        transition: 'transform 220ms cubic-bezier(0.4,0,0.2,1)',
        background: activeSurface, borderRadius: 9,
        boxShadow: '0 1px 4px rgba(36,26,23,0.12)',
      }} />
      {items.map(item => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            aria-pressed={isActive}
            style={{
              position: 'relative', flex: 1, padding: '7px 0', borderRadius: 9, border: 'none',
              background: 'transparent', cursor: 'pointer',
              color: isActive ? activeText : inactiveText,
              fontWeight: 800, fontSize: 11.5, transition: 'color 200ms ease',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
