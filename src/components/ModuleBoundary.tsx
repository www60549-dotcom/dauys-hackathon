import {Component,type ReactNode} from 'react';
/** Keep navigation available when a lazy chunk is unavailable after a deploy. */
export class ModuleBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<section className="server-panel" role="alert"><h2>Не удалось загрузить раздел</h2><p>Возможно, приложение обновилось или пропало соединение. Обновите страницу, чтобы повторить загрузку.</p><button className="button button-blue" onClick={()=>window.location.reload()}>Обновить страницу</button></section>:this.props.children;}
}
