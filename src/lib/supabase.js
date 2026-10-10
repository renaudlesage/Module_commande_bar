import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Diagnostic de configuration. Sans ça, createClient lève une exception à
// l'import et l'app affiche une page vide — impossible à diagnostiquer sur
// un téléphone, un soir d'événement.
function diagnostiquer() {
  if (!url && !key) return 'Les deux variables sont absentes.';
  if (!url) return 'VITE_SUPABASE_URL est absente.';
  if (!key) return 'VITE_SUPABASE_ANON_KEY est absente.';

  // Erreur classique : la clé collée dans le champ URL
  if (/publishable|^eyJ/.test(url) || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
    return "VITE_SUPABASE_URL ne ressemble pas à une URL de projet. Attendu : https://xxxxxxxx.supabase.co — c'est l'identifiant du projet, pas une clé.";
  }
  if (url.includes(key) || key.startsWith('https://')) {
    return 'URL et clé semblent inversées.';
  }
  return null;
}

export const erreurConfig = diagnostiquer();

if (erreurConfig) console.error('Configuration Supabase : ' + erreurConfig);

// Valeurs de repli : permettent à l'app de se charger et d'afficher l'écran
// d'erreur au lieu de planter à l'import.
export const supabase = createClient(
  erreurConfig ? 'https://exemple.supabase.co' : url,
  erreurConfig ? 'cle-absente' : key
);

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
