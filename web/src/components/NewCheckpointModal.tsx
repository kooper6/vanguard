import React, { useState } from 'react';
import { BookmarkPlus, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    prompt: string;
    reasoning: string;
    tool_calls: string;
    files: string[];
  }) => Promise<void>;
}

export const NewCheckpointModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [prompt, setPrompt] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [toolCalls, setToolCalls] = useState('manual_web_checkpoint');
  const [filesInput, setFilesInput] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const files = filesInput
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    setLoading(true);
    try {
      await onConfirm({
        prompt: prompt.trim(),
        reasoning: reasoning.trim() || 'Manual checkpoint triggered via Web UI',
        tool_calls: toolCalls.trim(),
        files,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookmarkPlus size={20} color="var(--accent-primary)" />
            Create Execution Checkpoint
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Prompt / Goal Message</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="e.g., Refactor token verification logic and add unit tests"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">LLM Chain-of-Thought Reasoning Trace</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="e.g., Identified clock skew vulnerability in JWT expiry parser..."
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Changed Files (one relative path per line)</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="crates/agent_vcs_core/src/lib.rs"
                value={filesInput}
                onChange={(e) => setFilesInput(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Recording...' : 'Create Checkpoint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
