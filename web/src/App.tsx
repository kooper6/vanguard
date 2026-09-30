import React, { useEffect, useState, useMemo } from 'react';
import {
  GitPullRequest,
  GitBranch,
  GitCommit,
  RefreshCw,
  PlusCircle,
  FileCode,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Terminal,
  Layers,
  ArrowRight,
  Split,
  AlignLeft,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  ThumbsUp,
  MessageSquare,
  Copy,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Code2,
  ShieldCheck,
  Eye,
  ExternalLink,
  BookmarkPlus,
  FileText
} from 'lucide-react';
import { EngineStatus, NodeDetails, NodeSummary } from './types';
import {
  fetchStatus,
  fetchNodes,
  fetchNodeDetails,
  promoteNode,
  rejectNode,
  checkoutNode,
  createCheckpoint,
  fetchShadowFiles
} from './api';
import { UnifiedDiffViewer } from './components/UnifiedDiffViewer';
import { SplitDiffViewer } from './components/SplitDiffViewer';
import { GitLabFileTree } from './components/GitLabFileTree';
import { AgentContextDossier } from './components/AgentContextDossier';
import { PromoteModal } from './components/PromoteModal';
import { NewCheckpointModal } from './components/NewCheckpointModal';
import { ReviewThread } from './components/InlineCommentThread';
import { SAMPLE_NODES, SAMPLE_NODE_DETAILS, INITIAL_THREADS } from './sampleData';

