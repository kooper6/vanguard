import React, { useState } from 'react';
import { Plus } from 'lucide-react';
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

interface SplitRowPair {
  left: DiffLine | null;
  right: DiffLine | null;
}

export const SplitDiffViewer: React.FC<Props> = ({
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
    return (
      <div className="gl-empty-box">
        Structured hunks not available for side-by-side view. Switch to inline view.
      </div>
    );
  }

  return (
    <div className="gl-split-diff-container">
      {structural_diff.hunks.map((hunk, hunkIdx) => {
        const pairs: SplitRowPair[] = [];
        const lines = hunk.lines;
        let i = 0;

        while (i < lines.length) {
          const line = lines[i];

          if (line.tag === 'Equal') {
            pairs.push({ left: line, right: line });
            i++;
          } else if (line.tag === 'Delete') {
            const deletes: DiffLine[] = [];
            while (i < lines.length && lines[i].tag === 'Delete') {
              deletes.push(lines[i]);
              i++;
            }
            const inserts: DiffLine[] = [];
            while (i < lines.length && lines[i].tag === 'Insert') {
              inserts.push(lines[i]);
              i++;
            }

            const maxLen = Math.max(deletes.length, inserts.length);
            for (let j = 0; j < maxLen; j++) {
              pairs.push({
                left: deletes[j] || null,
                right: inserts[j] || null,
              });
            }
          } else if (line.tag === 'Insert') {
            pairs.push({ left: null, right: line });
            i++;
          }
        }

        return (
          <div key={hunkIdx} className="gl-split-hunk-block">
            <div className="gl-diff-hunk-row split-hunk-header">
              <span className="gl-hunk-tag">
                @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
              </span>
              {hunk.header && <span className="gl-hunk-header-code"> {hunk.header}</span>}
            </div>

            <div className="gl-split-table-wrapper">
              <table className="gl-split-table">
                <tbody>
                  {pairs.map((pair, pIdx) => {
                    const left = pair.left;
                    const right = pair.right;
                    const relevantLineNo = right?.new_line_no ?? left?.old_line_no ?? pIdx;

                    const lineThreads = threads.filter(
                      (t) => t.filePath === patch.path && t.lineNo === relevantLineNo
                    );

                    return (
                      <React.Fragment key={pIdx}>
                        <tr className="gl-split-row">
                          {/* Left Column (Old / Deletion) */}
                          <td className={`gl-line-num gl-line-old ${left?.tag === 'Delete' ? 'delete' : ''}`}>
                            {left?.old_line_no ?? ''}
                          </td>
                          <td className={`gl-split-content-cell ${left?.tag === 'Delete' ? 'gl-diff-delete' : left ? 'gl-diff-equal' : 'gl-diff-empty'}`}>
                            {left && (
                              <div className="gl-split-code-line">
                                <span className="gl-sign">{left.tag === 'Delete' ? '-' : ' '}</span>
                                <span className="gl-line-code">{renderContent(left)}</span>
                              </div>
                            )}
                          </td>

                          {/* Right Column (New / Addition) */}
                          <td className={`gl-line-num gl-line-new ${right?.tag === 'Insert' ? 'insert' : ''}`}>
                            {right?.new_line_no ?? ''}
                          </td>
                          <td className={`gl-split-content-cell ${right?.tag === 'Insert' ? 'gl-diff-insert' : right ? 'gl-diff-equal' : 'gl-diff-empty'}`}>
                            {right && (
                              <div className="gl-split-code-line">
                                <button
                                  className="gl-gutter-add-btn"
                                  title="Add inline review note"
                                  onClick={() => handleStartComment(relevantLineNo)}
                                >
                                  <Plus size={11} />
                                </button>
                                <span className="gl-sign">{right.tag === 'Insert' ? '+' : ' '}</span>
                                <span className="gl-line-code">{renderContent(right)}</span>
                              </div>
                            )}
                          </td>
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

                        {activeCommentLine === relevantLineNo && (
                          <tr className="gl-diff-thread-row">
                            <td colSpan={4} className="gl-diff-thread-cell">
                              <div className="gl-inline-thread new-comment-box">
                                <div className="gl-comment-author-bar">
                                  <span className="gl-author-name">
                                    Review Note on line {relevantLineNo}
                                  </span>
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
                                    onClick={() => handleSaveComment(relevantLineNo)}
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
          </div>
        );
      })}
    </div>
  );
};
