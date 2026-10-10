import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { erreurConfig } from './lib/supabase';
import './styles.css';

function EcranConfig({ message }) {
  return (
    <div className="ecran centre">
      <div className="confirmation">
        <h1>Configuration incomplète</h1>
        <p className="erreur">{message}</p>
        <p className="consigne">
          Dans Vercel : <strong>Settings → Environment Variables</strong>, puis
          <strong> Redeploy</strong>. En local : un fichier <code>.env.local</code>
          {' '}à la racine, puis relancer le serveur.
        </p>
        <p className="aide-mini">
          VITE_SUPABASE_URL = https://&lt;identifiant&gt;.supabase.co<br />
          VITE_SUPABASE_ANON_KEY = la clé anon, qui commence par eyJ
        </p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {erreurConfig ? <EcranConfig message={erreurConfig} /> : <App />}
  </React.StrictMode>
);
