import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, enEuros, libelleCases } from '../lib/supabase';

// Le prénom du serveur est conservé sur l'appareil : sur une soirée, il est
// saisi une fois et plus jamais. Le bouton « Changer de serveur » reste le
// moyen d'en changer aux relèves.
const CLE_SERVEUR = 'bar-serveur';

function lireServeur() {
  try {
    return localStorage.getItem(CLE_SERVEUR) || '';
  } catch {
    return ''; // navigation privée, stockage bloqué : on retombe sur la saisie
  }
}

function ecrireServeur(nom) {
  try {
    if (nom) localStorage.setItem(CLE_SERVEUR, nom);
    else localStorage.removeItem(CLE_SERVEUR);
  } catch {
    // sans stockage, le prénom vaut pour la session en cours
  }
}

export default function Service() {
  const [serveur, setServeurEtat] = useState(lireServeur);
  const [nomSaisi, setNomSaisi] = useState('');

  function setServeur(nom) {
    ecrireServeur(nom);
    setServeurEtat(nom);
  }
  const [commandes, setCommandes] = useState([]);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('bar_commandes')
      .select('id, cases_dues, commentaire, created_at, bar_tables(numero, zone), bar_lignes(libelle, quantite)')
      .eq('statut', 'prete')
      .order('created_at', { ascending: true });

    if (error) setErreur('Lecture impossible : ' + error.message);
    else { setCommandes(data || []); setErreur(null); }
  }, []);

  useEffect(() => { if (serveur) charger(); }, [serveur, charger]);

  useEffect(() => {
    if (!serveur) return;
    const canal = supabase
      .channel('service-commandes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bar_commandes' }, charger)
      .subscribe();
    const t = setInterval(charger, 20000);
    return () => { supabase.removeChannel(canal); clearInterval(t); };
  }, [serveur, charger]);

  async function marquerServie(id) {
    setCommandes((c) => c.filter((x) => x.id !== id));
    const { error } = await supabase
      .from('bar_commandes')
      .update({ statut: 'servie', serveur, servie_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { setErreur('Mise à jour refusée : ' + error.message); charger(); }
  }

  if (!serveur) {
    return (
      <div className="ecran centre">
        <div className="confirmation">
          <h1>Service</h1>
          <p className="table-rappel">Ton prénom, pour tracer qui sert quoi</p>
          <input
            className="champ"
            placeholder="Prénom"
            value={nomSaisi}
            onChange={(e) => setNomSaisi(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && nomSaisi.trim() && setServeur(nomSaisi.trim())}
          />
          <button
            className="btn"
            disabled={!nomSaisi.trim()}
            onClick={() => setServeur(nomSaisi.trim())}
          >
            Commencer
          </button>
          <p style={{ marginTop: 16 }}>
            <Link className="lien-discret" to="/">Retour</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ecran">
      <header className="entete-poste">
        <h1>Service — {serveur}</h1>
        <div className="entete-droite">
          <span className="compteur">{commandes.length} à servir</span>
          <button className="bascule discret" onClick={() => setServeur('')}>
            Changer de serveur
          </button>
          <Link className="lien-discret" to="/">Retour</Link>
        </div>
      </header>

      {erreur && <p className="erreur">{erreur}</p>}

      {commandes.length === 0 && (
        <p className="vide grand">Rien à servir pour le moment.</p>
      )}

      {commandes.map((c) => (
        <article key={c.id} className="ticket service">
          <div className="ticket-tete">
            <span className="table-num gros">{c.bar_tables?.numero}</span>
            {c.bar_tables?.zone && <span className="zone">{c.bar_tables.zone}</span>}
          </div>

          <ul className="lignes">
            {c.bar_lignes.map((l, i) => (
              <li key={i}><span className="qte-ligne">{l.quantite}×</span> {l.libelle}</li>
            ))}
          </ul>

          {c.commentaire && <p className="note">{c.commentaire}</p>}

          <div className="encaissement">
            <div className="a-cocher">
              <span className="nombre">{c.cases_dues}</span>
              <span className="unite">cases à cocher</span>
              <span className="euros">{enEuros(c.cases_dues)}</span>
            </div>
            <button className="btn" onClick={() => marquerServie(c.id)}>
              Servie et cochée
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
