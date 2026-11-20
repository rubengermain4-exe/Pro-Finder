import './styles/main.css';
import { isConfigured } from './lib/supabase.js';
import { initAuth } from './state/auth.js';
import { startApp } from './app.js';

const root = document.getElementById('app');

function showSetupScreen() {
  root.innerHTML = `
    <main class="setup">
      <h1>Configuration requise</h1>
      <p>Pro Finder n'est pas encore connecté à Supabase.</p>
      <ol>
        <li>Copiez <code>.env.example</code> en <code>.env</code>.</li>
        <li>Renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>.</li>
        <li>Relancez <code>npm run dev</code>.</li>
      </ol>
      <p class="muted">Guide complet : docs/SUPABASE.md</p>
    </main>`;
}

if (!isConfigured) {
  showSetupScreen();
} else {
  root.innerHTML = '<div class="loader" role="status"><div class="spinner"></div><span>Chargement…</span></div>';
  initAuth()
    .catch((e) => console.error('Auth init failed', e))
    .finally(() => startApp(root));
}
