import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, enEuros, CASE_EN_EUROS } from '../lib/supabase';

const CASES_PAR_CARTE = 10; // carte de 10 € à cases de 1,00 €

function aujourdhui() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// Une soirée déborde sur le lendemain : on la borne de midi à 6h du matin.
function bornes(jour) {
  const debut = new Date(`${jour}T12:00:00`);
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + 1);
  fin.setHours(6, 0, 0, 0);
  return { debut: debut.toISOString(), fin: fin.toISOString() };
}

export default function Recap() {
  const [jour, setJour] = useState(aujourdhui());
  const [commandes, setCommandes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { debut, fin } = bornes(jour);

    const { data, error } = await supabase
      .from('bar_commandes')
      .select('id, statut, cases_dues, serveur, motif_annulation, created_at, servie_at, bar_tables(numero, zone), bar_lignes(libelle, quantite, prix_cases)')
      .gte('created_at', debut)
      .lt('created_at', fin)
      .order('created_at');

    if (error) setErreur(error.message);
    else setCommandes(data || []);
    setChargement(false);
  }, [jour]);

  useEffect(() => { charger(); }, [charger]);

  const servies = useMemo(
    () => commandes.filter((c) => c.statut === 'servie'),
    [commandes]
  );
  const annulees = useMemo(
    () => commandes.filter((c) => c.statut === 'annulee'),
    [commandes]
  );
  const enCours = useMemo(
    () => commandes.filter((c) => ['recue', 'preparation', 'prete'].includes(c.statut)),
    [commandes]
  );

  const casesConsommees = useMemo(
    () => servies.reduce((s, c) => s + c.cases_dues, 0),
    [servies]
  );

  const parArticle = useMemo(() => {
    const m = new Map();
    for (const c of servies) {
      for (const l of c.bar_lignes) {
        const e = m.get(l.libelle) || { libelle: l.libelle, quantite: 0, cases: 0 };
        e.quantite += l.quantite;
        e.cases += l.quantite * l.prix_cases;
        m.set(l.libelle, e);
      }
    }
    return [...m.values()].sort((a, b) => b.quantite - a.quantite);
  }, [servies]);

  const parServeur = useMemo(() => {
    const m = new Map();
    for (const c of servies) {
      const nom = c.serveur || '(non renseigné)';
      const e = m.get(nom) || { nom, commandes: 0, cases: 0 };
      e.commandes += 1;
      e.cases += c.cases_dues;
      m.set(nom, e);
    }
    return [...m.values()].sort((a, b) => b.cases - a.cases);
  }, [servies]);

  const parTable = useMemo(() => {
    const m = new Map();
    for (const c of servies) {
      const nom = c.bar_tables?.numero || '?';
      const e = m.get(nom) || { nom, commandes: 0, cases: 0 };
      e.commandes += 1;
      e.cases += c.cases_dues;
      m.set(nom, e);
    }
    return [...m.values()].sort((a, b) => b.cases - a.cases);
  }, [servies]);

  function exporterCSV() {
    const l = [];
    l.push(['Récapitulatif', jour]);
    l.push([]);
    l.push(['Commandes servies', servies.length]);
    l.push(['Cases consommées', casesConsommees]);
    l.push(['Équivalent euros', (casesConsommees * CASE_EN_EUROS).toFixed(2)]);
    l.push(['Équivalent cartes de 10 €', (casesConsommees / CASES_PAR_CARTE).toFixed(1)]);
    l.push(['Commandes annulées', annulees.length]);
    l.push(['Commandes non terminées', enCours.length]);
    l.push([]);
    l.push(['Article', 'Quantité', 'Cases']);
    parArticle.forEach((a) => l.push([a.libelle, a.quantite, a.cases]));
    l.push([]);
    l.push(['Serveur', 'Commandes', 'Cases encaissées']);
    parServeur.forEach((s) => l.push([s.nom, s.commandes, s.cases]));
    l.push([]);
    l.push(['Table', 'Commandes', 'Cases']);
    parTable.forEach((t) => l.push([t.nom, t.commandes, t.cases]));
    l.push([]);
    l.push(['Annulations — heure', 'Table', 'Cases', 'Motif']);
    annulees.forEach((c) =>
      l.push([
        new Date(c.created_at).toLocaleTimeString('fr-BE'),
        c.bar_tables?.numero || '',
        c.cases_dues,
        c.motif_annulation || '',
      ])
    );

    // Point-virgule : Excel francophone ouvre le fichier sans assistant d'import
    const csv = l.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recap-bar-${jour}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ecran large">
      <header className="entete-poste">
        <h1>Récapitulatif</h1>
        <Link className="lien-discret" to="/admin">Retour</Link>
      </header>

      <section className="bloc">
        <div className="ligne-champs">
          <label>
            Soirée du
            <input
              className="champ"
              type="date"
              value={jour}
              onChange={(e) => setJour(e.target.value)}
            />
          </label>
        </div>
        <p className="aide">
          La soirée est comptée de 12h au lendemain 6h, pour ne pas couper
          le service à minuit.
        </p>
        <button className="btn" onClick={exporterCSV} disabled={commandes.length === 0}>
          Exporter en CSV
        </button>
      </section>

      {erreur && <p className="erreur">{erreur}</p>}
      {chargement && <p className="aide">Chargement…</p>}

      {!chargement && commandes.length === 0 && (
        <p className="vide grand">Aucune commande sur cette soirée.</p>
      )}

      {!chargement && commandes.length > 0 && (
        <>
          <section className="chiffres">
            <div className="chiffre">
              <span className="valeur">{servies.length}</span>
              <span className="etiquette">commandes servies</span>
            </div>
            <div className="chiffre fort">
              <span className="valeur">{casesConsommees}</span>
              <span className="etiquette">cases consommées</span>
              <span className="detail">{enEuros(casesConsommees)}</span>
            </div>
            <div className="chiffre">
              <span className="valeur">{(casesConsommees / CASES_PAR_CARTE).toFixed(1)}</span>
              <span className="etiquette">cartes de 10 € équivalentes</span>
            </div>
            <div className="chiffre">
              <span className="valeur">{annulees.length}</span>
              <span className="etiquette">annulées</span>
            </div>
            {enCours.length > 0 && (
              <div className="chiffre alerte">
                <span className="valeur">{enCours.length}</span>
                <span className="etiquette">jamais terminées</span>
              </div>
            )}
          </section>

          <section className="bloc">
            <h2>Réconciliation</h2>
            <p className="aide">
              Compare <strong>{casesConsommees} cases consommées</strong> au nombre
              de cases vendues à la caisse. Un écart signale une fuite : cartes
              non enregistrées, cases oubliées, ou consommations offertes non tracées.
              L'app mesure la consommation, pas l'encaissement — le contrôle croisé
              reste indispensable.
            </p>
          </section>

          <section className="bloc">
            <h2>Par article <span className="badge">{parArticle.length}</span></h2>
            <table className="tableau">
              <thead><tr><th>Article</th><th>Quantité</th><th>Cases</th><th>Équivalent</th></tr></thead>
              <tbody>
                {parArticle.map((a) => (
                  <tr key={a.libelle}>
                    <td>{a.libelle}</td>
                    <td>{a.quantite}</td>
                    <td>{a.cases}</td>
                    <td>{enEuros(a.cases)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bloc">
            <h2>Par serveur <span className="badge">{parServeur.length}</span></h2>
            <table className="tableau">
              <thead><tr><th>Serveur</th><th>Commandes</th><th>Cases encaissées</th></tr></thead>
              <tbody>
                {parServeur.map((s) => (
                  <tr key={s.nom}>
                    <td>{s.nom}</td>
                    <td>{s.commandes}</td>
                    <td>{s.cases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bloc">
            <h2>Par table <span className="badge">{parTable.length}</span></h2>
            <table className="tableau">
              <thead><tr><th>Table</th><th>Commandes</th><th>Cases</th></tr></thead>
              <tbody>
                {parTable.map((t) => (
                  <tr key={t.nom}>
                    <td>{t.nom}</td>
                    <td>{t.commandes}</td>
                    <td>{t.cases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {annulees.length > 0 && (
            <section className="bloc">
              <h2>Annulations <span className="badge">{annulees.length}</span></h2>
              <table className="tableau">
                <thead><tr><th>Heure</th><th>Table</th><th>Cases</th><th>Motif</th></tr></thead>
                <tbody>
                  {annulees.map((c) => (
                    <tr key={c.id}>
                      <td>{new Date(c.created_at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{c.bar_tables?.numero}</td>
                      <td>{c.cases_dues}</td>
                      <td>{c.motif_annulation || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {enCours.length > 0 && (
            <section className="bloc">
              <h2>Jamais terminées <span className="badge">{enCours.length}</span></h2>
              <p className="aide">
                Restées bloquées en cours de service. À vérifier avant de clôturer :
                soit elles ont été servies sans être pointées, soit elles ont été
                oubliées — et dans les deux cas le total ci-dessus est sous-estimé.
              </p>
              <table className="tableau">
                <thead><tr><th>Heure</th><th>Table</th><th>Statut</th><th>Cases</th></tr></thead>
                <tbody>
                  {enCours.map((c) => (
                    <tr key={c.id}>
                      <td>{new Date(c.created_at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{c.bar_tables?.numero}</td>
                      <td>{c.statut}</td>
                      <td>{c.cases_dues}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
