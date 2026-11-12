import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';
import './innovation.css';
import './presentation.css';
import './atmosphere.css';
import './analytics.css';
import './workspace.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
