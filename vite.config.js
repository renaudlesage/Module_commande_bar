import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { host: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'apple-touch-icon.png',
        'favicon-32.png',
        'logo-bucolique.png',
        'modele-carte.csv',
      ],
      manifest: {
        name: 'Commande bar — Bucolique Blind Test',
        short_name: 'Bar Buco',
        description: 'Commande de boissons par QR code — Bucolique Ferrières Musique',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Pas de verrou d'orientation : l'écran bar à trois colonnes
        // est fait pour le paysage sur tablette, le formulaire client
        // pour le portrait sur téléphone.
        orientation: 'any',
        background_color: '#3A2B66',
        theme_color: '#3A2B66',
        icons: [
          { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icone-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icone-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Écran bar', url: '/bar' },
          { name: 'Écran service', url: '/service' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff2}'],
        navigateFallback: '/index.html',
        // Les appels Supabase ne doivent JAMAIS être servis depuis le cache :
        // une commande ou un statut périmé au bar ferait plus de dégâts
        // qu'une erreur réseau visible.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
