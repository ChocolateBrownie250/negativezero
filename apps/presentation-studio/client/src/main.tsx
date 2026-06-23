import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerCitrineServiceWorker } from './lib/pwa';
import './styles.css';

registerCitrineServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
