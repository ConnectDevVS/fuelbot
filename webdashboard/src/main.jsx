// Entry. nonce.js MUST stay the first import: it has to patch style creation before antd loads.
import { nonce } from './nonce.js';
import './lib/dayjs.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/print.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { App } from './App.jsx';
import { routes } from './shell/routes.jsx';
import { makeQueryClient } from './api/queryClient.js';
import { setNavigator } from './api/navigation.js';

const router = createBrowserRouter(routes, { basename: '/dashboard' });
setNavigator((path, options) => router.navigate(path, options));
const queryClient = makeQueryClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App nonce={nonce} router={router} queryClient={queryClient} />
  </StrictMode>,
);
