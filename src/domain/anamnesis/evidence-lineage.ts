import type {
  ClinicalReviewEntry,
  EvidenceLineageEdge,
  EvidenceLineageGraph,
  SourceArtifact,
  SubmitReviewInput,
} from "./contracts";

export function stableClinicalReviewSignature(
  value: Pick<SubmitReviewInput, "reviewerName" | "action" | "comments"> | Pick<ClinicalReviewEntry, "reviewerName" | "action" | "comments">,
): string {
  return JSON.stringify({
    reviewerName: value.reviewerName,
    action: value.action,
    comments: value.comments ?? null,
  });
}

export function buildArtifactEvidenceLineage(
  artifacts: Array<Pick<SourceArtifact, "artifactId" | "derivedFromArtifactIds">>,
): EvidenceLineageGraph {
  const edges: EvidenceLineageEdge[] = [];
  const artifactIds = new Set(artifacts.map((artifact) => artifact.artifactId));
  const consumerIds = new Set<string>();
  const producerIds = new Set<string>();

  for (const artifact of artifacts) {
    for (const upstreamArtifactId of artifact.derivedFromArtifactIds ?? []) {
      if (!artifactIds.has(upstreamArtifactId)) {
        continue;
      }

      edges.push({
        producerArtifactId: upstreamArtifactId,
        consumerArtifactId: artifact.artifactId,
      });
      producerIds.add(upstreamArtifactId);
      consumerIds.add(artifact.artifactId);
    }
  }

  const orderedArtifactIds = artifacts.map((artifact) => artifact.artifactId);

  return {
    edges,
    roots: orderedArtifactIds.filter((artifactId) => !consumerIds.has(artifactId)),
    terminal: orderedArtifactIds.filter((artifactId) => !producerIds.has(artifactId)),
  };
}