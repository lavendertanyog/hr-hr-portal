// What's New feed — plain-language, user-facing entries only (no internal bug/ticket
// jargon). Newest first. `id` just needs to increase; it's what "seen" is tracked against.
// `version` numbers the updates from 1.0 upward (the oldest versioned entry is 1.0); give a new entry
// the next number. Entries from before the numbering began have no version.
export const WHATS_NEW = [
  {
    id: 10,
    date: '12 Oct 2026',
    version: '1.4',
    title: 'Attendance export: Excel or CSV, with leave and MC proof',
    summary: "Excel or CSV, with leave rows and MC proof links",
    chips: ['Excel or CSV','Leave rows included','MC proof links'],
    body: 'The Export button on Attendance is now a menu, and the file includes more than clock-ins.',
    points: [
      { icon: "download", lead: "Choose Excel (.xlsx) or CSV", text: "from the Export menu" },
      { icon: "calendar", lead: "Leave of every type", text: "is included, with its status" },
      { icon: "file", lead: "Sick leave rows", text: "have an MC proof link — click it, sign in to the HR portal if asked, and the MC opens" },
      { icon: "list", lead: "The column list changed", text: "so reports built on the old file may need a quick check" },
    ],
  },
  {
    id: 9,
    date: '12 Oct 2026',
    version: '1.3',
    title: 'Employee and Projects pages, redesigned',
    summary: "Cards, a Leave tab, and Deployed and Maintenance statuses",
    chips: ['Employee cards','Leave tab','Project cards'],
    body: 'People and projects are easier to browse and manage.',
    points: [
      { icon: "users", lead: "Employee page", text: "has cards with a details drawer, a combined role filter and search" },
      { icon: "calendar", lead: "A Leave tab", text: "to set leave days (with presets) and see the change history" },
      { icon: "folder", lead: "Projects page", text: "has project cards with a detail drawer, Deployed and Maintenance statuses, and the Org hierarchy tab" },
      { icon: "undo", lead: "Deactivate is now \"Mark as deployed\"", text: "— assignments are kept, and Reactivate puts it into Maintenance" },
    ],
  },
  {
    id: 8,
    date: '12 Oct 2026',
    version: '1.2',
    title: 'Calendar, holidays and reports',
    summary: "Holiday import counts, a cleaner PDF report, and one Leave page",
    chips: ['Calendar shows leave','Holiday import counts','PDF report pages'],
    body: 'Smaller improvements across Calendar, Approvals and Reports.',
    points: [
      { icon: "calendar", lead: "Calendar", text: "shows who is on leave, and has a collapsible sidebar" },
      { icon: "check", lead: "After saving a holiday", text: "the calendar jumps to its month, and you are told when the date or name is missing" },
      { icon: "download", lead: "Importing holidays", text: "tells you how many were added and how many were skipped" },
      { icon: "list", lead: "The separate Leave page is gone", text: "— leave is under Approvals > Leave Requests, with dates like 31-Oct-2026" },
      { icon: "file", lead: "PDF reports", text: "start each section on a new page, and Supporting detail now adapts to a week or a month" },
      { icon: "shield", lead: "A deactivated account", text: "is signed out within about a minute" },
    ],
  },
  {
    id: 7,
    date: '12 Oct 2026',
    version: '1.1',
    title: 'Everyone signs in once more',
    summary: "Login sessions were upgraded, so log in once after this update",
    chips: ['Log in once','Remember me for 1 day'],
    body: 'Login sessions have been upgraded, so you’ll be asked to log in once after this update.',
    points: [
      { icon: "signin", lead: "Remember me", text: "now keeps you signed in on this device for 1 day (see the earlier note)" },
      { icon: "lock", lead: "Changing your password", text: "or signing a device out ends its sign-in everywhere within about a minute" },
    ],
  },
  {
    id: 6,
    date: '8 Oct 2026',
    version: '1.0',
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

// Short summary shown in the one-time update notice after login (see UpdateNotice.js). Keep it to
// three lines and update it with each release; the full list stays in WHATS_NEW above.
export const WHATS_NEW_NOTICE = {
  portal: "HR portal",
  highlights: [
    { icon: "download", lead: "Attendance export", text: "in Excel or CSV, with leave and MC proof links" },
    { icon: "users", lead: "Employee and Projects pages", text: "redesigned, with a Leave tab and project cards" },
    { icon: "lock", lead: "Remember me", text: "keeps you signed in for 1 day" },
  ],
};
