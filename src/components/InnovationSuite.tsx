import {useEffect, useMemo, useState} from 'react';
import {ArrowUpRight, Check, Mic, MicOff, Sparkles, TrendingUp, Users, Zap} from 'lucide-react';
import {motion} from 'framer-motion';
import {useSpeechInput} from '../hooks/useSpeechInput';
import {DEFAULT_ESTIMATE, DEMO_USER_ID, DEMO_AUTHOR, detectRoute, estimateImpact, findSimilarAppeals, reportedCount} from '../lib/innovation';
import {formatNumber} from '../lib/utils';
import type {Appeal, ImpactEstimate} from '../types';

interface Props {
  description: string; title: string; active: boolean; appeals: Appeal[];
  onDescription: (text: string) => void;
  onRoute: (category: string, department: string) => void;
  automatic: boolean; onAutomatic: (enabled: boolean) => void;
  estimate?: ImpactEstimate; onEstimate: (value?: ImpactEstimate) => void;
  onOpen: (id: string) => void; onSupport: (id: string) => void;
}

export function InnovationSuite(props: Props) {
  const {description, title, active, appeals, onDescription, onRoute, automatic, onAutomatic, estimate, onEstimate, onOpen, onSupport} = props;
  const speech = useSpeechInput(description, onDescription, active);
  const text = `${title} ${description}`;
  const route = useMemo(() => detectRoute(text), [text]);
  const [search, setSearch] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setSearch(text), 250); return () => window.clearTimeout(timer); }, [text]);
  const similar = useMemo(() => findSimilarAppeals(search, appeals), [search, appeals]);
  useEffect(() => { if (route && automatic) onRoute(route.category, route.department); }, [route?.category, route?.department, automatic, onRoute]);
  const [draft, setDraft] = useState(DEFAULT_ESTIMATE);
  const [calculationError, setCalculationError] = useState('');
  const updateEstimate = (key: keyof ImpactEstimate, value: number) => {
    const next = {...draft, [key]: value};
    setDraft(next);
    try { estimateImpact(next); setCalculationError(''); onEstimate(next); } catch { setCalculationError('Проверьте ставку и рабочие дни.'); onEstimate(undefined); }
  };
  let money = 0, hours = 0;
  try { const value = estimateImpact(draft); money = value.moneyYear; hours = value.hoursYear; } catch { /* Inline validation keeps the form usable. */ }

  return <section className="innovation-suite" aria-label="Помощник обращения">
    <div className="innovation-title"><span><Sparkles size={17}/>Помощник обращения</span><span className="demo-chip">Демо · локальные правила</span></div>
    <div className="voice-row"><button type="button" className={`button voice-button ${speech.listening ? 'is-listening' : ''}`} disabled={!speech.supported} aria-pressed={speech.listening} onClick={speech.toggle}>{speech.listening ? <MicOff size={17}/> : <Mic size={17}/>} {speech.listening ? 'Остановить запись' : 'Надиктовать'}</button><small>{speech.listening ? 'Слушаю… Текст появляется в описании.' : speech.supported ? 'Русская речь → описание. Нужен доступ к микрофону.' : 'Голосовой ввод недоступен в этом браузере или без HTTPS.'}</small></div>
    <p className="privacy-note">Распознавание выполняет браузер; он может использовать внешний речевой сервис. Текст можно исправить перед отправкой.</p>
    {speech.error && <p className="form-error" role="alert">{speech.error}</p>}
    <label className="check-label"><input type="checkbox" checked={automatic} onChange={event => onAutomatic(event.target.checked)}/>Подбирать категорию и подразделение по тексту</label>
    {route && <motion.div className="routing-card" initial={{opacity: 0, y: 5}} animate={{opacity: 1, y: 0}}><Zap size={19}/><div><strong>{automatic ? 'Автоопределён ответственный' : 'Предлагаемый ответственный'}: {route.officer}</strong><p>{route.role} · {route.label} · норматив ответа: {route.responseHours} часа</p><small>Демо-оценка: {route.demoConfidence}%. Точность не измерена; подбор по ключевым словам.</small>{!automatic && <button type="button" className="text-button" onClick={() => onRoute(route.category, route.department)}>Применить маршрут <Check size={14}/></button>}</div></motion.div>}
    {!!similar.length && <section className="similar-section" aria-label="Похожие обращения"><h3><Users size={16}/> Возможно, об этом уже сообщили</h3><p className="privacy-note">Совпадения по темам и словам. Проверьте содержание перед объединением.</p>{similar.map(({appeal, reasons}) => {
      const own = appeal.author === DEMO_AUTHOR;
      const supported = own || appeal.supporterIds?.includes(DEMO_USER_ID);
      return <article className="similar-item" key={appeal.id}><button type="button" className="similar-link" onClick={() => onOpen(appeal.id)}><small>{appeal.id} · сообщили: {reportedCount(appeal)}</small><strong>{appeal.title} <ArrowUpRight size={14}/></strong><span>{reasons.join(' · ') || 'Совпадение формулировок'}</span></button><button type="button" className="support-button" disabled={supported} onClick={() => onSupport(appeal.id)}>{supported ? <><Check size={14}/>{own ? 'Ваше обращение' : 'Вы присоединились'}</> : '+1 У меня так же'}</button></article>;
    })}</section>}
    <div className="roi-section"><label className="check-label"><input type="checkbox" checked={!!estimate || !!calculationError} onChange={event => { setCalculationError(''); setDraft(DEFAULT_ESTIMATE); onEstimate(event.target.checked ? DEFAULT_ESTIMATE : undefined); }}/><TrendingUp size={16}/>Оценить потенциальный эффект</label>{(estimate || calculationError) && <div className="roi-calculator">
      <label>Экономия на человека в день <strong>{draft.minutesPerDay} мин</strong><input type="range" min="5" max="60" step="1" value={draft.minutesPerDay} onChange={event => updateEstimate('minutesPerDay', +event.target.value)}/></label>
      <label>Охвачено сотрудников <strong>{draft.employees} чел.</strong><input type="range" min="1" max="150" step="1" value={draft.employees} onChange={event => updateEstimate('employees', +event.target.value)}/></label>
      <div className="roi-total" aria-live="polite"><span>Прогноз за год</span><strong>{formatNumber(money)} ₸</strong><small>{formatNumber(Math.round(hours))} часов потенциальной экономии</small></div>
      <details><summary>Допущения расчёта</summary><div className="form-grid"><label className="form-field">Стоимость часа, ₸<input type="number" min="0" max="1000000" step="1" value={Number.isFinite(draft.hourlyRate) ? draft.hourlyRate : ''} onChange={event => updateEstimate('hourlyRate', event.target.value === '' ? NaN : +event.target.value)}/></label><label className="form-field">Рабочих дней в году<input type="number" min="1" max="366" step="1" value={Number.isFinite(draft.workdays) ? draft.workdays : ''} onChange={event => updateEstimate('workdays', event.target.value === '' ? NaN : +event.target.value)}/></label></div></details>
      {calculationError && <p className="form-error" role="alert">{calculationError}</p>}<small className="privacy-note">Минуты ÷ 60 × сотрудники × ставка × дни. Это прогноз стоимости времени, а не подтверждённая финансовая экономия.</small>
    </div>}</div>
  </section>;
}
