import {useRef, useState, type ReactNode} from 'react';
import {motion, useReducedMotion, type HTMLMotionProps} from 'framer-motion';
import {ArrowRight, type LucideIcon} from 'lucide-react';
import {cn} from '../lib/utils';

type Props = Omit<HTMLMotionProps<'button'>, 'children'> & {
  children: ReactNode;
  icon?: LucideIcon;
};

/** Shared primary action: a real button, with native form/disabled semantics. */
export function PrimaryButton({children, className, icon: Icon = ArrowRight, onClick, disabled, type = 'button', ...props}: Props) {
  const reduced = !!useReducedMotion();
  const serial = useRef(0);
  const [ripples, setRipples] = useState<number[]>([]);
  return <motion.button {...props} type={type} disabled={disabled}
    className={cn('button primary-cta', className)} initial="rest" animate="rest"
    whileHover={disabled || reduced ? undefined : 'hover'} whileTap={disabled || reduced ? undefined : {scale: 0.97}}
    variants={{rest: {scale: 1}, hover: {scale: 1.03}}}
    transition={{type: 'spring', stiffness: 340, damping: 23}}
    onClick={event => {
      if (!reduced) { const id = ++serial.current; setRipples(current => [...current.slice(-1), id]); }
      onClick?.(event);
    }}>
    <span className="primary-content">{children}<motion.span className="primary-arrow" aria-hidden="true"
      variants={{rest: {x: 0}, hover: {x: 6}}} transition={{type: 'spring', stiffness: 300, damping: 16}}><Icon size={20}/></motion.span></span>
    {ripples.map(id => <motion.span key={id} className="primary-ripple" aria-hidden="true"
      initial={{scale: 0, opacity: 0.45}} animate={{scale: 4, opacity: 0}} transition={{duration: 0.65, ease: 'easeOut'}}
      onAnimationComplete={() => setRipples(current => current.filter(value => value !== id))}/>)}
  </motion.button>;
}
