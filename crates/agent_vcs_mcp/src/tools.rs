use agent_vcs_core::VcsEngine;
use serde_json::{json, Value};
use std::path::Path;

pub fn handle_list_tools() -> Value {
    json!({
        "tools": [
            {
                "name": "vcs_checkpoint",
                "description": "Create a shadow checkpoint for agent reasoning, prompt history, and patch diffs. Automatically syncs patches to .agent_vcs/workspace/",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "prompt": { "type": "string", "description": "The user or system prompt driving execution" },
                        "reasoning": { "type": "string", "description": "Raw LLM chain of thought reasoning trace" },
                        "tool_calls": { "type": "string", "description": "Serialized list or log of tool calls executed" },
                        "patches": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "path": { "type": "string" },
                                    "diff": { "type": "string" }
                                },
                                "required": ["path", "diff"]
                            }
                        }
                    },
                    "required": ["prompt", "reasoning", "tool_calls"]
                }
            },
            {
                "name": "vcs_status",
                "description": "Get current Agent VCS status: active HEAD node, pending nodes count, and modified shadow files",
                "inputSchema": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "vcs_diff",
                "description": "Inspect unified and structural diffs for an execution node or current HEAD",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "node_id": { "type": "string", "description": "Target execution node ID (optional, defaults to HEAD)" }
                    }
                }
            },
            {
                "name": "vcs_checkout",
                "description": "Checkout an execution node, syncing the virtual shadow workspace (.agent_vcs/workspace/)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "node_id": { "type": "string", "description": "Target execution node ID to checkout" },
                        "apply_to_worktree": { "type": "boolean", "description": "If true, also copies shadow files into the actual working directory" }
                    },
                    "required": ["node_id"]
                }
            },
            {
                "name": "vcs_rollback",
                "description": "Rollback current shadow execution head to a previous execution node ID",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "node_id": { "type": "string", "description": "Target execution node ID to reset head to" }
                    },
                    "required": ["node_id"]
                }
            },
            {
                "name": "vcs_request_promotion",
                "description": "Request human gatekeeper review and git commit promotion for an execution node",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "node_id": { "type": "string", "description": "Execution node ID to promote" }
                    },
                    "required": ["node_id"]
                }
            }
        ]
    })
}

pub async fn handle_call_tool(repo_root: &Path, params: &Value) -> anyhow::Result<Value> {
    let name = params
        .get("name")
        .and_then(|n| n.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing 'name' in tool call params"))?;

    let arguments = params.get("arguments").cloned().unwrap_or(json!({}));
    let engine = VcsEngine::new(repo_root)?;

    match name {
        "vcs_checkpoint" => {
            let prompt = arguments.get("prompt").and_then(|p| p.as_str()).unwrap_or("");
            let reasoning = arguments.get("reasoning").and_then(|r| r.as_str()).unwrap_or("");
            let tool_calls = arguments.get("tool_calls").and_then(|t| t.as_str()).unwrap_or("");

            let mut patches = Vec::new();
            if let Some(arr) = arguments.get("patches").and_then(|p| p.as_array()) {
                for item in arr {
                    let path = item.get("path").and_then(|p| p.as_str()).unwrap_or("");
                    let diff = item.get("diff").and_then(|d| d.as_str()).unwrap_or("");
                    if !path.is_empty() {
                        patches.push((path.to_string(), diff.to_string()));
                    }
                }
            }

            let node = engine
                .create_checkpoint(prompt, reasoning, tool_calls, patches)
                .await?;

            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!("Checkpoint created successfully. Node ID: {}\nPatches applied to virtual shadow workspace.", node.node_id)
                }],
                "node_id": node.node_id
            }))
        }

        "vcs_status" => {
            let status = engine.status().await?;
            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": serde_json::to_string_pretty(&status)?
                }],
                "status": status
            }))
        }

        "vcs_diff" => {
            let node_id = match arguments.get("node_id").and_then(|n| n.as_str()) {
                Some(id) => id.to_string(),
                None => engine.dag_store().get_head()?.unwrap_or_default(),
            };

            if node_id.is_empty() {
                anyhow::bail!("No target node specified and no HEAD node available");
            }

            let details = engine.get_node_details(&node_id).await?;
            let patches_summary: Vec<_> = details
                .patches
                .iter()
                .map(|p| {
                    json!({
                        "path": p.path,
                        "diff": p.diff_content,
                        "additions": p.structural_diff.additions,
                        "deletions": p.structural_diff.deletions,
                    })
                })
                .collect();

            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!("Diff for node {}:\nFiles changed: {}", node_id, details.patches.len())
                }],
                "node_id": node_id,
                "patches": patches_summary
            }))
        }

        "vcs_checkout" => {
            let node_id = arguments
                .get("node_id")
                .and_then(|n| n.as_str())
                .ok_or_else(|| anyhow::anyhow!("Missing node_id argument for vcs_checkout"))?;

            let apply_worktree = arguments
                .get("apply_to_worktree")
                .and_then(|b| b.as_bool())
                .unwrap_or(false);

            let node = engine.checkout(node_id, apply_worktree).await?;

            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!(
                        "Checked out node {}. Shadow workspace synced. Applied to worktree: {}",
                        node.node_id, apply_worktree
                    )
                }],
                "node_id": node.node_id
            }))
        }

        "vcs_rollback" => {
            let node_id = arguments
                .get("node_id")
                .and_then(|n| n.as_str())
                .ok_or_else(|| anyhow::anyhow!("Missing node_id argument for vcs_rollback"))?;

            engine.rollback(node_id)?;

            Ok(json!({
                "content": [{
                    "type": "text",
                    "text": format!("Rollback complete. Head set to node: {}", node_id)
                }]
            }))
        }

        "vcs_request_promotion" => {
            let node_id = arguments
                .get("node_id")
                .and_then(|n| n.as_str())
                .ok_or_else(|| anyhow::anyhow!("Missing node_id argument for vcs_request_promotion"))?;

            if let Some(_node) = engine.dag_store().get_node(node_id)? {
                Ok(json!({
                    "content": [{
                        "type": "text",
                        "text": format!("Promotion requested for node {}. Pending review by Human Gatekeeper.", node_id)
                    }],
                    "status": "PendingReview"
                }))
            } else {
                anyhow::bail!("Execution node {} not found", node_id);
            }
        }

        _ => Ok(json!({
            "isError": true,
            "content": [{
                "type": "text",
                "text": format!("Unknown tool name: {}", name)
            }]
        })),
    }
}
