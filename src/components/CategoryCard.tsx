import {useRef, useState, type KeyboardEvent, type PointerEvent} from 'react';
import {motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform} from 'framer-motion';
import {DraftingCompass, LaptopMinimal, ShoppingCart, Wrench, Layers, type LucideIcon} from 'lucide-react';
import {cn} from '../lib/utils';
import type {CategoryId} from '../types';

export const categories: {id: CategoryId; label: string; description: string; icon: LucideIcon; category: string; department: string}[] = [
  {id: 'procurement', label: 'Закупки', description: 'Меньше согласований. Больше движения.', icon: ShoppingCart, category: 'Межотдельное взаимодействие', department: 'Закупки'},
  {id: 'it', label: 'IT и сервисы', description: 'Инструменты, которые помогают работать.', icon: LaptopMinimal, category: 'Интеграции и IT', department: 'IT'},
  {id: 'engineering', label: 'Проектирование', description: 'Точнее процессы. Сильнее результат.', icon: DraftingCompass, category: 'Проектная деятельность', department: 'Проектирование'},
  {id: 'installation', label: 'Монтаж и сервис', description: 'От задачи до готового результата.', icon: Wrench, category: 'Постановка задач', department: 'Монтаж и сервис'},
  {id: 'processes', label: 'Рабочие процессы', description: 'Удобные правила. Меньше рутины.', icon: Layers, category: 'Регламенты', department: 'Бухгалтерия'},
];

function CategoryCard({category, selected, focusable, onSelect}: {category: typeof categories[number]; selected: boolean; focusable: boolean; onSelect: () => void}) {
  const reduced = !!useReducedMotion();
  const rect = useRef<DOMRect | null>(null);
  const x = useMotionValue(0), y = useMotionValue(0);
  const px = useMotionValue(180), py = useMotionValue(60);
  const smoothX = useSpring(x, {stiffness: 230, damping: 25});
  const smoothY = useSpring(y, {stiffness: 230, damping: 25});
  const rotateX = useTransform(smoothY, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(smoothX, [-0.5, 0.5], [-7, 7]);
  const glow = useMotionTemplate`radial-gradient(250px circle at ${px}px ${py}px, rgba(37,99,235,.11), transparent 70%)`;
  const border = useMotionTemplate`radial-gradient(180px circle at ${px}px ${py}px, #2563eb, rgba(37,99,235,.08))`;
  const [ripples, setRipples] = useState<{id: number; x: number; y: number}[]>([]);
  const counter = useRef(0);
  const Icon = category.icon;
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (reduced || event.pointerType === 'touch') return;
    const bounds = rect.current;
    if (!bounds) return;
    const localX = event.clientX - bounds.left, localY = event.clientY - bounds.top;
    x.set(localX / bounds.width - 0.5); y.set(localY / bounds.height - 0.5); px.set(localX); py.set(localY);
  };
  return <motion.button type="button" role="radio" aria-checked={selected} tabIndex={focusable ? 0 : -1} className={cn('category-card', selected && 'is-selected')} style={{rotateX, rotateY, transformPerspective: 1000}} whileHover={reduced ? undefined : {y: -4, scale: 1.025}} whileTap={reduced ? undefined : {scale: 0.99}} transition={{type: 'spring', stiffness: 280, damping: 24}}
    onPointerEnter={event => { rect.current = event.currentTarget.getBoundingClientRect(); }} onPointerMove={move} onPointerLeave={() => { x.set(0); y.set(0); rect.current = null; }}
    onClick={event => {
      onSelect();
      if (reduced) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const id = ++counter.current;
      setRipples(current => [...current.slice(-2), {id, x: event.detail ? event.clientX - bounds.left : bounds.width / 2, y: event.detail ? event.clientY - bounds.top : bounds.height / 2}]);
    }}>
    <motion.span className="category-glow" style={{background: glow}} aria-hidden="true"/>
    <motion.span className="category-border" style={{background: border}} aria-hidden="true"/>
    <span className="category-icon"><Icon size={29} strokeWidth={1.45}/></span>
    <span className="category-copy"><strong>{category.label}</strong><small>{category.description}</small></span>
    <span className="radio-shell"><motion.span className="radio-fill" initial={false} animate={{scale: selected ? 1 : 0, opacity: selected ? 1 : 0}} transition={{type: 'spring', stiffness: 300, damping: 14}}/></span>
    <span className="ripple-clip" aria-hidden="true">{ripples.map(ripple => <motion.i key={ripple.id} className="click-wave" style={{left: ripple.x, top: ripple.y}} initial={{scale: 0, opacity: 0.35, rotateX: 20}} animate={{scale: 5, opacity: 0}} transition={{duration: 0.8, ease: 'easeOut'}} onAnimationComplete={() => setRipples(current => current.filter(item => item.id !== ripple.id))}/>)}</span>
  </motion.button>;
}

export function CategorySelector({value, onChange}: {value: CategoryId | null; onChange: (value: CategoryId) => void}) {
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = Math.max(0, categories.findIndex(category => category.id === value));
    const next = ['ArrowRight', 'ArrowDown'].includes(event.key) ? (current + 1) % categories.length : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (current + categories.length - 1) % categories.length : event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); onChange(categories[next].id);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next].focus();
  };
  return <div className="category-grid" role="radiogroup" aria-label="Категория обращения" onKeyDown={navigate}>{categories.map((category, index) => <CategoryCard key={category.id} category={category} selected={value === category.id} focusable={value === category.id || (value === null && index === 0)} onSelect={() => onChange(category.id)}/>)}</div>;
}
