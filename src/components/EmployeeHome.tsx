import {AlertTriangle, ArrowRight, Lightbulb, CheckCircle2} from 'lucide-react';
import {motion, useReducedMotion} from 'framer-motion';
import {DauysPlanet} from './DauysPlanet';
import {StatusBadge} from './StatusBadge';
import {DEMO_EMPLOYEE} from '../lib/workspace';
import {formatDate} from '../lib/utils';
import type {Appeal, Kind, PointerRef} from '../types';

export function EmployeeHome({user, activeAppeals, pointer, paused, onCreate, onOpen, onShowAll}: {
  user?: {name: string; department: string};
  activeAppeals: Appeal[]; pointer: PointerRef; paused: boolean;
  onCreate: (kind: Kind) => void; onOpen: (id: string) => void; onShowAll: () => void;
}) {
  const reduced = !!useReducedMotion();
  const profile = user ? {...user, firstName: user.name.split(' ')[0]} : DEMO_EMPLOYEE;
  return <section className="employee-home" aria-labelledby="employee-home-title">
    <div className="employee-welcome"><div><p className="employee-greeting">Привет, {profile.firstName} <span>• {profile.department}</span></p><h1 id="employee-home-title">Что сделаем лучше?</h1><p>Оставьте обращение — статус и ответ будут здесь.</p></div><DauysPlanet pointer={pointer} paused={paused} compact/></div>
    <div className="home-action-grid">{[
      {kind: 'problem' as const, title: 'Сообщить о проблеме', description: 'Что-то мешает работе или сломалось', icon: AlertTriangle},
      {kind: 'idea' as const, title: 'Предложить улучшение', description: 'Есть идея, как сделать процесс быстрее', icon: Lightbulb},
    ].map(({kind, title, description, icon: Icon}) => <motion.button key={kind} className={`home-action-card ${kind}`} onClick={() => onCreate(kind)} whileHover={reduced ? undefined : {y: -4}} whileTap={reduced ? undefined : {scale: 0.985}} transition={{type: 'spring', stiffness: 320, damping: 28}}><span className="home-action-icon"><Icon size={28} strokeWidth={1.6}/></span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={21}/></motion.button>)}</div>
    <section className="home-recent" aria-labelledby="home-recent-title"><div className="section-heading"><h2 id="home-recent-title">Мои активные обращения</h2><button className="text-button" onClick={onShowAll}>Все мои обращения <ArrowRight size={16}/></button></div>
      {activeAppeals.length ? <ul>{activeAppeals.slice(0, 3).map(item => <li key={item.id}><button className="home-recent-row" onClick={() => onOpen(item.id)}><span><small>{item.id}{item.status === 'resolved' && ' · Нужно ваше подтверждение'}</small><strong>{item.title}</strong></span><StatusBadge appeal={item}/><time dateTime={new Date(item.updatedAt).toISOString()}>{formatDate(item.updatedAt)}</time><ArrowRight size={18}/></button></li>)}</ul>
        : <div className="home-all-clear"><CheckCircle2 size={22}/><div><strong>Сейчас нет активных обращений</strong><p>Создайте новое выше или посмотрите историю своих обращений.</p></div></div>}
    </section>
  </section>;
}
