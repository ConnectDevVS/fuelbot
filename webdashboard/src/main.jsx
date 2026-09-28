// Entry. nonce.js MUST stay the first import: it has to patch style creation before antd loads.
import { nonce } from './nonce.js';
import './lib/dayjs.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/print.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App nonce={nonce} />
  </StrictMode>,
);
