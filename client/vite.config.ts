import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    /**
     * Bind the IPv4 loopback explicitly.
     *
     * The default is the hostname `localhost`, and Node 17+ resolves names in
     * `verbatim` order - on Windows `localhost` comes back as `::1` first,
     * even though the hosts file maps it to `127.0.0.1`. Vite takes the first
     * address and ends up listening on `[::1]` alone. Browsers read the hosts
     * file, connect to `127.0.0.1`, and get ECONNREFUSED - the page looks dead
     * while the terminal cheerfully prints "ready".
     *
     * The address is spelled out rather than left to `localhost` so the
     * terminal banner and the listening socket cannot disagree again.
     */
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
