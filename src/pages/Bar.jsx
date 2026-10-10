import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, enEuros, libelleCases } from '../lib/supabase';

const COLONNES = [
  { statut: 'recue', titre: 'Reçues', suivant: 'preparation', action: 'Préparer' },
  { statut: 'preparation', titre: 'En préparation', suivant: 'prete', action: 'Prête' },
  { statut: 'prete', titre: 'Prêtes à servir', suivant: null, action: null },
];

function minutesEcoulees(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

export default function Bar() {
  const [commandes, setCommandes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [tick, setTick] = useState(0); // rafraîchit les compteurs d'attente
  const [serviceOuvert, setServiceOuvert] = useState(true);
  const [aAnnuler, setAAnnuler] = useState(null); // commande en attente de confirmation
  const [motif, setMotif] = useState('');

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('bar_commandes')
      .select('id, statut, cases_dues, commentaire, created_at, bar_tables(numero, zone), bar_lignes(libelle, quantite)')
      .in('statut', ['recue', 'preparation', 'prete'])
      .order('created_at', { ascending: true });

    if (error) setErreur('Lecture impossible : ' + error.message);
    else { setCommandes(data || []); setErreur(null); }
    setChargement(false);
  }, []);

  const chargerConfig = useCallback(async () => {
    const { data } = await supabase
      .from('bar_config')
      .select('service_ouvert')
      .eq('id', 1)
      .single();
    if (data) setServiceOuvert(data.service_ouvert);
  }, []);

  useEffect(() => { charger(); chargerConfig(); }, [charger, chargerConfig]);

  // Temps réel : à chaque événement on relit la liste entière.
  // Le volume est faible (une soirée, un bar) et ça évite toute désynchro.
  useEffect(() => {
    const canal = supabase
      .channel('bar-commandes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bar_commandes' }, charger)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [charger]);

  // Filet de sécurité si le websocket tombe (wifi capricieux)
  useEffect(() => {
    const t = setInterval(() => { charger(); setTick((n) => n + 1); }, 20000);
    return () => clearInterval(t);
  }, [charger]);

  async function changerStatut(id, statut) {
    // Mise à jour optimiste : le bar ne doit jamais attendre le réseau
    setCommandes((c) => c.map((x) => (x.id === id ? { ...x, statut } : x)));
    const patch = { statut };
    if (statut === 'servie') patch.servie_at = new Date().toISOString();
    const { error } = await supabase.from('bar_commandes').update(patch).eq('id', id);
    if (error) { setErreur('Mise à jour refusée : ' + error.message); charger(); }
  }

  async function basculerService() {
    const suivant = !serviceOuvert;
    setServiceOuvert(suivant);
    const { error } = await supabase
      .from('bar_config')
      .update({ service_ouvert: suivant, updated_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) { setErreur('Bascule refusée : ' + error.message); chargerConfig(); }
  }

  async function annuler(id) {
    const { error } = await supabase.rpc('bar_annuler_commande', {
      p_id: id,
      p_motif: motif.trim() || null,
    });
    setAAnnuler(null);
    setMotif('');
    if (error) setErreur('Annulation refusée : ' + error.message);
    charger();
  }

  if (chargement) return <div className="ecran centre"><p>Chargement…</p></div>;

  return (
    <div className="ecran large">
      <header className="entete-poste">
        <h1>Bar</h1>
        <div className="entete-droite">
          <Link className="lien-discret" to="/">Retour</Link>
          <span className="compteur">{commandes.length} en cours</span>
          <button
            className={'interrupteur' + (serviceOuvert ? ' ouvert' : ' ferme')}
            onClick={basculerService}
          >
            <span className="pastille" />
            {serviceOuvert ? 'Service ouvert' : 'Service fermé'}
          </button>
        </div>
      </header>

      {!serviceOuvert && (
        <p className="avertissement bandeau">
          Les clients ne peuvent plus commander. Les commandes déjà reçues
          restent à traiter normalement.
        </p>
      )}

      {erreur && <p className="erreur">{erreur}</p>}

      <div className="colonnes">
        {COLONNES.map((col) => {
          const liste = commandes.filter((c) => c.statut === col.statut);
          return (
            <section key={col.statut} className="colonne">
              <h2>{col.titre} <span className="badge">{liste.length}</span></h2>

              {liste.length === 0 && <p className="vide">—</p>}

              {liste.map((c) => {
                const attente = minutesEcoulees(c.created_at);
                return (
                  <article
                    key={c.id}
                    className={'ticket' + (attente >= 10 ? ' urgent' : '')}
                  >
                    <div className="ticket-tete">
                      <span className="table-num">{c.bar_tables?.numero}</span>
                      <span className="attente">{attente} min</span>
                    </div>

                    <ul className="lignes">
                      {c.bar_lignes.map((l, i) => (
                        <li key={i}>
                          <span className="qte-ligne">{l.quantite}×</span> {l.libelle}
                        </li>
                      ))}
                    </ul>

                    {c.commentaire && <p className="note">{c.commentaire}</p>}

                    {aAnnuler === c.id ? (
                      <div className="confirmation-annulation">
                        <p>Annuler cette commande ?</p>
                        <input
                          className="champ-mini large"
                          placeholder="Motif (rupture, erreur…)"
                          value={motif}
                          onChange={(e) => setMotif(e.target.value)}
                          autoFocus
                        />
                        <div className="actions-annulation">
                          <button className="btn-danger" onClick={() => annuler(c.id)}>
                            Confirmer
                          </button>
                          <button
                            className="bascule"
                            onClick={() => { setAAnnuler(null); setMotif(''); }}
                          >
                            Retour
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="ticket-pied">
                        <span className="cases-dues">
                          {libelleCases(c.cases_dues)} · {enEuros(c.cases_dues)}
                        </span>
                        <div className="actions-ticket">
                          <button
                            className="bascule discret"
                            onClick={() => setAAnnuler(c.id)}
                          >
                            Annuler
                          </button>
                          {col.suivant && (
                            <button
                              className="btn petit"
                              onClick={() => changerStatut(c.id, col.suivant)}
                            >
                              {col.action}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