export const App: React.FC = () => {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<NodeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'changes' | 'overview' | 'commits' | 'pipelines'>('changes');
  const [diffMode, setDiffMode] = useState<'unified' | 'split'>('unified');
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(true);

  // Review State
  const [viewedFiles, setViewedFiles] = useState<Record<string, boolean>>({});
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const [threads, setThreads] = useState<ReviewThread[]>(INITIAL_THREADS);
  const [isApproved, setIsApproved] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isCheckoutDropdownOpen, setIsCheckoutDropdownOpen] = useState(false);

  // Discussion reply in overview tab
  const [generalComment, setGeneralComment] = useState('');
  const [generalDiscussions, setGeneralDiscussions] = useState<
    Array<{ id: string; author: string; avatar: string; time: string; text: string; role?: string }>
  >([
    {
      id: 'g-1',
      author: 'Agent VCS',
      avatar: 'AV',
      role: 'Bot',
      time: '25 mins ago',
      text: 'Automated checkpoint generated: Implement content-addressable BlobStore for execution traces, diff patches, and tool calls. All test assertions passed.',
    },
    {
      id: 'g-2',
      author: 'Security & QA Reviewer',
      avatar: 'SR',
      role: 'Reviewer',
      time: '12 mins ago',
      text: 'Verified SHA-256 fanout directories and async Tokio IO boundary. Diff looks clean and ready for promotion into native Git tree.',
    },
  ]);

  // Modals & Toast
  const [isPromoteOpen, setIsPromoteOpen] = useState(false);
  const [isNewCheckpointOpen, setIsNewCheckpointOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [shadowFiles, setShadowFiles] = useState<string[]>([]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    showToast(`Copied ${label} to clipboard`);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const loadData = async (preserveSelected = true) => {
    try {
      setLoading(true);
      const [st, nds, sf] = await Promise.all([
        fetchStatus().catch(() => null),
        fetchNodes().catch(() => []),
        fetchShadowFiles().catch(() => []),
      ]);

      if (st) setStatus(st);
      if (sf) setShadowFiles(sf);

      const combinedNodes = nds && nds.length > 0 ? nds : SAMPLE_NODES;
      setNodes(combinedNodes);

      if (!preserveSelected || !selectedNodeId) {
        if (st?.head_node_id && combinedNodes.some((n) => n.node_id === st.head_node_id)) {
          setSelectedNodeId(st.head_node_id);
        } else if (combinedNodes.length > 0) {
          setSelectedNodeId(combinedNodes[0].node_id);
        }
      }
    } catch (err: any) {
      setNodes(SAMPLE_NODES);
      setSelectedNodeId(SAMPLE_NODES[0].node_id);
      setSelectedNodeDetails(SAMPLE_NODE_DETAILS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  // Fetch node details when selectedNodeId changes
  useEffect(() => {
    if (!selectedNodeId) {
      setSelectedNodeDetails(null);
      return;
    }

    if (selectedNodeId === SAMPLE_NODE_DETAILS.node.node_id) {
      setSelectedNodeDetails(SAMPLE_NODE_DETAILS);
      setSelectedFileIndex(0);
      return;
    }

    let isMounted = true;
    setDetailsLoading(true);
    fetchNodeDetails(selectedNodeId)
      .then((details) => {
        if (isMounted) {
          setSelectedNodeDetails(details);
          setSelectedFileIndex(0);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setSelectedNodeDetails(SAMPLE_NODE_DETAILS);
        }
      })
      .finally(() => {
        if (isMounted) setDetailsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedNodeId]);

  // Current active node summary
  const currentNodeSummary = useMemo(() => {
    return nodes.find((n) => n.node_id === selectedNodeId) || nodes[0] || SAMPLE_NODES[0];
  }, [nodes, selectedNodeId]);

  // Total additions & deletions across all patches in current node
  const diffStats = useMemo(() => {
    if (!selectedNodeDetails?.patches) return { additions: 0, deletions: 0, filesCount: 0 };
    const additions = selectedNodeDetails.patches.reduce(
      (sum, p) => sum + (p.structural_diff?.additions || 0),
      0
    );
    const deletions = selectedNodeDetails.patches.reduce(
      (sum, p) => sum + (p.structural_diff?.deletions || 0),
      0
    );
    return { additions, deletions, filesCount: selectedNodeDetails.patches.length };
  }, [selectedNodeDetails]);

  // Viewed files progress calculation
  const viewedCount = useMemo(() => {
    if (!selectedNodeDetails?.patches) return 0;
    return selectedNodeDetails.patches.filter((p) => viewedFiles[p.path]).length;
  }, [selectedNodeDetails, viewedFiles]);

  const viewedPercentage = useMemo(() => {
    if (!diffStats.filesCount) return 0;
    return Math.round((viewedCount / diffStats.filesCount) * 100);
  }, [viewedCount, diffStats.filesCount]);

  // Actions
  const handleToggleViewed = (filePath: string) => {
    setViewedFiles((prev) => ({
      ...prev,
      [filePath]: !prev[filePath],
    }));
  };

  const handleToggleCollapse = (filePath: string) => {
    setCollapsedFiles((prev) => ({
      ...prev,
      [filePath]: !prev[filePath],
    }));
  };

  const handleCollapseAll = () => {
    if (!selectedNodeDetails?.patches) return;
    const allCollapsed: Record<string, boolean> = {};
    selectedNodeDetails.patches.forEach((p) => {
      allCollapsed[p.path] = true;
    });
    setCollapsedFiles(allCollapsed);
  };

  const handleExpandAll = () => {
    setCollapsedFiles({});
  };

  // Inline Comment handlers
  const handleAddComment = (filePath: string, lineNo: number, body: string) => {
    const newThread: ReviewThread = {
      id: `thread-${Date.now()}`,
      filePath,
      lineNo,
      resolved: false,
      comments: [
        {
          id: `comment-${Date.now()}`,
          author: 'Reviewer',
          avatarText: 'RV',
          role: 'Reviewer',
          timestamp: 'Just now',
          body,
        },
      ],
    };
    setThreads((prev) => [...prev, newThread]);
    showToast(`Added review comment on line ${lineNo}`);
  };

  const handleAddReply = (threadId: string, replyText: string) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          return {
            ...t,
            comments: [
              ...t.comments,
              {
                id: `reply-${Date.now()}`,
                author: 'Reviewer',
                avatarText: 'RV',
                role: 'Reviewer',
                timestamp: 'Just now',
                body: replyText,
              },
            ],
          };
        }
        return t;
      })
    );
    showToast('Reply posted');
  };

  const handleToggleResolve = (threadId: string) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === threadId) {
          const next = !t.resolved;
          showToast(next ? 'Thread marked as resolved' : 'Thread reopened');
          return { ...t, resolved: next };
        }
        return t;
      })
    );
  };

  const handleDeleteComment = (threadId: string, commentId: string) => {
    setThreads((prev) =>
      prev
        .map((t) => {
          if (t.id === threadId) {
            const nextComments = t.comments.filter((c) => c.id !== commentId);
            return { ...t, comments: nextComments };
          }
          return t;
        })
        .filter((t) => t.comments.length > 0)
    );
  };

  const handleAddGeneralDiscussion = () => {
    if (!generalComment.trim()) return;
    setGeneralDiscussions((prev) => [
      ...prev,
      {
        id: `g-${Date.now()}`,
        author: 'Reviewer',
        avatar: 'RV',
        role: 'Reviewer',
        time: 'Just now',
        text: generalComment.trim(),
      },
    ]);
    setGeneralComment('');
    showToast('Discussion comment posted');
  };

  // Promote / Reject / Checkout
  const handlePromoteConfirm = async (authorName: string, authorEmail: string) => {
    if (!selectedNodeId) return;
    try {
      const res = await promoteNode(selectedNodeId, authorName, authorEmail);
      showToast(`Merge Request merged into Git commit: ${res.commit_sha.slice(0, 8)}`);
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Promotion failed', 'error');
    }
  };

  const handleReject = async () => {
    if (!selectedNodeId) return;
    try {
      await rejectNode(selectedNodeId);
      showToast(`Merge Request closed`);
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to reject node', 'error');
    }
  };

  const handleCheckout = async (applyToWorktree = false) => {
    if (!selectedNodeId) return;
    try {
      await checkoutNode(selectedNodeId, applyToWorktree);
      showToast(`Checked out ${selectedNodeId.slice(0, 8)}. Shadow workspace synchronized.`);
      setIsCheckoutDropdownOpen(false);
      await loadData(true);
    } catch (err: any) {
      showToast(err.message || 'Checkout failed', 'error');
    }
  };

  const handleCreateCheckpoint = async (data: {
    prompt: string;
    reasoning: string;
    tool_calls: string;
    files: string[];
  }) => {
    try {
      const res = await createCheckpoint(data);
      showToast(`New execution checkpoint created: ${res.node_id.slice(0, 8)}`);
      await loadData(false);
      setSelectedNodeId(res.node_id);
    } catch (err: any) {
      showToast(err.message || 'Checkpoint creation failed', 'error');
    }
  };

  const shortNodeId = selectedNodeId ? selectedNodeId.slice(0, 8) : 'head';
  const isNodePromoted = currentNodeSummary?.status === 'Promoted';
  const isNodeRejected = currentNodeSummary?.status === 'Rejected';
  const isNodeOpen = !isNodePromoted && !isNodeRejected;

  return (
    <div className="gl-root-layout">
      {/* Top Navbar */}
      <header className="gl-top-navbar">
        <div className="gl-nav-left">
          {/* Vanguard VCS Icon */}
          <div className="gl-vcs-logo" title="Vanguard VCS Code Review">
            <GitBranch size={16} />
          </div>

          {/* Breadcrumb Path */}
          <nav className="gl-breadcrumbs">
            <span className="gl-breadcrumb-item">vanguard</span>
            <span className="gl-breadcrumb-separator">/</span>
            <span className="gl-breadcrumb-item">agent-vcs</span>
            <span className="gl-breadcrumb-separator">/</span>
            <span className="gl-breadcrumb-item highlight">Merge Requests</span>
            <span className="gl-breadcrumb-separator">/</span>
            <span className="gl-breadcrumb-id">!{shortNodeId}</span>
          </nav>
        </div>

        {/* Global Search Bar */}
        <div className="gl-nav-center">
          <div className="gl-global-search">
            <Search size={14} className="gl-search-icon" />
            <input
              type="text"
              placeholder="Search or jump to..."
              className="gl-search-field"
              readOnly
            />
            <span className="gl-kbd-shortcut">/</span>
          </div>
        </div>

        {/* Top Navbar Actions */}
        <div className="gl-nav-right">
          <button
            className="gl-btn gl-btn-subtle gl-btn-sm"
            onClick={() => loadData(true)}
            title="Synchronize repository state"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Sync</span>
          </button>

          <button
            className="gl-btn gl-btn-secondary gl-btn-sm"
            onClick={() => setIsNewCheckpointOpen(true)}
          >
            <BookmarkPlus size={14} />
            <span>New Checkpoint</span>
          </button>

          <div className="gl-avatar-badge" title="Logged in as Reviewer">
            <span>RV</span>
          </div>
        </div>
      </header>

      {/* Main Review Page Container */}
      <div className="gl-page-container">
        {/* MR Header Banner */}
        <section className="gl-mr-header-section">
          <div className="gl-mr-title-row">
            <div className="gl-mr-title-wrapper">
              <h1 className="gl-mr-title">
                {selectedNodeDetails?.prompt
                  ? selectedNodeDetails.prompt
                  : 'Implement Content-Addressable Storage & Execution Checkpoints'}
              </h1>

              {/* Status Pill */}
              <div className="gl-mr-status-pill-group">
                {isNodeOpen && (
                  <span className="gl-status-pill open">
                    <GitPullRequest size={14} />
                    Open
                  </span>
                )}
                {isNodePromoted && (
                  <span className="gl-status-pill merged">
                    <GitCommit size={14} />
                    Merged to Git
                  </span>
                )}
                {isNodeRejected && (
                  <span className="gl-status-pill closed">
                    <XCircle size={14} />
                    Closed
                  </span>
                )}

                <span className="gl-mr-ref-pill" title="Checkpoint Node ID">
                  node: #{shortNodeId}
                </span>
              </div>
            </div>

            {/* Review Action Buttons */}
            <div className="gl-mr-action-bar">
              {/* Approve Button */}
              <button
                className={`gl-btn gl-btn-md ${isApproved ? 'gl-btn-approved' : 'gl-btn-secondary'}`}
                onClick={() => {
                  setIsApproved(!isApproved);
                  showToast(!isApproved ? 'Merge Request approved' : 'Approval revoked');
                }}
                disabled={isNodePromoted}
                title="Approve this merge request"
              >
                <ThumbsUp size={15} />
                <span>{isApproved ? 'Approved (1)' : 'Approve'}</span>
              </button>

              {/* Code / Checkout Dropdown */}
              <div className="gl-dropdown-wrapper">
                <button
                  className="gl-btn gl-btn-secondary gl-btn-md"
                  onClick={() => setIsCheckoutDropdownOpen(!isCheckoutDropdownOpen)}
                >
                  <Code2 size={15} />
                  <span>Code</span>
                  <ChevronDown size={14} />
                </button>

                {isCheckoutDropdownOpen && (
                  <div className="gl-dropdown-menu">
                    <div className="gl-dropdown-header">Check out shadow branch</div>
                    <div className="gl-dropdown-code-box">
                      <code>agent_vcs checkout {shortNodeId}</code>
                      <button
                        className="gl-btn-icon-subtle"
                        onClick={() =>
                          copyToClipboard(`agent_vcs checkout ${shortNodeId}`, 'checkout command')
                        }
                      >
                        {copiedText === 'checkout command' ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                    <div className="gl-dropdown-divider" />
                    <button
                      className="gl-dropdown-item"
                      onClick={() => handleCheckout(false)}
                    >
                      <FolderGit2 size={14} />
                      <span>Sync Shadow Workspace</span>
                    </button>
                    <button
                      className="gl-dropdown-item"
                      onClick={() => handleCheckout(true)}
                    >
                      <FileCode size={14} />
                      <span>Apply Directly to Primary Worktree</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Reject / Close Button */}
              {!isNodeRejected && !isNodePromoted && (
                <button
                  className="gl-btn gl-btn-danger-outline gl-btn-md"
                  onClick={handleReject}
                  title="Close this merge request"
                >
                  <XCircle size={15} />
                  <span>Close MR</span>
                </button>
              )}

              {/* Merge / Promote Button */}
              {!isNodePromoted && (
                <button
                  className="gl-btn gl-btn-success gl-btn-md"
                  onClick={() => setIsPromoteOpen(true)}
                  title="Merge into native Git commit"
                >
                  <CheckCircle2 size={16} />
                  <span>Merge</span>
                </button>
              )}
            </div>
          </div>

          {/* MR Meta Row */}
          <div className="gl-mr-meta-row">
            <span className="gl-mr-author">
              Created by <strong style={{ color: 'var(--gl-text-default)' }}>Agent VCS (`vcs-bot`)</strong>{' '}
              {currentNodeSummary
                ? new Date(currentNodeSummary.timestamp_utc * 1000).toLocaleString()
                : 'recently'}
            </span>

            <span className="gl-mr-branches">
              <span className="gl-branch-tag">agent/checkpoint-{shortNodeId}</span>
              <span className="gl-branch-arrow">into</span>
              <span className="gl-branch-tag">main</span>
            </span>

            {/* Pipeline Status Pill */}
            <div className="gl-pipeline-pill success" title="Verification pipeline">
              <ShieldCheck size={14} />
              <span>Pipeline: passed</span>
            </div>

            {/* Select checkpoint dropdown for multi-node review */}
            {nodes.length > 1 && (
              <div className="gl-checkpoint-switcher">
                <span style={{ fontSize: '0.8rem', color: 'var(--gl-text-subtle)' }}>Checkpoint:</span>
                <select
                  className="gl-select-sm"
                  value={selectedNodeId || ''}
                  onChange={(e) => setSelectedNodeId(e.target.value)}
                >
                  {nodes.map((n) => (
                    <option key={n.node_id} value={n.node_id}>
                      #{n.node_id.slice(0, 8)} - {n.prompt.slice(0, 38)} ({n.status})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Canonical Tabs */}
          <nav className="gl-mr-tabs">
            <button
              className={`gl-mr-tab ${activeTab === 'changes' ? 'active' : ''}`}
              onClick={() => setActiveTab('changes')}
            >
              <span>Changes</span>
              <span className="gl-tab-count">{diffStats.filesCount}</span>
            </button>

            <button
              className={`gl-mr-tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <span>Overview</span>
              <span className="gl-tab-count">{threads.length + generalDiscussions.length}</span>
            </button>

            <button
              className={`gl-mr-tab ${activeTab === 'commits' ? 'active' : ''}`}
              onClick={() => setActiveTab('commits')}
            >
              <span>Commits</span>
              <span className="gl-tab-count">{nodes.length}</span>
            </button>

            <button
              className={`gl-mr-tab ${activeTab === 'pipelines' ? 'active' : ''}`}
              onClick={() => setActiveTab('pipelines')}
            >
              <span>Pipelines</span>
              <span className="gl-tab-count">3</span>
            </button>
          </nav>
        </section>

        {/* Tab 1: CHANGES (Diff Review) */}
        {activeTab === 'changes' && (
          <section className="gl-changes-container">
            {/* Diff Controls Utility Bar */}
            <div className="gl-diff-controls-bar">
              <div className="gl-controls-left">
                {/* File Tree Toggle */}
                <button
                  className="gl-btn gl-btn-subtle gl-btn-sm"
                  onClick={() => setIsFileTreeOpen(!isFileTreeOpen)}
                  title={isFileTreeOpen ? 'Hide file tree' : 'Show file tree'}
                >
                  {isFileTreeOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
                  <span>{isFileTreeOpen ? 'Hide file tree' : 'Show file tree'}</span>
                </button>

                {/* Diff Stats summary */}
                <div className="gl-diff-stats-text">
                  Showing <strong>{diffStats.filesCount} changed files</strong> with{' '}
                  <span className="gl-diff-add">+{diffStats.additions} additions</span> and{' '}
                  <span className="gl-diff-del">-{diffStats.deletions} deletions</span>
                </div>

                {/* Viewed Progress Bar */}
                <div className="gl-viewed-progress-group">
                  <div className="gl-viewed-label">
                    {viewedCount} of {diffStats.filesCount} viewed ({viewedPercentage}%)
                  </div>
                  <div className="gl-progress-track">
                    <div
                      className="gl-progress-fill"
                      style={{ width: `${viewedPercentage}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="gl-controls-right">
                {/* Collapse / Expand all */}
                <button
                  className="gl-btn gl-btn-subtle gl-btn-xs"
                  onClick={handleCollapseAll}
                  title="Collapse all files"
                >
                  Collapse all
                </button>
                <button
                  className="gl-btn gl-btn-subtle gl-btn-xs"
                  onClick={handleExpandAll}
                  title="Expand all files"
                >
                  Expand all
                </button>

                {/* Unified / Split Toggle */}
                <div className="gl-diff-mode-switcher">
                  <button
                    className={`gl-mode-btn ${diffMode === 'unified' ? 'active' : ''}`}
                    onClick={() => setDiffMode('unified')}
                    title="Inline diff view"
                  >
                    <AlignLeft size={13} />
                    <span>Inline</span>
                  </button>
                  <button
                    className={`gl-mode-btn ${diffMode === 'split' ? 'active' : ''}`}
                    onClick={() => setDiffMode('split')}
                    title="Side-by-side diff view"
                  >
                    <Split size={13} />
                    <span>Side-by-side</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Changes Layout: File Tree + Diff Viewers */}
            <div className="gl-changes-layout">
              {/* Left File Tree Sidebar */}
              {isFileTreeOpen && (
                <aside className="gl-file-tree-sidebar">
                  <GitLabFileTree
                    patches={selectedNodeDetails?.patches || []}
                    selectedFileIndex={selectedFileIndex}
                    onSelectFile={(idx) => {
                      setSelectedFileIndex(idx);
                      const patch = selectedNodeDetails?.patches[idx];
                      if (patch) {
                        const el = document.getElementById(`diff-file-${idx}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    viewedFiles={viewedFiles}
                    onToggleViewed={handleToggleViewed}
                  />
                </aside>
              )}

              {/* Main Diff Content Area */}
              <main className="gl-diff-content-area">
                {detailsLoading ? (
                  <div className="gl-loading-box">
                    <RefreshCw size={24} className="spin" />
                    <span>Loading diff patches...</span>
                  </div>
                ) : !selectedNodeDetails || selectedNodeDetails.patches.length === 0 ? (
                  <div className="gl-empty-box">
                    <FileCode size={36} color="var(--gl-text-subtle)" />
                    <h3>No changed files</h3>
                    <p>This execution node has no file diffs recorded.</p>
                  </div>
                ) : (
                  <>
                    <AgentContextDossier nodeDetails={selectedNodeDetails} />
                    <div className="gl-file-diff-list">
                    {selectedNodeDetails.patches.map((patch, idx) => {
                      const isCollapsed = Boolean(collapsedFiles[patch.path]);
                      const isViewed = Boolean(viewedFiles[patch.path]);
                      const isAdded =
                        patch.structural_diff.deletions === 0 &&
                        patch.structural_diff.additions > 0;
                      const isDeleted =
                        patch.structural_diff.additions === 0 &&
                        patch.structural_diff.deletions > 0;
                      const fileStatusLabel = isAdded ? 'ADDED' : isDeleted ? 'DELETED' : 'MODIFIED';

                      return (
                        <div
                          key={patch.path}
                          id={`diff-file-${idx}`}
                          className={`gl-file-diff-card ${isViewed ? 'viewed' : ''}`}
                        >
                          {/* File Header Bar */}
                          <div className="gl-file-diff-header">
                            <div className="gl-file-header-left">
                              <button
                                className="gl-chevron-toggle"
                                onClick={() => handleToggleCollapse(patch.path)}
                                title={isCollapsed ? 'Expand file' : 'Collapse file'}
                              >
                                {isCollapsed ? (
                                  <ChevronRight size={15} />
                                ) : (
                                  <ChevronDown size={15} />
                                )}
                              </button>

                              <span className={`gl-file-status-tag ${fileStatusLabel.toLowerCase()}`}>
                                {fileStatusLabel}
                              </span>

                              <div className="gl-file-path" title={patch.path}>
                                <span>{patch.path}</span>
                                <button
                                  className="gl-btn-icon-subtle"
                                  title="Copy file path"
                                  onClick={() => copyToClipboard(patch.path, 'file path')}
                                >
                                  {copiedText === 'file path' ? <Check size={12} /> : <Copy size={12} />}
                                </button>
                              </div>
                            </div>

                            <div className="gl-file-header-right">
                              {/* File additions & deletions */}
                              <div className="gl-file-stats">
                                <span className="gl-diff-add">
                                  +{patch.structural_diff.additions}
                                </span>
                                <span className="gl-diff-del">
                                  -{patch.structural_diff.deletions}
                                </span>
                              </div>

                              {/* Viewed Checkbox */}
                              <label className="gl-viewed-checkbox-label">
                                <input
                                  type="checkbox"
                                  className="gl-checkbox"
                                  checked={isViewed}
                                  onChange={() => handleToggleViewed(patch.path)}
                                />
                                <span>Viewed</span>
                              </label>
                            </div>
                          </div>

                          {/* File Diff Body */}
                          {!isCollapsed && (
                            <div className="gl-file-diff-body">
                              {diffMode === 'unified' ? (
                                <UnifiedDiffViewer
                                  patch={patch}
                                  threads={threads}
                                  onAddComment={handleAddComment}
                                  onAddReply={handleAddReply}
                                  onToggleResolve={handleToggleResolve}
                                  onDeleteComment={handleDeleteComment}
                                />
                              ) : (
                                <SplitDiffViewer
                                  patch={patch}
                                  threads={threads}
                                  onAddComment={handleAddComment}
                                  onAddReply={handleAddReply}
                                  onToggleResolve={handleToggleResolve}
                                  onDeleteComment={handleDeleteComment}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              </main>
            </div>
          </section>
        )}

        {/* Tab 2: OVERVIEW */}
        {activeTab === 'overview' && (
          <section className="gl-overview-container">
            {/* Merge Widget */}
            <div className="gl-merge-widget">
              <div className="gl-merge-widget-status">
                <div className="gl-merge-icon-circle success">
                  <Check size={18} />
                </div>
                <div className="gl-merge-widget-text">
                  <h3>
                    {isNodePromoted
                      ? 'The changes were merged into the primary Git tree.'
                      : isApproved
                      ? 'Ready to merge. Approved by reviewer.'
                      : 'Merge request is ready for review.'}
                  </h3>
                  <p>
                    Pipeline passed on branch{' '}
                    <code>agent/checkpoint-{shortNodeId}</code>. All AST diffs verified.
                  </p>
                </div>
              </div>

              {!isNodePromoted && (
                <div className="gl-merge-widget-actions">
                  <button
                    className="gl-btn gl-btn-success gl-btn-md"
                    onClick={() => setIsPromoteOpen(true)}
                  >
                    <CheckCircle2 size={16} />
                    <span>Merge</span>
                  </button>
                </div>
              )}
            </div>

            {/* Description Card */}
            <div className="gl-card">
              <div className="gl-card-header">
                <h3>Description</h3>
              </div>
              <div className="gl-card-body">
                <p style={{ fontSize: '0.92rem', lineHeight: 1.6 }}>
                  {selectedNodeDetails?.prompt || 'No description provided.'}
                </p>
              </div>
            </div>

            {/* Execution Context & Rationale Card */}
            <div className="gl-card">
              <div className="gl-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={15} color="var(--gl-text-subtle)" />
                  <h3>Execution Context & Implementation Notes</h3>
                </div>
              </div>
              <div className="gl-card-body">
                <pre className="gl-code-block">
                  {selectedNodeDetails?.reasoning || 'No execution notes recorded.'}
                </pre>
              </div>
            </div>

            {/* Tool Actions */}
            {selectedNodeDetails?.tool_calls && (
              <div className="gl-card">
                <div className="gl-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Terminal size={15} color="var(--gl-text-subtle)" />
                    <h3>Automated Tool Operations</h3>
                  </div>
                </div>
                <div className="gl-card-body">
                  <pre className="gl-code-block">
                    {selectedNodeDetails.tool_calls}
                  </pre>
                </div>
              </div>
            )}

            {/* Activity & Discussion Feed */}
            <div className="gl-discussion-section">
              <div className="gl-discussion-header">
                <MessageSquare size={16} />
                <h3>Activity ({generalDiscussions.length + threads.length})</h3>
              </div>

              <div className="gl-discussion-timeline">
                {generalDiscussions.map((item) => (
                  <div key={item.id} className="gl-comment-card">
                    <div className="gl-comment-avatar">{item.avatar}</div>
                    <div className="gl-comment-content">
                      <div className="gl-comment-author-bar">
                        <span className="gl-author-name">{item.author}</span>
                        {item.role && <span className="gl-author-badge">{item.role}</span>}
                        <span className="gl-comment-time">{item.time}</span>
                      </div>
                      <div className="gl-comment-text">{item.text}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Comment Input */}
              <div className="gl-discussion-input-box">
                <textarea
                  className="gl-textarea"
                  rows={3}
                  placeholder="Write a comment or review note..."
                  value={generalComment}
                  onChange={(e) => setGeneralComment(e.target.value)}
                />
                <div className="gl-discussion-input-actions">
                  <button
                    className="gl-btn gl-btn-primary gl-btn-sm"
                    onClick={handleAddGeneralDiscussion}
                    disabled={!generalComment.trim()}
                  >
                    Comment
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Tab 3: COMMITS */}
        {activeTab === 'commits' && (
          <section className="gl-commits-container">
            <div className="gl-card">
              <div className="gl-card-header">
                <h3>Commits & Checkpoints ({nodes.length})</h3>
              </div>
              <div className="gl-table-wrapper">
                <table className="gl-commits-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>SHA</th>
                      <th>Message</th>
                      <th>Files</th>
                      <th>Changes</th>
                      <th>Date</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((node) => {
                      const isSelected = node.node_id === selectedNodeId;
                      return (
                        <tr
                          key={node.node_id}
                          className={`gl-commit-row ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedNodeId(node.node_id)}
                        >
                          <td>
                            <span className={`gl-badge ${node.status === 'PendingReview' ? 'gl-badge-pending' : node.status === 'Promoted' ? 'gl-badge-success' : 'gl-badge-danger'}`}>
                              {node.status}
                            </span>
                          </td>
                          <td>
                            <code className="gl-sha">#{node.node_id.slice(0, 8)}</code>
                            {node.is_head && <span className="gl-head-pill">HEAD</span>}
                          </td>
                          <td className="gl-commit-msg">{node.prompt || '(No message)'}</td>
                          <td>{node.files_count} files</td>
                          <td>
                            <span className="gl-diff-add">+{node.additions}</span>{' '}
                            <span className="gl-diff-del">-{node.deletions}</span>
                          </td>
                          <td>{new Date(node.timestamp_utc * 1000).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="gl-btn gl-btn-subtle gl-btn-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedNodeId(node.node_id);
                                setActiveTab('changes');
                              }}
                            >
                              View changes
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* Tab 4: PIPELINES */}
        {activeTab === 'pipelines' && (
          <section className="gl-pipelines-container">
            <div className="gl-card">
              <div className="gl-card-header">
                <h3>Automated Pipeline #1042</h3>
              </div>
              <div className="gl-card-body">
                <div className="gl-pipeline-graph">
                  <div className="gl-pipeline-stage">
                    <span className="gl-stage-title">diff-parser</span>
                    <div className="gl-stage-pill success">
                      <Check size={13} />
                      <span>ast_diff: passed</span>
                    </div>
                  </div>
                  <div className="gl-pipeline-arrow">→</div>
                  <div className="gl-pipeline-stage">
                    <span className="gl-stage-title">safety-checks</span>
                    <div className="gl-stage-pill success">
                      <Check size={13} />
                      <span>secret_scan: passed</span>
                    </div>
                  </div>
                  <div className="gl-pipeline-arrow">→</div>
                  <div className="gl-pipeline-stage">
                    <span className="gl-stage-title">shadow-sandbox</span>
                    <div className="gl-stage-pill success">
                      <Check size={13} />
                      <span>unit_tests: passed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Modals */}
      {selectedNodeId && (
        <PromoteModal
          nodeId={selectedNodeId}
          isOpen={isPromoteOpen}
          onClose={() => setIsPromoteOpen(false)}
          onConfirm={handlePromoteConfirm}
        />
      )}

      <NewCheckpointModal
        isOpen={isNewCheckpointOpen}
        onClose={() => setIsNewCheckpointOpen(false)}
        onConfirm={handleCreateCheckpoint}
      />

      {/* Toast Notification */}
      {toast && (
        <div className={`gl-toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};
