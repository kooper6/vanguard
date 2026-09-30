import express from 'express';
import path from 'node:path';
import { handleApiRequest } from './api-handler';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '50mb' }));

app.all('/api/*', async (req, res) => {
  const query = (req.query as Record<string, string>) || {};
  const { status, data } = await handleApiRequest(req.path, req.method, query, req.body);
  res.status(status).json(data);
});

// Serve static frontend assets
const distDir = path.resolve(process.cwd(), 'dist');
app.use(express.static(distDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Agent VCS Web UI server running at http://localhost:${port}`);
});
