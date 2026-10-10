import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';

export default function AdminQR() {
  const [tables, setTables] = useState([]);
  const [images, setImages] = useState({});
  const [base, setBase] = useState('');
  const [parPage, setParPage] = useState(6);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    // En production ce sera l'URL Vercel ; en dev, l'URL de la preview.
    setBase(window.location.origin);
  }, []);

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('bar_tables')
      .select('id, numero, zone, token, actif')
      .eq('actif', true)
      .order('numero');
    if (error) setErreur(error.message);
    else setTables(data || []);
    setChargement(false);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (!base || tables.length === 0) return;
    let annule = false;
    (async () => {
      const rendus = {};
      for (const t of tables) {
        rendus[t.id] = await QRCode.toDataURL(`${base}/c/${t.token}`, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 600,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
      }
      if (!annule) setImages(rendus);
    })();
    return () => { annule = true; };
  }, [base, tables]);

  if (chargement) return <div className="ecran centre"><p>Chargement…</p></div>;

  return (
    <div className="ecran large">
      <div className="hors-impression">
        <header className="entete-poste">
          <h1>QR codes</h1>
          <Link className="lien-discret" to="/admin">Retour</Link>
        </header>

        {erreur && <p className="erreur">{erreur}</p>}

        <section className="bloc">
          <p className="aide">
            L'URL encodée est construite à partir de l'adresse actuelle. Si tu
            imprimes depuis StackBlitz, les QR pointeront vers la preview et
            cesseront de fonctionner. <strong>Imprime depuis l'URL Vercel
            définitive</strong>, une fois le domaine fixé.
          </p>

          <label className="champ-label">
            URL de base
            <input className="champ" value={base} onChange={(e) => setBase(e.target.value)} />
          </label>

          <label className="champ-label">
            QR par page
            <select className="champ" value={parPage} onChange={(e) => setParPage(Number(e.target.value))}>
              <option value={2}>2 — très grand</option>
              <option value={4}>4 — grand</option>
              <option value={6}>6 — standard</option>
              <option value={9}>9 — compact</option>
            </select>
          </label>

          <button className="btn" onClick={() => window.print()}>
            Imprimer ({tables.length} table{tables.length > 1 ? 's' : ''})
          </button>
        </section>
      </div>

      <div className={'planche planche-' + parPage}>
        {tables.map((t) => (
          <div key={t.id} className="fiche-qr">
            <div className="fiche-tete">
              <span className="fiche-marque">Bucolique · Blind Test</span>
              <span className="fiche-numero">{t.numero}</span>
              {t.zone && <span className="fiche-zone">{t.zone}</span>}
            </div>
            {images[t.id]
              ? <img src={images[t.id]} alt={'QR table ' + t.numero} />
              : <div className="qr-attente" />}
            <p className="fiche-consigne">
              Scanne pour commander<br />
              <span>1 case = 0,50 €</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
