use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use similar::TextDiff;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiffLineTag {
    Equal,
    Insert,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffWordToken {
    pub tag: DiffLineTag,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffLine {
    pub tag: DiffLineTag,
    pub content: String,
    pub old_line_no: Option<usize>,
    pub new_line_no: Option<usize>,
    pub word_tokens: Vec<DiffWordToken>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiffHunk {
    pub header: String, // e.g., enclosing function or context
    pub old_start: usize,
    pub old_lines: usize,
    pub new_start: usize,
    pub new_lines: usize,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StructuralDiff {
    pub file_path: String,
    pub additions: usize,
    pub deletions: usize,
    pub hunks: Vec<DiffHunk>,
}

/// Computes a standard unified diff between two text strings using the `similar` crate.
pub fn compute_unified_diff(old_text: &str, new_text: &str, file_path: &str) -> String {
    let diff = TextDiff::from_lines(old_text, new_text);
    diff.unified_diff()
        .header(&format!("a/{}", file_path), &format!("b/{}", file_path))
        .to_string()
}

/// Applies a unified diff string to an original text, producing the updated file content.
pub fn apply_unified_diff(original: &str, patch: &str) -> Result<String> {
    let original_lines: Vec<&str> = original.lines().collect();
    let mut result_lines: Vec<String> = Vec::new();
    let mut orig_idx = 0;

    let patch_lines: Vec<&str> = patch.lines().collect();
    let mut i = 0;

    // Skip file headers (--- and +++)
    while i < patch_lines.len() {
        let line = patch_lines[i];
        if line.starts_with("---") || line.starts_with("+++") {
            i += 1;
            continue;
        }
        if line.starts_with("@@") {
            break;
        }
        i += 1;
    }

    if i >= patch_lines.len() {
        // No hunks found. If patch is empty or only headers, return original.
        return Ok(original.to_string());
    }

    while i < patch_lines.len() {
        let header_line = patch_lines[i];
        if !header_line.starts_with("@@") {
            i += 1;
            continue;
        }

        // Parse hunk header: @@ -old_start,old_len +new_start,new_len @@
        let (old_start, _old_len) = parse_hunk_range(header_line)?;
        let target_idx = if old_start > 0 { old_start - 1 } else { 0 };

        // Copy unchanged lines from original up to target_idx
        while orig_idx < target_idx && orig_idx < original_lines.len() {
            result_lines.push(original_lines[orig_idx].to_string());
            orig_idx += 1;
        }

        i += 1;

        // Process hunk content lines
        while i < patch_lines.len() {
            let line = patch_lines[i];
            if line.starts_with("@@") {
                break;
            }

            if let Some(rest) = line.strip_prefix('+') {
                result_lines.push(rest.to_string());
            } else if let Some(_rest) = line.strip_prefix('-') {
                if orig_idx < original_lines.len() {
                    orig_idx += 1;
                }
            } else if let Some(rest) = line.strip_prefix(' ') {
                result_lines.push(rest.to_string());
                if orig_idx < original_lines.len() {
                    orig_idx += 1;
                }
            } else if line.is_empty() {
                // Empty context line
                if orig_idx < original_lines.len() {
                    result_lines.push(original_lines[orig_idx].to_string());
                    orig_idx += 1;
                } else {
                    result_lines.push(String::new());
                }
            } else if line.starts_with('\\') {
                // "\ No newline at end of file" -> ignore
            } else {
                // Unexpected line in hunk; treat as context
                result_lines.push(line.to_string());
                if orig_idx < original_lines.len() {
                    orig_idx += 1;
                }
            }

            i += 1;
        }
    }

    // Append any remaining original lines
    while orig_idx < original_lines.len() {
        result_lines.push(original_lines[orig_idx].to_string());
        orig_idx += 1;
    }

    let mut output = result_lines.join("\n");
    if !output.is_empty() {
        output.push('\n');
    }

    Ok(output)
}

/// Helper to parse `@@ -old_start,old_len +new_start,new_len @@`
fn parse_hunk_range(header: &str) -> Result<(usize, usize)> {
    let parts: Vec<&str> = header.split("@@").collect();
    if parts.len() < 2 {
        bail!("Invalid hunk header: {}", header);
    }
    let range_str = parts[1].trim();
    let sections: Vec<&str> = range_str.split_whitespace().collect();
    if sections.is_empty() {
        bail!("Invalid hunk range: {}", range_str);
    }

    let old_sec = sections[0].strip_prefix('-').unwrap_or(sections[0]);
    let old_parts: Vec<&str> = old_sec.split(',').collect();
    let old_start: usize = old_parts[0].parse().unwrap_or(1);
    let old_len: usize = if old_parts.len() > 1 {
        old_parts[1].parse().unwrap_or(1)
    } else {
        1
    };

    Ok((old_start, old_len))
}

/// Detects AST / structural context header for a given line (e.g. fn / class / def)
pub fn detect_structural_context(lines: &[&str], up_to_index: usize) -> String {
    for idx in (0..=up_to_index.min(lines.len().saturating_sub(1))).rev() {
        let line = lines[idx].trim();
        if line.starts_with("fn ")
            || line.starts_with("pub fn ")
            || line.starts_with("async fn ")
            || line.starts_with("pub async fn ")
            || line.starts_with("struct ")
            || line.starts_with("pub struct ")
            || line.starts_with("enum ")
            || line.starts_with("pub enum ")
            || line.starts_with("impl ")
            || line.starts_with("class ")
            || line.starts_with("def ")
            || line.starts_with("function ")
            || line.starts_with("export function ")
            || line.starts_with("export default ")
            || line.starts_with("type ")
            || line.starts_with("pub type ")
        {
            return line.chars().take(80).collect();
        }
    }
    String::new()
}

/// Analyzes two texts to produce a detailed StructuralDiff with line numbers and token highlights.
pub fn analyze_text_diff(file_path: &str, old_text: &str, new_text: &str) -> Result<StructuralDiff> {
    let diff_str = compute_unified_diff(old_text, new_text, file_path);
    let mut sdiff = parse_unified_diff(file_path, &diff_str)?;
    let old_lines: Vec<&str> = old_text.lines().collect();

    for hunk in &mut sdiff.hunks {
        if hunk.header.is_empty() {
            hunk.header = detect_structural_context(&old_lines, hunk.old_start);
        }
    }

    Ok(sdiff)
}

/// Parses an existing unified diff string into a StructuralDiff structure.
pub fn parse_unified_diff(file_path: &str, diff_content: &str) -> Result<StructuralDiff> {
    let mut additions = 0;
    let mut deletions = 0;
    let mut hunks = Vec::new();

    let lines: Vec<&str> = diff_content.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];
        if !line.starts_with("@@") {
            i += 1;
            continue;
        }

        // Hunk header: @@ -old_start,old_len +new_start,new_len @@ context
        let (old_start, old_len, new_start, new_len, context) = parse_full_hunk_header(line);
        let mut cur_old = old_start;
        let mut cur_new = new_start;
        let mut hunk_lines = Vec::new();

        i += 1;
        while i < lines.len() {
            let l = lines[i];
            if l.starts_with("@@") {
                break;
            }

            if let Some(content) = l.strip_prefix('+') {
                additions += 1;
                hunk_lines.push(DiffLine {
                    tag: DiffLineTag::Insert,
                    content: content.to_string(),
                    old_line_no: None,
                    new_line_no: Some(cur_new),
                    word_tokens: Vec::new(),
                });
                cur_new += 1;
            } else if let Some(content) = l.strip_prefix('-') {
                deletions += 1;
                hunk_lines.push(DiffLine {
                    tag: DiffLineTag::Delete,
                    content: content.to_string(),
                    old_line_no: Some(cur_old),
                    new_line_no: None,
                    word_tokens: Vec::new(),
                });
                cur_old += 1;
            } else if let Some(content) = l.strip_prefix(' ') {
                hunk_lines.push(DiffLine {
                    tag: DiffLineTag::Equal,
                    content: content.to_string(),
                    old_line_no: Some(cur_old),
                    new_line_no: Some(cur_new),
                    word_tokens: Vec::new(),
                });
                cur_old += 1;
                cur_new += 1;
            } else if l.is_empty() {
                hunk_lines.push(DiffLine {
                    tag: DiffLineTag::Equal,
                    content: String::new(),
                    old_line_no: Some(cur_old),
                    new_line_no: Some(cur_new),
                    word_tokens: Vec::new(),
                });
                cur_old += 1;
                cur_new += 1;
            }

            i += 1;
        }

        hunks.push(DiffHunk {
            header: context,
            old_start,
            old_lines: old_len,
            new_start,
            new_lines: new_len,
            lines: hunk_lines,
        });
    }

    Ok(StructuralDiff {
        file_path: file_path.to_string(),
        additions,
        deletions,
        hunks,
    })
}

fn parse_full_hunk_header(header: &str) -> (usize, usize, usize, usize, String) {
    let parts: Vec<&str> = header.split("@@").collect();
    let context = if parts.len() > 2 {
        parts[2].trim().to_string()
    } else {
        String::new()
    };

    let range_str = if parts.len() > 1 { parts[1].trim() } else { "" };
    let sections: Vec<&str> = range_str.split_whitespace().collect();

    let mut old_start = 1;
    let mut old_len = 1;
    let mut new_start = 1;
    let mut new_len = 1;

    if !sections.is_empty() {
        let old_sec = sections[0].strip_prefix('-').unwrap_or(sections[0]);
        let old_p: Vec<&str> = old_sec.split(',').collect();
        old_start = old_p[0].parse().unwrap_or(1);
        old_len = if old_p.len() > 1 {
            old_p[1].parse().unwrap_or(1)
        } else {
            1
        };
    }

    if sections.len() > 1 {
        let new_sec = sections[1].strip_prefix('+').unwrap_or(sections[1]);
        let new_p: Vec<&str> = new_sec.split(',').collect();
        new_start = new_p[0].parse().unwrap_or(1);
        new_len = if new_p.len() > 1 {
            new_p[1].parse().unwrap_or(1)
        } else {
            1
        };
    }

    (old_start, old_len, new_start, new_len, context)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_and_apply_unified_diff() {
        let original = "line1\nline2\nline3\n";
        let modified = "line1\nline2_modified\nline3\nline4\n";

        let diff = compute_unified_diff(original, modified, "test.txt");
        assert!(diff.contains("line2_modified"));

        let applied = apply_unified_diff(original, &diff).unwrap();
        assert_eq!(applied, modified);
    }

    #[test]
    fn test_apply_diff_new_file() {
        let original = "";
        let patch = "--- /dev/null\n+++ b/new_file.rs\n@@ -0,0 +1,2 @@\n+fn hello() {\n+}\n";
        let applied = apply_unified_diff(original, patch).unwrap();
        assert_eq!(applied, "fn hello() {\n}\n");
    }

    #[test]
    fn test_structural_diff_analysis() {
        let old = "pub fn calculate() -> u32 {\n    let a = 10;\n    a\n}\n";
        let new = "pub fn calculate() -> u32 {\n    let a = 20;\n    let b = 30;\n    a + b\n}\n";

        let sdiff = analyze_text_diff("calc.rs", old, new).unwrap();
        assert_eq!(sdiff.file_path, "calc.rs");
        assert!(sdiff.additions > 0);
        assert_eq!(sdiff.hunks.len(), 1);
        assert!(sdiff.hunks[0].header.contains("pub fn calculate"));
    }
}
