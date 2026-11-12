import {ArrowRight} from 'lucide-react';
import {Brand} from './Brand';
import {DauysPlanet} from './DauysPlanet';
import {PrimaryButton} from './PrimaryButton';
import {publicImprovements} from '../data/publicImprovements';
import type {PointerRef} from '../types';

interface Props {pointer: PointerRef; showImprovements: boolean; onLogin: () => void; onPublicBoard: (show: boolean) => void}

export function GuestLanding({pointer, showImprovements, onLogin, onPublicBoard}: Props) {
  return <div className="app-shell guest-shell">
    <header className="site-header guest-header"><button className="brand-button" aria-label="Dauys — главная" onClick={() => onPublicBoard(false)}><Brand/></button><button className="guest-login" onClick={onLogin}>Войти <ArrowRight size={17}/></button></header>
    <main id="guest-main" tabIndex={-1}>
      {showImprovements ? <section className="public-board" aria-labelledby="public-board-title">
        <button className="text-button" onClick={() => onPublicBoard(false)}>← На главную</button>
        <div className="public-board-heading"><p className="eyebrow small">ОТКРЫТЫЕ УЛУЧШЕНИЯ</p><h1 id="public-board-title">Идеи становятся изменениями.</h1><p>Публичные примеры результатов. Демонстрационные данные.</p></div>
        <div className="public-improvement-grid">{publicImprovements.map(item => <article key={item.slug}><span className="public-result-label">Пример внедрения</span><h2>{item.title}</h2><p>{item.summary}</p><p className="public-outcome">{item.outcome}</p></article>)}</div>
      </section> : <section className="guest-hero" aria-labelledby="guest-title">
        <div className="guest-copy"><h1 id="guest-title">Есть идея или проблема на объекте?<br/><span>Дайте ей голос.</span></h1><p className="guest-description">Расскажите, что мешает работе или что можно улучшить.<br/>Dauys поможет передать обращение и увидеть результат.</p>
          <ol className="quick-tour"><li><span>1</span>Описал</li><li><span>2</span>Назначили ответственного</li><li><span>3</span>Решили</li></ol>
          <div className="guest-actions"><PrimaryButton onClick={onLogin}>Войти в систему сотрудника</PrimaryButton><button className="text-button" onClick={() => onPublicBoard(true)}>Посмотреть открытые улучшения <ArrowRight size={16}/></button></div>
        </div><DauysPlanet pointer={pointer}/>
      </section>}
    </main>
    <footer className="site-footer"><span>ГК «Модус Трейд»</span><span>Обратная связь сотрудников</span></footer>
  </div>;
}
