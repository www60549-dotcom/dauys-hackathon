import {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {summarizeHeatmap} from '../lib/heatmap';
import {kindLabels, type Appeal, type Kind} from '../types';

/** Portal keeps the tooltip readable outside the grid's narrow scroll area. */
export function HeatmapCell({department, kind, items, onOpen, onSelect, overdueCount = 0}: {
  department: string; kind: Kind; items: Appeal[]; onOpen: (id: string) => void;
  onSelect?: () => void; overdueCount?: number;
}) {
  const summary = summarizeHeatmap(items);
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null), tooltip = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const focused = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({left: 12, top: 12});
  const show = () => { window.clearTimeout(closeTimer.current); setOpen(true); };
  const hide = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => { if (!focused.current) setOpen(false); }, 160);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const cell = anchor.current?.getBoundingClientRect(), hint = tooltip.current?.getBoundingClientRect();
      if (!cell || !hint) return;
      const maxTop = Math.max(12, window.innerHeight - hint.height - 12);
      const top = cell.top >= hint.height + 22 ? cell.top - hint.height - 10 : cell.bottom + 10;
      setPosition({left: Math.max(12, Math.min(cell.left + cell.width / 2 - hint.width / 2, window.innerWidth - hint.width - 12)), top: Math.max(12, Math.min(top, maxTop))});
    };
    update();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); window.clearTimeout(closeTimer.current); } };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('keydown', escape);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); document.removeEventListener('keydown', escape); };
  }, [open]);

  return <>
    <button ref={anchor} className="heatmap-cell" aria-disabled={!items.length}
      aria-label={`${department}, ${kindLabels[kind]}, ${summary.count}, приоритет: ${summary.label}, просрочено: ${overdueCount}`}
      aria-haspopup={onSelect && items.length ? 'dialog' : undefined}
      aria-describedby={open ? id : undefined} style={{background: summary.background, color: summary.color}}
      onPointerEnter={show} onPointerLeave={hide}
      onFocus={() => { focused.current = true; show(); }} onBlur={() => { focused.current = false; hide(); }}
      onClick={() => { if (items.length) { setOpen(false); if (onSelect) onSelect(); else onOpen(items[0].id); } }}>
      <span>{summary.count}</span>
      {overdueCount > 0 && <small className="heatmap-cell-overdue">! {overdueCount} проср.</small>}
    </button>
    {open && createPortal(<div ref={tooltip} id={id} role="tooltip" className="heatmap-tooltip" style={position}
      onPointerEnter={() => window.clearTimeout(closeTimer.current)} onPointerLeave={hide}>
      <strong>{department} · {kindLabels[kind]}</strong>
      <p>Обращений: <b>{summary.count}</b> · Приоритет: <b>{items.length ? summary.label : 'нет обращений'}</b></p>
      <p><b>Категории:</b> {summary.categories.join(', ') || 'Нет обращений этого типа'}</p>
      {overdueCount > 0 && <p><b>Просрочено:</b> {overdueCount}</p>}
      {items.length > 0 && <p className="heatmap-tooltip-action">{onSelect ? 'Нажмите, чтобы увидеть все обращения этой ячейки.' : 'Нажмите на ячейку, чтобы открыть обращение.'}</p>}
    </div>, document.body)}
  </>;
}
