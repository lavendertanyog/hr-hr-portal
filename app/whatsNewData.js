// What's New feed — plain-language, user-facing entries only (no internal bug/ticket
// jargon). Newest first. `id` just needs to increase; it's what "seen" is tracked against.
export const WHATS_NEW = [
  {
    id: 15,
    date: '29 Oct 2026',
    title: 'Switch portal without signing in again',
    body: 'If you also have a Staff, Manager or Account Manager role, open the menu under your name (top right) and choose Switch portal. The other portal opens already signed in.',
    points: [
      'Only the portals for your roles are listed (everyone can open the Staff portal)',
      'Each portal still has its own sign-in, so logging out of one leaves the others as they are',
    ],
  },
  {
    id: 14,
    date: '29 Oct 2026',
    title: 'Sign-ups from any email, with you approving outside ones',
    body: 'People can now sign up with any email address, not only @nextan.com.sg. You hear about every new sign-up in your Inbox and by email to hr.admin@.',
    points: [
      'Nextan emails become active as soon as the person verifies their email, as before',
      'Other emails (e.g. Gmail) wait for you after they verify: approve or reject them under Approvals > Pending Accounts',
      'Microsoft (Outlook) sign-in still only accepts Nextan accounts',
    ],
  },
  {
    id: 13,
    date: '29 Oct 2026',
    title: 'Leave by the hour',
    body: 'Staff can now take annual or emergency leave by the hour (1 to 4 hours on one day). Leave lists, the calendar and reports show it as hours, e.g. 2 h.',
    points: [
      'It counts against the leave balance as part of a day: 8 hours is 1 day',
      'Editing an hourly request keeps it hourly; you can change its date and hours',
    ],
  },
  {
    id: 12,
    date: '28 Oct 2026',
    title: 'Coming up on your Dashboard',
    body: 'Your Dashboard now shows what is coming up for you: your own next leave and your office’s upcoming public holidays, as small cards in one row.',
    points: [
      'Shows the next three items, soonest first',
      'View calendar opens the full Calendar',
    ],
  },
  {
    id: 11,
    date: '22 Oct 2026',
    title: 'Public holidays for each country',
    body: "The Calendar page now manages public holidays for Singapore, Malaysia, China and Sri Lanka. Pick the country from the Holidays for dropdown.",
    points: [
      "Fetch official holidays works for every country: Singapore from data.gov.sg, the others from Google's holiday calendar",
      "Untick any fetched holiday you don't want before adding them",
      "For a Malaysian holiday, choose Nationwide or Only some states and tick the states",
      "Some Malaysian state holidays (such as Sultans' birthdays) aren't in the fetched list, so add those by hand",
    ],
  },
  {
    id: 10,
    date: '22 Oct 2026',
    title: 'Office country and time zone for each user',
    body: "Each user now has an office country, and their attendance follows that office's time zone.",
    points: [
      "Set it in Users → Edit User: Singapore, Malaysia, China or Sri Lanka",
      "Everyone starts as Singapore, so set it for staff based elsewhere",
      "Attendance and Reports show times in the staff member's own office time, with a small country tag for anyone outside Singapore",
      "Lunch, overtime and clock-in reminders follow that office's clock",
    ],
  },
  {
    id: 9,
    date: '19 Oct 2026',
    title: 'A quick tour of the portal',
    body: 'The first time you log in to each portal, a short walkthrough points out each page in the sidebar and what it is for. Staff, managers and account managers get one too.',
    points: [
      'Use Next and Back to move through it, or Skip tour to close it; it only shows once',
      'Take it again any time from your Profile page',
    ],
  },
  {
    id: 8,
    date: '13 Oct 2026',
    title: 'A fresh new look and a Dashboard',
    body: 'The portal has a cleaner design, and you now land on a new Dashboard after logging in.',
    points: [
      'The Dashboard shows leave and claims waiting for you, employees, active projects and who is out today',
      'The bell shows how many leave requests and claims are waiting, and opens the right Approvals tab',
      'The menu button next to search hides or shows the sidebar labels; Profile and Log out are at the bottom of the sidebar',
      'The Calendar has a cleaner month view',
    ],
  },
  {
    id: 7,
    date: '12 Oct 2026',
    title: 'Expense claims',
    body: 'Staff can now claim expenses from a receipt photo. After their manager approves, claims come to the new Claims page for your final approval.',
    points: [
      'Approve or reject claims (a reason is needed to reject), one at a time or in bulk',
      'Mark approved claims paid with the payment date and a reference; staff are told in their Inbox',
      'Export a month’s approved claims as a CSV for payroll, with a total per staff member; each claim shows its tax and service charge',
      'Claims that look like the same receipt as another claim (same date, amount and merchant), by anyone, are flagged as a possible duplicate',
      'Claims in another currency show the SGD amount at the purchase date’s exchange rate, and the payroll CSV has the rate and the SGD amount',
      'See this month’s receipt-scanning spend against its US$20 monthly limit',
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
