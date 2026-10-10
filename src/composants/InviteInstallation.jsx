import { useEffect, useState } from 'react';

// iOS ne déclenche jamais d'invite d'installation automatique : sur iPhone,
// l'ajout à l'écran d'accueil passe obligatoirement par le menu Partager de
// Safari. Il faut donc l'expliquer, sinon personne ne le fait.

function estIOS() {
  const ua = window.navigator.userAgent;
  const iPad = /Macintosh/.test(ua) && 'ontouchend' in document; // iPad récent
  return /iPad|iPhone|iPod/.test(ua) || iPad;
}

function estInstallee() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export default function InviteInstallation() {
  const [evenement, setEvenement] = useState(null);
  const [masquee, setMasquee] = useState(false);
  const [aideIOS, setAideIOS] = useState(false);

  useEffect(() => {
    function capturer(e) {
      e.preventDefault();
      setEvenement(e);
    }
    window.addEventListener('beforeinstallprompt', capturer);
    return () => window.removeEventListener('beforeinstallprompt', capturer);
  }, []);

  if (masquee || estInstallee()) return null;

  const ios = estIOS();
  if (!ios && !evenement) return null; // Chrome/Android : rien tant que l'invite n'est pas prête

  async function installer() {
    if (ios) { setAideIOS(true); return; }
    evenement.prompt();
    await evenement.userChoice;
    setEvenement(null);
  }

  return (
    <div className="invite-install">
      {aideIOS ? (
        <div className="invite-texte">
          <strong>Installer sur iPhone</strong>
          <ol>
            <li>Appuie sur <span className="pictogramme">⬆︎</span> Partager, en bas de Safari</li>
            <li>Fais défiler et choisis « Sur l'écran d'accueil »</li>
            <li>Valide avec « Ajouter »</li>
          </ol>
          <p className="aide-mini">
            Depuis Chrome ou Firefox sur iPhone, ça ne marche pas : il faut Safari.
          </p>
        </div>
      ) : (
        <div className="invite-texte">
          <strong>Installer l'application</strong>
          <p className="aide-mini">Accès direct depuis l'écran d'accueil, sans barre de navigateur.</p>
        </div>
      )}

      <div className="invite-actions">
        {!aideIOS && (
          <button className="btn petit" onClick={installer}>Installer</button>
        )}
        <button className="bascule" onClick={() => setMasquee(true)}>Plus tard</button>
      </div>
    </div>
  );
}
