use agent_vcs_core::{NodeStatus, VcsEngine};
use git2::Repository;
use tempfile::TempDir;

#[tokio::test]
async fn test_full_agent_vcs_lifecycle() {
    let temp_dir = TempDir::new().unwrap();
    let repo_path = temp_dir.path();

    // Initialize git repository
    let repo = Repository::init(repo_path).unwrap();
    
    // Create initial commit
    let file_path = repo_path.join("README.md");
    std::fs::write(&file_path, "# Initial Repo").unwrap();
    
    let mut index = repo.index().unwrap();
    index.add_path(std::path::Path::new("README.md")).unwrap();
    index.write().unwrap();
    let tree_id = index.write_tree().unwrap();
    let tree = repo.find_tree(tree_id).unwrap();
    let sig = repo.signature().unwrap();
    repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[]).unwrap();

    // Instantiate VCS Engine
    let engine = VcsEngine::new(repo_path).unwrap();

    // Step 1: Create Checkpoint
    let prompt = "Fix bug in authentication module";
    let reasoning = "Analyzing token validation routine; found edge case with expired tokens.";
    let tool_calls = "view_file('auth.rs') -> edit_file('auth.rs')";
    let patch = ("src/auth.rs".to_string(), "--- auth.rs\n+++ auth.rs\n@@ -1 +1 @@\n-old\n+new".to_string());

    let node = engine
        .create_checkpoint(prompt, reasoning, tool_calls, vec![patch])
        .await
        .unwrap();

    assert_eq!(node.status, NodeStatus::PendingReview);
    assert_eq!(engine.dag_store().get_head().unwrap(), Some(node.node_id.clone()));

    // Step 2: Query DAG store
    let nodes = engine.dag_store().list_nodes().unwrap();
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].node_id, node.node_id);

    // Step 3: Promote to Git
    let commit_sha = engine
        .promote_node(&node.node_id, "Human Reviewer", "reviewer@agent.vcs")
        .await
        .unwrap();

    assert!(!commit_sha.is_empty());

    let updated_node = engine.dag_store().get_node(&node.node_id).unwrap().unwrap();
    assert_eq!(updated_node.status, NodeStatus::Promoted);
}
