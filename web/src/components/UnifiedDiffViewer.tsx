import React, { useState } from 'react';
import { Plus, CornerDownRight } from 'lucide-react';
import { DetailedFilePatch, DiffLine } from '../types';
import { InlineCommentThread, ReviewThread } from './InlineCommentThread';

interface Props {
  patch: DetailedFilePatch;
  threads: ReviewThread[];
  onAddComment: (filePath: string, lineNo: number, body: string) => void;
  onAddReply: (threadId: string, replyText: string) => void;
  onToggleResolve: (threadId: string) => void;
  onDeleteComment?: (threadId: string, commentId: string) => void;
}

export const UnifiedDiffViewer: React.FC<Props> = ({
  patch,
  threads,
  onAddComment,
  onAddReply,
  onToggleResolve,
  onDeleteComment,
}) => {
  const { structural_diff } = patch;
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null);
  const [newCommentText, setNewCommentText] = useState('');

  const handleStartComment = (lineNo: number) => {
    setActiveCommentLine(lineNo);
    setNewCommentText('');
  };

  const handleSaveComment = (lineNo: number) => {
    if (!newCommentText.trim()) return;
    onAddComment(patch.path, lineNo, newCommentText.trim());
    setActiveCommentLine(null);
    setNewCommentText('');
  };

  const renderContent = (line: DiffLine) => {
    if (line.word_tokens && line.word_tokens.length > 0) {
      return (
        <>
          {line.word_tokens.map((token, idx) => {
            const tokenClass =
              token.tag === 'Insert'
                ? 'gl-word-insert'
                : token.tag === 'Delete'
                ? 'gl-word-delete'
                : '';
            return (
              <span key={idx} className={tokenClass}>
                {token.text}
              </span>
            );
          })}
        </>
      );
    }
    return line.content;
  };

  if (!structural_diff.hunks || structural_diff.hunks.length === 0) {
    const rawLines = patch.diff_content.split('\n');
    return (
      <div className="gl-diff-table-wrapper">
        <table className="gl-diff-table">
          <tbody>
            {rawLines.map((line, idx) => {
              let rowClass = 'gl-diff-equal';
              let sign = ' ';
              if (line.startsWith('+') && !line.startsWith('+++')) {
                rowClass = 'gl-diff-insert';
                sign = '+';
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                rowClass = 'gl-diff-delete';
                sign = '-';
              } else if (line.startsWith('@@')) {
                return (
                  <tr key={idx} className="gl-diff-hunk-row">
                    <td colSpan={4} className="gl-diff-hunk-cell">
                      {line}
                    </td>
                  </tr>
                );
              }
              const lineNo = idx + 1;
              const lineThreads = threads.filter(
                (t) => t.filePath === patch.path && t.lineNo === lineNo
              );

              return (
                <React.Fragment key={idx}>
                  <tr className={`gl-diff-row ${rowClass}`}>
                    <td className="gl-line-num gl-line-old">{lineNo}</td>
                    <td className="gl-line-num gl-line-new">{lineNo}</td>
                    <td className="gl-line-gutter">
                      <button
                        className="gl-gutter-add-btn"
                        title="Add comment on this line"
                        onClick={() => handleStartComment(lineNo)}
                      >
                        <Plus size={11} />
                      </button>
                      <span className="gl-sign">{sign}</span>
                    </td>
                    <td className="gl-line-code">{line.slice(1) || line}</td>
                  </tr>

                  {lineThreads.map((thread) => (
                    <tr key={thread.id} className="gl-diff-thread-row">
                      <td colSpan={4} className="gl-diff-thread-cell">
                        <InlineCommentThread
                          thread={thread}
                          onAddReply={onAddReply}
                          onToggleResolve={onToggleResolve}
                          onDeleteComment={onDeleteComment}
                        />
                      </td>
                    </tr>
                  ))}

                  {activeCommentLine === lineNo && (
                    <tr className="gl-diff-thread-row">
                      <td colSpan={4} className="gl-diff-thread-cell">
                        <div className="gl-inline-thread new-comment-box">
                          <div className="gl-comment-author-bar">
                            <span className="gl-author-name">Add comment on line {lineNo}</span>
                          </div>
                          <textarea
                            className="gl-textarea gl-reply-textarea"
                            rows={3}
                            placeholder="Write a comment or review suggestion..."
                            value={newCommentText}
                            onChange={(e) => setNewCommentText(e.target.value)}
                            autoFocus
                          />
                          <div className="gl-reply-actions">
                            <button
                              className="gl-btn gl-btn-secondary gl-btn-sm"
                              onClick={() => setActiveCommentLine(null)}
                            >
                              Cancel
                            </button>
                            <button
                              className="gl-btn gl-btn-primary gl-btn-sm"
                              onClick={() => handleSaveComment(lineNo)}
                              disabled={!newCommentText.trim()}
                            >
                              Add Comment
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="gl-diff-table-wrapper">
      <table className="gl-diff-table">
        <tbody>
          {structural_diff.hunks.map((hunk, hunkIdx) => (
            <React.Fragment key={hunkIdx}>
              <tr className="gl-diff-hunk-row">
                <td colSpan={4} className="gl-diff-hunk-cell">
                  <span className="gl-hunk-tag">
                    @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
                  </span>
                  {hunk.header && <span className="gl-hunk-header-code"> {hunk.header}</span>}
                </td>
              </tr>

              {hunk.lines.map((line, lineIdx) => {
                const isInsert = line.tag === 'Insert';
                const isDelete = line.tag === 'Delete';
                const rowClass = isInsert
                  ? 'gl-diff-insert'
                  : isDelete
                  ? 'gl-diff-delete'
                  : 'gl-diff-equal';
                const sign = isInsert ? '+' : isDelete ? '-' : ' ';
                const currentLineNo = line.new_line_no ?? line.old_line_no ?? lineIdx + 1;

                const lineThreads = threads.filter(
                  (t) => t.filePath === patch.path && t.lineNo === currentLineNo
                );

                return (
                  <React.Fragment key={lineIdx}>
                    <tr className={`gl-diff-row ${rowClass}`}>
                      <td className="gl-line-num gl-line-old">{line.old_line_no ?? ''}</td>
                      <td className="gl-line-num gl-line-new">{line.new_line_no ?? ''}</td>
                      <td className="gl-line-gutter">
                        <button
                          className="gl-gutter-add-btn"
                          title="Add inline review note"
                          onClick={() => handleStartComment(currentLineNo)}
                        >
                          <Plus size={11} />
                        </button>
                        <span className="gl-sign">{sign}</span>
                      </td>
                      <td className="gl-line-code">{renderContent(line)}</td>
                    </tr>

                    {lineThreads.map((thread) => (
                      <tr key={thread.id} className="gl-diff-thread-row">
                        <td colSpan={4} className="gl-diff-thread-cell">
                          <InlineCommentThread
                            thread={thread}
                            onAddReply={onAddReply}
                            onToggleResolve={onToggleResolve}
                            onDeleteComment={onDeleteComment}
                          />
                        </td>
                      </tr>
                    ))}

                    {activeCommentLine === currentLineNo && (
                      <tr className="gl-diff-thread-row">
                        <td colSpan={4} className="gl-diff-thread-cell">
                          <div className="gl-inline-thread new-comment-box">
                            <div className="gl-comment-author-bar">
                              <span className="gl-author-name">
                                Review Note on line {currentLineNo}
                              </span>
                            </div>
                            <textarea
                              className="gl-textarea gl-reply-textarea"
                              rows={3}
                              placeholder="Write a comment or suggest a code change..."
                              value={newCommentText}
                              onChange={(e) => setNewCommentText(e.target.value)}
                              autoFocus
                            />
                            <div className="gl-reply-actions">
                              <button
                                className="gl-btn gl-btn-secondary gl-btn-sm"
                                onClick={() => setActiveCommentLine(null)}
                              >
                                Cancel
                              </button>
                              <button
                                className="gl-btn gl-btn-primary gl-btn-sm"
                                onClick={() => handleSaveComment(currentLineNo)}
                                disabled={!newCommentText.trim()}
                              >
                                Add Comment
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};
