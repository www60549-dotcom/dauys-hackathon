import {QrCode, Smartphone} from 'lucide-react';

export function JuryDemoWidget({onOpen}: {onOpen: () => void}) {
  return <button type="button" className="jury-demo-widget" onClick={onOpen} aria-haspopup="dialog">
    <span className="jury-widget-icon" aria-hidden="true"><QrCode size={25}/></span>
    <span><strong>Демо для жюри</strong><small><Smartphone size={13}/> Сканировать с телефона</small></span>
  </button>;
}
