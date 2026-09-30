pub mod blob;
pub mod dag;
pub mod diff;
pub mod engine;
pub mod promotion;
pub mod workspace;

pub use blob::BlobStore;
pub use dag::{AgentExecutionNode, DagStore, FilePatch, NodeStatus};
pub use diff::{
    analyze_text_diff, apply_unified_diff, compute_unified_diff, parse_unified_diff, DiffHunk,
    DiffLine, DiffLineTag, StructuralDiff,
};
pub use engine::{EngineStatus, NodeDetails, VcsEngine};
pub use promotion::PromotionBridge;
pub use workspace::ShadowWorkspace;
