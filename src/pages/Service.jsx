import { useCallback, useEffect, useRef, useState } from 'react';
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

const CLE_SON = 'bar-son';

function lireSon() {
  try {
    return localStorage.getItem(CLE_SON) !== 'off';
  } catch {
    return true;
  }
}

// Bip de synthèse : pas de fichier à charger, donc rien qui puisse manquer
// au mauvais moment. Deux notes courtes, audibles par-dessus la musique.
function bip(ctx) {
  if (!ctx) return;
  const maintenant = ctx.currentTime;
  [0, 0.18].forEach((decalage, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = i === 0 ? 880 : 1175;
    gain.gain.setValueAtTime(0.0001, maintenant + decalage);
    gain.gain.exponentialRampToValueAtTime(0.35, maintenant + decalage + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, maintenant + decalage + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(maintenant + decalage);
    osc.stop(maintenant + decalage + 0.16);
  });
}

export default function Service() {
  const [serveur, setServeurEtat] = useState(lireServeur);
  const [nomSaisi, setNomSaisi] = useState('');

  function setServeur(nom) {
    ecrireServeur(nom);
    setServeurEtat(nom);
    if (nom && !audio.current) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audio.current = new Ctx();
      } catch {
        // pas de son disponible : l'alerte visuelle suffira
      }
    }
    audio.current?.resume?.().catch(() => {});
  }

  function basculerSon() {
    const suivant = !son;
    setSon(suivant);
    try {
      localStorage.setItem(CLE_SON, suivant ? 'on' : 'off');
    } catch { /* sans stockage, le choix vaut pour la session */ }
    if (suivant) { audio.current?.resume?.().catch(() => {}); bip(audio.current); }
  }
  const [commandes, setCommandes] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [son, setSon] = useState(lireSon);
  const [nouvelles, setNouvelles] = useState([]);

  // Le contexte audio n'est créé qu'au clic sur « Commencer » : les
  // navigateurs refusent tout son déclenché sans geste de l'utilisateur.
  const audio = useRef(null);
  const vues = useRef(null); // null tant que la première liste n'est pas arrivée

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('bar_commandes')
      .select('id, cases_dues, commentaire, created_at, pris_par, bar_tables(numero, zone), bar_lignes(libelle, quantite)')
      .eq('statut', 'prete')
      .order('created_at', { ascending: true });

    if (error) { setErreur('Lecture impossible : ' + error.message); return; }

    const liste = data || [];
    setCommandes(liste);
    setErreur(null);

    // Alerte uniquement sur ce qui n'était pas déjà là. Le premier
    // chargement ne sonne pas, sinon chaque ouverture d'écran ferait
    // croire à de nouvelles commandes.
    const ids = new Set(liste.map((c) => c.id));
    if (vues.current) {
      const arrivees = liste.filter((c) => !vues.current.has(c.id)).map((c) => c.id);
      if (arrivees.length) {
        setNouvelles(arrivees);
        if (lireSon()) bip(audio.current);
        navigator.vibrate?.([120, 60, 120]);
        setTimeout(() => setNouvelles([]), 6000);
      }
    }
    vues.current = ids;
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

  // Prise atomique : la condition « pris_par is null » est évaluée par
  // Postgres, donc deux serveurs qui appuient en même temps ne peuvent
  // pas réussir tous les deux.
  async function prendre(id) {
    const { data, error } = await supabase
      .from('bar_commandes')
      .update({ pris_par: serveur, pris_at: new Date().toISOString() })
      .eq('id', id)
      .is('pris_par', null)
      .select('id');

    if (error) { setErreur('Prise impossible : ' + error.message); return; }
    if (!data || data.length === 0) {
      setErreur('Quelqu\'un vient de prendre cette commande.');
      setTimeout(() => setErreur(null), 4000);
    }
    charger();
  }

  async function relacher(id) {
    const { error } = await supabase
      .from('bar_commandes')
      .update({ pris_par: null, pris_at: null })
      .eq('id', id);
    if (error) setErreur('Mise à jour refusée : ' + error.message);
    charger();
  }

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
          <button
            className={'bascule son' + (son ? ' actif' : '')}
            onClick={basculerSon}
            title={son ? 'Son activé — toucher pour couper' : 'Son coupé — toucher pour activer'}
          >
            {son ? '🔔 Son' : '🔕 Muet'}
          </button>
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
        <article
          key={c.id}
          className={'ticket service'
            + (nouvelles.includes(c.id) ? ' nouveau' : '')
            + (c.pris_par && c.pris_par !== serveur ? ' pris-autre' : '')}
        >
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

          {c.pris_par && (
            <p className={'prise' + (c.pris_par === serveur ? ' moi' : '')}>
              {c.pris_par === serveur ? 'Tu prends cette commande' : `Pris par ${c.pris_par}`}
              <button className="bascule discret" onClick={() => relacher(c.id)}>
                Relâcher
              </button>
            </p>
          )}

          <div className="encaissement">
            <div className="a-cocher">
              <span className="nombre">{c.cases_dues}</span>
              <span className="unite">cases à cocher</span>
              <span className="euros">{enEuros(c.cases_dues)}</span>
            </div>
            {c.pris_par ? (
              <button className="btn" onClick={() => marquerServie(c.id)}>
                Servie et cochée
              </button>
            ) : (
              <button className="btn" onClick={() => prendre(c.id)}>
                Je prends
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
