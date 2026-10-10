import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from './supabase';

export function useSession() {
  const [session, setSession] = useState(undefined); // undefined = en cours de lecture

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return session;
}

export function RouteProtegee({ children }) {
  const session = useSession();
  if (session === undefined) {
    return <div className="ecran centre"><p>Vérification…</p></div>;
  }
  if (session === null) {
    return <Navigate to="/connexion" replace />;
  }
  return children;
}
