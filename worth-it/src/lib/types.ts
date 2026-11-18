export type Choice = 'buy' | 'wait' | 'skip';
export const CHOICES: Choice[] = ['buy', 'wait', 'skip'];
export const CHOICE_LABEL: Record<Choice, string> = {
  buy: 'Buy',
  wait: 'Wait for a sale',
  skip: 'Skip',
};

export interface Poll {
  id: string;
  itemName: string;
  priceInr: number;
  question: string;
  /** Public URL (connected) or data URI (local). Null for bundled demo art. */
  imageUrl: string | null;
  /** Key into the bundled demo artwork. */
  demoImage: string | null;
  isDemo: boolean;
  createdAt: string;
}

export interface PollSummary extends Poll {
  voteCount: number;
  updateStatus: 'bought' | 'passed' | null;
}

export interface VoteEntry {
  id: string;
  choice: Choice;
  reason: string | null;
  ownsItem: boolean;
  createdAt: string;
}

export interface PurchaseUpdate {
  status: 'bought' | 'passed';
  pricePaidInr: number | null;
  review: string | null;
  storeUrl: string | null;
  isAffiliate: boolean;
  updatedAt: string;
}

export interface PollView {
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
}

export interface NewPollInput {
  itemName: string;
  priceInr: number;
  question: string;
  photo: PickedPhoto;
}

export interface PickedPhoto {
  uri: string;
  mimeType?: string;
}

export interface VoteInput {
  choice: Choice;
  reason: string;
  ownsItem: boolean;
}

export interface UpdateInput {
  status: 'bought' | 'passed';
  pricePaidInr: number | null;
  review: string;
  storeUrl: string;
  isAffiliate: boolean;
}

export type AppErrorCode =
  | 'invalid'
  | 'not_found'
  | 'already_voted'
  | 'author_cannot_vote'
  | 'demo_readonly'
  | 'not_author'
  | 'upload_failed'
  | 'network'
  | 'unknown';

export class AppError extends Error {
  code: AppErrorCode;
  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppError';
  }
}

export interface Repo {
  mode: 'local' | 'supabase';
  /** Local mode lets you vote on seeded demo polls; connected mode keeps the shared demo data read-only. */
  demoVotingEnabled: boolean;
  init(): Promise<Session>;
  getSession(): Promise<Session>;
  listDemoPolls(): Promise<PollSummary[]>;
  listMyPolls(): Promise<PollSummary[]>;
  createPoll(input: NewPollInput): Promise<Poll>;
  getPollView(id: string): Promise<PollView | null>;
  castVote(id: string, input: VoteInput): Promise<void>;
  savePurchaseUpdate(id: string, input: UpdateInput): Promise<PurchaseUpdate>;
  /** Public helper so the UI can show the right photo URL. */
  // Local-only tools (no-ops in connected mode)
  demoTools?: {
    actAsNewGuest(): Promise<Session>;
    backToMyIdentity(): Promise<Session>;
    resetAll(): Promise<Session>;
  };
}
