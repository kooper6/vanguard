use git2::{Repository, Signature};
use std::path::Path;

pub struct PromotionBridge {
    repo: Repository,
}

impl PromotionBridge {
    pub fn open(repo_path: &Path) -> Result<Self, git2::Error> {
        let repo = Repository::open(repo_path)?;
        Ok(Self { repo })
    }

    /// Appends the approved agent execution node as a native Git commit.
    /// Returns the hex string of the created Git commit SHA.
    pub fn promote_node_to_git(
        &self,
        node_id: &str,
        prompt: &str,
        author_name: &str,
        author_email: &str,
    ) -> Result<String, git2::Error> {
        let mut index = self.repo.index()?;

        // Stage all working directory changes applied from the shadow node
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
        index.write()?;

        let tree_id = index.write_tree()?;
        let tree = self.repo.find_tree(tree_id)?;

        let head_commit = match self.repo.head() {
            Ok(head_ref) => match head_ref.peel_to_commit() {
                Ok(commit) => Some(commit),
                Err(_) => None,
            },
            Err(_) => None,
        };

        let signature = Signature::now(author_name, author_email)?;

        let commit_message = format!(
            "feat(agent): {}\n\nAgent-VCS-Node: {}\nApproved-By: Human Gatekeeper",
            prompt, node_id
        );

        let parents: Vec<&git2::Commit> = match &head_commit {
            Some(commit) => vec![commit],
            None => vec![],
        };

        let commit_id = self.repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            &commit_message,
            &tree,
            &parents,
        )?;

        Ok(commit_id.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_git_promotion_bridge() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();
        
        // Initialize git repository
        let repo = Repository::init(repo_path).unwrap();
        
        // Write dummy file
        let file_path = repo_path.join("test.txt");
        std::fs::write(&file_path, "Agent VCS initial file").unwrap();

        let bridge = PromotionBridge::open(repo_path).unwrap();
        let commit_sha = bridge
            .promote_node_to_git(
                "node_test_001",
                "Implement feature X",
                "Agent VCS Gatekeeper",
                "gatekeeper@agent.vcs",
            )
            .unwrap();

        assert!(!commit_sha.is_empty());
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head.id().to_string(), commit_sha);
    }
}
