import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import Commande from './pages/Commande';
import Connexion from './pages/Connexion';
import Bar from './pages/Bar';
import Service from './pages/Service';
import Admin from './pages/Admin';
import AdminQR from './pages/AdminQR';
import Recap from './pages/Recap';
import { RouteProtegee } from './lib/auth';
import InviteInstallation from './composants/InviteInstallation';
import './styles.css';

function Accueil() {
  return (
    <div className="ecran centre">
      <img className="logo-buco" src="/logo-bucolique.png" alt="Bucolique Ferrières Musique" />
      <span className="bandeau-event">Blind Test · 10 octobre</span>
      <p className="sous-titre">
        Les clients commandent en scannant le QR code de leur table.
      </p>
      <nav className="menu-postes">
        <Link className="btn" to="/bar">Écran bar</Link>
        <Link className="btn secondaire" to="/service">Écran service</Link>
        <Link className="btn secondaire" to="/admin">Administration</Link>
        <Link className="btn secondaire" to="/admin/recap">Récapitulatif</Link>
      </nav>
      <InviteInstallation />
      <p className="pied-event">Bucolique Club · Au Clocher 14, 4190 Ferrières</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="/c/:token" element={<Commande />} />
        <Route path="/connexion" element={<Connexion />} />
        <Route path="/bar" element={<RouteProtegee><Bar /></RouteProtegee>} />
        <Route path="/service" element={<RouteProtegee><Service /></RouteProtegee>} />
        <Route path="/admin" element={<RouteProtegee><Admin /></RouteProtegee>} />
        <Route path="/admin/qr" element={<RouteProtegee><AdminQR /></RouteProtegee>} />
        <Route path="/admin/recap" element={<RouteProtegee><Recap /></RouteProtegee>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
