/** One row of GET /api/authoring/publications (lib/authoring.ts list_recent_publications, with the member's name). */
export type PublicationRow = {
  draftId: string;
  name: string;
  layout: string;
  excerpt: string;
  revision: number;
  publishedAt: number;
  publishedBy: "agent" | "person";
  approvedBy: "agent" | "person" | null;
  memberName: string | null;
  standingApproval: boolean;
  current: boolean;
  archived: boolean;
  draftVersion: number | null;
  rollbackTo: number | null;
  previewId: string | null;
  image: { width: number; height: number; mimeType: string } | null;
};

export const RANGES = [
  { id: "day", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { id: "week", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "month", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];

/** Who published it, in words a volunteer reads: never an id, never "MCP". */
export function publishedByLine(row: Pick<PublicationRow, "publishedBy" | "memberName" | "standingApproval">): string {
  if (row.publishedBy === "agent") return row.memberName ? `Published by an assistant connected by ${row.memberName}` : "Published by an assistant";
  if (row.standingApproval) return row.memberName ? `Saved by ${row.memberName} on This service` : "Saved on This service";
  return row.memberName ? `Published by ${row.memberName}` : "Published in the editor";
}

export type PublicationStatus = { label: string; tone: "live" | "replaced" | "archived" };
export function publicationStatus(row: Pick<PublicationRow, "current" | "archived">): PublicationStatus {
  if (row.archived) return { label: "Archived", tone: "archived" };
  return row.current ? { label: "In use now", tone: "live" } : { label: "Replaced by a later version", tone: "replaced" };
}

/** What the page can offer for going back, and the sentence it says when it cannot. */
export function rollbackOffer(row: Pick<PublicationRow, "current" | "rollbackTo" | "draftVersion">): { available: true } | { available: false; reason: string | null } {
  if (!row.current) return { available: false, reason: null };
  if (row.rollbackTo === null || row.draftVersion === null) return { available: false, reason: "This is the first version published, so there is no earlier one to go back to." };
  return { available: true };
}

export const imageUrl = (previewId: string) => `/api/authoring/publications?image=${encodeURIComponent(previewId)}`;
