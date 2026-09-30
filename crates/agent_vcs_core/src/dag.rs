use anyhow::{Context, Result};
use rocksdb::DB;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum NodeStatus {
    PendingReview,
    Promoted,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FilePatch {
    pub path: String,
    pub unified_diff_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentExecutionNode {
    pub node_id: String,
    pub parent_id: Option<String>,
    pub timestamp_utc: u64,
    pub prompt_blob_hash: String,
    pub reasoning_blob_hash: String,
    pub tool_calls_blob_hash: String,
    pub file_patches: Vec<FilePatch>,
    pub status: NodeStatus,
}

#[derive(Clone)]
pub struct DagStore {
    db: Arc<DB>,
    _db_path: PathBuf,
}

impl DagStore {
    pub fn open(repo_root: &Path) -> Result<Self> {
        let db_path = repo_root.join(".agent_vcs").join("dag_db");
        std::fs::create_dir_all(&db_path)?;

        let mut opts = rocksdb::Options::default();
        opts.create_if_missing(true);

        let db = DB::open(&opts, &db_path)
            .with_context(|| format!("Failed to open RocksDB DAG store at {:?}", db_path))?;

        Ok(Self {
            db: Arc::new(db),
            _db_path: db_path,
        })
    }

    /// Inserts or updates an AgentExecutionNode in RocksDB
    pub fn insert_node(&self, node: &AgentExecutionNode) -> Result<()> {
        let key = format!("node:{}", node.node_id);
        let val = serde_json::to_vec(node)
            .with_context(|| format!("Failed to serialize node {}", node.node_id))?;
        self.db.put(key.as_bytes(), val)?;
        Ok(())
    }

    /// Retrieves an AgentExecutionNode by its node_id
    pub fn get_node(&self, node_id: &str) -> Result<Option<AgentExecutionNode>> {
        let key = format!("node:{}", node_id);
        if let Some(val) = self.db.get(key.as_bytes())? {
            let node: AgentExecutionNode = serde_json::from_slice(&val)?;
            Ok(Some(node))
        } else {
            Ok(None)
        }
    }

    /// Updates node status (e.g. PendingReview -> Promoted)
    pub fn update_status(&self, node_id: &str, status: NodeStatus) -> Result<()> {
        if let Some(mut node) = self.get_node(node_id)? {
            node.status = status;
            self.insert_node(&node)?;
            Ok(())
        } else {
            anyhow::bail!("Node {} not found", node_id);
        }
    }

    /// Set current active shadow DAG head node_id
    pub fn set_head(&self, node_id: &str) -> Result<()> {
        self.db.put(b"meta:head", node_id.as_bytes())?;
        Ok(())
    }

    /// Get current active shadow DAG head node_id
    pub fn get_head(&self) -> Result<Option<String>> {
        if let Some(val) = self.db.get(b"meta:head")? {
            Ok(Some(String::from_utf8(val)?))
        } else {
            Ok(None)
        }
    }

    /// Lists all execution nodes stored in DAG index
    pub fn list_nodes(&self) -> Result<Vec<AgentExecutionNode>> {
        let mut nodes = Vec::new();
        let iter = self.db.prefix_iterator(b"node:");

        for item in iter {
            let (key, val) = item?;
            let key_str = String::from_utf8_lossy(&key);
            if key_str.starts_with("node:") {
                let node: AgentExecutionNode = serde_json::from_slice(&val)?;
                nodes.push(node);
            }
        }

        // Sort chronologically by timestamp_utc
        nodes.sort_by_key(|n| n.timestamp_utc);
        Ok(nodes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_dag_store_operations() {
        let temp_dir = TempDir::new().unwrap();
        let dag = DagStore::open(temp_dir.path()).unwrap();

        let node = AgentExecutionNode {
            node_id: "node_123".to_string(),
            parent_id: None,
            timestamp_utc: 1000,
            prompt_blob_hash: "p_hash".to_string(),
            reasoning_blob_hash: "r_hash".to_string(),
            tool_calls_blob_hash: "t_hash".to_string(),
            file_patches: vec![FilePatch {
                path: "src/main.rs".to_string(),
                unified_diff_hash: "d_hash".to_string(),
            }],
            status: NodeStatus::PendingReview,
        };

        dag.insert_node(&node).unwrap();
        dag.set_head("node_123").unwrap();

        let retrieved = dag.get_node("node_123").unwrap().unwrap();
        assert_eq!(retrieved, node);
        assert_eq!(dag.get_head().unwrap(), Some("node_123".to_string()));

        dag.update_status("node_123", NodeStatus::Promoted).unwrap();
        let updated = dag.get_node("node_123").unwrap().unwrap();
        assert_eq!(updated.status, NodeStatus::Promoted);

        let list = dag.list_nodes().unwrap();
        assert_eq!(list.len(), 1);
    }
}
