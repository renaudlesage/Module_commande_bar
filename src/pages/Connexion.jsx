import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Connexion() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const destination = location.state?.from || '/bar';

  async function connecter() {
    setEnvoi(true);
    setErreur(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: motDePasse,
    });
    if (error) {
      setErreur('Identifiants refusés.');
      setEnvoi(false);
      return;
    }
    navigate(destination, { replace: true });
  }

  return (
    <div className="ecran centre">
      <div className="confirmation">
        <img className="logo-buco" src="/logo-bucolique.png" alt="Bucolique Ferrières Musique" />
        <h1>Poste bar</h1>
        <p className="table-rappel">Connexion réservée à l'équipe</p>

        <input
          className="champ"
          type="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Adresse e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="champ"
          type="password"
          placeholder="Mot de passe"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && connecter()}
        />

        {erreur && <p className="erreur">{erreur}</p>}

        <button
          className="btn"
          onClick={connecter}
          disabled={envoi || !email || !motDePasse}
        >
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>
      </div>
    </div>
  );
}
