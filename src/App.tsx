import {lazy, Suspense, useEffect, useState} from 'react';
import {AnimatePresence, MotionConfig, motion, useReducedMotion} from 'framer-motion';
import {useSearchParams} from 'react-router-dom';
import {GuestLanding} from './components/GuestLanding';
import {LoginDialog} from './components/LoginDialog';
import {usePagePointer} from './hooks/usePagePointer';
import {useAuth} from './auth/AuthProvider';

const Workspace = lazy(() => import('./components/ConnectedWorkspace'));
const PitchDeck3D = lazy(() => import('./components/PitchDeck3D').then(module => ({default: module.PitchDeck3D})));

export default function App() {
  const {user, loading, error, logout, retry} = useAuth();
  const [, setParams] = useSearchParams();
  const [publicBoard, setPublicBoard] = useState(false), [loginOpen, setLoginOpen] = useState(false);
  const [pitchOpen, setPitchOpen] = useState(false), [actionError, setActionError] = useState('');
  const pointer = usePagePointer();
  const reduced = !!useReducedMotion();
  const login = () => setLoginOpen(true);
  const signOut = () => {
    setActionError('');
    void logout().then(() => {setParams({}, {replace: true}); setPublicBoard(false); window.scrollTo({top: 0, behavior: 'instant'});})
      .catch(failure => setActionError(failure instanceof Error ? failure.message : 'Не удалось выйти. Повторите попытку.'));
  };
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const launch = (event: KeyboardEvent) => {if (event.altKey && event.key.toLowerCase() === 'p') {event.preventDefault(); setPitchOpen(true);}};
    window.addEventListener('keydown', launch); return () => window.removeEventListener('keydown', launch);
  }, []);
  if (loading) return <div className="app-shell workspace-loading" role="status">Проверяем вход в Dauys…</div>;
  return <MotionConfig reducedMotion="user">
    {(error || actionError) && <div className="server-message" role="alert"><p>{actionError || error?.message}</p><button className="text-button" onClick={() => {setActionError(''); retry();}}>Повторить</button></div>}
    <AnimatePresence mode="wait" initial={false}><motion.div key={user?.id ?? 'guest'} initial={{opacity: 0, y: reduced ? 0 : 10}} animate={{opacity: 1, y: 0}} exit={{opacity: 0}} transition={{duration: reduced ? 0 : 0.2}}>
      {user ? <Suspense fallback={<div className="workspace-loading" role="status">Открываем рабочее пространство…</div>}><Workspace pointer={pointer} user={user} onLogout={signOut}/></Suspense>
        : <GuestLanding pointer={pointer} showImprovements={publicBoard} onLogin={login} onPublicBoard={setPublicBoard}/>}
    </motion.div></AnimatePresence>
    <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)}/>
    {import.meta.env.DEV && <button className="pitch-launcher" onClick={() => setPitchOpen(true)}>🎥 3D-презентация <span>Alt + P</span></button>}
    <AnimatePresence>{pitchOpen && <Suspense fallback={null}><PitchDeck3D onExit={() => setPitchOpen(false)} onStartDemo={() => {setPitchOpen(false); if (!user) login();}}/></Suspense>}</AnimatePresence>
  </MotionConfig>;
}
