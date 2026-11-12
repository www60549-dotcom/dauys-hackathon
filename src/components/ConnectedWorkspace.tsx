import {lazy, Suspense, useEffect, useMemo, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {Check, Plus} from 'lucide-react';
import {api} from '../api/client';
import {toAppeal, toNotification} from '../api/adapters';
import type {AppealFilters, SessionUser} from '../api/contracts';
import type {ComposeContext, Kind, PointerRef, View} from '../types';
import {Header} from './Header';
import {EmployeeHome} from './EmployeeHome';
import {PrimaryButton} from './PrimaryButton';
import {ServerAppealList} from './ServerAppealList';
import {ServerAppealDialog} from './ServerAppealDialog';
import {ServerCreateDialog} from './ServerCreateDialog';
import {ServerAdminSettings} from './ServerAdminSettings';
import {QRAccessDialog} from './QRAccessDialog';
import {Dialog} from './Dialog';
import {HelpPage} from './HelpPage';
const BackgroundParticles = lazy(() => import('./three/SwarmBackground').then(module => ({default: module.BackgroundParticles})));
const Analytics = lazy(() => import('./ServerAnalytics').then(module => ({default: module.ServerAnalytics})));
const views: View[] = ['space', 'appeals', 'assigned', 'improvements', 'analytics', 'help', 'admin'];

export default function ConnectedWorkspace({pointer, user, onLogout}: {pointer: PointerRef; user: SessionUser; onLogout: () => void}) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requestedView = params.get('tab') as View;
  const view = views.includes(requestedView) && !(requestedView === 'admin' && user.role !== 'admin') && !(requestedView === 'assigned' && user.role === 'employee') ? requestedView : 'space';
  const selectedId = params.get('appeal');
  const creating = params.get('compose') === '1';
  const [kind, setKind] = useState<Kind>('problem');
  const [qrOpen, setQROpen] = useState(false), [settingsOpen, setSettingsOpen] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false), [toast, setToast] = useState('');
  const reduced = !!useReducedMotion();
  const query = params.get('q') || '';
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {const timer = setTimeout(() => setDebouncedQuery(query), 250); return () => clearTimeout(timer);}, [query]);
  useEffect(() => {if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer);}, [toast]);
  const context = useMemo<ComposeContext>(() => ({category: params.get('category') || undefined, department: params.get('department') || undefined}), [params.get('category'), params.get('department')]);
  const root = ['workspace', user.id] as const;
  const meta = useQuery({queryKey: [...root, 'meta'], queryFn: ({signal}) => api.meta(signal), staleTime: 60_000});
  const home = useQuery({queryKey: [...root, 'home'], queryFn: ({signal}) => api.appeals({mine: 'true', status: 'active', sort: 'updated'}, signal)});
  const notices = useQuery({queryKey: [...root, 'notifications'], queryFn: ({signal}) => api.notifications(signal)});
  const filters: AppealFilters = {page: Math.max(1, Number(params.get('page')) || 1), q: debouncedQuery, status: (params.get('status') || undefined) as AppealFilters['status'], kind: (params.get('kind') || undefined) as AppealFilters['kind'], department: params.get('department') || undefined,
    mine: view === 'appeals' && params.get('scope') !== 'all' ? 'true' : undefined, assigned: view === 'assigned' ? 'true' : undefined};
  if (view === 'improvements') {filters.status = 'done'; filters.mine = undefined;}
  const list = useQuery({queryKey: [...root, 'list', view, filters], queryFn: ({signal}) => api.appeals(filters, signal), enabled: ['appeals', 'assigned', 'improvements'].includes(view)});
  const detail = useQuery({queryKey: [...root, 'detail', selectedId], queryFn: ({signal}) => api.detail(selectedId!, signal), enabled: !!selectedId});
  const active = useMemo(() => home.data?.items.map(item => toAppeal(item)) ?? [], [home.data]);
  const notifications = useMemo(() => notices.data?.map(toNotification) ?? [], [notices.data]);
  const refresh = () => client.invalidateQueries({queryKey: root});
  const changeParams = (values: Record<string, string | undefined>, replace = false) => setParams(current => {
    const next = new URLSearchParams(current); Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); return next;
  }, {replace});
  const navigate = (next: View) => {changeParams({tab: next, page: undefined, q: undefined, status: undefined, kind: undefined, department: undefined, scope: undefined, appeal: undefined, compose: undefined, category: undefined}); window.scrollTo({top: 0, behavior: 'instant'});};
  const open = (id: string) => changeParams({appeal: id, compose: undefined});
  const startCreate = (next: Kind = 'problem') => {setKind(next); changeParams({compose: '1', category: undefined, department: undefined, appeal: undefined});};
  const closeCreate = () => changeParams({compose: undefined, category: undefined, department: undefined});
  const overlay = creating || !!selectedId || qrOpen || settingsOpen;
  return <div className="employee-mode">
    <Suspense fallback={null}><BackgroundParticles pointer={pointer} paused={overlay || motionPaused}/></Suspense>
    <div className="app-shell employee-shell">
      <Header user={user} view={view} onNavigate={navigate} onOpen={open} notifications={notifications} activeCount={home.data?.counts.active ?? 0} onReadAll={() => {void api.readNotifications().then(refresh).catch(error => setToast(error.message));}} onQR={() => setQROpen(true)} onSettings={() => setSettingsOpen(true)} onLogout={onLogout}/>
      {meta.error && <p className="form-error" role="alert">Не удалось загрузить справочники. <button onClick={() => {void meta.refetch();}}>Повторить</button></p>}
      <main id="workspace-panel" role="tabpanel" aria-labelledby={`workspace-${view}`} tabIndex={0}>
        <AnimatePresence mode="wait" initial={false}><motion.div key={view} initial={{opacity: 0, y: reduced ? 0 : 8}} animate={{opacity: 1, y: 0}} exit={{opacity: 0}} transition={{duration: reduced ? 0 : 0.18}}>
          {view === 'space' && <>{home.isPending ? <p className="workspace-loading" role="status">Загружаем ваши обращения…</p> : home.error ? <p className="form-error" role="alert">{home.error.message} <button onClick={() => {void home.refetch();}}>Повторить</button></p> : <EmployeeHome user={user} activeAppeals={active} pointer={pointer} paused={overlay || motionPaused} onCreate={startCreate} onOpen={open} onShowAll={() => navigate('appeals')}/>}</>}
          {['appeals', 'assigned', 'improvements'].includes(view) && <>
            <div className="server-list-actions"><PrimaryButton icon={Plus} onClick={() => startCreate(view === 'improvements' ? 'idea' : 'problem')}>{view === 'improvements' ? 'Предложить улучшение' : 'Создать обращение'}</PrimaryButton>{view === 'appeals' && <label className="form-field">Показать<select value={params.get('scope') || 'mine'} onChange={event => changeParams({scope: event.target.value, page: undefined}, true)}><option value="mine">Мои обращения</option><option value="all">Все обращения компании</option></select></label>}</div>
            <ServerAppealList data={list.data} loading={list.isFetching} error={list.error} title={view === 'assigned' ? 'Назначенные мне' : view === 'improvements' ? 'Решения и улучшения' : params.get('scope') === 'all' ? 'Обращения компании' : 'Мои обращения'} query={query} status={params.get('status') || ''} kind={params.get('kind') || ''} onFilter={(key, value) => changeParams({[key]: value, page: undefined}, true)} onOpen={open} onPage={page => changeParams({page: String(page)})} onRetry={() => {void list.refetch();}}/>
          </>}
          {view === 'analytics' && <Suspense fallback={<p className="workspace-loading">Загружаем аналитику…</p>}><Analytics userId={user.id} departments={meta.data?.departments ?? []} onOpen={open}/></Suspense>}
          {view === 'admin' && user.role === 'admin' && <ServerAdminSettings meta={meta.data} onChanged={refresh}/>}
          {view === 'help' && <HelpPage onCreate={() => startCreate()}/>}
        </motion.div></AnimatePresence>
      </main><footer className="site-footer"><span>ГК «Модус Трейд»</span><span>Общая база обращений</span></footer>
    </div>
    <ServerCreateDialog open={creating} kind={kind} context={context} meta={meta.data} user={user} onClose={closeCreate} onCreated={id => {changeParams({compose: undefined, category: undefined, department: undefined, appeal: id, tab: 'appeals'}); setToast('Обращение зарегистрировано.'); void refresh();}}/>
    <ServerAppealDialog id={selectedId} detail={detail.data} loading={detail.isPending} error={detail.error} user={user} meta={meta.data} onClose={() => changeParams({appeal: undefined})} onChanged={refresh} onRetry={() => {void detail.refetch();}}/>
    <QRAccessDialog open={qrOpen} onClose={() => setQROpen(false)}/>
    <Dialog open={settingsOpen} title="Настройки" onClose={() => setSettingsOpen(false)}><div className="workspace-settings"><p><strong>{user.name}</strong><span>{user.department} · {user.email}</span></p><label className="motion-preference"><input type="checkbox" checked={!motionPaused && !reduced} disabled={reduced} onChange={event => setMotionPaused(!event.target.checked)}/><span>Движение 3D</span></label></div></Dialog>
    <AnimatePresence>{toast && <motion.div className="toast" role="status" initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} exit={{opacity: 0}}><Check size={17}/>{toast}</motion.div>}</AnimatePresence>
  </div>;
}
