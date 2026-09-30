import React, { useState, useMemo } from 'react';
import {
  FileCode,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Search,
  List,
  FolderTree
} from 'lucide-react';
import { DetailedFilePatch } from '../types';

interface Props {
  patches: DetailedFilePatch[];
  selectedFileIndex: number;
  onSelectFile: (index: number) => void;
  viewedFiles: Record<string, boolean>;
  onToggleViewed: (filePath: string) => void;
}

interface FileTreeNode {
  name: string;
  fullPath: string;
  isFolder: boolean;
  fileIndex?: number;
  children: FileTreeNode[];
  additions: number;
  deletions: number;
}

export const GitLabFileTree: React.FC<Props> = ({
  patches,
  selectedFileIndex,
  onSelectFile,
  viewedFiles,
  onToggleViewed,
}) => {
  const [filterText, setFilterText] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  // Build tree with compact folder paths (collapse single-child folder chains)
  const tree = useMemo(() => {
    const root: FileTreeNode = {
      name: 'root',
      fullPath: '',
      isFolder: true,
      children: [],
      additions: 0,
      deletions: 0,
    };

    patches.forEach((patch, index) => {
      if (filterText && !patch.path.toLowerCase().includes(filterText.toLowerCase())) {
        return;
      }

      const parts = patch.path.split('/');
      let current = root;

      parts.forEach((part, partIdx) => {
        const isFile = partIdx === parts.length - 1;
        const currentPath = parts.slice(0, partIdx + 1).join('/');

        let found = current.children.find((c) => c.name === part);
        if (!found) {
          found = {
            name: part,
            fullPath: currentPath,
            isFolder: !isFile,
            fileIndex: isFile ? index : undefined,
            children: [],
            additions: isFile ? patch.structural_diff?.additions || 0 : 0,
            deletions: isFile ? patch.structural_diff?.deletions || 0 : 0,
          };
          current.children.push(found);
        }
        current = found;
      });
    });

    // Helper to compact folder chains with only 1 child folder
    const compactTree = (node: FileTreeNode): FileTreeNode => {
      if (!node.isFolder) return node;

      // First recursively compact children
      node.children = node.children.map(compactTree);

      // If this folder has exactly 1 child and that child is also a folder, merge their names
      while (node.children.length === 1 && node.children[0].isFolder && node.name !== 'root') {
        const child = node.children[0];
        node.name = `${node.name}/${child.name}`;
        node.fullPath = child.fullPath;
        node.children = child.children;
      }

      return node;
    };

    return compactTree(root);
  }, [patches, filterText]);

  // Flat list filtered
  const flatFiles = useMemo(() => {
    return patches
      .map((patch, idx) => ({ patch, idx }))
      .filter(({ patch }) => !filterText || patch.path.toLowerCase().includes(filterText.toLowerCase()));
  }, [patches, filterText]);

  const renderNode = (node: FileTreeNode, depth = 0) => {
    if (node.isFolder) {
      const isCollapsed = Boolean(collapsedFolders[node.fullPath]);
      return (
        <div key={node.fullPath || 'root-group'} className="gl-tree-folder-group">
          {node.fullPath && (
            <div
              className="gl-tree-row gl-tree-folder"
              style={{ paddingLeft: `${depth * 12 + 10}px` }}
              onClick={() => toggleFolder(node.fullPath)}
            >
              <div className="gl-tree-left">
                <span className="gl-tree-chevron">
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </span>
                <span className="gl-tree-icon">
                  {isCollapsed ? <Folder size={14} /> : <FolderOpen size={14} />}
                </span>
                <span className="gl-tree-label folder">{node.name}</span>
              </div>
            </div>
          )}
          {!isCollapsed &&
            node.children.map((child) => renderNode(child, node.fullPath ? depth + 1 : depth))}
        </div>
      );
    }

    const isSelected = node.fileIndex === selectedFileIndex;
    const isViewed = Boolean(viewedFiles[node.fullPath]);
    const patch = node.fileIndex !== undefined ? patches[node.fileIndex] : null;
    const isAdded = patch ? patch.structural_diff?.deletions === 0 && (patch.structural_diff?.additions || 0) > 0 : false;
    const isDeleted = patch ? (patch.structural_diff?.additions || 0) === 0 && (patch.structural_diff?.deletions || 0) > 0 : false;
    const fileStatus = isAdded ? 'A' : isDeleted ? 'D' : 'M';

    return (
      <div
        key={node.fullPath}
        className={`gl-tree-row gl-tree-file ${isSelected ? 'active' : ''} ${
          isViewed ? 'viewed' : ''
        }`}
        style={{ paddingLeft: `${depth * 12 + 10}px` }}
        onClick={() => {
          if (node.fileIndex !== undefined) {
            onSelectFile(node.fileIndex);
          }
        }}
      >
        <div className="gl-tree-left">
          <input
            type="checkbox"
            className="gl-checkbox"
            checked={isViewed}
            onChange={(e) => {
              e.stopPropagation();
              onToggleViewed(node.fullPath);
            }}
            title={isViewed ? 'Mark as unreviewed' : 'Mark as reviewed'}
          />
          <span className={`gl-file-status-pill ${fileStatus.toLowerCase()}`}>
            {fileStatus}
          </span>
          <span className="gl-tree-label file" title={node.fullPath}>
            {node.name}
          </span>
        </div>

        <div className="gl-tree-right">
          {node.additions > 0 && <span className="gl-diff-add">+{node.additions}</span>}
          {node.deletions > 0 && <span className="gl-diff-del">-{node.deletions}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="gl-file-tree-container">
      <div className="gl-file-tree-header">
        <div className="gl-file-tree-header-top">
          <span className="gl-file-tree-title">Files ({patches.length})</span>
          {/* Tree vs List Toggle */}
          <div className="gl-view-toggle-group">
            <button
              className={`gl-toggle-btn ${viewMode === 'tree' ? 'active' : ''}`}
              onClick={() => setViewMode('tree')}
              title="Tree view"
            >
              <FolderTree size={13} />
            </button>
            <button
              className={`gl-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Flat list view"
            >
              <List size={13} />
            </button>
          </div>
        </div>

        <div className="gl-file-filter-wrapper">
          <Search size={13} className="gl-filter-icon" />
          <input
            type="text"
            className="gl-filter-input"
            placeholder="Filter files..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
      </div>

      <div className="gl-tree-scroll-area">
        {viewMode === 'tree' ? (
          tree.children.length === 0 ? (
            <div className="gl-tree-empty">No files matching filter</div>
          ) : (
            tree.children.map((child) => renderNode(child, 0))
          )
        ) : (
          flatFiles.length === 0 ? (
            <div className="gl-tree-empty">No files matching filter</div>
          ) : (
            flatFiles.map(({ patch, idx }) => {
              const isSelected = idx === selectedFileIndex;
              const isViewed = Boolean(viewedFiles[patch.path]);
              const lastSlash = patch.path.lastIndexOf('/');
              const dirPart = lastSlash !== -1 ? patch.path.slice(0, lastSlash + 1) : '';
              const filePart = lastSlash !== -1 ? patch.path.slice(lastSlash + 1) : patch.path;

              const isAdded = patch.structural_diff?.deletions === 0 && (patch.structural_diff?.additions || 0) > 0;
              const isDeleted = (patch.structural_diff?.additions || 0) === 0 && (patch.structural_diff?.deletions || 0) > 0;
              const fileStatus = isAdded ? 'A' : isDeleted ? 'D' : 'M';

              return (
                <div
                  key={patch.path}
                  className={`gl-tree-row gl-tree-file ${isSelected ? 'active' : ''} ${
                    isViewed ? 'viewed' : ''
                  }`}
                  style={{ paddingLeft: '12px' }}
                  onClick={() => onSelectFile(idx)}
                >
                  <div className="gl-tree-left">
                    <input
                      type="checkbox"
                      className="gl-checkbox"
                      checked={isViewed}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleViewed(patch.path);
                      }}
                    />
                    <span className={`gl-file-status-pill ${fileStatus.toLowerCase()}`}>
                      {fileStatus}
                    </span>
                    <span className="gl-tree-label file flat" title={patch.path}>
                      {dirPart && <span className="gl-dir-prefix">{dirPart}</span>}
                      <span className="gl-file-name">{filePart}</span>
                    </span>
                  </div>

                  <div className="gl-tree-right">
                    {(patch.structural_diff?.additions || 0) > 0 && (
                      <span className="gl-diff-add">+{patch.structural_diff.additions}</span>
                    )}
                    {(patch.structural_diff?.deletions || 0) > 0 && (
                      <span className="gl-diff-del">-{patch.structural_diff.deletions}</span>
                    )}
                  </div>
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
};
