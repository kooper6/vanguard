mod tui;

use agent_vcs_core::{compute_unified_diff, NodeStatus, VcsEngine};
use clap::{Parser, Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(name = "agent-vcs")]
#[command(
    about = "High-performance Agent VCS engine & Git gatekeeper",
    long_about = "A Git-like version control system designed specifically for AI agent execution loops, featuring content-addressable storage, execution DAG, virtual shadow workspace, and native Git promotion bridge."
)]
struct Cli {
    /// Path to target repository root directory (defaults to current working directory)
    #[arg(short, long, global = true)]
    repo: Option<PathBuf>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Clone, Copy, ValueEnum)]
enum Transport {
    Stdio,
    Socket,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NodeSummary {
    pub node_id: String,
    pub parent_id: Option<String>,
    pub timestamp_utc: u64,
    pub status: NodeStatus,
    pub is_head: bool,
    pub prompt: String,
    pub files_count: usize,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Subcommand)]
enum Commands {
    /// Show current VCS status, HEAD node, and shadow workspace files
    Status {
        /// Output status in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Inspect execution DAG graph log (like git log)
    Log {
        /// Display single-line compact view
        #[arg(long)]
        oneline: bool,

        /// Show diff statistics (added/deleted lines)
        #[arg(long)]
        stat: bool,

        /// Limit number of nodes displayed
        #[arg(short = 'n', long)]
        limit: Option<usize>,

        /// Output log in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Show unified and structural diffs for an execution node or HEAD
    Diff {
        /// Target node ID to inspect (defaults to current HEAD)
        node_id: Option<String>,

        /// Only show summary of changed files and line counts
        #[arg(long)]
        stat: bool,

        /// Output diff data in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Show full execution node details including prompt, CoT reasoning, tool calls, and diffs
    Show {
        /// Target execution node ID
        node_id: String,

        /// Output full details in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Checkout an execution node and update virtual shadow workspace
    Checkout {
        /// Target execution node ID
        node_id: String,

        /// Also sync changes from shadow workspace to actual working tree
        #[arg(short = 'w', long)]
        apply_to_worktree: bool,

        /// Output JSON response
        #[arg(long)]
        json: bool,
    },

    /// Reset HEAD pointer to target node ID
    Reset {
        /// Target execution node ID
        node_id: String,

        /// Hard reset: also synchronize shadow workspace
        #[arg(long)]
        hard: bool,

        /// Output JSON response
        #[arg(long)]
        json: bool,
    },

    /// Review and promote a shadow node into a native Git commit
    Promote {
        /// Execution node ID (defaults to current HEAD if omitted)
        node_id: Option<String>,

        #[arg(long, default_value = "Agent VCS Gatekeeper")]
        author_name: String,

        #[arg(long, default_value = "gatekeeper@agent.vcs")]
        author_email: String,

        /// Output JSON response
        #[arg(long)]
        json: bool,
    },

    /// Reject an execution node
    Reject {
        /// Execution node ID
        node_id: String,

        /// Output JSON response
        #[arg(long)]
        json: bool,
    },

    /// Manually create a new execution checkpoint
    Checkpoint {
        /// The prompt or task message driving execution
        #[arg(short = 'm', long)]
        prompt: String,

        /// Reasoning trace or commit explanation
        #[arg(long, default_value = "Manual checkpoint via CLI")]
        reasoning: String,

        /// Tool calls log description
        #[arg(long, default_value = "cli_manual_edit")]
        tool_calls: String,

        /// Paths to changed files to include in checkpoint
        #[arg(short = 'f', long)]
        file: Vec<String>,

        /// Explicit file patch in format "path:::unified_diff"
        #[arg(long)]
        patch: Vec<String>,

        /// Output JSON response
        #[arg(long)]
        json: bool,
    },

    /// Start the MCP server process for agent integration (stdio or UNIX socket)
    ServeMcp {
        /// Transport protocol: stdio or socket
        #[arg(long, value_enum, default_value_t = Transport::Stdio)]
        transport: Transport,

        /// UNIX domain socket path when using socket transport
        #[arg(long, default_value = "/tmp/agent_vcs.sock")]
        socket: PathBuf,
    },

    /// Launch interactive terminal TUI review interface
    Review,

    /// Launch or open the Web UI for visual diff and DAG inspection
    Web {
        /// Port to run web server on
        #[arg(short = 'p', long, default_value = "3000")]
        port: u16,

        /// Open web browser automatically
        #[arg(long)]
        open: bool,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    let repo_root = cli
        .repo
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    match cli.command {
        Commands::Status { json } => {
            cmd_status(&repo_root, json).await?;
        }

        Commands::Log { oneline, stat, limit, json } => {
            cmd_log(&repo_root, oneline, stat, limit, json).await?;
        }

        Commands::Diff { node_id, stat, json } => {
            cmd_diff(&repo_root, node_id, stat, json).await?;
        }

        Commands::Show { node_id, json } => {
            cmd_show(&repo_root, &node_id, json).await?;
        }

        Commands::Checkout { node_id, apply_to_worktree, json } => {
            let engine = VcsEngine::new(&repo_root)?;
            let node = engine.checkout(&node_id, apply_to_worktree).await?;
            if json {
                println!("{}", serde_json::json!({
                    "success": true,
                    "node_id": node.node_id,
                    "applied_to_worktree": apply_to_worktree
                }));
            } else {
                println!("\x1b[32m✔ Checked out node {}\x1b[0m", node.node_id);
                println!("  Virtual shadow workspace (.agent_vcs/workspace/) updated.");
                if apply_to_worktree {
                    println!("  \x1b[33mChanges applied directly to working tree.\x1b[0m");
                }
            }
        }

        Commands::Reset { node_id, hard, json } => {
            let engine = VcsEngine::new(&repo_root)?;
            if hard {
                engine.checkout(&node_id, false).await?;
            } else {
                engine.rollback(&node_id)?;
            }
            if json {
                println!("{}", serde_json::json!({
                    "success": true,
                    "node_id": node_id,
                    "hard": hard
                }));
            } else {
                println!("\x1b[32m✔ HEAD reset to {}{}\x1b[0m", node_id, if hard { " (hard reset: shadow workspace synced)" } else { "" });
            }
        }

        Commands::Promote {
            node_id,
            author_name,
            author_email,
            json,
        } => {
            let engine = VcsEngine::new(&repo_root)?;
            let target_id = match node_id {
                Some(id) => id,
                None => engine.dag_store().get_head()?.unwrap_or_default(),
            };

            if target_id.is_empty() {
                if json {
                    println!("{}", serde_json::json!({ "success": false, "error": "No node specified and no HEAD node available to promote" }));
                } else {
                    eprintln!("\x1b[31mError: No node specified and no HEAD node available to promote.\x1b[0m");
                }
                std::process::exit(1);
            }

            if !json {
                println!("Promoting execution node {} to primary Git branch...", target_id);
            }
            match engine.promote_node(&target_id, &author_name, &author_email).await {
                Ok(commit_sha) => {
                    if json {
                        println!("{}", serde_json::json!({
                            "success": true,
                            "node_id": target_id,
                            "commit_sha": commit_sha
                        }));
                    } else {
                        println!("\x1b[32m✔ Successfully promoted node {} into native Git commit: {}\x1b[0m", target_id, commit_sha);
                    }
                }
                Err(err) => {
                    if json {
                        println!("{}", serde_json::json!({ "success": false, "error": err.to_string() }));
                    } else {
                        eprintln!("\x1b[31mFailed to promote node {}: {}\x1b[0m", target_id, err);
                    }
                    std::process::exit(1);
                }
            }
        }

        Commands::Reject { node_id, json } => {
            let engine = VcsEngine::new(&repo_root)?;
            engine.dag_store().update_status(&node_id, NodeStatus::Rejected)?;
            if json {
                println!("{}", serde_json::json!({
                    "success": true,
                    "node_id": node_id,
                    "status": "Rejected"
                }));
            } else {
                println!("\x1b[31m✔ Node {} marked as REJECTED\x1b[0m", node_id);
            }
        }

        Commands::Checkpoint {
            prompt,
            reasoning,
            tool_calls,
            file,
            patch,
            json,
        } => {
            cmd_checkpoint(&repo_root, &prompt, &reasoning, &tool_calls, file, patch, json).await?;
        }

        Commands::ServeMcp { transport, socket } => {
            match transport {
                Transport::Stdio => {
                    agent_vcs_mcp::run_mcp_loop(&repo_root).await?;
                }
                Transport::Socket => {
                    println!("Starting Agent VCS MCP over UNIX socket at {:?}", socket);
                    agent_vcs_mcp::run_mcp_socket(&repo_root, &socket).await?;
                }
            }
        }

        Commands::Review => {
            tui::run_tui_reviewer(&repo_root).await?;
        }

        Commands::Web { port, open } => {
            cmd_web(&repo_root, port, open).await?;
        }
    }

    Ok(())
}

async fn cmd_status(repo_root: &Path, json: bool) -> anyhow::Result<()> {
    let engine = VcsEngine::new(repo_root)?;
    let status = engine.status().await?;

    if json {
        println!("{}", serde_json::to_string_pretty(&status)?);
        return Ok(());
    }

    println!("\x1b[1;36m=== Agent VCS Status ===\x1b[0m");
    println!("Repository: \x1b[1m{}\x1b[0m", repo_root.display());

    match status.head_node_id {
        Some(ref hid) => {
            let short_id = if hid.len() > 10 { &hid[..10] } else { hid };
            let status_badge = match status.head_status {
                Some(NodeStatus::PendingReview) => "\x1b[33m[PENDING REVIEW]\x1b[0m",
                Some(NodeStatus::Promoted) => "\x1b[32m[PROMOTED]\x1b[0m",
                Some(NodeStatus::Rejected) => "\x1b[31m[REJECTED]\x1b[0m",
                None => "",
            };
            println!("HEAD Node:  \x1b[1m{}\x1b[0m ({}) {}", short_id, hid, status_badge);
            if let Some(ref p) = status.head_prompt {
                println!("Prompt:     \x1b[37m{}\x1b[0m", p);
            }
        }
        None => {
            println!("HEAD Node:  \x1b[2m(No checkpoints created yet)\x1b[0m");
        }
    }

    println!("Total DAG Nodes:     {}", status.total_nodes);
    println!("Nodes Pending Review: {}", if status.pending_nodes > 0 {
        format!("\x1b[33m{}\x1b[0m", status.pending_nodes)
    } else {
        "0".to_string()
    });

    println!("\n\x1b[1mVirtual Shadow Workspace (.agent_vcs/workspace/):\x1b[0m");
    if status.shadow_files.is_empty() {
        println!("  \x1b[2m(Clean - no modified shadow files)\x1b[0m");
    } else {
        for file in &status.shadow_files {
            println!("  \x1b[32mmodified:   {}\x1b[0m", file);
        }
    }

    Ok(())
}

async fn cmd_log(repo_root: &Path, oneline: bool, show_stat: bool, limit: Option<usize>, json: bool) -> anyhow::Result<()> {
    let engine = VcsEngine::new(repo_root)?;
    let mut nodes = engine.dag_store().list_nodes()?;

    if nodes.is_empty() {
        if json {
            println!("[]");
        } else {
            println!("No execution nodes found in .agent_vcs storage.");
        }
        return Ok(());
    }

    // Sort newest first for git-like log
    nodes.reverse();
    if let Some(lim) = limit {
        nodes.truncate(lim);
    }

    let head = engine.dag_store().get_head()?;

    if json {
        let mut summaries = Vec::new();
        for node in &nodes {
            let is_head = head.as_deref() == Some(&node.node_id);
            let prompt = engine
                .blob_store()
                .get_str(&node.prompt_blob_hash)
                .await
                .unwrap_or_default();

            let mut adds = 0;
            let mut dels = 0;
            for p in &node.file_patches {
                if let Ok(d) = engine.blob_store().get_str(&p.unified_diff_hash).await {
                    adds += d.lines().filter(|l| l.starts_with('+') && !l.starts_with("+++")).count();
                    dels += d.lines().filter(|l| l.starts_with('-') && !l.starts_with("---")).count();
                }
            }

            summaries.push(NodeSummary {
                node_id: node.node_id.clone(),
                parent_id: node.parent_id.clone(),
                timestamp_utc: node.timestamp_utc,
                status: node.status.clone(),
                is_head,
                prompt,
                files_count: node.file_patches.len(),
                additions: adds,
                deletions: dels,
            });
        }
        println!("{}", serde_json::to_string_pretty(&summaries)?);
        return Ok(());
    }

    for (idx, node) in nodes.iter().enumerate() {
        let is_head = head.as_deref() == Some(&node.node_id);
        let head_marker = if is_head { "\x1b[1;36m(HEAD -> shadow)\x1b[0m " } else { "" };
        let status_badge = match node.status {
            NodeStatus::PendingReview => "\x1b[33m[PENDING_REVIEW]\x1b[0m",
            NodeStatus::Promoted => "\x1b[32m[PROMOTED]\x1b[0m",
            NodeStatus::Rejected => "\x1b[31m[REJECTED]\x1b[0m",
        };

        let short_id = if node.node_id.len() > 8 { &node.node_id[..8] } else { &node.node_id };
        let prompt_first_line = engine
            .blob_store()
            .get_str(&node.prompt_blob_hash)
            .await
            .unwrap_or_default()
            .lines()
            .next()
            .unwrap_or("")
            .to_string();

        if oneline {
            let symbol = if is_head { "\x1b[1;36m*\x1b[0m" } else { "\x1b[2m*\x1b[0m" };
            println!(
                "{} \x1b[33m{}\x1b[0m {}{} - {}",
                symbol, short_id, head_marker, status_badge, prompt_first_line
            );
        } else {
            let symbol = if is_head { "\x1b[1;36m*\x1b[0m" } else { "*" };
            println!("{} \x1b[33mnode {}\x1b[0m {}{}", symbol, node.node_id, head_marker, status_badge);
            println!("| Parent:    {}", node.parent_id.as_deref().unwrap_or("root"));
            println!("| Timestamp: {} (UTC epoch)", node.timestamp_utc);
            println!("| Prompt:    \x1b[1m{}\x1b[0m", prompt_first_line);

            if show_stat || !node.file_patches.is_empty() {
                println!("| Files Changed ({}):", node.file_patches.len());
                for patch in &node.file_patches {
                    if show_stat {
                        if let Ok(d) = engine.blob_store().get_str(&patch.unified_diff_hash).await {
                            let adds = d.lines().filter(|l| l.starts_with('+') && !l.starts_with("+++")).count();
                            let dels = d.lines().filter(|l| l.starts_with('-') && !l.starts_with("---")).count();
                            println!("|   - {} \x1b[32m(+{})\x1b[0m \x1b[31m(-{})\x1b[0m", patch.path, adds, dels);
                        } else {
                            println!("|   - {}", patch.path);
                        }
                    } else {
                        println!("|   - {}", patch.path);
                    }
                }
            }

            if idx + 1 < nodes.len() {
                println!("|");
            }
        }
    }

    Ok(())
}

async fn cmd_diff(repo_root: &Path, node_id: Option<String>, stat_only: bool, json: bool) -> anyhow::Result<()> {
    let engine = VcsEngine::new(repo_root)?;
    let target_id = match node_id {
        Some(id) => id,
        None => engine.dag_store().get_head()?.unwrap_or_default(),
    };

    if target_id.is_empty() {
        if json {
            println!("[]");
        } else {
            eprintln!("No node specified and no HEAD node available to diff.");
        }
        return Ok(());
    }

    let details = engine.get_node_details(&target_id).await?;

    if json {
        println!("{}", serde_json::to_string_pretty(&details.patches)?);
        return Ok(());
    }

    println!("\x1b[1;36mDiff for Node:\x1b[0m \x1b[33m{}\x1b[0m", target_id);
    println!("Prompt: {}\n", details.prompt.lines().next().unwrap_or(""));

    if details.patches.is_empty() {
        println!("No file patches in this checkpoint.");
        return Ok(());
    }

    if stat_only {
        println!("Files changed: {}", details.patches.len());
        for p in &details.patches {
            println!(
                "  {} | +{} -{}",
                p.path,
                p.structural_diff.additions,
                p.structural_diff.deletions
            );
        }
        return Ok(());
    }

    for p in &details.patches {
        println!("\x1b[1;35m--- a/{}\x1b[0m", p.path);
        println!("\x1b[1;35m+++ b/{}\x1b[0m", p.path);

        for hunk in &p.structural_diff.hunks {
            let ctx = if !hunk.header.is_empty() {
                format!(" \x1b[2m{}\x1b[0m", hunk.header)
            } else {
                String::new()
            };
            println!(
                "\x1b[36m@@ -{},{} +{},{} @@{}\x1b[0m",
                hunk.old_start, hunk.old_lines, hunk.new_start, hunk.new_lines, ctx
            );

            for line in &hunk.lines {
                match line.tag {
                    agent_vcs_core::DiffLineTag::Insert => {
                        println!("\x1b[32m+{}\x1b[0m", line.content);
                    }
                    agent_vcs_core::DiffLineTag::Delete => {
                        println!("\x1b[31m-{}\x1b[0m", line.content);
                    }
                    agent_vcs_core::DiffLineTag::Equal => {
                        println!(" {}", line.content);
                    }
                }
            }
        }
        println!();
    }

    Ok(())
}

async fn cmd_show(repo_root: &Path, node_id: &str, json: bool) -> anyhow::Result<()> {
    let engine = VcsEngine::new(repo_root)?;
    let details = engine.get_node_details(node_id).await?;

    if json {
        println!("{}", serde_json::to_string_pretty(&details)?);
        return Ok(());
    }

    let status_str = match details.node.status {
        NodeStatus::PendingReview => "\x1b[33mPENDING REVIEW\x1b[0m",
        NodeStatus::Promoted => "\x1b[32mPROMOTED\x1b[0m",
        NodeStatus::Rejected => "\x1b[31mREJECTED\x1b[0m",
    };

    println!("\x1b[1mNode:\x1b[0m       \x1b[33m{}\x1b[0m", details.node.node_id);
    println!("\x1b[1mParent:\x1b[0m     {}", details.node.parent_id.as_deref().unwrap_or("root"));
    println!("\x1b[1mStatus:\x1b[0m     {}", status_str);
    println!("\x1b[1mTimestamp:\x1b[0m  {}", details.node.timestamp_utc);

    println!("\n\x1b[1;34m=== PROMPT ===\x1b[0m");
    println!("{}", details.prompt);

    if !details.reasoning.is_empty() {
        println!("\n\x1b[1;35m=== CHAIN-OF-THOUGHT REASONING ===\x1b[0m");
        println!("{}", details.reasoning);
    }

    if !details.tool_calls.is_empty() {
        println!("\n\x1b[1;36m=== TOOL CALLS TELEMETRY ===\x1b[0m");
        println!("{}", details.tool_calls);
    }

    println!("\n\x1b[1;32m=== FILE PATCHES ({}) ===\x1b[0m", details.patches.len());
    for p in &details.patches {
        println!("\x1b[1mFile: {}\x1b[0m (+{} -{})", p.path, p.structural_diff.additions, p.structural_diff.deletions);
        for hunk in &p.structural_diff.hunks {
            println!(
                "\x1b[36m@@ -{},{} +{},{} @@ {}\x1b[0m",
                hunk.old_start, hunk.old_lines, hunk.new_start, hunk.new_lines, hunk.header
            );
            for line in &hunk.lines {
                match line.tag {
                    agent_vcs_core::DiffLineTag::Insert => println!("\x1b[32m+{}\x1b[0m", line.content),
                    agent_vcs_core::DiffLineTag::Delete => println!("\x1b[31m-{}\x1b[0m", line.content),
                    agent_vcs_core::DiffLineTag::Equal => println!(" {}", line.content),
                }
            }
        }
        println!();
    }

    Ok(())
}

fn read_git_head_file(repo_root: &Path, rel_path: &str) -> Option<String> {
    let repo = git2::Repository::open(repo_root).ok()?;
    let head = repo.head().ok()?.peel_to_commit().ok()?;
    let tree = head.tree().ok()?;
    let entry = tree.get_path(Path::new(rel_path)).ok()?;
    let blob = repo.find_blob(entry.id()).ok()?;
    String::from_utf8(blob.content().to_vec()).ok()
}

async fn cmd_checkpoint(
    repo_root: &Path,
    prompt: &str,
    reasoning: &str,
    tool_calls: &str,
    files: Vec<String>,
    explicit_patches: Vec<String>,
    json: bool,
) -> anyhow::Result<()> {
    let engine = VcsEngine::new(repo_root)?;
    let mut patches = Vec::new();

    for p in &explicit_patches {
        if let Some((path, diff)) = p.split_once(":::") {
            patches.push((path.to_string(), diff.replace("\\n", "\n")));
        } else if let Some((path, diff)) = p.split_once(':') {
            patches.push((path.to_string(), diff.replace("\\n", "\n")));
        }
    }

    for file_path in &files {
        let full_path = repo_root.join(file_path);
        let new_content = if full_path.exists() {
            std::fs::read_to_string(&full_path).unwrap_or_default()
        } else {
            String::new()
        };

        // Old baseline is from shadow workspace or Git HEAD commit
        let old_content = match engine.shadow_workspace().read_file(file_path)? {
            Some(c) => c,
            None => read_git_head_file(repo_root, file_path).unwrap_or_default(),
        };

        let diff = compute_unified_diff(&old_content, &new_content, file_path);
        patches.push((file_path.clone(), diff));
    }

    let node = engine
        .create_checkpoint(prompt, reasoning, tool_calls, patches)
        .await?;

    if json {
        println!("{}", serde_json::to_string_pretty(&node)?);
    } else {
        println!("\x1b[32m✔ Checkpoint created successfully!\x1b[0m");
        println!("Node ID:  \x1b[1m{}\x1b[0m", node.node_id);
        println!("Files:    {}", node.file_patches.len());
        println!("Shadow:   Updated in .agent_vcs/workspace/");
        println!("Status:   PENDING REVIEW (run `agent-vcs review` or `agent-vcs promote` to commit)");
    }

    Ok(())
}

async fn cmd_web(repo_root: &Path, port: u16, open: bool) -> anyhow::Result<()> {
    let web_dir = repo_root.join("web");
    println!("\x1b[1;36m=== Launching Agent VCS Web UI ===\x1b[0m");
    println!("Target Repository: {}", repo_root.display());
    println!("Web UI Location:   {}", web_dir.display());

    let url = format!("http://localhost:{}", port);
    println!("\n\x1b[1;32mServer starting at: {}\x1b[0m", url);

    if open {
        #[cfg(target_os = "macos")]
        let _ = std::process::Command::new("open").arg(&url).spawn();
        #[cfg(target_os = "linux")]
        let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
    }

    // Launch npm run dev
    let mut cmd = tokio::process::Command::new("npm");
    cmd.current_dir(&web_dir)
        .arg("run")
        .arg("dev")
        .env("PORT", port.to_string())
        .env("REPO_ROOT", repo_root.to_string_lossy().to_string());

    let mut child = cmd.spawn()?;
    child.wait().await?;

    Ok(())
}
