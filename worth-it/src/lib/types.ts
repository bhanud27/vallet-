import type { ProductDetails } from "./productDetails";
import type { PostAction, PollEdit, PostCursor } from "./postEdits";
import type { SelectedVideo } from "./socialVideo";

export type Choice = "buy" | "wait" | "skip";
export const CHOICES: Choice[] = ["buy", "wait", "skip"];
export const CHOICE_LABEL: Record<Choice, string> = {
  buy: "Buy",
  wait: "Wait for a sale",
  skip: "Skip",
};

export const POLL_CATEGORIES = {
  audio: "Headphones & audio",
  electronics: "Electronics",
  fashion: "Fashion",
  home: "Home",
  fitness: "Fitness",
  other: "Other",
} as const;
export type PollCategory = keyof typeof POLL_CATEGORIES;
export type PurchaseStatus = "bought" | "passed" | "returned";

interface ShoppingContext {
  creationSpec?: import("./creationSpec").CreationSpec;
  productDetails?: ProductDetails;
  category?: PollCategory;
  useCase?: string;
  priority?: string;
  budgetInr?: number;
}

export interface Poll extends ShoppingContext {
  contentKind?: "poll" | "post";
  archivedAt?: string;
  editedAt?: string;
  mediaState?: "pending" | "ready" | "failed";
  id: string;
  itemName: string;
  priceInr: number;
  question: string;
  /** Signed media URL (connected) or data URI (local). Null for bundled demo art. */
  imageUrl: string | null;
  authorId?: string;
  username?: string;
  /** Key into the bundled demo artwork. */
  demoImage: string | null;
  media?: PollMedia[];
  isDemo: boolean;
  createdAt: string;
}

export interface PollSummary extends Poll {
  voteCount: number;
  updateStatus: PurchaseStatus | null;
}

export interface VoteEntry {
  id: string;
  choice: Choice | null;
  optionId?: string;
  reason: string | null;
  ownsItem: boolean;
  helpful?: boolean;
  createdAt: string;
}

export interface PurchaseUpdate {
  status: PurchaseStatus;
  pricePaidInr: number | null;
  review: string | null;
  storeUrl: string | null;
  isAffiliate: boolean;
  updatedAt: string;
  purchasedAt?: string | null;
  wouldBuyAgain?: boolean | null;
}

export interface VoteSummary {
  buy: number;
  wait: number;
  skip: number;
  ownerBuy: number;
  ownerWait: number;
  ownerSkip: number;
}

export interface PollView {
  myOption?: string | null;
  optionSummary?: { counts: Record<string, number>; total: number };
  summary?: VoteSummary;
  poll: Poll;
  votes: VoteEntry[];
  update: PurchaseUpdate | null;
  isAuthor: boolean;
  myChoice: Choice | null;
}

export interface Session {
  userId: string;
  isGuest: boolean;
  email: string | null;
  needsPassword?: boolean;
}

export interface NewPollInput extends ShoppingContext {
  contentKind?: "poll" | "post";
  requestId?: string;
  signal?: AbortSignal;
  itemName: string;
  priceInr: number;
  question: string;
  photo?: PickedPhoto | null;
  media?: NewPollMedia[];
  productUrl?: string;
}

export interface PublishProgress {
  stage: "preparing" | "uploading" | "publishing" | "completed";
  completed: number;
  total: number;
  bytesSent?: number;
  bytesTotal?: number;
}

export interface PollExtras {
  productUrl: string | null;
  stars: number;
  starred: boolean;
}

export const MAX_POLL_MEDIA = 24;

export type NewPollMedia =
  | { kind: "image"; id?: string; file: PickedPhoto; sourceUrl?: string }
  | { kind: "video"; id?: string; file: SelectedVideo; sourceUrl?: never };

export interface PollMedia {
  thumbnail?: string;
  kind: "image" | "video";
  value: string;
  device?: boolean;
  sourceUrl?: string;
}

export interface PickedPhoto {
  uri: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface VoteInput {
  optionId?: string;
  choice: Choice | null;
  reason: string;
  ownsItem: boolean;
}

export interface UpdateInput {
  status: PurchaseStatus;
  pricePaidInr: number | null;
  review: string;
  storeUrl: string;
  isAffiliate: boolean;
  wouldBuyAgain?: boolean | null;
}

export interface DiscoverFilters {
  category?: PollCategory;
  min?: number;
  max?: number;
  query?: string;
  needsAnswer: boolean;
}

export interface ProductHistoryEntry {
  id: string;
  itemName: string;
  priceInr: number;
  createdAt: string;
  pricePaidInr: number | null;
  purchasedAt: string | null;
  status: PurchaseStatus | null;
}

export interface DecisionNotification {
  id: string;
  kind: "purchase_update" | "after_buy_reminder";
  target_id: string;
  username: string;
  detail: string;
  created_at: string;
}

export type AppErrorCode =
  | "invalid"
  | "not_found"
  | "already_voted"
  | "author_cannot_vote"
  | "demo_readonly"
  | "not_author"
  | "upload_failed"
  | "network"
  | "unknown";

export class AppError extends Error {
  code: AppErrorCode;
  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}

export interface Repo {
  mode: "local" | "supabase";
  /** Local mode lets you vote on seeded demo polls; connected mode keeps the shared demo data read-only. */
  demoVotingEnabled: boolean;
  init(): Promise<Session>;
  getSession(): Promise<Session>;
  listDemoPolls(): Promise<PollSummary[]>;
  listMyPolls(archived?: boolean, before?: PostCursor): Promise<PollSummary[]>;
  managePoll(id: string, action: PostAction, values?: PollEdit): Promise<void>;
  listSocialPolls?(author?: string): Promise<PollSummary[]>;
  discoverPolls(filters: DiscoverFilters): Promise<PollSummary[]>;
  listProductHistory(
    productUrl: string,
    current?: string,
  ): Promise<ProductHistoryEntry[]>;
  createPoll(
    input: NewPollInput,
    onProgress?: (status: PublishProgress) => void,
  ): Promise<Poll>;
  getPollView(id: string): Promise<PollView | null>;
  getVoteReasons?(
    id: string,
    before: string,
    beforeId: string,
  ): Promise<VoteEntry[]>;
  getPollExtras(ids: string[]): Promise<Record<string, PollExtras>>;
  setPollStar(id: string, starred: boolean): Promise<PollExtras>;
  castVote(id: string, input: VoteInput): Promise<void>;
  markHelpfulReason(
    pollId: string,
    voteId: string,
    helpful: boolean,
  ): Promise<void>;
  savePurchaseUpdate(id: string, input: UpdateInput): Promise<PurchaseUpdate>;
  /** Public helper so the UI can show the right photo URL. */
  // Local-only tools (no-ops in connected mode)
  demoTools?: {
    decisionNotifications(): Promise<DecisionNotification[]>;
    actAsNewGuest(): Promise<Session>;
    backToMyIdentity(): Promise<Session>;
    resetAll(): Promise<Session>;
  };
}
