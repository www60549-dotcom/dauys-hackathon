import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {QueryClientProvider} from '@tanstack/react-query';
import {BrowserRouter} from 'react-router-dom';
import {queryClient} from './api/queryClient';
import {AuthProvider} from './auth/AuthProvider';
import {RealtimeProvider} from './realtime/RealtimeProvider';
import './styles.css';
import './innovation.css';
import './presentation.css';
import './atmosphere.css';
import './analytics.css';
import './workspace.css';
import './connected.css';

createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><RealtimeProvider><App/></RealtimeProvider></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>);
