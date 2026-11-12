import {LayoutGroup, motion} from 'framer-motion';
import {cn} from '../lib/utils';

interface Tab<T extends string> {id: T; label: string; count?: number}
interface Props<T extends string> {
  tabs: readonly Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  id: string;
  label: string;
  className?: string;
  layoutId?: string;
}

export function NavigationTabs<T extends string>({tabs, value, onChange, id, label, className, layoutId = 'activeTab'}: Props<T>) {
  return <LayoutGroup id={id}><nav className={cn('navigation-tabs', className)} role="tablist" aria-label={label}
    onKeyDown={event => {
      const current = tabs.findIndex(tab => tab.id === value);
      const next = event.key === 'ArrowRight' ? (current + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      onChange(tabs[next].id);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>
    {tabs.map(tab => <button type="button" key={tab.id} id={`${id}-${tab.id}`} role="tab"
      aria-selected={value === tab.id} aria-controls={`${id}-panel`} tabIndex={value === tab.id ? 0 : -1}
      onClick={() => onChange(tab.id)} className={cn('navigation-tab', value === tab.id && 'is-active')}>
      {value === tab.id && <motion.span className="navigation-active" layoutId={layoutId} transition={{type: 'spring', stiffness: 420, damping: 34}}/>}
      <span className="navigation-label">{tab.label}{tab.count !== undefined && <span className="navigation-count" aria-label={`${tab.count} активных`}>{tab.count}</span>}</span>
    </button>)}
  </nav></LayoutGroup>;
}
