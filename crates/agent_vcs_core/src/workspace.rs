use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};

use crate::blob::BlobStore;
use crate::dag::AgentExecutionNode;
use crate::diff::apply_unified_diff;

/// Manages the virtual shadow workspace stored at `.agent_vcs/workspace/`.
/// Allows agents to apply diffs and preview changes live without polluting the primary working tree.
#[derive(Debug, Clone)]
pub struct ShadowWorkspace {
    workspace_dir: PathBuf,
}

impl ShadowWorkspace {
    pub fn new(repo_root: &Path) -> Self {
        Self {
            workspace_dir: repo_root.join(".agent_vcs").join("workspace"),
        }
    }

    pub fn workspace_dir(&self) -> &Path {
        &self.workspace_dir
    }

    /// Ensures the shadow workspace directory exists.
    pub fn ensure_dir(&self) -> Result<()> {
        if !self.workspace_dir.exists() {
            fs::create_dir_all(&self.workspace_dir)
                .with_context(|| format!("Failed to create shadow workspace at {:?}", self.workspace_dir))?;
        }
        Ok(())
    }

    /// Resolves the absolute path of a relative file inside the shadow workspace.
    pub fn shadow_file_path(&self, rel_path: &str) -> PathBuf {
        self.workspace_dir.join(rel_path)
    }

    /// Reads a file from the shadow workspace if it exists.
    pub fn read_file(&self, rel_path: &str) -> Result<Option<String>> {
        let p = self.shadow_file_path(rel_path);
        if p.exists() {
            let content = fs::read_to_string(&p)
                .with_context(|| format!("Failed to read shadow file {:?}", p))?;
            Ok(Some(content))
        } else {
            Ok(None)
        }
    }

    /// Applies a unified diff patch to a file in the shadow workspace.
    /// If the file does not exist in shadow, it reads the baseline from repo_root (or empty for new files).
    pub fn apply_patch(&self, repo_root: &Path, rel_path: &str, patch_diff: &str) -> Result<PathBuf> {
        self.ensure_dir()?;
        let target_path = self.shadow_file_path(rel_path);

        // Determine baseline content
        let original_content = if target_path.exists() {
            fs::read_to_string(&target_path)?
        } else {
            let repo_file = repo_root.join(rel_path);
            if repo_file.exists() {
                fs::read_to_string(&repo_file)?
            } else {
                String::new()
            }
        };

        let updated_content = apply_unified_diff(&original_content, patch_diff)
            .with_context(|| format!("Failed to apply patch to {}", rel_path))?;

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::write(&target_path, updated_content)
            .with_context(|| format!("Failed to write shadow file {:?}", target_path))?;

        Ok(target_path)
    }

    /// Synchronizes an execution node's file patches into the shadow workspace.
    pub async fn sync_node(
        &self,
        repo_root: &Path,
        node: &AgentExecutionNode,
        blob_store: &BlobStore,
    ) -> Result<()> {
        for patch in &node.file_patches {
            let diff_content = blob_store.get_str(&patch.unified_diff_hash).await?;
            self.apply_patch(repo_root, &patch.path, &diff_content)?;
        }
        Ok(())
    }

    /// Rebuilds the shadow workspace completely from the DAG up to a specific node.
    pub async fn checkout_node(
        &self,
        repo_root: &Path,
        node: &AgentExecutionNode,
        blob_store: &BlobStore,
    ) -> Result<()> {
        self.clean()?;
        self.sync_node(repo_root, node, blob_store).await?;
        Ok(())
    }

    /// Cleans/resets the shadow workspace directory.
    pub fn clean(&self) -> Result<()> {
        if self.workspace_dir.exists() {
            fs::remove_dir_all(&self.workspace_dir)?;
        }
        self.ensure_dir()?;
        Ok(())
    }

    /// Lists all relative paths in the shadow workspace.
    pub fn list_files(&self) -> Result<Vec<String>> {
        let mut files = Vec::new();
        if !self.workspace_dir.exists() {
            return Ok(files);
        }

        self.walk_dir(&self.workspace_dir, &mut files, "")?;
        files.sort();
        Ok(files)
    }

    fn walk_dir(&self, dir: &Path, files: &mut Vec<String>, prefix: &str) -> Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let rel_name = if prefix.is_empty() {
                name
            } else {
                format!("{}/{}", prefix, name)
            };

            if path.is_dir() {
                self.walk_dir(&path, files, &rel_name)?;
            } else {
                files.push(rel_name);
            }
        }
        Ok(())
    }

    /// Copies all files currently in the shadow workspace into repo_root (the real working directory).
    /// Used during promotion or explicit checkout to working tree.
    pub fn sync_to_repo(&self, repo_root: &Path) -> Result<Vec<String>> {
        let files = self.list_files()?;
        for file in &files {
            let shadow_path = self.shadow_file_path(file);
            let repo_path = repo_root.join(file);

            if let Some(parent) = repo_path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&shadow_path, &repo_path)
                .with_context(|| format!("Failed to copy {:?} to {:?}", shadow_path, repo_path))?;
        }
        Ok(files)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_shadow_workspace_patch_and_sync() {
        let temp_dir = TempDir::new().unwrap();
        let repo_root = temp_dir.path();

        // Create baseline file in repo
        let base_file = repo_root.join("src/lib.rs");
        fs::create_dir_all(base_file.parent().unwrap()).unwrap();
        fs::write(&base_file, "pub fn add(a: i32, b: i32) -> i32 {\n    a + b\n}\n").unwrap();

        let shadow = ShadowWorkspace::new(repo_root);
        let patch = "--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1,3 +1,4 @@\n pub fn add(a: i32, b: i32) -> i32 {\n+    println!(\"adding\");\n     a + b\n }\n";

        shadow.apply_patch(repo_root, "src/lib.rs", patch).unwrap();

        let shadow_content = shadow.read_file("src/lib.rs").unwrap().unwrap();
        assert!(shadow_content.contains("println!(\"adding\");"));

        // Baseline file in repo is still untouched
        let repo_content = fs::read_to_string(&base_file).unwrap();
        assert!(!repo_content.contains("println!(\"adding\");"));

        // Now sync to repo
        shadow.sync_to_repo(repo_root).unwrap();
        let synced_repo_content = fs::read_to_string(&base_file).unwrap();
        assert!(synced_repo_content.contains("println!(\"adding\");"));
    }
}
