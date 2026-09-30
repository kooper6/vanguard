import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApiRequest } from './api-handler';
import url from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'agent-vcs-api-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || !req.url.startsWith('/api')) {
            return next();
          }

          const parsedUrl = url.parse(req.url, true);
          const pathname = parsedUrl.pathname || '';
          const query = (parsedUrl.query as Record<string, string>) || {};
          const method = req.method || 'GET';

          let body: any = null;
          if (method === 'POST' || method === 'PUT') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            if (rawBody.trim()) {
              try {
                body = JSON.parse(rawBody);
              } catch {
                body = rawBody;
              }
            }
          }

          try {
            const { status, data } = await handleApiRequest(pathname, method, query, body);
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Server error' }));
          }
        });
      },
    },
  ],
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: '0.0.0.0',
  },
});
