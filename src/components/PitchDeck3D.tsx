import {useEffect, useMemo, useRef, useState} from 'react';
import {Canvas, useFrame, useThree} from '@react-three/fiber';
import {Environment, Float, Sparkles} from '@react-three/drei';
import {AnimatePresence, motion, useReducedMotion} from 'framer-motion';
import {ArrowLeft, ArrowRight, CircleDollarSign, Cpu, Keyboard, Mic, QrCode, Radio, ScanSearch, ShieldCheck, X, Zap, type LucideIcon} from 'lucide-react';
import * as THREE from 'three';
import QRCode from 'qrcode';
import {qrPath} from '../lib/qr';

type DeckProps = {onExit: () => void; onStartDemo: () => void};

const WAYPOINTS: [number, number, number][] = [
  [0, 0.15, 7.6], [5.8, 0.7, 5.2], [-4.7, 4.6, 4.3], [1.2, -4.5, 5.1], [-5.8, -0.8, 4.2], [2.2, 1.15, 4.35],
];

const THEME = ['#7697ff', '#ff7f9d', '#74d6ff', '#a78bfa', '#55d6b2', '#91a8ff'];

function CameraRig({slide}: {slide: number}) {
  const {camera} = useThree();
  const lookAt = useRef(new THREE.Vector3());
  useFrame((_, delta) => {
    const [x, y, z] = WAYPOINTS[slide];
    const speed = 1 - Math.exp(-Math.min(delta, 0.05) * 1.65);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, x, speed);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, y, speed);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, z, speed);
    lookAt.current.x = THREE.MathUtils.lerp(lookAt.current.x, slide === 3 ? -0.25 : 0, speed);
    lookAt.current.y = THREE.MathUtils.lerp(lookAt.current.y, slide === 2 ? 0.15 : 0, speed);
    camera.lookAt(lookAt.current);
  });
  return null;
}

