import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { supabase, enEuros, CASE_EN_EUROS } from '../lib/supabase';

const ONGLETS = [
  { id: 'carte', titre: 'Carte' },
  { id: 'tables', titre: 'Tables' },
];

export default function Admin() {
  const [onglet, setOnglet] = useState('carte');

  return (
    <div className="ecran large">
      <header className="entete-poste">
        <h1>Administration</h1>
        <span className="entete-droite">
          <Link className="lien-discret" to="/admin/recap">Récapitulatif</Link>
          <Link className="lien-discret" to="/">Retour</Link>
        </span>
      </header>

      <nav className="onglets">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            className={'onglet' + (onglet === o.id ? ' actif' : '')}
            onClick={() => setOnglet(o.id)}
          >
            {o.titre}
          </button>
        ))}
      </nav>

      {onglet === 'carte' ? <OngletCarte /> : <OngletTables />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Carte : import CSV + édition ligne à ligne                          */
/* ------------------------------------------------------------------ */

function OngletCarte() {
  const [articles, setArticles] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [info, setInfo] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [remplacer, setRemplacer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const fichierRef = useRef(null);

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('bar_articles')
      .select('id, nom, prix_cases, disponible, ordre, bar_categories(nom)')
      .order('ordre');
    if (error) setErreur(error.message);
    else setArticles(data || []);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  function lireFichier(e) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setErreur(null);
    setInfo(null);

    Papa.parse(fichier, {
      header: true,
      skipEmptyLines: true,
      // Excel francophone exporte en point-virgule : on laisse Papa détecter
      delimitersToGuess: [';', ',', '\t'],
      complete: (res) => {
        const lignes = [];
        const problemes = [];

        res.data.forEach((row, i) => {
          const cle = (k) =>
            Object.keys(row).find((x) => x.trim().toLowerCase() === k);

          const categorie = (row[cle('categorie')] ?? row[cle('catégorie')] ?? '').trim();
          const nom = (row[cle('nom')] ?? row[cle('article')] ?? '').trim();
          const brut = (row[cle('prix_euros')] ?? row[cle('prix')] ?? '').toString().trim();

          if (!nom && !categorie && !brut) return;

          const numero = i + 2; // +1 pour l'entête, +1 pour partir de 1

          // Article offert : 0, 0.0, « gratuit » ou « offert »
          const motGratuit = /^(gratuit|offert|free|0([.,]0*)?)$/i.test(brut);
          const euros = motGratuit ? 0 : parseFloat(brut.replace(',', '.'));

          if (!categorie) { problemes.push(`Ligne ${numero} : catégorie manquante`); return; }
          if (!nom) { problemes.push(`Ligne ${numero} : nom manquant`); return; }
          if (!isFinite(euros) || euros < 0) {
            problemes.push(`Ligne ${numero} : prix illisible ("${brut}")`); return;
          }

          const cases = euros / CASE_EN_EUROS;
          if (euros > 0 && Math.abs(cases - Math.round(cases)) > 1e-9) {
            problemes.push(
              `Ligne ${numero} : ${euros.toFixed(2)} € ne tombe pas sur un multiple de 1,00 €`
            );
            return;
          }

          lignes.push({ categorie, nom, prix_cases: Math.round(cases) });
        });

        setApercu({ lignes, problemes });
      },
      error: () => setErreur('Fichier illisible.'),
    });
  }

  async function importer() {
    setEnvoi(true);
    setErreur(null);
    const { data, error } = await supabase.rpc('bar_import_carte', {
      p_lignes: apercu.lignes,
      p_remplacer: remplacer,
    });
    if (error) {
      setErreur(error.message);
    } else {
      setInfo(
        `${data.articles_importes} article(s) importé(s)` +
        (data.articles_supprimes ? `, ${data.articles_supprimes} remplacé(s)` : '')
      );
      setApercu(null);
      if (fichierRef.current) fichierRef.current.value = '';
      charger();
    }
    setEnvoi(false);
  }

  async function basculerDispo(a) {
    setArticles((l) => l.map((x) => (x.id === a.id ? { ...x, disponible: !x.disponible } : x)));
    const { error } = await supabase
      .from('bar_articles')
      .update({ disponible: !a.disponible })
      .eq('id', a.id);
    if (error) { setErreur(error.message); charger(); }
  }

  async function changerPrix(a, valeur) {
    const n = parseInt(valeur, 10);
    if (!isFinite(n) || n < 0) return;
    setArticles((l) => l.map((x) => (x.id === a.id ? { ...x, prix_cases: n } : x)));
    const { error } = await supabase
      .from('bar_articles')
      .update({ prix_cases: n })
      .eq('id', a.id);
    if (error) { setErreur(error.message); charger(); }
  }

  return (
    <>
      <section className="bloc">
        <h2>Importer une carte</h2>
        <p className="aide">
          Fichier CSV avec trois colonnes : <code>categorie</code>, <code>nom</code>,{' '}
          <code>prix_euros</code>. Point-virgule ou virgule, peu importe.
          Article offert : <code>0</code>, <code>gratuit</code> ou <code>offert</code>.
          Le fichier doit être enregistré en <strong>CSV UTF-8</strong>, sinon les
          accents se cassent.
          Les prix doivent tomber sur un multiple de 1,00 € — c'est la granularité
          des cases, on ne peut pas cocher une demi-case.
        </p>

        <a className="lien-discret" href="/modele-carte.csv" download>
          Télécharger un modèle
        </a>

        <input
          ref={fichierRef}
          className="champ"
          type="file"
          accept=".csv,text/csv"
          onChange={lireFichier}
        />

        {apercu && (
          <div className="apercu">
            {apercu.problemes.length > 0 && (
              <div className="erreur">
                <strong>{apercu.problemes.length} ligne(s) ignorée(s) :</strong>
                <ul>{apercu.problemes.slice(0, 8).map((p, i) => <li key={i}>{p}</li>)}</ul>
                {apercu.problemes.length > 8 && <p>…</p>}
              </div>
            )}

            <p className="aide">{apercu.lignes.length} article(s) prêt(s) à importer :</p>
            <table className="tableau">
              <thead>
                <tr><th>Catégorie</th><th>Article</th><th>Cases</th><th>Prix</th></tr>
              </thead>
              <tbody>
                {apercu.lignes.slice(0, 15).map((l, i) => (
                  <tr key={i}>
                    <td>{l.categorie}</td>
                    <td>{l.nom}</td>
                    <td>{l.prix_cases}</td>
                    <td>{enEuros(l.prix_cases)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {apercu.lignes.length > 15 && (
              <p className="aide">… et {apercu.lignes.length - 15} de plus.</p>
            )}

            <label className="case-a-cocher">
              <input
                type="checkbox"
                checked={remplacer}
                onChange={(e) => setRemplacer(e.target.checked)}
              />
              Remplacer toute la carte existante
            </label>
            {remplacer && (
              <p className="avertissement">
                Les articles actuels seront supprimés. Les commandes déjà passées
                gardent leur libellé et leur prix, l'historique n'est pas touché.
              </p>
            )}

            <button
              className="btn"
              disabled={envoi || apercu.lignes.length === 0}
              onClick={importer}
            >
              {envoi ? 'Import…' : `Importer ${apercu.lignes.length} article(s)`}
            </button>
          </div>
        )}

        {erreur && <p className="erreur">{erreur}</p>}
        {info && <p className="succes">{info}</p>}
      </section>

      <section className="bloc">
        <h2>Carte actuelle <span className="badge">{articles.length}</span></h2>
        {articles.length === 0 && <p className="vide">Aucun article.</p>}
        <table className="tableau">
          <thead>
            <tr><th>Catégorie</th><th>Article</th><th>Cases</th><th>Prix</th><th>Dispo</th></tr>
          </thead>
          <tbody>
            {articles.map((a) => (
              <tr key={a.id} className={a.disponible ? '' : 'indispo'}>
                <td>{a.bar_categories?.nom}</td>
                <td>{a.nom}</td>
                <td>
                  <input
                    className="champ-mini"
                    type="number"
                    min="0"
                    value={a.prix_cases}
                    onChange={(e) => changerPrix(a, e.target.value)}
                  />
                </td>
                <td>{enEuros(a.prix_cases)}</td>
                <td>
                  <button className="bascule" onClick={() => basculerDispo(a)}>
                    {a.disponible ? 'Oui' : 'Non'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

function OngletTables() {
  const [tables, setTables] = useState([]);
  const [prefixe, setPrefixe] = useState('T');
  const [de, setDe] = useState(1);
  const [a, setA] = useState(20);
  const [zone, setZone] = useState('');
  const [erreur, setErreur] = useState(null);
  const [info, setInfo] = useState(null);

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('bar_tables')
      .select('id, numero, zone, actif, token')
      .order('numero');
    if (error) setErreur(error.message);
    else setTables(data || []);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  async function creer() {
    setErreur(null);
    setInfo(null);
    const { data, error } = await supabase.rpc('bar_creer_tables', {
      p_prefixe: prefixe,
      p_de: Number(de),
      p_a: Number(a),
      p_zone: zone.trim() || null,
    });
    if (error) setErreur(error.message);
    else {
      setInfo(
        data.creees === 0
          ? 'Aucune nouvelle table : elles existaient déjà.'
          : `${data.creees} table(s) créée(s). Total : ${data.total}.`
      );
      charger();
    }
  }

  async function basculerActif(t) {
    setTables((l) => l.map((x) => (x.id === t.id ? { ...x, actif: !x.actif } : x)));
    const { error } = await supabase
      .from('bar_tables')
      .update({ actif: !t.actif })
      .eq('id', t.id);
    if (error) { setErreur(error.message); charger(); }
  }

  return (
    <>
      <section className="bloc">
        <h2>Créer des tables</h2>
        <p className="aide">
          Les tables existantes ne sont jamais modifiées : leurs jetons restent
          valides, donc les QR déjà imprimés continuent de fonctionner.
        </p>
        <div className="ligne-champs">
          <label>Préfixe<input className="champ" value={prefixe} onChange={(e) => setPrefixe(e.target.value)} /></label>
          <label>De<input className="champ" type="number" min="1" value={de} onChange={(e) => setDe(e.target.value)} /></label>
          <label>À<input className="champ" type="number" min="1" value={a} onChange={(e) => setA(e.target.value)} /></label>
          <label>Zone<input className="champ" placeholder="Salle, terrasse…" value={zone} onChange={(e) => setZone(e.target.value)} /></label>
        </div>
        <button className="btn" onClick={creer}>Créer</button>
        {erreur && <p className="erreur">{erreur}</p>}
        {info && <p className="succes">{info}</p>}
      </section>

      <section className="bloc">
        <h2>
          Tables <span className="badge">{tables.length}</span>
          {tables.length > 0 && (
            <Link className="lien-discret" to="/admin/qr" style={{ marginLeft: 'auto' }}>
              Imprimer les QR codes
            </Link>
          )}
        </h2>
        <table className="tableau">
          <thead><tr><th>Numéro</th><th>Zone</th><th>Active</th></tr></thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.id} className={t.actif ? '' : 'indispo'}>
                <td>{t.numero}</td>
                <td>{t.zone || '—'}</td>
                <td>
                  <button className="bascule" onClick={() => basculerActif(t)}>
                    {t.actif ? 'Oui' : 'Non'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
