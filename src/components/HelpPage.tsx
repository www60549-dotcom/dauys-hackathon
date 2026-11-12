import {ArrowRight, MessageSquare, UserRoundCheck, CircleCheck} from 'lucide-react';
import {PrimaryButton} from './PrimaryButton';

export function HelpPage({onCreate}: {onCreate: () => void}) {
  return <section className="help-page" aria-labelledby="help-title"><div className="workspace-page-heading"><h1 id="help-title">Как работает Dauys</h1><p>От сообщения до понятного результата.</p></div>
    <ol className="help-steps">{[
      {title: 'Опишите ситуацию', body: 'Выберите «Сообщить о проблеме» или «Предложить улучшение». Укажите, что происходит и как это влияет на работу. Можно надиктовать описание.', icon: MessageSquare},
      {title: 'Следите за ответом', body: 'В карточке видны ответственный, статус и обсуждение. Если нужны детали, дополните обращение комментарием. Список доступен в «Моих обращениях».', icon: UserRoundCheck},
      {title: 'Проверьте результат', body: 'Прочитайте решение команды. Когда изменение помогло, подтвердите результат в карточке. Общие итоги находятся в «Улучшениях».', icon: CircleCheck},
    ].map(({title, body, icon: Icon}, index) => <li key={title}><span><Icon size={24}/></span><div><small>Шаг {index + 1}</small><h2>{title}</h2><p>{body}</p></div></li>)}</ol>
    <div className="help-bottom"><div><h2>Открыть с телефона</h2><p>Нажмите на аватар → «QR-код для телефона». Настройки движения и выход находятся в том же меню.</p><p className="help-demo-note">Демонстрационная версия хранит обращения в браузере устройства. Демо-вход показывает интерфейс сотрудника; общий серверный доступ подключается отдельно.</p></div><PrimaryButton icon={ArrowRight} onClick={onCreate}>Создать обращение</PrimaryButton></div>
  </section>;
}
