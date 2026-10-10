import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, enEuros, libelleCases } from '../lib/supabase';

export default function Commande() {
  const { token } = useParams();

  const [table, setTable] = useState(null);
  const [articles, setArticles] = useState([]);
  const [quantites, setQuantites] = useState({});

  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [aVerifier, setAVerifier] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  const [serviceOuvert, setServiceOuvert] = useState(true);
  const [messageFerme, setMessageFerme] = useState('');

  useEffect(() => {
    let annule = false;
    (async () => {
      setChargement(true);
      setErreur(null);
      const { data, error } = await supabase.rpc('bar_menu', { p_token: token });
      if (annule) return;
      if (error) {
        const m = error.message || '';
        if (m.includes('inconnue')) {
          setErreur("Ce QR code n'est pas reconnu. Appelle un serveur.");
        } else if (m.includes('invalid input syntax')) {
          // Token qui n'est pas un UUID : lien tronqué, ou chevrons collés
          setErreur('Lien de table invalide. Rescanne le QR code.');
        } else {
          setErreur('Impossible de charger la carte. Réessaie dans un instant.');
        }
        console.error('bar_menu:', m);
      } else {
        setTable(data.table);
        setArticles(data.articles || []);
        setServiceOuvert(data.service_ouvert !== false);
        setMessageFerme(data.message_ferme || 'Le service est fermé pour le moment.');
      }
      setChargement(false);
    })();
    return () => { annule = true; };
  }, [token]);

  // Regroupement par catégorie, en conservant l'ordre renvoyé par la base
  const parCategorie = useMemo(() => {
    const groupes = [];
    for (const a of articles) {
      const nom = a.categorie || 'Autres';
      let g = groupes.find((g) => g.nom === nom);
      if (!g) { g = { nom, items: [] }; groupes.push(g); }
      g.items.push(a);
    }
    return groupes;
  }, [articles]);

  const totalCases = useMemo(
    () => articles.reduce((s, a) => s + (quantites[a.id] || 0) * a.prix_cases, 0),
    [articles, quantites]
  );

  // Le détail de ce qui part réellement, pour le récapitulatif
  const selection = useMemo(
    () => articles
      .filter((a) => (quantites[a.id] || 0) > 0)
      .map((a) => ({ ...a, quantite: quantites[a.id] })),
    [articles, quantites]
  );

  const nbArticles = useMemo(
    () => Object.values(quantites).reduce((s, q) => s + q, 0),
    [quantites]
  );

  function ajuster(id, delta) {
    setQuantites((q) => {
      const suivant = Math.max(0, Math.min(30, (q[id] || 0) + delta));
      return { ...q, [id]: suivant };
    });
  }

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);

    const lignes = Object.entries(quantites)
      .filter(([, q]) => q > 0)
      .map(([article_id, quantite]) => ({ article_id, quantite }));

    const { data, error } = await supabase.rpc('bar_passer_commande', {
      p_token: token,
      p_lignes: lignes,
      p_commentaire: commentaire.trim() || null,
    });

    if (error) {
      const m = error.message || '';
      if (m.includes('Trop de commandes')) {
        setErreur('Une commande vient déjà de partir pour cette table. Patiente une minute.');
      } else if (m.includes('Service ferme')) {
        // Le service a fermé pendant que le client remplissait son panier
        setServiceOuvert(false);
      } else {
        setErreur("L'envoi a échoué. Vérifie ta connexion et réessaie.");
      }
      setAVerifier(false);
      setEnvoi(false);
      return;
    }

    setConfirmation(data);
    setAVerifier(false);
    setEnvoi(false);
  }

  function nouvelleCommande() {
    setQuantites({});
    setCommentaire('');
    setConfirmation(null);
    setAVerifier(false);
  }

  if (chargement) {
    return <div className="ecran centre"><p>Chargement de la carte…</p></div>;
  }

  if (erreur && !table) {
    return (
      <div className="ecran centre">
        <p className="erreur">{erreur}</p>
        <button className="btn" onClick={() => window.location.reload()}>Réessayer</button>
      </div>
    );
  }

  if (!serviceOuvert) {
    return (
      <div className="ecran centre">
        <div className="confirmation">
          <img className="logo-buco" src="/logo-bucolique.png" alt="Bucolique Ferrières Musique" />
          <h1>Service fermé</h1>
          <p className="consigne">{messageFerme}</p>
          <button className="btn secondaire" onClick={() => window.location.reload()}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (aVerifier) {
    return (
      <div className="ecran centre">
        <div className="confirmation large">
          <img className="logo-buco" src="/logo-bucolique.png" alt="Bucolique Ferrières Musique" />
          <h1>Vérifie ta commande</h1>
          <p className="table-rappel">Table {table.numero}</p>

          <ul className="recap">
            {selection.map((a) => (
              <li key={a.id}>
                <span className="recap-qte">{a.quantite}×</span>
                <span className="recap-nom">{a.nom}</span>
                <span className="recap-cases">
                  {a.prix_cases === 0 ? 'offert' : a.quantite * a.prix_cases}
                </span>
              </li>
            ))}
          </ul>

          {commentaire.trim() && (
            <p className="note">{commentaire.trim()}</p>
          )}

          <div className="total-confirme">
            <span className="cases">{libelleCases(totalCases)}</span>
            <span className="euros">{enEuros(totalCases)}</span>
          </div>

          {erreur && <p className="erreur">{erreur}</p>}

          <button className="btn" disabled={envoi} onClick={envoyer}>
            {envoi ? 'Envoi…' : 'Confirmer et envoyer'}
          </button>
          <button
            className="btn secondaire"
            disabled={envoi}
            onClick={() => setAVerifier(false)}
            style={{ marginTop: 10 }}
          >
            Modifier
          </button>
        </div>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="ecran centre">
        <div className="confirmation">
          <img className="logo-buco" src="/logo-bucolique.png" alt="Bucolique Ferrières Musique" />
          <h1>Commande envoyée</h1>
          <p className="table-rappel">Table {table.numero}</p>
          <div className="total-confirme">
            <span className="cases">{libelleCases(confirmation.cases_dues)}</span>
            <span className="euros">{enEuros(confirmation.cases_dues)}</span>
          </div>
          <p className="consigne">
            Prépare ta carte : le serveur cochera{' '}
            <strong>{confirmation.cases_dues}</strong> cases à la livraison.
          </p>
          <button className="btn secondaire" onClick={nouvelleCommande}>
            Commander autre chose
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ecran">
      <header className="entete">
        <img className="logo-buco" src="/logo-bucolique.png" alt="Bucolique Ferrières Musique" />
        <h1>Table {table.numero}</h1>
        {table.zone && <p className="zone">{table.zone}</p>}
        <p className="rappel-tarif">1 case = 1 € · 1 carte = 10 cases</p>
      </header>

      {parCategorie.map((groupe) => (
        <section key={groupe.nom} className="categorie">
          <h2>{groupe.nom}</h2>
          {groupe.items.map((a) => {
            const q = quantites[a.id] || 0;
            return (
              <div key={a.id} className={'article' + (q > 0 ? ' actif' : '')}>
                <div className="article-info">
                  <span className="article-nom">{a.nom}</span>
                  <span className={'article-prix' + (a.prix_cases === 0 ? ' offert' : '')}>
                    {a.prix_cases === 0
                      ? 'Offert'
                      : `${libelleCases(a.prix_cases)} · ${enEuros(a.prix_cases)}`}
                  </span>
                </div>
                <div className="stepper">
                  <button
                    aria-label={'Retirer un ' + a.nom}
                    onClick={() => ajuster(a.id, -1)}
                    disabled={q === 0}
                  >−</button>
                  <span className="qte">{q}</span>
                  <button
                    aria-label={'Ajouter un ' + a.nom}
                    onClick={() => ajuster(a.id, +1)}
                  >+</button>
                </div>
              </div>
            );
          })}
        </section>
      ))}

      <section className="categorie">
        <h2>Remarque</h2>
        <textarea
          className="commentaire"
          rows={2}
          maxLength={200}
          placeholder="Sans glaçons, verre en plus…"
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
        />
      </section>

      {erreur && <p className="erreur">{erreur}</p>}

      <div className="barre-total">
        <div className="total-detail">
          <span className="cases">{libelleCases(totalCases)}</span>
          <span className="euros">{enEuros(totalCases)}</span>
        </div>
        <button
          className="btn"
          disabled={nbArticles === 0}
          onClick={() => { setErreur(null); setAVerifier(true); }}
        >
          Vérifier la commande
        </button>
      </div>
    </div>
  );
}
