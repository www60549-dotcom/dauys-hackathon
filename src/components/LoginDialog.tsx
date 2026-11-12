import {useState, type FormEvent} from 'react';
import {ArrowRight, LoaderCircle} from 'lucide-react';
import {Dialog} from './Dialog';
import {PrimaryButton} from './PrimaryButton';
import {useAuth} from '../auth/AuthProvider';

export function LoginDialog({open, onClose}: {open: boolean; onClose: () => void}) {
  const {login} = useAuth();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (pending) return;
    setPending(true); setError('');
    try {await login(email, password); setPassword(''); onClose();}
    catch (failure) {setError(failure instanceof Error ? failure.message : 'Не удалось войти.');}
    finally {setPending(false);}
  };
  return <Dialog open={open} title="Вход в Dauys" onClose={() => {if (!pending) {setPassword(''); setError(''); onClose();}}} className="login-dialog">
    <form className="create-form" onSubmit={event => {void submit(event);}} aria-busy={pending}>
      <label className="form-field">Рабочая почта<input type="email" name="email" autoComplete="username" autoFocus required value={email} onChange={event => setEmail(event.target.value)} disabled={pending}/></label>
      <label className="form-field">Пароль<input type="password" name="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={pending}/></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <PrimaryButton type="submit" disabled={pending} icon={pending ? LoaderCircle : ArrowRight}>{pending ? 'Входим…' : 'Войти'}</PrimaryButton>
    </form>
  </Dialog>;
}
