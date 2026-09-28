import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { iniciarI18n } from './i18n';
import './index.css';
import { lerPreferencias } from './preferencias/Preferencias';

void iniciarI18n(lerPreferencias().idioma);

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
