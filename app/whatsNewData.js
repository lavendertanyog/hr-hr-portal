// What's New feed — plain-language, user-facing entries only (no internal bug/ticket
// jargon). Newest first. `id` just needs to increase; it's what "seen" is tracked against.
export const WHATS_NEW = [
  {
    id: 6,
    date: '8 Oct 2026',
    title: 'Remember me on this device',
    body: 'Tick "Remember me on this device" when you log in and you’ll stay signed in on that browser for 1 day. Next time, the portal signs you straight in without your password.',
    points: [
      'Log out ends the sign-in but keeps your email filled in, partly hidden (e.g. ju•••@nextan.com.sg)',
      'Click "Not you?" on the login page to forget the email and use a different account',
      'See and sign out your remembered devices from your Profile page',
      'Changing your password signs out your other devices',
      'Don’t tick it on a shared or public computer',
    ],
  },
  {
    id: 5,
    date: '7 Oct 2026',
    title: 'Audit Log',
    body: 'A new Audit Log page shows who changed timesheets, leave, budgets, projects and leave entitlements, with the before and after values. Filter by date, record type, who made the change, or whose record it was.',
  },
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