function ParticleField() {
  const positions = useMemo(() => {
    const seeded = (index: number) => {
      const value = Math.sin(index * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
    const points = new Float32Array(2000 * 3);
    for (let index = 0; index < 2000; index += 1) {
      const radius = 3.6 + seeded(index * 3) * 7;
      const theta = seeded(index * 3 + 1) * Math.PI * 2;
      const phi = Math.acos(2 * seeded(index * 3 + 2) - 1);
      points[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      points[index * 3 + 1] = radius * Math.cos(phi) * 0.62;
      points[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return points;
  }, []);
  return <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]}/></bufferGeometry><pointsMaterial size={0.018} sizeAttenuation color="#6ad8ff" transparent opacity={0.72} depthWrite={false}/></points>;
}

function Planet({slide}: {slide: number}) {
  const group = useRef<THREE.Group>(null);
  const planetMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const target = useMemo(() => new THREE.Color(), []);
  useFrame((state, delta) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.y += delta * 0.12;
    group.current.rotation.x = Math.sin(t * 0.32) * 0.08;
    target.set(THEME[slide]);
    if (planetMaterial.current) {
      planetMaterial.current.color.lerp(target, 1 - Math.exp(-delta * 2.2));
      planetMaterial.current.emissive.lerp(target, 1 - Math.exp(-delta * 1.6));
    }
  });
  return <group ref={group}>
    <Float speed={1.1} rotationIntensity={0.12} floatIntensity={0.22}>
      <mesh><sphereGeometry args={[1.15, 64, 48]}/><meshPhysicalMaterial ref={planetMaterial} color={THEME[slide]} roughness={0.1} transmission={0.88} thickness={1.4} clearcoat={1} clearcoatRoughness={0.07} iridescence={0.45} iridescenceIOR={1.35} emissive={THEME[slide]} emissiveIntensity={0.13}/></mesh>
      <group rotation={[0.75, 0.35, 0.35]}>
        <mesh><torusGeometry args={[1.65, 0.035, 10, 180]}/><meshStandardMaterial color="#d8ecff" metalness={0.82} roughness={0.17} emissive="#335eff" emissiveIntensity={0.35}/></mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[1.92, 0.012, 8, 180]}/><meshBasicMaterial color="#8aa7ff" transparent opacity={0.62}/></mesh>
        <mesh position={[1.66, 0, 0]}><sphereGeometry args={[0.1, 20, 20]}/><meshBasicMaterial color="#c7ffed"/><pointLight color="#79ffe1" intensity={3} distance={2.5}/></mesh>
      </group>
    </Float>
  </group>;
}

function Stage({slide}: {slide: number}) {
  return <Canvas camera={{position: WAYPOINTS[0], fov: 42}} dpr={[1, 1.5]} gl={{antialias: true, powerPreference: 'high-performance'}}>
    <color attach="background" args={['#020617']}/><fog attach="fog" args={['#020617', 7, 18]}/>
    <ambientLight intensity={0.58}/><directionalLight position={[4, 5, 6]} intensity={2.8} color="#dcedff"/><pointLight position={[-4, -2, 4]} intensity={12} color={THEME[slide]} distance={14}/>
    <Environment preset="city"/><ParticleField/><Sparkles count={90} scale={9} size={1.2} speed={0.18} opacity={0.35} color="#7dd3fc"/>
    <Planet slide={slide}/><CameraRig slide={slide}/>
  </Canvas>;
}

const bullets = [
  ['Заявки и спецификации', 'теряются в мессенджерах'], ['Согласования', 'занимают дни вместо часов'], ['Повторяющиеся сбои', 'не превращаются в деньги'],
];
const featureList: [LucideIcon, string, string][] = [
  [Mic, 'Voice-to-Text', 'Голосовой ввод для полевых инженеров'], [ScanSearch, 'Anti-Duplicate', 'Поиск похожих проблем в реальном времени'], [CircleDollarSign, 'ROI-калькулятор', 'Часы и тенге в год по понятным допущениям'], [QrCode, 'QR-доступ', 'Короткий путь к форме для цехов и складов'],
];

function SlideContent({slide, onStartDemo}: {slide: number; onStartDemo: () => void}) {
  const [qr, setQr] = useState<{path: string; viewBox: string} | null>(null);
  useEffect(() => {
    if (slide !== 5) return;
    const code = QRCode.create(`${location.origin}${location.pathname}?compose=1`, {errorCorrectionLevel: 'M'});
    setQr(qrPath(code.modules.size, code.modules.data));
  }, [slide]);
  if (slide === 0) return <><p className="pitch-kicker">HACKATHON · ГК «МОДУС ТРЕЙД»</p><h1>Dauys — голос сотрудников<br/><span>ГК «Модус Трейд»</span></h1><p className="pitch-lead">Интеллектуальная система обратной связи, превращающая проблемы на объектах в измеримую экономию.</p></>;
  if (slide === 1) return <><p className="pitch-kicker">БОЛЬ БИЗНЕСА</p><h2>Сигналы с объектов есть.<br/>Общей картины нет.</h2><div className="pitch-card-grid">{bullets.map(([title, body], index) => <article className="pitch-mini-card" key={title}><span>0{index + 1}</span><strong>{title}</strong><p>{body}</p></article>)}</div></>;
  if (slide === 2) return <><p className="pitch-kicker">СКВОЗНОЙ СЦЕНАРИЙ</p><h2>От голоса на объекте<br/>к подтверждённому результату</h2><ol className="pitch-steps">{[['Голосовой ввод', 'Voice-to-Text'], ['AI-маршрутизация', 'поиск дублей'], ['Контроль SLA', 'анти-просрочка'], ['Подтверждение', 'результат автором']].map(([title, body], index) => <li key={title}><span>{index + 1}</span><div><strong>{title}</strong><small>{body}</small></div></li>)}</ol></>;
  if (slide === 3) return <><p className="pitch-kicker">КИЛЛЕР-ФИЧИ</p><h2>Возможности для<br/>полевой работы</h2><div className="pitch-feature-grid">{featureList.map(([Icon, title, body]) => <article key={title}><Icon size={23}/><strong>{title}</strong><p>{body}</p></article>)}</div></>;
  if (slide === 4) return <><p className="pitch-kicker">НАДЁЖНАЯ ОСНОВА</p><h2>Быстрый MVP сейчас.<br/>Готовность к развитию.</h2><div className="pitch-tech-stack"><div><Cpu size={22}/><strong>Backend</strong><p>Go + Fiber + PostgreSQL 17</p></div><div><Radio size={22}/><strong>Realtime</strong><p>SSE-уведомления и RBAC-роли</p></div><div><ShieldCheck size={22}/><strong>Качество</strong><p>88/88 интеграционных тестов</p></div><div><Zap size={22}/><strong>Интеграции</strong><p>Docker, 1С и Битрикс24</p></div></div><p className="pitch-disclaimer">Показатели отражают подготовленный хакатонный MVP.</p></>;
  return <><p className="pitch-kicker">LIVE DEMO</p><h2>Попробуйте Dauys<br/>прямо сейчас</h2><p className="pitch-lead">Откройте форму по QR-коду или запустите рабочий интерфейс на этом устройстве.</p><div className="pitch-demo-actions"><motion.button whileHover={{scale: 1.03}} whileTap={{scale: 0.98}} className="pitch-demo-button" onClick={onStartDemo}>Запустить живое демо Dauys <ArrowRight size={19}/></motion.button>{qr && <div className="pitch-qr"><svg role="img" aria-label="QR-код для формы обращения Dauys" viewBox={qr.viewBox} shapeRendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d={qr.path} fill="#071127"/></svg><small>Отсканируйте, чтобы открыть форму</small></div>}</div></>;
}

export function PitchDeck3D({onExit, onStartDemo}: DeckProps) {
  const [slide, setSlide] = useState(0);
  const reduced = !!useReducedMotion();
  const locked = useRef(false);
  const navigate = (direction: number) => setSlide(current => Math.max(0, Math.min(5, current + direction)));
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onExit(); return; }
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); navigate(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); navigate(-1); }
    };
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 8 || locked.current) return;
      event.preventDefault(); locked.current = true; navigate(event.deltaY > 0 ? 1 : -1);
      window.setTimeout(() => { locked.current = false; }, 520);
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('wheel', wheel, {passive: false});
    return () => {window.removeEventListener('keydown', keydown); window.removeEventListener('wheel', wheel);};
  }, [onExit]);
  return <section className="pitch-deck fixed inset-0 z-50 overflow-hidden bg-slate-950 text-white" aria-label="3D-презентация Dauys">
    <div className="absolute inset-0"><Stage slide={slide}/></div><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_35%_45%,transparent_0%,rgba(2,6,23,.16)_47%,rgba(2,6,23,.82)_100%)]"/>
    <header className="pitch-header"><div><span className="pitch-brand">DAUYS</span><span className="pitch-count">{String(slide + 1).padStart(2, '0')} / 06</span></div><button className="pitch-close" onClick={onExit} aria-label="Закрыть 3D-презентацию"><X size={20}/><span>Выйти</span></button></header>
    <main className="pitch-content"><AnimatePresence mode="wait"><motion.section key={slide} className="pitch-glass-card" initial={{opacity: 0, y: reduced ? 0 : 18, filter: reduced ? 'none' : 'blur(6px)'}} animate={{opacity: 1, y: 0, filter: 'blur(0px)'}} exit={{opacity: 0, y: reduced ? 0 : -14, filter: reduced ? 'none' : 'blur(4px)'}} transition={{duration: reduced ? 0 : 0.42, ease: [0.22, 1, 0.36, 1]}}><SlideContent slide={slide} onStartDemo={onStartDemo}/></motion.section></AnimatePresence></main>
    <footer className="pitch-footer"><div className="pitch-hint"><Keyboard size={15}/> ← → · Space · колёсико</div><div className="pitch-progress" aria-label="Навигация по слайдам">{Array.from({length: 6}, (_, index) => <button key={index} className={index === slide ? 'active' : ''} onClick={() => setSlide(index)} aria-label={`Слайд ${index + 1}`} aria-current={index === slide ? 'step' : undefined}/>)}</div><div className="pitch-controls"><button onClick={() => navigate(-1)} disabled={slide === 0} aria-label="Предыдущий слайд"><ArrowLeft size={19}/></button><button onClick={() => navigate(1)} disabled={slide === 5} aria-label="Следующий слайд"><ArrowRight size={19}/></button></div></footer>
  </section>;
}


