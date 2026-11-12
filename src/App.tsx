import {lazy, Suspense, useEffect, useState} from 'react';
import {AnimatePresence, MotionConfig, motion, useReducedMotion} from 'framer-motion';
import {GuestLanding} from './components/GuestLanding';
import {usePagePointer} from './hooks/usePagePointer';

const EmployeeWorkspace = lazy(() => import('./components/EmployeeWorkspace'));
const PitchDeck3D = lazy(() => import('./components/PitchDeck3D').then(module => ({default: module.PitchDeck3D})));

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [publicBoard, setPublicBoard] = useState(false);
  const [pitchOpen, setPitchOpen] = useState(false);
  const pointer = usePagePointer();
  const reduced = !!useReducedMotion();
  const login = () => setIsAuthenticated(true);
  const logout = () => {
    const url = new URL(location.href);
    ['compose', 'category', 'department'].forEach(key => url.searchParams.delete(key));
    history.replaceState(null, '', url);
    setPublicBoard(false);
    setIsAuthenticated(false);
    window.scrollTo({top: 0, behavior: 'instant'});
  };
  useEffect(() => {
    const launchPitch = (event: KeyboardEvent) => {if (event.altKey && event.key.toLowerCase() === 'p') {event.preventDefault(); setPitchOpen(true);}};
    window.addEventListener('keydown', launchPitch);
    return () => window.removeEventListener('keydown', launchPitch);
  }, []);

  return <MotionConfig reducedMotion="user">
    <AnimatePresence mode="wait" initial={false}><motion.div key={isAuthenticated ? 'employee' : 'guest'}
      initial={{opacity: 0, y: reduced ? 0 : 10}} animate={{opacity: 1, y: 0}} exit={{opacity: 0}}
      transition={{duration: reduced ? 0 : 0.2}}>
      {isAuthenticated ? <Suspense fallback={<div className="workspace-loading" role="status">Открываем рабочее пространство…</div>}><EmployeeWorkspace pointer={pointer} onLogout={logout}/></Suspense>
        : <GuestLanding pointer={pointer} showImprovements={publicBoard} onLogin={login} onPublicBoard={setPublicBoard}/>}
    </motion.div></AnimatePresence>
    <button className="demo-mode-switch" onClick={isAuthenticated ? logout : login}><span>Демо</span>{isAuthenticated ? 'Выйти (Режим гостя)' : 'Войти как сотрудник'}</button>
    <button className="pitch-launcher" onClick={() => setPitchOpen(true)}>🎥 3D-презентация <span>Alt + P</span></button>
    <AnimatePresence>{pitchOpen && <Suspense fallback={null}><PitchDeck3D onExit={() => setPitchOpen(false)} onStartDemo={() => {setIsAuthenticated(true); setPitchOpen(false);}}/></Suspense>}</AnimatePresence>
  </MotionConfig>;
}
