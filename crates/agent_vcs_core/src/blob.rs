use anyhow::{Context, Result};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::fs;

/// Content-addressable storage for prompt history, intermediate reasoning, tool calls, and diff patches.
#[derive(Debug, Clone)]
pub struct BlobStore {
    base_path: PathBuf,
}

impl BlobStore {
    pub fn new(repo_root: &Path) -> Self {
        Self {
            base_path: repo_root.join(".agent_vcs").join("blobs"),
        }
    }

    /// Calculates SHA-256 digest of data and stores it in the blob store.
    /// Returns hexadecimal SHA-256 hash string.
    pub async fn put_blob(&self, data: &[u8]) -> Result<String> {
        let hash = format!("{:x}", Sha256::digest(data));
        if hash.len() < 2 {
            anyhow::bail!("Generated hash is too short");
        }
        let blob_dir = self.base_path.join(&hash[..2]);
        let blob_path = blob_dir.join(&hash[2..]);

        if !blob_path.exists() {
            fs::create_dir_all(&blob_dir)
                .await
                .with_context(|| format!("Failed to create blob dir {:?}", blob_dir))?;
            fs::write(&blob_path, data)
                .await
                .with_context(|| format!("Failed to write blob file {:?}", blob_path))?;
        }

        Ok(hash)
    }

    /// Synchronous variant of put_blob for non-async contexts.
    pub fn put_blob_sync(&self, data: &[u8]) -> Result<String> {
        let hash = format!("{:x}", Sha256::digest(data));
        if hash.len() < 2 {
            anyhow::bail!("Generated hash is too short");
        }
        let blob_dir = self.base_path.join(&hash[..2]);
        let blob_path = blob_dir.join(&hash[2..]);

        if !blob_path.exists() {
            std::fs::create_dir_all(&blob_dir)?;
            std::fs::write(&blob_path, data)?;
        }

        Ok(hash)
    }

    /// Retrieves raw blob bytes given a SHA-256 hash string.
    pub async fn get_blob(&self, hash: &str) -> Result<Vec<u8>> {
        if hash.len() < 2 {
            anyhow::bail!("Invalid blob hash string: {}", hash);
        }
        let blob_path = self.base_path.join(&hash[..2]).join(&hash[2..]);
        let data = fs::read(&blob_path)
            .await
            .with_context(|| format!("Failed to read blob {}", hash))?;
        Ok(data)
    }

    /// Synchronous variant of get_blob.
    pub fn get_blob_sync(&self, hash: &str) -> Result<Vec<u8>> {
        if hash.len() < 2 {
            anyhow::bail!("Invalid blob hash string: {}", hash);
        }
        let blob_path = self.base_path.join(&hash[..2]).join(&hash[2..]);
        let data = std::fs::read(&blob_path)
            .with_context(|| format!("Failed to read blob {}", hash))?;
        Ok(data)
    }

    /// Stores string content as BLOB.
    pub async fn put_str(&self, text: &str) -> Result<String> {
        self.put_blob(text.as_bytes()).await
    }

    /// Retrieves string content from BLOB.
    pub async fn get_str(&self, hash: &str) -> Result<String> {
        let bytes = self.get_blob(hash).await?;
        String::from_utf8(bytes).with_context(|| format!("Blob {} is not valid UTF-8", hash))
    }

    /// Checks if a blob exists in the store.
    pub fn has_blob(&self, hash: &str) -> bool {
        if hash.len() < 2 {
            return false;
        }
        self.base_path.join(&hash[..2]).join(&hash[2..]).exists()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_blob_store_roundtrip() {
        let temp_dir = TempDir::new().unwrap();
        let store = BlobStore::new(temp_dir.path());

        let content = "Hello, Agent VCS!";
        let hash = store.put_str(content).await.unwrap();

        assert_eq!(hash.len(), 64);
        assert!(store.has_blob(&hash));

        let retrieved = store.get_str(&hash).await.unwrap();
        assert_eq!(retrieved, content);
    }
}
