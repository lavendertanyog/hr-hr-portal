// What's New feed — plain-language, user-facing entries only (no internal bug/ticket
// jargon). Newest first. `id` just needs to increase; it's what "seen" is tracked against.
export const WHATS_NEW = [
  {
    id: 10,
    date: '12 Oct 2026',
    title: 'Attendance export: Excel or CSV, with leave and MC proof',
    body: 'The Export button on Attendance is now a menu, and the file includes more than clock-ins.',
    points: [
      'Choose Excel (.xlsx) or CSV',
      'Leave of every type is included, with its status',
      'Sick leave rows have an MC proof link — click it, sign in to the HR portal if asked, and the MC opens',
      'The column list changed, so reports built on the old file may need a quick check',
    ],
  },
  {
    id: 9,
    date: '12 Oct 2026',
    title: 'Employee and Projects pages, redesigned',
    body: 'People and projects are easier to browse and manage.',
    points: [
      'Employee page: cards with a details drawer, a combined role filter and search',
      'A Leave tab to set leave days (with presets) and see the change history',
      'Projects page: project cards with a detail drawer, Deployed and Maintenance statuses, and the Org hierarchy tab',
      'Deactivate is now "Mark as deployed" — assignments are kept, and Reactivate puts it into Maintenance',
    ],
  },
  {
    id: 8,
    date: '12 Oct 2026',
    title: 'Calendar, holidays and reports',
    body: 'Smaller improvements across Calendar, Approvals and Reports.',
    points: [
      'Calendar shows who is on leave, and has a collapsible sidebar',
      'After saving a holiday the calendar jumps to its month, and you are told when the date or name is missing',
      'Importing holidays tells you how many were added and how many were skipped',
      'The separate Leave page is gone — leave is under Approvals > Leave Requests, with dates like 31-Oct-2026',
      'PDF reports start each section on a new page, and Supporting detail now adapts to a week or a month',
      'An account that has been deactivated is signed out within about a minute',
    ],
  },
  {
    id: 7,
    date: '12 Oct 2026',
    title: 'Everyone signs in once more',
    body: 'Login sessions have been upgraded, so you’ll be asked to log in once after this update.',
    points: [
      'Remember me now keeps you signed in on this device for 1 day (see the earlier note)',
      'Changing your password or signing a device out ends its sign-in everywhere within about a minute',
    ],
  },
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
