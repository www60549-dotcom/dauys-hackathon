import {useEffect, useState} from 'react';
import {motion, useReducedMotion} from 'framer-motion';
import {CalendarDays, Check, MessageCircle, Send, UserRound} from 'lucide-react';
import {Dialog} from './Dialog';
import {PrimaryButton} from './PrimaryButton';
import {StatusBadge} from './StatusBadge';
import {formatDate} from '../lib/utils';
import {statusLabels, type Appeal} from '../types';
import type {EffectMeasurement} from '../types';
import {DEMO_USER_ID, DEMO_AUTHOR, estimateImpact, reportedCount, slaWaitingHours} from '../lib/innovation';
import {formatNumber} from '../lib/utils';

export function AppealDialog({appeal, onClose, onComment, onConfirm, onSupport, onEscalate, onMeasure}: {appeal: Appeal | null; onClose: () => void; onComment: (id: string, body: string) => void; onConfirm: (id: string) => void; onSupport: (id: string) => void; onEscalate: (id: string) => void; onMeasure: (id: string, input: Omit<EffectMeasurement, 'recordedAt'>) => void}) {
  const [comment, setComment] = useState('');
  const reduced = !!useReducedMotion();
  useEffect(() => setComment(''), [appeal?.id]);
  return <Dialog open={!!appeal} title={appeal?.title || ''} eyebrow={appeal ? `${appeal.id} · ${appeal.category}` : ''} onClose={onClose}>
    {appeal && <div className="detail-body"><StatusBadge appeal={appeal} pill/><p className="detail-description">{appeal.description}</p><div className="detail-people"><span><UserRound size={17}/>{appeal.author}</span><span><UserRound size={17}/>{appeal.assignee}</span><span><CalendarDays size={17}/>До {formatDate(appeal.dueAt)}</span></div>
      {appeal.result && <div className={`detail-result ${appeal.status === 'rejected' ? 'is-rejected' : ''}`}><span><Check size={19}/></span><div><h3>{appeal.status === 'rejected' ? 'Причина отказа' : appeal.kind === 'praise' ? 'Отзыв принят' : 'Результат'}</h3><p>{appeal.result}</p></div></div>}
      {appeal.status === 'resolved' && appeal.author === DEMO_AUTHOR && <PrimaryButton className="w-full justify-center" icon={Check} onClick={() => onConfirm(appeal.id)}>Подтвердить решение</PrimaryButton>}
      {appeal.kind !== 'praise' && <div className="detail-support"><span>Сообщили: {reportedCount(appeal)}</span><button className="support-button" disabled={appeal.author === DEMO_AUTHOR || appeal.supporterIds?.includes(DEMO_USER_ID)} onClick={() => onSupport(appeal.id)}>{appeal.author === DEMO_AUTHOR ? 'Ваше обращение' : appeal.supporterIds?.includes(DEMO_USER_ID) ? 'Вы присоединились' : '+1 У меня такая же проблема'}</button></div>}
      {slaWaitingHours(appeal, Date.now()) !== null && <div className="detail-sla"><strong>Первый ответ задерживается больше 18 часов</strong><button className="support-button" disabled={!!appeal.escalation} onClick={() => onEscalate(appeal.id)}>{appeal.escalation ? appeal.escalation.processedAt ? 'Запрос обработан локально' : 'Запрос в очереди…' : 'Ускорить рассмотрение ⚡'}</button><small>Сигнал в локальной демо-очереди; отправка руководителю требует серверной интеграции.</small></div>}
      {appeal.estimate && <div className="detail-estimate"><strong>Прогноз эффекта: {formatNumber(estimateImpact(appeal.estimate).moneyYear)} ₸ / год</strong><p>{appeal.estimate.minutesPerDay} мин × {appeal.estimate.employees} чел. × {appeal.estimate.workdays} дней · {formatNumber(appeal.estimate.hourlyRate)} ₸/ч</p><small>Стоимость потенциально высвобожденного времени. Не входит в подтверждённый эффект.</small></div>}
      {['resolved', 'closed'].includes(appeal.status) && appeal.kind !== 'praise' && <EffectForm key={`${appeal.id}-${appeal.measurement?.recordedAt || 0}`} appeal={appeal} onMeasure={onMeasure}/>}
      <section className="detail-history"><h3>История обращения</h3><ol>{appeal.history.map((entry, index) => <motion.li key={`${entry.createdAt}-${index}`} initial={{opacity: 0, y: reduced ? 0 : 7}} animate={{opacity: 1, y: 0}} transition={{delay: reduced ? 0 : index * 0.1}}><i className={`history-dot status-${entry.status}`}/><span>{formatDate(entry.createdAt)}</span><strong>{entry.label || (entry.status === 'closed' && appeal.kind === 'praise' ? 'Отзыв принят' : statusLabels[entry.status])}</strong></motion.li>)}</ol></section>
      <section className="detail-discussion"><h3>Обсуждение <MessageCircle size={17}/></h3>{appeal.comments.length ? appeal.comments.map(item => <article className="comment" key={item.id}><span className="comment-avatar">{item.author.split(' ').slice(0, 2).map(word => word[0]).join('')}</span><div><h4>{item.author}<small>{formatDate(item.createdAt)}</small></h4><p>{item.body}</p></div></article>) : <p className="muted">Здесь можно уточнить детали и обсудить решение.</p>}<form className="comment-form" onSubmit={event => { event.preventDefault(); if (!comment.trim()) return; onComment(appeal.id, comment); setComment(''); }}><label className="sr-only" htmlFor="comment-input">Комментарий</label><input id="comment-input" placeholder="Написать комментарий…" maxLength={3000} required value={comment} onChange={event => setComment(event.target.value)}/><button className="button button-blue" type="submit" aria-label="Отправить комментарий" disabled={!comment.trim()}><Send size={19}/></button></form></section>
    </div>}
  </Dialog>;
}

function EffectForm({appeal, onMeasure}: {appeal: Appeal; onMeasure: (id: string, input: Omit<EffectMeasurement, 'recordedAt'>) => void}) {
  const [hours, setHours] = useState(appeal.measurement?.hoursPerMonth?.toString() || '');
  const [evidence, setEvidence] = useState(appeal.measurement?.evidence || '');
  const [error, setError] = useState('');
  return <details className="effect-form"><summary>{appeal.measurement ? `Замер: ${formatNumber(appeal.measurement.hoursPerMonth)} ч/мес. · ${appeal.status === 'closed' ? 'подтверждён автором' : 'ожидает подтверждения'}` : 'Зафиксировать эффект улучшения'}</summary><form onSubmit={event => { event.preventDefault(); try { onMeasure(appeal.id, {hoursPerMonth: Number(hours), evidence}); setError(''); } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось записать замер.'); } }}><label className="form-field">Экономия времени за месяц, ч<input type="number" required min="0" max="100000" step="0.1" value={hours} onChange={event => setHours(event.target.value)}/></label><label className="form-field">Основание замера<textarea required minLength={10} maxLength={3000} rows={2} value={evidence} onChange={event => setEvidence(event.target.value)} placeholder="Как сравнивали до и после, за какой период?"/></label><small>Записанный вручную замер попадёт в статистику после подтверждения автором. При изменении замера потребуется повторное подтверждение.</small>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-blue" type="submit">Сохранить замер</button></form></details>;
}
