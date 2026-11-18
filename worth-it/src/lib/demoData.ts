import { Choice, PurchaseUpdate } from './types';

export interface DemoVote { choice: Choice; reason: string | null; owns: boolean; minsAgo: number }
export interface DemoPollDef {
  id: string;
  itemName: string;
  priceInr: number;
  question: string;
  demoImage: string;
  hoursAgo: number;
  votes: DemoVote[];
  update?: Omit<PurchaseUpdate, 'updatedAt'>;
}

// Fictional product names so demo content never looks like a real brand review.
export const DEMO_POLLS: DemoPollDef[] = [
  {
    id: '00000000-0000-4000-8000-0000000000d1',
    itemName: 'Stride Lite everyday sneakers',
    priceInr: 1299,
    question: 'Good enough for college and daily walking?',
    demoImage: 'sneaker-1',
    hoursAgo: 52,
    votes: [
      { choice: 'buy', reason: 'Light and cheap. Mine lasted a year of daily use.', owns: true, minsAgo: 3000 },
      { choice: 'buy', reason: 'At this price you can replace them next year and not care.', owns: false, minsAgo: 2900 },
      { choice: 'buy', reason: null, owns: false, minsAgo: 2700 },
      { choice: 'wait', reason: 'These drop to about ₹999 every sale season.', owns: false, minsAgo: 2500 },
      { choice: 'buy', reason: 'Sole is thin but fine for pavements.', owns: true, minsAgo: 2300 },
      { choice: 'skip', reason: 'No arch support. Bad if you walk 5 km or more.', owns: false, minsAgo: 2200 },
    ],
  },
  {
    id: '00000000-0000-4000-8000-0000000000d2',
    itemName: 'Cloudwalk knit trainers',
    priceInr: 3999,
    question: 'Is the knit upper worth the extra money over a ₹2,500 pair?',
    demoImage: 'sneaker-2',
    hoursAgo: 30,
    votes: [
      { choice: 'wait', reason: 'Was ₹2,999 last month. Wait for the next sale.', owns: false, minsAgo: 1700 },
      { choice: 'wait', reason: 'Knit is nice but the price will drop.', owns: false, minsAgo: 1600 },
      { choice: 'buy', reason: 'Comfiest shoe I own. Worth it if you walk daily.', owns: true, minsAgo: 1500 },
      { choice: 'skip', reason: 'Knit gets dirty fast and is hard to clean.', owns: true, minsAgo: 1400 },
      { choice: 'wait', reason: null, owns: false, minsAgo: 1200 },
    ],
  },
  {
    id: '00000000-0000-4000-8000-0000000000d3',
    itemName: 'Apex Pro trail sneakers',
    priceInr: 6499,
    question: 'Too much for weekend hikes and some office wear?',
    demoImage: 'sneaker-3',
    hoursAgo: 120,
    votes: [
      { choice: 'skip', reason: 'Buy a ₹3,500 pair and spend the rest on good socks.', owns: false, minsAgo: 7000 },
      { choice: 'wait', reason: 'Look for the older colour, usually 30% off.', owns: false, minsAgo: 6900 },
      { choice: 'wait', reason: 'Prices drop in festive sales.', owns: false, minsAgo: 6800 },
      { choice: 'buy', reason: 'Grip is excellent. Hiking pair that lasts years.', owns: true, minsAgo: 6500 },
    ],
    update: {
      status: 'bought',
      pricePaidInr: 5299,
      review: 'Waited two weeks and got them ₹1,200 under the asking price. Grip is great, a bit stiff for office days.',
      storeUrl: 'https://example.com/demo-store-link',
      isAffiliate: true,
    },
  },
];

export const DEMO_NOTE = 'Sample poll with made-up votes. Not real shoppers.';
