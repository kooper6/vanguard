import React, { useState } from 'react';
import { MessageSquare, Check, CornerDownRight, Trash2 } from 'lucide-react';

export interface CommentItem {
  id: string;
  author: string;
  avatarText: string;
  timestamp: string;
  body: string;
  role?: string;
}

export interface ReviewThread {
  id: string;
  filePath: string;
  lineNo: number;
  comments: CommentItem[];
  resolved: boolean;
}

interface Props {
  thread: ReviewThread;
  onAddReply: (threadId: string, replyText: string) => void;
  onToggleResolve: (threadId: string) => void;
  onDeleteComment?: (threadId: string, commentId: string) => void;
}

export const InlineCommentThread: React.FC<Props> = ({
  thread,
  onAddReply,
  onToggleResolve,
  onDeleteComment,
}) => {
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  const handleSend = () => {
    if (!replyText.trim()) return;
    onAddReply(thread.id, replyText.trim());
    setReplyText('');
    setIsReplying(false);
  };

  return (
    <div className={`gl-inline-thread ${thread.resolved ? 'resolved' : ''}`}>
      <div className="gl-thread-header">
        <div className="gl-thread-meta">
          <MessageSquare size={14} className="gl-thread-icon" />
          <span>Discussion on line {thread.lineNo}</span>
          {thread.resolved && (
            <span className="gl-badge gl-badge-success">Resolved</span>
          )}
        </div>
        <button
          className="gl-btn gl-btn-xs gl-btn-subtle"
          onClick={() => onToggleResolve(thread.id)}
        >
          <Check size={13} />
          {thread.resolved ? 'Reopen thread' : 'Resolve thread'}
        </button>
      </div>

      <div className="gl-thread-comments">
        {thread.comments.map((comment) => (
          <div key={comment.id} className="gl-comment-card">
            <div className="gl-comment-avatar">{comment.avatarText}</div>
            <div className="gl-comment-content">
              <div className="gl-comment-author-bar">
                <span className="gl-author-name">{comment.author}</span>
                {comment.role && (
                  <span className="gl-author-badge">{comment.role}</span>
                )}
                <span className="gl-comment-time">{comment.timestamp}</span>
                {onDeleteComment && (
                  <button
                    className="gl-btn-icon-subtle"
                    title="Delete note"
                    onClick={() => onDeleteComment(thread.id, comment.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              <div className="gl-comment-text">{comment.body}</div>
            </div>
          </div>
        ))}
      </div>

      {isReplying ? (
        <div className="gl-reply-form">
          <div className="gl-reply-tabs">
            <button
              className={`gl-tab-sm ${activeTab === 'write' ? 'active' : ''}`}
              onClick={() => setActiveTab('write')}
            >
              Write
            </button>
            <button
              className={`gl-tab-sm ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              Preview
            </button>
          </div>

          {activeTab === 'write' ? (
            <textarea
              className="gl-textarea gl-reply-textarea"
              rows={3}
              placeholder="Leave a comment or suggest a change..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              autoFocus
            />
          ) : (
            <div className="gl-preview-box">
              {replyText ? replyText : <em style={{ color: 'var(--gl-text-subtle)' }}>Nothing to preview</em>}
            </div>
          )}

          <div className="gl-reply-actions">
            <button
              className="gl-btn gl-btn-secondary gl-btn-sm"
              onClick={() => {
                setIsReplying(false);
                setReplyText('');
              }}
            >
              Cancel
            </button>
            <button
              className="gl-btn gl-btn-primary gl-btn-sm"
              onClick={handleSend}
              disabled={!replyText.trim()}
            >
              Comment
            </button>
          </div>
        </div>
      ) : (
        <div className="gl-reply-placeholder" onClick={() => setIsReplying(true)}>
          <CornerDownRight size={14} />
          <span>Reply to this discussion...</span>
        </div>
      )}
    </div>
  );
};
