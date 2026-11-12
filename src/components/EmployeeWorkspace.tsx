import {lazy, Suspense, useCallback, useEffect, useMemo, useState} from 'react';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {Check, Plus} from 'lucide-react';
import {Header} from './Header';
import {EmployeeHome} from './EmployeeHome';
import {AppealTable} from './AppealTable';
import {CreateAppealDialog} from './CreateAppealDialog';
import {AppealDialog} from './AppealDialog';
import {QRAccessDialog} from './QRAccessDialog';
import {Dialog} from './Dialog';
import {PrimaryButton} from './PrimaryButton';
import {ImprovementBoard} from './ImprovementBoard';
import {HelpPage} from './HelpPage';
import {useAppeals} from '../hooks/useAppeals';
import {DEMO_EMPLOYEE, activeEmployeeAppeals, employeeAppeals} from '../lib/workspace';
import {departments, type ComposeContext, type Kind, type NewAppeal, type PointerRef, type View} from '../types';
import seed from '../data/seed.json';

const Analytics = lazy(() => import('./Analytics').then(module => ({default: module.Analytics})));
const BackgroundParticles = lazy(() => import('./three/SwarmBackground').then(module => ({default: module.BackgroundParticles})));

function composeIntent(): ComposeContext | undefined {
  const query = new URLSearchParams(location.search);
  if (query.get('compose') !== '1') return undefined;
  return {category: seed.some(item => item.category === query.get('category')) ? query.get('category')! : undefined,
    department: departments.includes(query.get('department') || '') ? query.get('department')! : undefined};
}

function clearComposeQuery() {
  const url = new URL(location.href);
  ['compose', 'category', 'department'].forEach(key => url.searchParams.delete(key));
  history.replaceState(null, '', url);
}

export default function EmployeeWorkspace({pointer, onLogout}: {pointer: PointerRef; onLogout: () => void}) {
  const [view, setView] = useState<View>('space');
  const [context, setContext] = useState(composeIntent);
  const [creating, setCreating] = useState(() => new URLSearchParams(location.search).get('compose') === '1');
  const [initialKind, setInitialKind] = useState<Kind>('problem');
  const [qrOpen, setQROpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const reduced = !!useReducedMotion();
  const repository = useAppeals();
  const {appeals, notifications, create, comment, confirm, support, escalate, measure, readAll, storageAvailable} = repository;
  const mine = useMemo(() => employeeAppeals(appeals, DEMO_EMPLOYEE.name), [appeals]);
  const active = useMemo(() => activeEmployeeAppeals(appeals, DEMO_EMPLOYEE.name), [appeals]);
  const selected = appeals.find(item => item.id === selectedId) ?? null;
  const myIDs = new Set(mine.map(item => item.id));
  const myNotifications = notifications.filter(item => myIDs.has(item.appealId));
  const overlayOpen = creating || !!selected || qrOpen || settingsOpen;
  useEffect(() => {if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4000); return () => window.clearTimeout(timer);}, [toast]);
  const navigate = useCallback((next: View) => {setView(next); window.scrollTo({top: 0, behavior: 'instant'});}, []);
  const open = (id: string) => {setCreating(false); setSelectedId(id);};
  const startCreate = (kind: Kind = 'problem') => {setInitialKind(kind); setContext(undefined); setCreating(true);};
  const closeCreate = () => {setCreating(false); clearComposeQuery();};
  const submit = (input: NewAppeal) => {const id = create(input); closeCreate(); setSelectedId(id); setView('appeals'); setToast('Обращение создано. Ответ будет в его карточке.');};

  return <div className="employee-mode">
    {!motionPaused && <Suspense fallback={null}><BackgroundParticles pointer={pointer} paused={overlayOpen}/></Suspense>}
    <div className="app-shell employee-shell">
      <Header view={view} onNavigate={navigate} onOpen={open} notifications={myNotifications} onReadAll={readAll} activeCount={active.length} onQR={() => setQROpen(true)} onSettings={() => setSettingsOpen(true)} onLogout={onLogout}/>
      <main id="workspace-panel" role="tabpanel" aria-labelledby={`workspace-${view}`} tabIndex={0}>
        <AnimatePresence mode="wait" initial={false}><motion.div key={view} initial={{opacity: 0, y: reduced ? 0 : 10}} animate={{opacity: 1, y: 0}} exit={{opacity: 0}} transition={{duration: reduced ? 0 : 0.18}}>
          {view === 'space' && <EmployeeHome activeAppeals={active} pointer={pointer} paused={overlayOpen || motionPaused} onCreate={startCreate} onOpen={open} onShowAll={() => navigate('appeals')}/>}
          {view === 'appeals' && <AppealTable items={mine} onOpen={open} onCreate={() => startCreate()}/>}
          {view === 'improvements' && <section className="improvements-page"><div className="workspace-page-heading"><div><h1>Улучшения</h1><p>Что изменилось благодаря обращениям сотрудников.</p></div><PrimaryButton icon={Plus} onClick={() => startCreate('idea')}>Предложить улучшение</PrimaryButton></div><ImprovementBoard appeals={appeals} onOpen={open}/></section>}
          {view === 'analytics' && <Suspense fallback={<p className="workspace-loading" role="status">Загружаем аналитику…</p>}><Analytics appeals={appeals} onOpen={open}/></Suspense>}
          {view === 'help' && <HelpPage onCreate={() => startCreate()}/>}
        </motion.div></AnimatePresence>
      </main>
      <footer className="site-footer"><span>ГК «Модус Трейд»</span><span>{storageAvailable ? 'Демонстрационное рабочее пространство' : 'Хранилище недоступно · данные до закрытия страницы'}</span></footer>
    </div>
    <CreateAppealDialog open={creating} category={null} initialKind={initialKind} context={context} covered={!!selected} appeals={appeals} onSupport={support} onOpen={open} onClose={closeCreate} onSubmit={submit}/>
    <AppealDialog appeal={selected} onClose={() => setSelectedId(null)} onSupport={support} onEscalate={escalate} onMeasure={measure} onComment={(id, body) => {comment(id, body); setToast('Комментарий добавлен');}} onConfirm={id => {confirm(id); setToast('Результат подтверждён. Спасибо!');}}/>
    <QRAccessDialog open={qrOpen} onClose={() => setQROpen(false)}/>
    <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Настройки"><div className="workspace-settings"><p><strong>{DEMO_EMPLOYEE.name}</strong><span>{DEMO_EMPLOYEE.department} · {DEMO_EMPLOYEE.email}</span></p><label className="motion-preference"><input type="checkbox" checked={!motionPaused && !reduced} disabled={reduced} onChange={event => setMotionPaused(!event.target.checked)}/><span>Движение 3D<small>{reduced ? 'Уменьшено по настройке вашего устройства.' : 'Плавная анимация планеты и фона.'}</small></span></label><p className="settings-demo-note">Демонстрационный вход. Обращения сохраняются в этом браузере.</p></div></Dialog>
    <AnimatePresence>{toast && <motion.div className="toast" role="status" initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} exit={{opacity: 0}}><Check size={17}/>{toast}</motion.div>}</AnimatePresence>
  </div>;
}
