use agent_vcs_core::{NodeStatus, VcsEngine};
use anyhow::Result;
use crossterm::{
    event::{self, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph, Wrap},
    Terminal,
};
use std::io;
use std::path::Path;

pub async fn run_tui_reviewer(repo_root: &Path) -> Result<()> {
    let engine = VcsEngine::new(repo_root)?;
    let mut nodes = engine.dag_store().list_nodes()?;

    if nodes.is_empty() {
        println!("No execution nodes found in .agent_vcs store.");
        return Ok(());
    }

    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut selected_index = 0;
    let mut diff_scroll: u16 = 0;
    let mut status_msg = String::from("p: Promote | r: Reject | c: Checkout shadow | j/k: Navigate | q: Quit");

    loop {
        let current_node = nodes.get(selected_index).cloned();

        let mut prompt_text = String::new();
        let mut reasoning_text = String::new();
        let mut diff_lines = Vec::new();

        if let Some(ref node) = current_node {
            if let Ok(p) = engine.blob_store().get_str(&node.prompt_blob_hash).await {
                prompt_text = p;
            }
            if let Ok(r) = engine.blob_store().get_str(&node.reasoning_blob_hash).await {
                reasoning_text = r;
            }

            for patch in &node.file_patches {
                diff_lines.push(Line::from(vec![
                    Span::styled(format!("📁 File: {}\n", patch.path), Style::default().add_modifier(Modifier::BOLD).fg(Color::Magenta))
                ]));

                if let Ok(d) = engine.blob_store().get_str(&patch.unified_diff_hash).await {
                    for l in d.lines() {
                        let styled_line = if l.starts_with('+') && !l.starts_with("+++") {
                            Line::from(vec![Span::styled(l.to_string(), Style::default().fg(Color::Green))])
                        } else if l.starts_with('-') && !l.starts_with("---") {
                            Line::from(vec![Span::styled(l.to_string(), Style::default().fg(Color::Red))])
                        } else if l.starts_with("@@") {
                            Line::from(vec![Span::styled(l.to_string(), Style::default().fg(Color::Cyan))])
                        } else if l.starts_with("---") || l.starts_with("+++") {
                            Line::from(vec![Span::styled(l.to_string(), Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD))])
                        } else {
                            Line::from(vec![Span::raw(l.to_string())])
                        };
                        diff_lines.push(styled_line);
                    }
                }
            }
        }

        terminal.draw(|f| {
            let chunks = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Percentage(30), Constraint::Percentage(70)].as_ref())
                .split(f.size());

            let right_chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([
                    Constraint::Percentage(35),
                    Constraint::Percentage(55),
                    Constraint::Length(3),
                ].as_ref())
                .split(chunks[1]);

            // Left Pane: Node List
            let items: Vec<ListItem> = nodes
                .iter()
                .map(|n| {
                    let status_str = match n.status {
                        NodeStatus::PendingReview => "[PENDING]",
                        NodeStatus::Promoted => "[PROMOTED]",
                        NodeStatus::Rejected => "[REJECTED]",
                    };
                    let style = match n.status {
                        NodeStatus::PendingReview => Style::default().fg(Color::Yellow),
                        NodeStatus::Promoted => Style::default().fg(Color::Green),
                        NodeStatus::Rejected => Style::default().fg(Color::Red),
                    };
                    let id_short = if n.node_id.len() > 8 { &n.node_id[..8] } else { &n.node_id };
                    ListItem::new(format!("{} Node: {}", status_str, id_short)).style(style)
                })
                .collect();

            let mut list_state = ListState::default();
            list_state.select(Some(selected_index));

            let list_widget = List::new(items)
                .block(Block::default().title(" Execution DAG Nodes ").borders(Borders::ALL))
                .highlight_style(Style::default().add_modifier(Modifier::BOLD).fg(Color::Cyan))
                .highlight_symbol("> ");

            f.render_stateful_widget(list_widget, chunks[0], &mut list_state);

            // Right Top: Prompt & Reasoning
            let info_content = format!(
                "PROMPT:\n{}\n\nREASONING TRACE:\n{}",
                prompt_text, reasoning_text
            );
            let info_widget = Paragraph::new(info_content)
                .block(Block::default().title(" Prompt & Reasoning ").borders(Borders::ALL))
                .wrap(Wrap { trim: true });

            f.render_widget(info_widget, right_chunks[0]);

            // Right Mid: Diff View with Syntax Colors and Scroll
            let diff_widget = Paragraph::new(diff_lines)
                .block(Block::default().title(" Patch Diffs (AST / Colorized) ").borders(Borders::ALL))
                .scroll((diff_scroll, 0))
                .wrap(Wrap { trim: false });

            f.render_widget(diff_widget, right_chunks[1]);

            // Right Bottom: Status Bar
            let status_widget = Paragraph::new(status_msg.clone())
                .block(Block::default().title(" Controls ").borders(Borders::ALL));

            f.render_widget(status_widget, right_chunks[2]);
        })?;

        if event::poll(std::time::Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                match key.code {
                    KeyCode::Char('q') | KeyCode::Esc => break,
                    KeyCode::Down | KeyCode::Char('j') => {
                        if !nodes.is_empty() {
                            selected_index = (selected_index + 1) % nodes.len();
                            diff_scroll = 0;
                        }
                    }
                    KeyCode::Up | KeyCode::Char('k') => {
                        if !nodes.is_empty() {
                            selected_index = if selected_index == 0 {
                                nodes.len() - 1
                            } else {
                                selected_index - 1
                            };
                            diff_scroll = 0;
                        }
                    }
                    KeyCode::Char('d') | KeyCode::PageDown => {
                        diff_scroll = diff_scroll.saturating_add(5);
                    }
                    KeyCode::Char('u') | KeyCode::PageUp => {
                        diff_scroll = diff_scroll.saturating_sub(5);
                    }
                    KeyCode::Char('c') => {
                        if let Some(ref node) = current_node {
                            match engine.checkout(&node.node_id, false).await {
                                Ok(_) => {
                                    status_msg = format!("Checked out node {} to shadow workspace", &node.node_id[..8]);
                                }
                                Err(err) => {
                                    status_msg = format!("Checkout error: {}", err);
                                }
                            }
                        }
                    }
                    KeyCode::Char('p') => {
                        if let Some(ref node) = current_node {
                            match engine.promote_node(&node.node_id, "Agent VCS Gatekeeper", "gatekeeper@agent.vcs").await {
                                Ok(sha) => {
                                    status_msg = format!("Successfully promoted node {} to git commit {}", &node.node_id[..8], &sha[..8]);
                                    nodes = engine.dag_store().list_nodes()?;
                                }
                                Err(err) => {
                                    status_msg = format!("Promotion error: {}", err);
                                }
                            }
                        }
                    }
                    KeyCode::Char('r') => {
                        if let Some(ref node) = current_node {
                            if let Ok(_) = engine.dag_store().update_status(&node.node_id, NodeStatus::Rejected) {
                                status_msg = format!("Node {} marked REJECTED", &node.node_id[..8]);
                                nodes = engine.dag_store().list_nodes()?;
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    Ok(())
}
