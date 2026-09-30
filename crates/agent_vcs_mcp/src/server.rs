use crate::tools::{handle_call_tool, handle_list_tools};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::Arc;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::UnixListener;

/// Runs the standard JSON-RPC MCP loop over an async reader and writer.
pub async fn process_mcp_session<R, W>(
    repo_root: &Path,
    mut reader: R,
    mut writer: W,
) -> anyhow::Result<()>
where
    R: AsyncBufRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut line = String::new();

    while reader.read_line(&mut line).await? > 0 {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            line.clear();
            continue;
        }

        if let Ok(request) = serde_json::from_str::<Value>(trimmed) {
            let id = request.get("id").cloned();
            let method = request.get("method").and_then(|m| m.as_str());

            if let Some(m) = method {
                let response = match m {
                    "initialize" => json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "protocolVersion": "2024-11-05",
                            "capabilities": {
                                "tools": {}
                            },
                            "serverInfo": {
                                "name": "agent-vcs-mcp",
                                "version": "0.1.0"
                            }
                        }
                    }),

                    "notifications/initialized" => {
                        // Handshake notification - no response required
                        line.clear();
                        continue;
                    }

                    "tools/list" => {
                        let tools_result = handle_list_tools();
                        json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": tools_result
                        })
                    }

                    "tools/call" => {
                        let params = request.get("params").cloned().unwrap_or(json!({}));
                        match handle_call_tool(repo_root, &params).await {
                            Ok(res) => json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "result": res
                            }),
                            Err(err) => json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "error": {
                                    "code": -32603,
                                    "message": err.to_string()
                                }
                            }),
                        }
                    }

                    _ => json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": {
                            "code": -32601,
                            "message": format!("Method not found: {}", m)
                        }
                    }),
                };

                let mut response_str = serde_json::to_string(&response)?;
                response_str.push('\n');
                writer.write_all(response_str.as_bytes()).await?;
                writer.flush().await?;
            }
        }

        line.clear();
    }

    Ok(())
}

/// Runs MCP server over standard I/O (stdin/stdout).
pub async fn run_mcp_loop(repo_root: &Path) -> anyhow::Result<()> {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();
    let reader = BufReader::new(stdin);
    process_mcp_session(repo_root, reader, stdout).await
}

/// Runs MCP server over a UNIX domain socket (e.g. `/tmp/agent_vcs.sock`).
pub async fn run_mcp_socket(repo_root: &Path, socket_path: &Path) -> anyhow::Result<()> {
    if socket_path.exists() {
        let _ = std::fs::remove_file(socket_path);
    }

    if let Some(parent) = socket_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let listener = UnixListener::bind(socket_path)?;
    tracing::info!("Agent VCS MCP listening on UNIX socket {:?}", socket_path);

    let repo_arc = Arc::new(repo_root.to_path_buf());

    loop {
        match listener.accept().await {
            Ok((stream, _addr)) => {
                let repo = repo_arc.clone();
                tokio::spawn(async move {
                    let (reader, writer) = stream.into_split();
                    let buf_reader = BufReader::new(reader);
                    if let Err(e) = process_mcp_session(repo.as_path(), buf_reader, writer).await {
                        tracing::error!("MCP session error: {:?}", e);
                    }
                });
            }
            Err(e) => {
                tracing::error!("Error accepting connection on UNIX socket: {:?}", e);
                break;
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::UnixStream;

    #[tokio::test]
    async fn test_mcp_unix_socket_transport() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_path_buf();
        let socket_path = temp_dir.path().join("test_agent_vcs.sock");

        let repo_clone = repo_path.clone();
        let sock_clone = socket_path.clone();

        // Spawn socket server
        let server_handle = tokio::spawn(async move {
            let _ = run_mcp_socket(&repo_clone, &sock_clone).await;
        });

        // Wait briefly for socket to bind
        let mut stream = None;
        for _ in 0..20 {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            if let Ok(s) = UnixStream::connect(&socket_path).await {
                stream = Some(s);
                break;
            }
        }

        let stream = stream.expect("Failed to connect to UNIX socket");
        let (reader, mut writer) = stream.into_split();
        let mut buf_reader = BufReader::new(reader);

        // 1. Test initialize
        let init_req = serde_json::to_string(&json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize"
        })).unwrap() + "\n";

        writer.write_all(init_req.as_bytes()).await.unwrap();
        writer.flush().await.unwrap();

        let mut line = String::new();
        buf_reader.read_line(&mut line).await.unwrap();
        let resp: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(resp["id"], 1);
        assert_eq!(resp["result"]["serverInfo"]["name"], "agent-vcs-mcp");

        // 2. Test tools/list
        line.clear();
        let list_req = serde_json::to_string(&json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list"
        })).unwrap() + "\n";

        writer.write_all(list_req.as_bytes()).await.unwrap();
        writer.flush().await.unwrap();

        buf_reader.read_line(&mut line).await.unwrap();
        let list_resp: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(list_resp["id"], 2);
        let tools = list_resp["result"]["tools"].as_array().unwrap();
        assert!(tools.iter().any(|t| t["name"] == "vcs_checkpoint"));
        assert!(tools.iter().any(|t| t["name"] == "vcs_status"));

        server_handle.abort();
    }
}
