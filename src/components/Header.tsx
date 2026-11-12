import {useEffect, useRef, useState} from 'react';
import {AnimatePresence, motion, useAnimationControls, useReducedMotion} from 'framer-motion';
import {ArrowUpRight, Bell, CheckCheck, LogOut, QrCode, Settings, X} from 'lucide-react';
import {Brand} from './Brand';
import {NavigationTabs} from './NavigationTabs';
import {DEMO_EMPLOYEE} from '../lib/workspace';
import type {View, Notification} from '../types';

interface Props {
  view: View; onNavigate: (view: View) => void; onOpen: (id: string) => void;
  notifications: Notification[]; onReadAll: () => void; activeCount: number;
  onQR: () => void; onSettings: () => void; onLogout: () => void;
}

export function Header({view, onNavigate, onOpen, notifications, onReadAll, activeCount, onQR, onSettings, onLogout}: Props) {
  const [popover, setPopover] = useState<'notifications' | 'profile' | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const latestNotice = useRef(notifications[0]?.id);
  const bell = useAnimationControls();
  const reduced = !!useReducedMotion();
  const read = !notifications.some(item => !item.read);
  useEffect(() => {
    const id = notifications[0]?.id;
    if (id && id !== latestNotice.current && !reduced) void bell.start({rotate: [0, -12, 8, 0], transition: {duration: 0.45}});
    latestNotice.current = id;
  }, [notifications, reduced, bell]);
  useEffect(() => {
    if (!popover) return;
    const outside = (event: PointerEvent) => {if (container.current && !container.current.contains(event.target as Node)) setPopover(null);};
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape') {setPopover(null); trigger.current?.focus();}};
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);};
  }, [popover]);
  const tabs: {id: View; label: string; count?: number}[] = [
    {id: 'space', label: 'Главная'}, {id: 'appeals', label: 'Мои обращения', count: activeCount},
    {id: 'improvements', label: 'Улучшения'}, {id: 'analytics', label: 'Аналитика и итоги'}, {id: 'help', label: 'Помощь'},
  ];
  const menuAction = (action: () => void) => {setPopover(null); action();};
  return <header className="site-header employee-header">
    <button className="brand-button" aria-label="Dauys — главная" onClick={() => {setPopover(null); onNavigate('space');}}><Brand/></button>
    <NavigationTabs id="workspace" tabs={tabs} value={view} label="Разделы рабочего пространства" onChange={next => {setPopover(null); onNavigate(next);}} className="workspace-tabs"/>
    <div className="header-actions" ref={container}>
      <button className="icon-button bell-button" aria-label="Уведомления" aria-expanded={popover === 'notifications'} onClick={event => {trigger.current = event.currentTarget; setPopover(value => value === 'notifications' ? null : 'notifications');}}><motion.span animate={bell}><Bell size={22} strokeWidth={1.6}/></motion.span>{!read && <span className="notification-dot"/>}</button>
      <button className="avatar" aria-label={`Профиль: ${DEMO_EMPLOYEE.name}`} aria-expanded={popover === 'profile'} onClick={event => {trigger.current = event.currentTarget; setPopover(value => value === 'profile' ? null : 'profile');}}>{DEMO_EMPLOYEE.initials}</button>
      <AnimatePresence>{popover && <motion.aside className="header-popover workspace-popover" key={popover} initial={{opacity: 0, y: -5}} animate={{opacity: 1, y: 0}} exit={{opacity: 0}} transition={{duration: reduced ? 0 : 0.15}} aria-label={popover === 'profile' ? 'Профиль сотрудника' : 'Уведомления'}>
        <div className="popover-heading"><h3>{popover === 'profile' ? DEMO_EMPLOYEE.name : 'Уведомления'}</h3><button className="icon-button small" aria-label="Закрыть меню" onClick={() => {setPopover(null); trigger.current?.focus();}}><X size={17}/></button></div>
        {popover === 'profile' ? <><p className="profile-department">{DEMO_EMPLOYEE.department}</p><div className="profile-actions"><button onClick={() => menuAction(onQR)}><QrCode size={18}/>QR-код для телефона</button><button onClick={() => menuAction(onSettings)}><Settings size={18}/>Настройки</button><button onClick={() => menuAction(onLogout)}><LogOut size={18}/>Выход</button></div></>
          : <><div className="notice-list">{notifications.slice(0, 12).map(item => <button className="notice-item" key={item.id} onClick={() => menuAction(() => onOpen(item.appealId))}><span><strong>{item.appealId}</strong><small>{item.body}</small></span><ArrowUpRight size={16}/></button>)}{!notifications.length && <p className="profile-department">Новых событий пока нет.</p>}</div><button className="text-button" onClick={onReadAll}><CheckCheck size={16}/>{read ? 'Всё прочитано' : 'Отметить прочитанными'}</button></>}
      </motion.aside>}</AnimatePresence>
    </div>
  </header>;
}
