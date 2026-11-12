import {useEffect, useMemo, useState} from 'react';
import {ArrowUpRight, Clock3, QrCode, Zap} from 'lucide-react';
import {slaWaitingHours} from '../lib/innovation';
import type {Appeal} from '../types';

export function InnovationOverview({appeals, onOpen, onEscalate, onQR}: {appeals: Appeal[]; onOpen: (id: string) => void; onEscalate: (id: string) => void; onQR: () => void}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const stale = useMemo(() => appeals.filter(item => slaWaitingHours(item, now) !== null).sort((a, b) => a.createdAt - b.createdAt), [appeals, now]);
  return <section className="innovation-overview" aria-labelledby="innovation-heading"><div className="section-heading"><div><span className="eyebrow small">ОТ ГОЛОСА К ДЕЙСТВИЮ</span><h2 id="innovation-heading">Ничего не потеряется.</h2></div><button className="button qr-trigger" onClick={onQR}><QrCode size={18}/>Показать QR для жюри</button></div><div className="sla-panel"><div className="sla-heading"><Clock3 size={20}/><div><h3>Нужен первый ответ <span>{stale.length}</span></h3><p>Больше 18 часов без ответа исполнителя. Даты в демо синтетические.</p></div></div>{stale.slice(0, 3).map(item => <article className="sla-item" key={item.id}><button className="similar-link" onClick={() => onOpen(item.id)}><small>{item.id} · {Math.floor(slaWaitingHours(item, now) || 0)} ч без ответа</small><strong>{item.title}<ArrowUpRight size={15}/></strong></button><button className="support-button" disabled={!!item.escalation} onClick={() => onEscalate(item.id)}><Zap size={14}/>{item.escalation ? item.escalation.processedAt ? 'Обработано локально' : 'В очереди…' : 'Ускорить рассмотрение'}</button></article>)}{!stale.length && <p className="muted">Обращений без первого ответа дольше 18 часов нет.</p>}<small className="privacy-note">Демо-эскалация сохраняется в этом браузере и создаёт локальное событие. Отправка руководителю требует подключения серверного API.</small></div></section>;
}
