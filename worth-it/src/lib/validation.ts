import { AppError, CHOICES, NewPollInput, UpdateInput, VoteInput } from './types';

export const LIMITS = {
  itemName: 80,
  question: 200,
  reason: 280,
  review: 280,
  url: 500,
  maxPriceInr: 10_000_000,
};

export function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 && n <= LIMITS.maxPriceInr ? n : null;
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validatePoll(input: Omit<NewPollInput, 'photo'> & { photo: unknown }): void {
  const name = input.itemName.trim();
  const q = input.question.trim();
  if (!name) throw new AppError('invalid', 'Enter the item name.');
  if (name.length > LIMITS.itemName) throw new AppError('invalid', `Item name must be ${LIMITS.itemName} characters or fewer.`);
  if (!Number.isInteger(input.priceInr) || input.priceInr <= 0 || input.priceInr > LIMITS.maxPriceInr)
    throw new AppError('invalid', 'Enter the asking price in rupees, for example 2499.');
  if (!q) throw new AppError('invalid', 'Write the question you want answered.');
  if (q.length > LIMITS.question) throw new AppError('invalid', `Question must be ${LIMITS.question} characters or fewer.`);
  if (!input.photo) throw new AppError('invalid', 'Add one product photo.');
}

export function validateVote(input: VoteInput): void {
  if (!CHOICES.includes(input.choice)) throw new AppError('invalid', 'Pick Buy, Wait for a sale, or Skip.');
  if (input.reason.trim().length > LIMITS.reason)
    throw new AppError('invalid', `Reason must be ${LIMITS.reason} characters or fewer.`);
}

export function validateUpdate(input: UpdateInput): void {
  if (input.status !== 'bought' && input.status !== 'passed') throw new AppError('invalid', 'Choose Bought or Passed.');
  if (input.status === 'passed') return;
  if (input.pricePaidInr === null || !Number.isInteger(input.pricePaidInr) || input.pricePaidInr <= 0 || input.pricePaidInr > LIMITS.maxPriceInr)
    throw new AppError('invalid', 'Enter the price you actually paid, in rupees.');
  if (input.review.trim().length > LIMITS.review)
    throw new AppError('invalid', `Review must be ${LIMITS.review} characters or fewer.`);
  const url = input.storeUrl.trim();
  if (url) {
    if (url.length > LIMITS.url || !isHttpUrl(url)) throw new AppError('invalid', 'Store link must start with http:// or https://.');
  }
  if (input.isAffiliate && !url) throw new AppError('invalid', 'Add the store link before marking it as an affiliate link.');
}

/** Normalised values stored for an update (passed updates carry no price, review or link). */
export function normaliseUpdate(input: UpdateInput) {
  if (input.status === 'passed') {
    return { status: 'passed' as const, pricePaidInr: null, review: null, storeUrl: null, isAffiliate: false };
  }
  const url = input.storeUrl.trim();
  return {
    status: 'bought' as const,
    pricePaidInr: input.pricePaidInr,
    review: input.review.trim() || null,
    storeUrl: url || null,
    isAffiliate: url ? input.isAffiliate : false,
  };
}
