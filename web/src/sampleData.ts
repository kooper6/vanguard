import { NodeDetails, NodeSummary } from './types';
import { ReviewThread } from './components/InlineCommentThread';

export const SAMPLE_NODES: NodeSummary[] = [
  {
    node_id: 'a8f4c910e52b3149dfa167098234bcdae1102948123456789abcdef012345678',
    parent_id: '591cc770123456789abcdef0123456789abcdef0123456789abcdef012345678',
    timestamp_utc: Math.floor(Date.now() / 1000) - 1800,
    status: 'PendingReview',
    is_head: true,
    prompt: 'Implement content-addressable BlobStore for agent reasoning traces, diff patches, and tool calls',
    files_count: 3,
    additions: 121,
    deletions: 14,
  },
  {
    node_id: '7b22104fa28cd910123456789abcdef0123456789abcdef0123456789abcdef0',
    parent_id: null,
    timestamp_utc: Math.floor(Date.now() / 1000) - 7200,
    status: 'Promoted',
    is_head: false,
    prompt: 'Initial agent workspace sandbox setup and shadow worktree bindings',
    files_count: 2,
    additions: 86,
    deletions: 0,
  },
];

export const SAMPLE_NODE_DETAILS: NodeDetails = {
  node: {
    node_id: 'a8f4c910e52b3149dfa167098234bcdae1102948123456789abcdef012345678',
    parent_id: '591cc770123456789abcdef0123456789abcdef0123456789abcdef012345678',
    timestamp_utc: Math.floor(Date.now() / 1000) - 1800,
    prompt_blob_hash: 'c83f98214fa',
    reasoning_blob_hash: '92ba48d1e90',
    tool_calls_blob_hash: '3f00192ea88',
    file_patches: [
      { path: 'crates/agent_vcs_core/src/blob.rs', unified_diff_hash: 'hash1' },
      { path: 'crates/agent_vcs_core/src/workspace.rs', unified_diff_hash: 'hash2' },
      { path: 'crates/agent_vcs_core/src/lib.rs', unified_diff_hash: 'hash3' },
    ],
    status: 'PendingReview',
  },
  prompt: 'Implement content-addressable BlobStore for agent reasoning traces, diff patches, and tool calls with synchronous and async disk access.',
  reasoning: `1. Analyzed storage requirements: Agent VCS needs high-performance, collision-resistant storage for large multi-modal prompt inputs, chain-of-thought traces, and structured AST diffs.
2. Selected SHA-256 content-addressable two-character fanout directory architecture (e.g. .agent_vcs/blobs/ab/cd...).
3. Implemented both asynchronous (tokio::fs) and non-async (std::fs) put/get primitives to accommodate CLI commands and MCP server threads.
4. Added unit test suite ensuring byte integrity and round-trip hash verification.`,
  tool_calls: JSON.stringify(
    [
      {
        tool: 'write_file',
        path: 'crates/agent_vcs_core/src/blob.rs',
        bytes: 3879,
      },
      {
        tool: 'cargo_test',
        filter: 'test_blob_store_roundtrip',
        status: 'passed',
      },
    ],
    null,
    2
  ),
  patches: [
    {
      path: 'crates/agent_vcs_core/src/blob.rs',
      unified_diff_hash: 'hash1',
      diff_content: `--- a/crates/agent_vcs_core/src/blob.rs\n+++ b/crates/agent_vcs_core/src/blob.rs\n@@ -1,5 +1,18 @@\n-use std::path::Path;\n+use anyhow::{Context, Result};\n+use sha2::{Digest, Sha256};\n+use std::path::{Path, PathBuf};\n+use tokio::fs;\n+\n+/// Content-addressable storage for prompt history, reasoning, and patches.\n+#[derive(Debug, Clone)]\n+pub struct BlobStore {\n+    base_path: PathBuf,\n+}\n`,
      structural_diff: {
        file_path: 'crates/agent_vcs_core/src/blob.rs',
        additions: 48,
        deletions: 4,
        hunks: [
          {
            header: 'BlobStore definition',
            old_start: 1,
            old_lines: 5,
            new_start: 1,
            new_lines: 15,
            lines: [
              {
                tag: 'Delete',
                content: 'use std::path::Path;',
                old_line_no: 1,
                new_line_no: null,
                word_tokens: [{ tag: 'Delete', text: 'use std::path::Path;' }],
              },
              {
                tag: 'Insert',
                content: 'use anyhow::{Context, Result};',
                old_line_no: null,
                new_line_no: 1,
                word_tokens: [{ tag: 'Insert', text: 'use anyhow::{Context, Result};' }],
              },
              {
                tag: 'Insert',
                content: 'use sha2::{Digest, Sha256};',
                old_line_no: null,
                new_line_no: 2,
                word_tokens: [{ tag: 'Insert', text: 'use sha2::{Digest, Sha256};' }],
              },
              {
                tag: 'Insert',
                content: 'use std::path::{Path, PathBuf};',
                old_line_no: null,
                new_line_no: 3,
                word_tokens: [{ tag: 'Insert', text: 'use std::path::{Path, PathBuf};' }],
              },
              {
                tag: 'Insert',
                content: 'use tokio::fs;',
                old_line_no: null,
                new_line_no: 4,
                word_tokens: [{ tag: 'Insert', text: 'use tokio::fs;' }],
              },
              {
                tag: 'Equal',
                content: '',
                old_line_no: 2,
                new_line_no: 5,
                word_tokens: [],
              },
              {
                tag: 'Insert',
                content: '/// Content-addressable storage for prompt history, reasoning, and patches.',
                old_line_no: null,
                new_line_no: 6,
                word_tokens: [{ tag: 'Insert', text: '/// Content-addressable storage for prompt history, reasoning, and patches.' }],
              },
              {
                tag: 'Insert',
                content: '#[derive(Debug, Clone)]',
                old_line_no: null,
                new_line_no: 7,
                word_tokens: [{ tag: 'Insert', text: '#[derive(Debug, Clone)]' }],
              },
              {
                tag: 'Insert',
                content: 'pub struct BlobStore {',
                old_line_no: null,
                new_line_no: 8,
                word_tokens: [{ tag: 'Insert', text: 'pub struct BlobStore {' }],
              },
              {
                tag: 'Insert',
                content: '    base_path: PathBuf,',
                old_line_no: null,
                new_line_no: 9,
                word_tokens: [{ tag: 'Insert', text: '    base_path: PathBuf,' }],
              },
              {
                tag: 'Insert',
                content: '}',
                old_line_no: null,
                new_line_no: 10,
                word_tokens: [{ tag: 'Insert', text: '}' }],
              },
            ],
          },
          {
            header: 'impl BlobStore put_blob',
            old_start: 18,
            old_lines: 4,
            new_start: 21,
            new_lines: 16,
            lines: [
              {
                tag: 'Equal',
                content: 'impl BlobStore {',
                old_line_no: 18,
                new_line_no: 21,
                word_tokens: [],
              },
              {
                tag: 'Insert',
                content: '    /// Calculates SHA-256 digest of data and stores it in the blob store.',
                old_line_no: null,
                new_line_no: 22,
                word_tokens: [{ tag: 'Insert', text: '    /// Calculates SHA-256 digest of data and stores it in the blob store.' }],
              },
              {
                tag: 'Insert',
                content: '    pub async fn put_blob(&self, data: &[u8]) -> Result<String> {',
                old_line_no: null,
                new_line_no: 23,
                word_tokens: [{ tag: 'Insert', text: '    pub async fn put_blob(&self, data: &[u8]) -> Result<String> {' }],
              },
              {
                tag: 'Insert',
                content: "        let hash = format!(\"{:x}\", Sha256::digest(data));",
                old_line_no: null,
                new_line_no: 24,
                word_tokens: [{ tag: 'Insert', text: "        let hash = format!(\"{:x}\", Sha256::digest(data));" }],
              },
              {
                tag: 'Insert',
                content: '        let blob_dir = self.base_path.join(&hash[..2]);',
                old_line_no: null,
                new_line_no: 25,
                word_tokens: [{ tag: 'Insert', text: '        let blob_dir = self.base_path.join(&hash[..2]);' }],
              },
              {
                tag: 'Insert',
                content: '        let blob_path = blob_dir.join(&hash[2..]);',
                old_line_no: null,
                new_line_no: 26,
                word_tokens: [{ tag: 'Insert', text: '        let blob_path = blob_dir.join(&hash[2..]);' }],
              },
              {
                tag: 'Insert',
                content: '        fs::create_dir_all(&blob_dir).await?;',
                old_line_no: null,
                new_line_no: 27,
                word_tokens: [{ tag: 'Insert', text: '        fs::create_dir_all(&blob_dir).await?;' }],
              },
              {
                tag: 'Insert',
                content: '        fs::write(&blob_path, data).await?;',
                old_line_no: null,
                new_line_no: 28,
                word_tokens: [{ tag: 'Insert', text: '        fs::write(&blob_path, data).await?;' }],
              },
              {
                tag: 'Insert',
                content: '        Ok(hash)',
                old_line_no: null,
                new_line_no: 29,
                word_tokens: [{ tag: 'Insert', text: '        Ok(hash)' }],
              },
              {
                tag: 'Insert',
                content: '    }',
                old_line_no: null,
                new_line_no: 30,
                word_tokens: [{ tag: 'Insert', text: '    }' }],
              },
              {
                tag: 'Equal',
                content: '}',
                old_line_no: 22,
                new_line_no: 31,
                word_tokens: [],
              },
            ],
          },
        ],
      },
    },
    {
      path: 'crates/agent_vcs_core/src/workspace.rs',
      unified_diff_hash: 'hash2',
      diff_content: `--- a/crates/agent_vcs_core/src/workspace.rs\n+++ b/crates/agent_vcs_core/src/workspace.rs\n@@ -10,3 +10,12 @@\n+use crate::blob::BlobStore;\n`,
      structural_diff: {
        file_path: 'crates/agent_vcs_core/src/workspace.rs',
        additions: 12,
        deletions: 2,
        hunks: [
          {
            header: 'Inject blob store into workspace engine',
            old_start: 10,
            old_lines: 4,
            new_start: 10,
            new_lines: 8,
            lines: [
              {
                tag: 'Equal',
                content: 'pub struct WorkspaceManager {',
                old_line_no: 10,
                new_line_no: 10,
                word_tokens: [],
              },
              {
                tag: 'Insert',
                content: '    pub blob_store: BlobStore,',
                old_line_no: null,
                new_line_no: 11,
                word_tokens: [{ tag: 'Insert', text: '    pub blob_store: BlobStore,' }],
              },
              {
                tag: 'Equal',
                content: '    pub repo_root: PathBuf,',
                old_line_no: 11,
                new_line_no: 12,
                word_tokens: [],
              },
              {
                tag: 'Delete',
                content: '    // temp storage pointer',
                old_line_no: 12,
                new_line_no: null,
                word_tokens: [{ tag: 'Delete', text: '    // temp storage pointer' }],
              },
            ],
          },
        ],
      },
    },
    {
      path: 'crates/agent_vcs_core/src/lib.rs',
      unified_diff_hash: 'hash3',
      diff_content: `--- a/crates/agent_vcs_core/src/lib.rs\n+++ b/crates/agent_vcs_core/src/lib.rs\n@@ -4,2 +4,3 @@\n+pub mod blob;\n`,
      structural_diff: {
        file_path: 'crates/agent_vcs_core/src/lib.rs',
        additions: 1,
        deletions: 0,
        hunks: [
          {
            header: 'Export blob module',
            old_start: 4,
            old_lines: 2,
            new_start: 4,
            new_lines: 3,
            lines: [
              {
                tag: 'Equal',
                content: 'pub mod workspace;',
                old_line_no: 4,
                new_line_no: 4,
                word_tokens: [],
              },
              {
                tag: 'Insert',
                content: 'pub mod blob;',
                old_line_no: null,
                new_line_no: 5,
                word_tokens: [{ tag: 'Insert', text: 'pub mod blob;' }],
              },
            ],
          },
        ],
      },
    },
  ],
};

export const INITIAL_THREADS: ReviewThread[] = [
  {
    id: 'thread-1',
    filePath: 'crates/agent_vcs_core/src/blob.rs',
    lineNo: 24,
    resolved: false,
    comments: [
      {
        id: 'c1',
        author: 'Senior Gatekeeper',
        avatarText: 'SG',
        role: 'Reviewer',
        timestamp: '15 mins ago',
        body: 'Looks clean. The two-byte directory fanout (`&hash[..2]`) prevents inode exhaustion on large repos. Approved from my side.',
      },
    ],
  },
];
