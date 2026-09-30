use crate::blob::BlobStore;
use crate::dag::{AgentExecutionNode, DagStore, FilePatch, NodeStatus};
use crate::diff::{parse_unified_diff, StructuralDiff};
use crate::promotion::PromotionBridge;
use crate::workspace::ShadowWorkspace;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetailedFilePatch {
    pub path: String,
    pub unified_diff_hash: String,
    pub diff_content: String,
    pub structural_diff: StructuralDiff,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeDetails {
    pub node: AgentExecutionNode,
    pub prompt: String,
    pub reasoning: String,
    pub tool_calls: String,
    pub patches: Vec<DetailedFilePatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineStatus {
    pub head_node_id: Option<String>,
    pub head_status: Option<NodeStatus>,
    pub head_prompt: Option<String>,
    pub total_nodes: usize,
    pub pending_nodes: usize,
    pub shadow_files: Vec<String>,
}

pub struct VcsEngine {
    repo_root: PathBuf,
    blob_store: BlobStore,
    dag_store: DagStore,
    shadow_workspace: ShadowWorkspace,
}

impl VcsEngine {
    pub fn new(repo_root: &Path) -> Result<Self> {
        let blob_store = BlobStore::new(repo_root);
        let dag_store = DagStore::open(repo_root)?;
        let shadow_workspace = ShadowWorkspace::new(repo_root);
        shadow_workspace.ensure_dir()?;

        Ok(Self {
            repo_root: repo_root.to_path_buf(),
            blob_store,
            dag_store,
            shadow_workspace,
        })
    }

    pub fn repo_root(&self) -> &Path {
        &self.repo_root
    }

    pub fn blob_store(&self) -> &BlobStore {
        &self.blob_store
    }

    pub fn dag_store(&self) -> &DagStore {
        &self.dag_store
    }

    pub fn shadow_workspace(&self) -> &ShadowWorkspace {
        &self.shadow_workspace
    }

    /// Records an execution checkpoint with prompt history, reasoning logs, tool calls, and file patches.
    /// Also applies unified diffs directly into `.agent_vcs/workspace/` so changes can be previewed live.
    pub async fn create_checkpoint(
        &self,
        prompt: &str,
        reasoning: &str,
        tool_calls: &str,
        patches: Vec<(String, String)>, // (path, unified_diff_content)
    ) -> Result<AgentExecutionNode> {
        let prompt_blob_hash = self.blob_store.put_str(prompt).await?;
        let reasoning_blob_hash = self.blob_store.put_str(reasoning).await?;
        let tool_calls_blob_hash = self.blob_store.put_str(tool_calls).await?;

        let mut file_patches = Vec::new();
        for (path, diff) in &patches {
            let diff_hash = self.blob_store.put_str(diff).await?;
            file_patches.push(FilePatch {
                path: path.clone(),
                unified_diff_hash: diff_hash,
            });

            // Apply directly into virtual shadow workspace
            if let Err(e) = self.shadow_workspace.apply_patch(&self.repo_root, path, diff) {
                tracing::warn!("Failed to apply patch to shadow workspace {}: {:?}", path, e);
            }
        }

        let parent_id = self.dag_store.get_head()?;
        let timestamp_utc = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let node_id_input = format!(
            "{}:{}:{}",
            parent_id.as_deref().unwrap_or("root"),
            prompt_blob_hash,
            timestamp_utc
        );
        let node_id = self.blob_store.put_str(&node_id_input).await?;

        let node = AgentExecutionNode {
            node_id: node_id.clone(),
            parent_id,
            timestamp_utc,
            prompt_blob_hash,
            reasoning_blob_hash,
            tool_calls_blob_hash,
            file_patches,
            status: NodeStatus::PendingReview,
        };

        self.dag_store.insert_node(&node)?;
        self.dag_store.set_head(&node_id)?;

        Ok(node)
    }

    /// Checks out a target node ID: sets DAG HEAD, updates shadow workspace, and optionally applies to worktree.
    pub async fn checkout(&self, target_node_id: &str, apply_to_worktree: bool) -> Result<AgentExecutionNode> {
        let node = self
            .dag_store
            .get_node(target_node_id)?
            .with_context(|| format!("Target node {} not found", target_node_id))?;

        self.dag_store.set_head(&node.node_id)?;

        // Rebuild shadow workspace for this node
        self.shadow_workspace
            .checkout_node(&self.repo_root, &node, &self.blob_store)
            .await?;

        if apply_to_worktree {
            self.shadow_workspace.sync_to_repo(&self.repo_root)?;
        }

        Ok(node)
    }

    /// Rollbacks current shadow DAG head to target node_id
    pub fn rollback(&self, target_node_id: &str) -> Result<()> {
        let node = self
            .dag_store
            .get_node(target_node_id)?
            .with_context(|| format!("Target rollback node {} not found", target_node_id))?;

        self.dag_store.set_head(&node.node_id)?;
        Ok(())
    }

    /// Retrieves full node details including prompt, reasoning, and parsed structural diffs.
    pub async fn get_node_details(&self, node_id: &str) -> Result<NodeDetails> {
        let node = self
            .dag_store
            .get_node(node_id)?
            .with_context(|| format!("Node {} not found", node_id))?;

        let prompt = self.blob_store.get_str(&node.prompt_blob_hash).await.unwrap_or_default();
        let reasoning = self.blob_store.get_str(&node.reasoning_blob_hash).await.unwrap_or_default();
        let tool_calls = self.blob_store.get_str(&node.tool_calls_blob_hash).await.unwrap_or_default();

        let mut patches = Vec::new();
        for p in &node.file_patches {
            let diff_content = self.blob_store.get_str(&p.unified_diff_hash).await.unwrap_or_default();
            let structural_diff = parse_unified_diff(&p.path, &diff_content)
                .unwrap_or_else(|_| StructuralDiff {
                    file_path: p.path.clone(),
                    additions: 0,
                    deletions: 0,
                    hunks: Vec::new(),
                });

            patches.push(DetailedFilePatch {
                path: p.path.clone(),
                unified_diff_hash: p.unified_diff_hash.clone(),
                diff_content,
                structural_diff,
            });
        }

        Ok(NodeDetails {
            node,
            prompt,
            reasoning,
            tool_calls,
            patches,
        })
    }

    /// Inspects the current engine status.
    pub async fn status(&self) -> Result<EngineStatus> {
        let head_id = self.dag_store.get_head()?;
        let all_nodes = self.dag_store.list_nodes()?;

        let mut head_status = None;
        let mut head_prompt = None;

        if let Some(ref hid) = head_id {
            if let Some(node) = self.dag_store.get_node(hid)? {
                head_status = Some(node.status);
                if let Ok(p) = self.blob_store.get_str(&node.prompt_blob_hash).await {
                    let first_line = p.lines().next().unwrap_or("").to_string();
                    head_prompt = Some(first_line);
                }
            }
        }

        let pending_count = all_nodes
            .iter()
            .filter(|n| n.status == NodeStatus::PendingReview)
            .count();

        let shadow_files = self.shadow_workspace.list_files().unwrap_or_default();

        Ok(EngineStatus {
            head_node_id: head_id,
            head_status,
            head_prompt,
            total_nodes: all_nodes.len(),
            pending_nodes: pending_count,
            shadow_files,
        })
    }

    /// Promotes an approved execution node into a native Git commit.
    /// Syncs shadow workspace changes into the working tree first.
    pub async fn promote_node(
        &self,
        node_id: &str,
        author_name: &str,
        author_email: &str,
    ) -> Result<String> {
        let node = self
            .dag_store
            .get_node(node_id)?
            .with_context(|| format!("Node {} not found for promotion", node_id))?;

        // 1. Sync shadow files to working tree so git2 can commit the changes
        self.shadow_workspace.sync_to_repo(&self.repo_root)?;

        // 2. Commit via Git promotion bridge
        let prompt = self.blob_store.get_str(&node.prompt_blob_hash).await?;
        let bridge = PromotionBridge::open(&self.repo_root)?;

        let commit_sha = bridge.promote_node_to_git(
            node_id,
            &prompt,
            author_name,
            author_email,
        )?;

        // 3. Mark node as Promoted
        self.dag_store
            .update_status(node_id, NodeStatus::Promoted)?;

        Ok(commit_sha)
    }
}
