/**
 * Official APTS Housing & Guest Services contact + distilled campus policies.
 * Keep guest-facing copy concise; full handbook lives with Housing Office.
 */

export const HOUSING_CONTACT = {
  name: 'Merlyn Ramos',
  title: 'Housing & Guest Services Supervisor',
  email: 'guestservices@apts.edu',
  phoneDisplay: '(6374) 442-2779 / 442-7068 Ext. 283',
  phonePrimaryTel: 'tel:+63744422779',
  fax: '(6374) 442-6378',
  mobileDisplay: '0929-599-1831',
  mobileTel: 'tel:+639295991831',
  website: 'https://www.apts.edu',
  websiteLabel: 'www.apts.edu',
  officeHours: 'Monday–Friday, 8:00 AM – 4:30 PM',
  officeHoursNote: 'Closed Saturday and Sunday',
  campusLine: '444 Ambuklao, Baguio City, Philippines',
  organization: 'Asia Pacific Theological Seminary',
  label: 'Housing & Guest Services',
};

/** Compact chips shown in guest browse / booking UI (rooms). */
export const ROOM_POLICY_HIGHLIGHTS = [
  {
    icon: 'payments',
    title: 'Deposits',
    text: '25% on approval · +50% by 30 days before stay (or 50% if booking within 30 days). Rates are reference only.',
  },
  {
    icon: 'event_busy',
    title: 'Cancellation',
    text: 'More than 30 days before: 10% of deposit deducted. Less than 30 days: 50% of deposit forfeited.',
  },
  {
    icon: 'schedule',
    title: 'Check-in / out',
    text: '12:00 noon. Settle bills on check-in. After-hours departures: settle extras the day before.',
  },
  {
    icon: 'restaurant',
    title: 'Meals',
    text: 'Reserve in advance · Breakfast 7:00–7:45 · Lunch 12:00–1:00 · Dinner 5:00–5:45.',
  },
  {
    icon: 'volume_off',
    title: 'Quiet hours',
    text: '10:00 PM – 7:00 AM. Non-smoking campus · no alcohol or illegal drugs.',
  },
  {
    icon: 'meeting_room',
    title: 'Occupancy',
    text: 'Follow approved capacity. Mixed-gender rooms for families only unless Housing approves otherwise.',
  },
];

/** Compact chips for venues / facilities. */
export const VENUE_POLICY_HIGHLIGHTS = [
  {
    icon: 'payments',
    title: 'Deposits',
    text: '25% on approval · +50% by 30 days before the event (or 50% if booking within 30 days). Rates are reference only.',
  },
  {
    icon: 'event_busy',
    title: 'Cancellation',
    text: 'More than 30 days before: 10% of deposit deducted. Less than 30 days: 50% of deposit forfeited.',
  },
  {
    icon: 'event',
    title: 'Schedule',
    text: 'Use only the approved purpose, date, and time. Setup, program, and cleanup must fit the booked window.',
  },
  {
    icon: 'groups',
    title: 'Group duty',
    text: 'Name a responsible representative. Youth groups need a supervising adult on site.',
  },
  {
    icon: 'cleaning_services',
    title: 'Clean & clear',
    text: 'Leave the venue clean. No wall/ceiling mounts, holes, flower picking, or landscaping damage.',
  },
  {
    icon: 'volume_off',
    title: 'Campus conduct',
    text: 'Quiet hours 10:00 PM – 7:00 AM. Non-smoking campus · no alcohol or illegal drugs.',
  },
];

/** Default free-text policies when a room has none saved (admin can override per room). */
export const DEFAULT_ROOM_POLICIES_TEXT = [
  'Deposit: 25% upon approval; additional 50% at least 30 days before stay (50% if booked within 30 days). Displayed rates are reference only and subject to Housing Office review.',
  'Cancellation: More than 30 days before stay — 10% of deposit deducted. Less than 30 days — 50% of deposit forfeited.',
  'Check-in / check-out: 12:00 noon. Payment of incurred bills is due on check-in. Keys may be left in the locked room or with the guard.',
  'Office hours: Mon–Fri 8:00 AM–4:30 PM (closed Sat–Sun).',
  'Meals: Reserve in advance. Breakfast 7:00–7:45 AM · Lunch 12:00–1:00 PM · Dinner 5:00–5:45 PM.',
  'Conduct: Non-smoking campus. No alcohol or illegal drugs. Quiet hours 10:00 PM–7:00 AM.',
  'Occupancy: Follow approved capacity. Male/female guests are housed separately unless staying as a family (or Housing approves otherwise).',
  'Cleanliness & damages: Keep rooms tidy; guests may be charged for damage to APTS property.',
].join('\n');

/** Default free-text policies when a venue has none saved. */
export const DEFAULT_VENUE_POLICIES_TEXT = [
  'Deposit: 25% upon approval; additional 50% at least 30 days before the event (50% if booked within 30 days). Displayed rates are reference only and subject to Housing Office review.',
  'Cancellation: More than 30 days before event — 10% of deposit deducted. Less than 30 days — 50% of deposit forfeited.',
  'Venue use: Only for the approved purpose, date, and time. Setup, program, cleanup, and exit must fall within the booked schedule. Extra hours may incur charges.',
  'Office hours: Mon–Fri 8:00 AM–4:30 PM (closed Sat–Sun).',
  'Conduct: Non-smoking campus. No alcohol or illegal drugs. Quiet hours 10:00 PM–7:00 AM.',
  'Groups: A responsible representative must coordinate with Housing/security. Youth groups need a supervising adult. The reserving group is liable for damages.',
  'Facility care: Clear garbage, décor, and equipment after use. No wall/ceiling mounts, digging holes, picking flowers, or altering structures. Special setups need prior approval.',
  'Inclusions: Confirm chairs, tables, AV, and other inclusions with Housing — extras may be charged.',
].join('\n');

export function resolvePoliciesText(savedText, kind = 'room') {
  const saved = String(savedText || '').trim();
  if (saved) return saved;
  return kind === 'venue' ? DEFAULT_VENUE_POLICIES_TEXT : DEFAULT_ROOM_POLICIES_TEXT;
}

export function policyHighlightsFor(kind = 'room') {
  return kind === 'venue' ? VENUE_POLICY_HIGHLIGHTS : ROOM_POLICY_HIGHLIGHTS;
}

export function housingContactMailto() {
  return `mailto:${HOUSING_CONTACT.email}`;
}
