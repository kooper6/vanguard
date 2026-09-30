import React, { useState } from 'react';
import {
  MessageSquareQuote,
  ListTree,
  Terminal,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Cpu,
  Layers,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { NodeDetails } from '../types';

interface Props {
  nodeDetails: NodeDetails;
}

export const AgentContextDossier: React.FC<Props> = ({ nodeDetails }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'reasoning' | 'tools' | 'raw'>('reasoning');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(nodeDetails.prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  // Parse tool calls if JSON
  const parsedTools = React.useMemo(() => {
    if (!nodeDetails.tool_calls) return null;
    try {
      const data = JSON.parse(nodeDetails.tool_calls);
      if (Array.isArray(data)) return data;
      return null;
    } catch {
      return null;
    }
  }, [nodeDetails.tool_calls]);

  return (
    <div className={`gl-agent-dossier-card ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* Header bar */}
      <div className="gl-dossier-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="gl-dossier-header-left">
          <div className="gl-dossier-icon">
            <Cpu size={15} />
          </div>
          <div className="gl-dossier-title-group">
            <span className="gl-dossier-title">Agent Execution Dossier</span>
            <span className="gl-dossier-subtitle">
              Goal prompt, intermediate reasoning & tool audit trail for this checkpoint
            </span>
          </div>
        </div>

        <div className="gl-dossier-header-right" onClick={(e) => e.stopPropagation()}>
          <button
            className="gl-btn gl-btn-subtle gl-btn-xs"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse agent context' : 'Expand agent context'}
          >
            {isExpanded ? (
              <>
                <ChevronUp size={13} />
                <span>Collapse</span>
              </>
            ) : (
              <>
                <ChevronDown size={13} />
                <span>Show Prompt & Reasoning</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="gl-dossier-body">
          {/* Top section: Driving Prompt */}
          <div className="gl-dossier-prompt-block">
            <div className="gl-dossier-section-label">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageSquareQuote size={14} className="gl-icon-blue" />
                <span>Driving Prompt / User Intent</span>
              </div>
              <button
                className="gl-btn-icon-subtle"
                title="Copy driving prompt"
                onClick={handleCopyPrompt}
              >
                {copiedPrompt ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
            <div className="gl-dossier-prompt-text">
              {nodeDetails.prompt || '(No prompt provided)'}
            </div>
          </div>

          {/* Subtabs: Intermediate Reasoning vs Tool Calls */}
          <div className="gl-dossier-tabs-bar">
            <div className="gl-dossier-tabs">
              <button
                className={`gl-dossier-tab ${activeTab === 'reasoning' ? 'active' : ''}`}
                onClick={() => setActiveTab('reasoning')}
              >
                <ListTree size={13} />
                <span>Intermediate Reasoning & Decisions</span>
              </button>

              <button
                className={`gl-dossier-tab ${activeTab === 'tools' ? 'active' : ''}`}
                onClick={() => setActiveTab('tools')}
              >
                <Terminal size={13} />
                <span>Tool Operations {parsedTools ? `(${parsedTools.length})` : ''}</span>
              </button>

              <button
                className={`gl-dossier-tab ${activeTab === 'raw' ? 'active' : ''}`}
                onClick={() => setActiveTab('raw')}
              >
                <Layers size={13} />
                <span>Raw Execution Trace</span>
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="gl-dossier-tab-content">
            {activeTab === 'reasoning' && (
              <div className="gl-dossier-reasoning-view">
                <pre className="gl-dossier-code-block">
                  {nodeDetails.reasoning || '(No intermediate reasoning recorded for this node)'}
                </pre>
              </div>
            )}

            {activeTab === 'tools' && (
              <div className="gl-dossier-tools-view">
                {parsedTools ? (
                  <div className="gl-tool-pill-list">
                    {parsedTools.map((tool, idx) => (
                      <div key={idx} className="gl-tool-card">
                        <div className="gl-tool-card-header">
                          <span className="gl-tool-name">
                            <Terminal size={12} />
                            <code>{tool.tool || 'tool_call'}</code>
                          </span>
                          {tool.status && (
                            <span className="gl-badge gl-badge-success">{tool.status}</span>
                          )}
                        </div>
                        <div className="gl-tool-card-body">
                          {Object.entries(tool)
                            .filter(([k]) => k !== 'tool' && k !== 'status')
                            .map(([k, v]) => (
                              <div key={k} className="gl-tool-prop-row">
                                <span className="gl-tool-prop-key">{k}:</span>
                                <span className="gl-tool-prop-val">
                                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre className="gl-dossier-code-block">
                    {nodeDetails.tool_calls || '(No tool calls recorded)'}
                  </pre>
                )}
              </div>
            )}

            {activeTab === 'raw' && (
              <div className="gl-dossier-raw-view">
                <pre className="gl-dossier-code-block">
                  {JSON.stringify(
                    {
                      node_id: nodeDetails.node.node_id,
                      parent_id: nodeDetails.node.parent_id,
                      timestamp_utc: nodeDetails.node.timestamp_utc,
                      prompt: nodeDetails.prompt,
                      reasoning: nodeDetails.reasoning,
                      tool_calls: nodeDetails.tool_calls,
                      file_count: nodeDetails.patches.length,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
