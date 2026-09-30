import { EngineStatus, NodeDetails, NodeSummary } from './types';

export async function fetchStatus(): Promise<EngineStatus> {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error('Failed to fetch VCS status');
  return res.json();
}

export async function fetchNodes(): Promise<NodeSummary[]> {
  const res = await fetch('/api/nodes');
  if (!res.ok) throw new Error('Failed to fetch DAG nodes');
  return res.json();
}

export async function fetchNodeDetails(nodeId: string): Promise<NodeDetails> {
  const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}`);
  if (!res.ok) throw new Error(`Failed to fetch node ${nodeId}`);
  return res.json();
}

export async function promoteNode(
  nodeId: string,
  authorName?: string,
  authorEmail?: string
): Promise<{ success: boolean; commit_sha: string; node_id: string }> {
  const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author_name: authorName, author_email: authorEmail }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to promote node');
  }
  return res.json();
}

export async function rejectNode(nodeId: string): Promise<{ success: boolean; status: string }> {
  const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to reject node');
  }
  return res.json();
}

export async function checkoutNode(
  nodeId: string,
  applyToWorktree = false
): Promise<{ success: boolean; node_id: string }> {
  const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apply_to_worktree: applyToWorktree }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to checkout node');
  }
  return res.json();
}

export async function createCheckpoint(params: {
  prompt: string;
  reasoning: string;
  tool_calls: string;
  files: string[];
}): Promise<any> {
  const res = await fetch('/api/checkpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create checkpoint');
  }
  return res.json();
}

export async function fetchShadowFiles(): Promise<string[]> {
  const res = await fetch('/api/shadow/files');
  if (!res.ok) return [];
  const data = await res.json();
  return data.files || [];
}
