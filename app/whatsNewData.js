// What's New feed — plain-language, user-facing entries only (no internal bug/ticket
// jargon). Newest first. `id` just needs to increase; it's what "seen" is tracked against.
export const WHATS_NEW = [
  {
    id: 4,
    date: '18 Sept 2026',
    title: 'Find anything faster',
    body: 'The search bar in the top bar now actually works — type a page name or an action like "approve" or "org chart" and jump straight there.',
  },
  {
    id: 3,
    date: '18 Sept 2026',
    title: 'People page',
    body: 'User Roles and Organisation Hierarchy now live together under one "People" page, switchable by tab.',
  },
  {
    id: 2,
    date: '18 Sept 2026',
    title: 'Redesigned organisation chart',
    body: 'The org chart has colored role tiers and avatar cards, plus a new "Edit Organisation" mode so the chart stays clean until you need to make changes.',
  },
  {
    id: 1,
    date: '17 Sept 2026',
    title: 'Budget approvals fixed',
    body: 'Fixed a bug where approving or rejecting a budget request could fail with an unrelated error message.',
  },
];
export const WHATS_NEW_LATEST_ID = WHATS_NEW[0].id;
export const WHATS_NEW_SEEN_KEY = 'hr_portal_whats_new_seen';
