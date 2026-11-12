import type {ApiAppeal, Metadata} from '../api/contracts';
import type {AppealDraft} from '../lib/appealDraft';
import {dateForInput} from '../lib/appealDraft';
import {statusLabels} from '../types';

export function AppealConflict({draft, item, meta, pending, onReload}: {draft: AppealDraft; item: ApiAppeal; meta?: Metadata; pending: boolean; onReload: () => void}) {
  const names = (id: string) => meta?.executors.find(value => value.id === id)?.name || (id ? 'Другой ответственный' : 'Не назначен');
  const priorities = {low: 'Низкий', medium: 'Обычный', high: 'Высокий', critical: 'Критический'};
  const rows = [
    ['Заголовок', draft.title, item.title], ['Описание', draft.description, item.description],
    ['Предложенное решение', draft.solution, item.solution], ['Результат', draft.result, item.result],
    ['Статус', statusLabels[draft.status], statusLabels[item.status]],
    ['Приоритет', priorities[draft.priority], priorities[item.priority]],
    ['Ответственный', names(draft.assignee_id), names(item.assignee_id)],
    ['Срок', dateForInput(draft.due_at), dateForInput(item.due_at)],
    ['Денежный эффект, ₸', String(draft.actual_effect), String(item.actual_effect)],
    ['Причина повторного обращения',draft.reopen_reason,''],
  ].filter(([,mine,current]) => mine !== current);
  return <section className="appeal-conflict" role="alert" aria-labelledby="appeal-conflict-heading">
    <h3 id="appeal-conflict-heading">Карточка изменилась во время редактирования</h3>
    <p>Ваши правки остались в форме. Сравните их с текущими данными и скопируйте нужный текст перед загрузкой новой версии.</p>
    {rows.length > 0 && <details open><summary>Сравнить изменения</summary><div className="conflict-table-scroll"><table><thead><tr><th>Поле</th><th>Ваша форма</th><th>В карточке сейчас</th></tr></thead><tbody>{rows.map(([label,mine,current]) => <tr key={label}><th>{label}</th><td><div>{mine || '—'}</div></td><td><div>{current || '—'}</div></td></tr>)}</tbody></table></div></details>}
    <button className="button" disabled={pending} onClick={onReload}>Загрузить актуальную версию</button>
    <small>Поля формы будут заменены текущими данными карточки.</small>
  </section>;
}
