import React, { useState } from 'react';
import { GitCommit, X, Check } from 'lucide-react';

interface Props {
  nodeId: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (authorName: string, authorEmail: string) => Promise<void>;
}

export const PromoteModal: React.FC<Props> = ({
  nodeId,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [authorName, setAuthorName] = useState('Agent VCS Gatekeeper');
  const [authorEmail, setAuthorEmail] = useState('gatekeeper@agent.vcs');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onConfirm(authorName, authorEmail);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const shortId = nodeId.length > 8 ? nodeId.slice(0, 8) : nodeId;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitCommit size={20} color="var(--color-promoted)" />
            Promote to Native Git Commit
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Approving execution node <strong style={{ color: '#818CF8' }}>#{shortId}</strong> will
              synchronize changes from the virtual shadow workspace into the primary Git working tree,
              stage modified files, and create a permanent Git commit with Gatekeeper audit trailers.
            </p>

            <div className="form-group">
              <label className="form-label">Author Name</label>
              <input
                type="text"
                className="form-input"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Author Email</label>
              <input
                type="email"
                className="form-input"
                value={authorEmail}
                onChange={(e) => setAuthorEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-success" disabled={loading}>
              {loading ? (
                'Promoting...'
              ) : (
                <>
                  <Check size={16} />
                  Approve & Commit
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
