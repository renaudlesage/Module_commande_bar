import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    "Variables d'environnement manquantes. " +
    'En local : créer un fichier .env.local à la racine, puis relancer npm run dev. En production : Vercel → Settings → Environment Variables, puis Redeploy.'
  );
}

export const supabase = createClient(url, key);

// 1 case = 0,50 €
export const CASE_EN_EUROS = 0.5;

export function enEuros(cases) {
  if (cases === 0) return 'offert';
  return (cases * CASE_EN_EUROS).toFixed(2).replace('.', ',') + ' €';
}

export function libelleCases(cases) {
  if (cases === 0) return 'Aucune case';
  return cases + (cases > 1 ? ' cases' : ' case');
}
