import {useEffect, useId, useRef, type ReactNode} from 'react';
import {motion, useReducedMotion} from 'framer-motion';
import {X} from 'lucide-react';
import {cn} from '../lib/utils';
let openDialogs = 0;
let savedOverflow = '';

export function Dialog({open, title, eyebrow, children, className, onClose}: {open: boolean; title: string; eyebrow?: string; children: ReactNode; className?: string; onClose: () => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const reduced = !!useReducedMotion();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) return;
    if (openDialogs === 0) savedOverflow = document.body.style.overflow;
    openDialogs++;
    document.body.style.overflow = 'hidden';
    return () => { openDialogs = Math.max(0, openDialogs - 1); if (!openDialogs) document.body.style.overflow = savedOverflow; };
  }, [open]);
  return <dialog ref={ref} className={cn('modal', className)} aria-labelledby={titleId} onCancel={onClose} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    {open && <motion.div initial={{opacity: 0, y: reduced ? 0 : 14, scale: reduced ? 1 : 0.985}} animate={{opacity: 1, y: 0, scale: 1}} transition={{duration: reduced ? 0 : 0.25, ease: [0.22, 1, 0.36, 1]}}>
      <div className="modal-heading"><div>{eyebrow && <span className="eyebrow small">{eyebrow}</span>}<h2 id={titleId}>{title}</h2></div><button className="icon-button close-dialog" aria-label="Закрыть диалог" onClick={onClose}><X size={21}/></button></div>
      {children}
    </motion.div>}
  </dialog>;
}
