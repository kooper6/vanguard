import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';

const execFileAsync = promisify(execFile);

export function getRepoRoot(): string {
  return process.env.REPO_ROOT || path.resolve(process.cwd(), '..');
}

export function getCliPath(repoRoot: string): string {
  return path.resolve(repoRoot, 'target/debug/agent_vcs_cli');
}

async function runCliJson(args: string[]): Promise<any> {
  const repoRoot = getRepoRoot();
  const cliPath = getCliPath(repoRoot);

  try {
    const { stdout } = await execFileAsync(cliPath, ['--repo', repoRoot, ...args], {
      maxBuffer: 50 * 1024 * 1024,
    });
    return JSON.parse(stdout.trim());
  } catch (err: any) {
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout.trim());
      } catch {
        // ignore
      }
    }
    throw new Error(err.stderr || err.message);
  }
}

export async function handleApiRequest(
  urlPath: string,
  method: string,
  query: Record<string, string>,
  body: any
): Promise<{ status: number; data: any }> {
  const repoRoot = getRepoRoot();

  try {
    // GET /api/status
    if (urlPath === '/api/status' && method === 'GET') {
      const data = await runCliJson(['status', '--json']);
      return { status: 200, data };
    }

    // GET /api/nodes
    if (urlPath === '/api/nodes' && method === 'GET') {
      const data = await runCliJson(['log', '--json']);
      return { status: 200, data };
    }

    // GET /api/nodes/:id
    const nodeMatch = urlPath.match(/^\/api\/nodes\/([^/]+)$/);
    if (nodeMatch && method === 'GET') {
      const nodeId = nodeMatch[1];
      const data = await runCliJson(['show', nodeId, '--json']);
      return { status: 200, data };
    }

    // POST /api/nodes/:id/promote
    const promoteMatch = urlPath.match(/^\/api\/nodes\/([^/]+)\/promote$/);
    if (promoteMatch && method === 'POST') {
      const nodeId = promoteMatch[1];
      const authorName = body?.author_name || 'Agent VCS Gatekeeper';
      const authorEmail = body?.author_email || 'gatekeeper@agent.vcs';
      const data = await runCliJson([
        'promote',
        nodeId,
        '--author-name',
        authorName,
        '--author-email',
        authorEmail,
        '--json',
      ]);
      return { status: 200, data };
    }

    // POST /api/nodes/:id/reject
    const rejectMatch = urlPath.match(/^\/api\/nodes\/([^/]+)\/reject$/);
    if (rejectMatch && method === 'POST') {
      const nodeId = rejectMatch[1];
      const data = await runCliJson(['reject', nodeId, '--json']);
      return { status: 200, data };
    }

    // POST /api/nodes/:id/checkout
    const checkoutMatch = urlPath.match(/^\/api\/nodes\/([^/]+)\/checkout$/);
    if (checkoutMatch && method === 'POST') {
      const nodeId = checkoutMatch[1];
      const applyToWorktree = Boolean(body?.apply_to_worktree);
      const args = ['checkout', nodeId, '--json'];
      if (applyToWorktree) {
        args.push('--apply-to-worktree');
      }
      const data = await runCliJson(args);
      return { status: 200, data };
    }

    // POST /api/checkpoint
    if (urlPath === '/api/checkpoint' && method === 'POST') {
      const prompt = body?.prompt || 'Web UI checkpoint';
      const reasoning = body?.reasoning || 'Created via Web UI Inspector';
      const toolCalls = body?.tool_calls || 'web_ui';
      const files: string[] = body?.files || [];

      const args = [
        'checkpoint',
        '-m',
        prompt,
        '-r',
        reasoning,
        '--tool-calls',
        toolCalls,
        '--json',
      ];
      for (const f of files) {
        args.push('-f', f);
      }

      const data = await runCliJson(args);
      return { status: 200, data };
    }

    // GET /api/shadow/files
    if (urlPath === '/api/shadow/files' && method === 'GET') {
      const shadowDir = path.resolve(repoRoot, '.agent_vcs', 'workspace');
      const files: string[] = [];

      async function walk(dir: string, prefix = '') {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              await walk(path.join(dir, entry.name), rel);
            } else {
              files.push(rel);
            }
          }
        } catch {
          // ignore directory read errors if directory does not exist
        }
      }

      await walk(shadowDir);
      return { status: 200, data: { files } };
    }

    // GET /api/shadow/file?path=...
    if (urlPath === '/api/shadow/file' && method === 'GET') {
      const filePath = query.path;
      if (!filePath) {
        return { status: 400, data: { error: 'Missing path query parameter' } };
      }
      const fullPath = path.resolve(repoRoot, '.agent_vcs', 'workspace', filePath);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        return { status: 200, data: { path: filePath, content } };
      } catch (err: any) {
        return { status: 404, data: { error: `File not found: ${filePath}` } };
      }
    }

    return { status: 404, data: { error: `Endpoint not found: ${method} ${urlPath}` } };
  } catch (err: any) {
    return { status: 500, data: { error: err.message || 'Internal server error' } };
  }
}
