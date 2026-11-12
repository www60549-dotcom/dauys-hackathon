import {useEffect, useMemo, useState} from 'react';
import {Check, Copy, ExternalLink, QrCode} from 'lucide-react';
import {Dialog} from './Dialog';
import {categories} from './CategoryCard';
import {buildComposeUrl} from '../lib/innovation';
import {qrPath} from '../lib/qr';

export function QRAccessDialog({open, onClose}: {open: boolean; onClose: () => void}) {
  const [base, setBase] = useState(() => `${location.origin}${location.pathname}`);
  const [categoryId, setCategoryId] = useState('');
  const [qr, setQR] = useState<{path: string; viewBox: string} | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const selected = categories.find(item => item.id === categoryId);
  const url = useMemo(() => { try { return buildComposeUrl(base, {category: selected?.category, department: selected?.department}); } catch { return ''; } }, [base, selected]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQR(null); setError(''); setCopied(false);
    if (!url) { setError('Введите корректный HTTP(S)-адрес приложения.'); return; }
    import('qrcode').then(module => {
      const code = module.default.create(url, {errorCorrectionLevel: 'M'});
      if (!cancelled) setQR(qrPath(code.modules.size, code.modules.data));
    }).catch(() => { if (!cancelled) setError('Не удалось создать QR-код. Можно открыть или скопировать ссылку ниже.'); });
    return () => { cancelled = true; };
  }, [open, url]);
  const local = url && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  return <Dialog open={open} className="jury-qr-dialog" title="Попробуйте Dauys с телефона" eyebrow="БЫСТРОЕ ДЕМО ДЛЯ ЖЮРИ" onClose={onClose}>
    <div className="qr-dialog-content">
      <div className="jury-qr-hero">
        <div className="qr-art">{qr ? <svg role="img" aria-label="QR-код ссылки на форму обращения" xmlns="http://www.w3.org/2000/svg" viewBox={qr.viewBox} shapeRendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d={qr.path} fill="#0e172d"/></svg> : <QrCode size={80} strokeWidth={1}/>}</div>
        <div className="jury-instructions"><h3>От идеи до первого обращения</h3><ol>
          <li><span>1</span><div><strong>Отсканируйте камерой</strong><p>Откройте ссылку из QR-кода на телефоне.</p></div></li>
          <li><span>2</span><div><strong>Отправьте тестовый тикет</strong><p>Опишите идею или проблему в короткой форме.</p></div></li>
          <li><span>3</span><div><strong>Проверьте карточку и статус</strong><p>Созданное обращение появится на вашем устройстве.</p></div></li>
        </ol><p className="jury-sync-note">В этом MVP данные сохраняются в браузере устройства. Появление на общем 3D-экране в реальном времени потребует подключения сервера.</p></div>
      </div>
      {local && <p className="qr-local-hint"><strong>Для телефона нужен доступный адрес.</strong> Сейчас в коде localhost — он открывается только на этом компьютере. Укажите сетевой адрес запущенного приложения или адрес после публикации в настройках ниже.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {url && <div className="qr-actions"><button className="button qr-copy" onClick={() => { if (!navigator.clipboard) { setError('Копирование недоступно. Выделите ссылку вручную.'); return; } navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => setError('Копирование недоступно. Выделите ссылку вручную.')); }}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? 'Скопировано' : 'Копировать ссылку'}</button><a className="button button-dark" href={url} target="_blank" rel="noopener noreferrer">Проверить форму <ExternalLink size={17}/></a></div>}
      <details className="qr-settings"><summary>Адрес приложения и направление</summary><div>
        <label className="form-field">Адрес запущенного приложения<input type="url" maxLength={1500} value={base} onChange={event => setBase(event.target.value)} placeholder="https://dauys.example"/></label>
        <label className="form-field">Предвыбранное направление<select value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">Без предвыбора</option>{categories.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        {url && <code className="qr-url">{url}</code>}
      </div></details>
    </div>
  </Dialog>;
}