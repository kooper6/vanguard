export type NodeStatus = 'PendingReview' | 'Promoted' | 'Rejected';

export interface NodeSummary {
  node_id: string;
  parent_id: string | null;
  timestamp_utc: number;
  status: NodeStatus;
  is_head: boolean;
  prompt: string;
  files_count: number;
  additions: number;
  deletions: number;
}

export interface EngineStatus {
  head_node_id: string | null;
  head_status: NodeStatus | null;
  head_prompt: string | null;
  total_nodes: number;
  pending_nodes: number;
  shadow_files: string[];
}

export type DiffLineTag = 'Equal' | 'Insert' | 'Delete';

export interface DiffWordToken {
  tag: DiffLineTag;
  text: string;
}

export interface DiffLine {
  tag: DiffLineTag;
  content: string;
  old_line_no: number | null;
  new_line_no: number | null;
  word_tokens: DiffWordToken[];
}

export interface DiffHunk {
  header: string;
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  lines: DiffLine[];
}

export interface StructuralDiff {
  file_path: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DetailedFilePatch {
  path: string;
  unified_diff_hash: string;
  diff_content: string;
  structural_diff: StructuralDiff;
}

export interface AgentExecutionNode {
  node_id: string;
  parent_id: string | null;
  timestamp_utc: number;
  prompt_blob_hash: string;
  reasoning_blob_hash: string;
  tool_calls_blob_hash: string;
  file_patches: Array<{ path: string; unified_diff_hash: string }>;
  status: NodeStatus;
}

export interface NodeDetails {
  node: AgentExecutionNode;
  prompt: string;
  reasoning: string;
  tool_calls: string;
  patches: DetailedFilePatch[];
}
