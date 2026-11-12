import {cn} from '../lib/utils';
import {displayStatus, type Appeal} from '../types';

export function StatusBadge({appeal, pill = false}: {appeal: Pick<Appeal, 'kind' | 'status'>; pill?: boolean}) {
  return <span className={cn('status-badge', `status-${appeal.status}`, pill && 'status-pill')}><i aria-hidden="true"/>{displayStatus(appeal)}</span>;
}
