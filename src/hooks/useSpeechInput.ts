import {useEffect, useRef, useState} from 'react';
import {combineTranscript} from '../lib/innovation';

interface RecognitionResult {length: number; [index: number]: {transcript: string}; isFinal: boolean}
interface RecognitionEvent {results: ArrayLike<RecognitionResult>}
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: {error: string}) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SpeechWindow = Window & {SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition};

export function useSpeechInput(value: string, onChange: (text: string) => void, active: boolean) {
  const recognition = useRef<Recognition | null>(null);
  const latest = useRef({value, onChange});
  latest.current = {value, onChange};
  const [listening, setListening] = useState(false), [error, setError] = useState('');
  const browser = window as SpeechWindow;
  const Constructor = browser.SpeechRecognition || browser.webkitSpeechRecognition;
  const supported = !!Constructor && window.isSecureContext;
  useEffect(() => {
    if (active) return;
    const instance = recognition.current;
    recognition.current = null;
    if (instance) { instance.onresult = null; instance.onend = null; instance.onerror = null; instance.abort(); }
    setListening(false);
  }, [active]);
  useEffect(() => () => {
    const instance = recognition.current;
    recognition.current = null;
    if (instance) { instance.onresult = null; instance.onend = null; instance.onerror = null; instance.abort(); }
  }, []);

  const toggle = () => {
    if (recognition.current) { try { recognition.current.stop(); } catch { recognition.current.abort(); } return; }
    if (!Constructor || !supported || !active) { setError('Для голосового ввода нужен поддерживаемый браузер и HTTPS либо localhost.'); return; }
    const instance = new Constructor();
    recognition.current = instance;
    const base = latest.current.value;
    instance.lang = 'ru-RU'; instance.interimResults = true; instance.continuous = true;
    instance.onresult = event => {
      if (recognition.current !== instance) return;
      const segments = Array.from(event.results).map(result => result[0].transcript);
      latest.current.onChange(combineTranscript(base, segments));
    };
    instance.onend = () => { if (recognition.current === instance) { recognition.current = null; setListening(false); } };
    instance.onerror = event => {
      if (recognition.current !== instance) return;
      const messages: Record<string, string> = {'not-allowed': 'Доступ к микрофону не разрешён. Можно продолжить печатать.', 'audio-capture': 'Микрофон недоступен.', 'no-speech': 'Речь не обнаружена. Попробуйте ещё раз.', network: 'Сервис распознавания недоступен. Проверьте соединение.'};
      if (event.error !== 'aborted') setError(messages[event.error] || 'Не удалось распознать речь. Продолжите ввод вручную.');
      setListening(false); recognition.current = null;
      instance.onresult = null; instance.onend = null; instance.onerror = null; instance.abort();
    };
    try { setError(''); setListening(true); instance.start(); }
    catch { recognition.current = null; setListening(false); setError('Не удалось начать распознавание. Повторите попытку.'); }
  };
  return {listening, supported, error, toggle};
}
