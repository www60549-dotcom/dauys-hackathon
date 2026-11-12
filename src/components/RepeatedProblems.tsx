import {ArrowUpRight, CopyCheck} from 'lucide-react';
import {repeatedProblemGroups} from '../lib/workspace';
import type {Appeal} from '../types';

export function RepeatedProblems({appeals, onOpen}: {appeals: readonly Appeal[]; onOpen: (id: string) => void}) {
  const groups = repeatedProblemGroups(appeals);
  return <section className="dashboard-card repeated-problems" aria-labelledby="repeat-title"><div className="dashboard-heading"><h2 id="repeat-title">Повторяющиеся проблемы</h2></div>
    <p className="analytics-chart-note">Обращения одной категории и отметки «У меня такая же проблема». Совпадение причин проверяет команда.</p>
    {groups.length ? <ul>{groups.map(group => <li key={group.category}><div><h3>{group.category}</h3><p>{group.items.length} обращений · {group.supporters} поддержали</p></div><div>{group.items.map(item => <button className="text-button" key={item.id} onClick={() => onOpen(item.id)}>{item.title} <ArrowUpRight size={15}/></button>)}</div></li>)}</ul>
      : <div className="section-empty"><CopyCheck size={25}/><h3>Повторяющихся сигналов пока нет</h3><p>Группы появятся при нескольких обращениях одной категории или поддержке существующей проблемы.</p></div>}
  </section>;
}
