// Steps for the first-login walkthrough (WalkthroughTour.js). Each portal has its own copy.
// `target` is a CSS selector for the element the step points at; leave it out for a centred card.
// The first step is the welcome card and isn't counted in "1 of N".

export const TOUR_PORTAL = 'hr';
export const TOUR_SESSION_KEY = 'hr_portal_user';

const nav = (href) => `nav[aria-label="Main"] a[href="${href}"]`;

export const TOUR_STEPS = [
  {
    title: 'Welcome to the HR portal',
    body: "Here's a quick look around so you know where everything is. It takes about a minute, and you can skip it at any time.",
  },
  {
    target: nav('/dashboard'),
    title: 'Dashboard',
    body: 'A summary of everything waiting for HR.',
  },
  {
    target: nav('/admin'),
    title: 'Approvals',
    body: 'Review requests waiting for HR, and look back at past decisions.',
  },
  {
    target: nav('/people'),
    title: 'Employee',
    body: 'Manage roles and leave days for any Nextan employee.',
  },
  {
    target: nav('/project-codes'),
    title: 'Projects',
    body: 'Create and manage project codes, and see who reports to whom on each project.',
  },
  {
    target: nav('/attendance'),
    title: 'Attendance',
    body: 'Monitor attendance across all employees.',
  },
  {
    target: nav('/claims'),
    title: 'Claims',
    body: 'Give final approval to expense claims, mark them paid with payroll, and export each month for payment.',
  },
  {
    target: nav('/reports'),
    title: 'Reports',
    body: 'Generate a PDF activity report for one employee or all staff.',
  },
  {
    target: nav('/calendar'),
    title: 'Calendar',
    body: "Public holidays and who's on leave across the company.",
  },
  {
    target: nav('/audit-log'),
    title: 'Audit Log',
    body: 'A read-only record of changes to timesheets, leave, budgets, projects and employee settings.',
  },
  {
    target: 'input[aria-label="Search"]',
    title: 'Search',
    body: 'Type what you want to do, for example "approve leave", to jump straight to the right page.',
  },
  {
    target: 'button[aria-label^="Notifications"]',
    title: 'Notifications',
    body: 'The bell counts the requests waiting for HR. Open it to go straight to them.',
  },
  {
    target: 'aside a[href="/profile"]',
    title: 'Your profile',
    body: 'Change your password and see the devices you stay signed in on. You can take this tour again from here at any time.',
  },
];
