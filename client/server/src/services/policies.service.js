import { pool } from '../config/db.js';

const ROOMS_KEY = 'public_policies_rooms';
const VENUES_KEY = 'public_policies_venues';
const MAX_POLICY_LENGTH = 50_000;

export const DEFAULT_ROOMS_POLICIES = `## Purpose
These accommodation policies serve as a guide for guests staying within the Asia Pacific Theological Seminary (APTS) campus. They outline reservation requirements, payment guidelines, guest conduct expectations, meal arrangements, and important reminders to help ensure a safe, peaceful, and orderly stay.

## Reservation and Deposit Guidelines
Upon approval of a reservation, a twenty-five percent (25%) deposit is required to confirm the booking. An additional fifty percent (50%) deposit must be paid at least thirty (30) days before the scheduled stay. For reservations made less than thirty (30) days before the scheduled stay, a fifty percent (50%) deposit shall be required upon approval.

All displayed rates are for reference only and may still be reviewed by the Housing Office. Final charges may vary depending on the approved reservation details, room assignment, number of guests, additional requests, and applicable fees.

## Cancellation Policy
If a reservation is cancelled more than thirty (30) days before the scheduled stay, ten percent (10%) of the deposit shall be deducted. If a reservation is cancelled less than thirty (30) days before the scheduled stay, fifty percent (50%) of the deposit shall be forfeited.

Cancellation requests are subject to review and must follow the official reservation guidelines of APTS.

## Check-In and Check-Out
The standard check-in and check-out time for all accommodations is 12:00 noon. Guests are requested to complete check-in and check-out procedures during regular business hours.

Payment for bills incurred is required upon check-in. Guests who plan to vacate their accommodations outside regular business hours must settle any additional charges at the Housing Office or Business Office on the day before departure.

Upon departure, room keys may be left inside the locked room or surrendered to the guard on duty.

## Business Hours
- Monday to Friday: 8:00 AM – 4:30 PM
- Saturday: Closed
- Sunday: Closed

Guests are encouraged to coordinate concerns, payments, extensions, and additional requests during business hours.

## Meal Reservations
Meals must be reserved in advance. The standard meal schedule is as follows:

- Breakfast: 7:00 AM – 7:45 AM
- Lunch: 12:00 PM – 1:00 PM
- Dinner/Supper: 5:00 PM – 5:45 PM

Special meal schedules or arrangements may be coordinated through the Food Service Manager, subject to approval and availability.

## Guest Conduct and Campus Rules
Guests are expected to conduct themselves according to acceptable Christian social and moral standards while on campus. APTS is a non-smoking campus. Smoking, alcoholic beverages, illegal drugs, and similar prohibited substances are not allowed within the premises.

Guests are required to observe quiet hours from 10:00 PM to 7:00 AM. During these hours, guests should refrain from roaming around the campus and avoid activities that may disturb residents, students, faculty, staff, and other guests.

As APTS is primarily a school and residential community, all guests are expected to respect the comfort, safety, privacy, and peaceful environment of the campus.

## Room Assignment and Occupancy
Room assignments are subject to availability and confirmation by the Housing Office. Guests must follow the approved room capacity and occupancy guidelines.

Male and female guests may be assigned to separate rooms unless they are staying as a family. Additional guests, mattresses, room changes, or special arrangements may require admin approval and may be subject to additional charges.

## Cleanliness and Damages
Guests are expected to maintain cleanliness in their rooms and shared areas throughout their stay. Any damage to property, room equipment, furniture, keys, or other APTS assets may result in corresponding charges or penalties.

Guests are also responsible for ensuring that the room is left in proper condition upon check-out.

## Contact Information
Merlyn Ramos
Housing & Guest Services Supervisor

- Telephone: (6374) 442-2779 / 442-7068 Ext. 283
- Fax: (6374) 442-6378
- Mobile Number: 0929-599-1831
- Email: guestservices@apts.edu
- Website: www.apts.edu`;

export const DEFAULT_VENUES_POLICIES = `## Purpose
These facility usage policies serve as a guide for guests, groups, and organizations reserving venues or facilities within the Asia Pacific Theological Seminary (APTS) campus. They outline reservation guidelines, payment requirements, event responsibilities, facility restrictions, and conduct expectations to help ensure proper and respectful use of APTS spaces.

## Reservation and Deposit Guidelines
Upon approval of a facility reservation, a twenty-five percent (25%) deposit is required to confirm the booking. An additional fifty percent (50%) deposit must be paid at least thirty (30) days before the scheduled event. For reservations made less than thirty (30) days before the scheduled event, a fifty percent (50%) deposit shall be required upon approval.

All displayed rates are for reference only and may still be reviewed by the Housing Office. Final charges may vary depending on the approved venue, event duration, number of participants, setup requirements, additional requests, equipment use, extra hours, and applicable fees.

## Cancellation Policy
If a reservation is cancelled more than thirty (30) days before the scheduled event, ten percent (10%) of the deposit shall be deducted. If a reservation is cancelled less than thirty (30) days before the scheduled event, fifty percent (50%) of the deposit shall be forfeited.

Cancellation requests are subject to review and must follow the official reservation guidelines of APTS.

## Venue Use and Event Schedule
The use of any APTS venue or facility is subject to availability, approval, and the specific purpose of the event. Guests must use the venue only for the approved reservation purpose, date, and time.

Some venues may require a minimum booking duration. Additional hours may be charged based on the configured hourly rate and must be approved by the Housing Office or assigned administrator.

Event setup, program time, cleanup, and exit from the venue should be included within the approved reservation schedule.

## Business Hours
- Monday to Friday: 8:00 AM – 4:30 PM
- Saturday: Closed
- Sunday: Closed

Guests and event organizers are encouraged to coordinate payments, setup requests, changes, and additional concerns during business hours.

## Guest and Event Conduct
Guests, participants, and organizers are expected to conduct themselves according to acceptable Christian social and moral standards while on campus. APTS is a non-smoking campus. Smoking, alcoholic beverages, illegal drugs, and similar prohibited substances are not allowed within the premises.

Guests are required to observe quiet hours from 10:00 PM to 7:00 AM. Activities must not disturb residents, students, faculty, staff, or other guests.

As APTS is primarily a school and residential community, all activities must respect the comfort, safety, privacy, and peaceful environment of the campus.

## Group and Event Responsibilities
For group events, a responsible representative must coordinate with the Housing Office and campus security when necessary. The representative is responsible for ensuring that only authorized guests and participants are admitted to the event.

Groups accompanied by children and/or young people are required to designate a responsible adult or supervisor who will help ensure proper conduct, safety, and compliance with facility guidelines.

The organization or group reserving the venue is legally responsible for any damage to property, equipment, furniture, or facilities resulting from their use of APTS spaces. They are also responsible for ensuring the safety and protection of participants and the general public during their activity.

## Facility Setup, Cleanliness, and Restrictions
Guests and organizers are required to maintain cleanliness in all areas used during the event. After the activity, the facility must be cleared of garbage, equipment, furniture, decorations, props, and other materials brought in for the event.

Heavy props and cameras mounted on walls or ceilings are strictly prohibited. Making or digging holes, picking flowers, damaging landscaped areas, or altering facility structures is not allowed.

Decorations, equipment setup, food arrangements, and special venue layouts must be coordinated and approved in advance. Failure to comply with facility usage restrictions may result in additional charges, penalties, or restrictions on future reservations.

## Equipment, Inclusions, and Additional Requests
Venue inclusions may vary depending on the selected facility. Available inclusions, such as chairs, tables, sound equipment, projectors, or other setup items, must be confirmed with the Housing Office or assigned administrator.

Additional equipment, special arrangements, extra setup time, extended use, cleaning requirements, or other requests may be subject to approval and additional charges.

## Contact Information
Merlyn Ramos
Housing & Guest Services Supervisor

- Telephone: (6374) 442-2779 / 442-7068 Ext. 283
- Fax: (6374) 442-6378
- Mobile Number: 0929-599-1831
- Email: guestservices@apts.edu
- Website: www.apts.edu`;

export async function getPublicPolicies() {
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value, updated_at
     FROM system_settings WHERE setting_key IN (?, ?)`,
    [ROOMS_KEY, VENUES_KEY]
  );
  const settings = new Map(rows.map((row) => [row.setting_key, row]));
  const rooms = settings.get(ROOMS_KEY);
  const venues = settings.get(VENUES_KEY);
  const updatedAt = [rooms?.updated_at, venues?.updated_at]
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null;
  return {
    rooms: rooms?.setting_value || DEFAULT_ROOMS_POLICIES,
    venues: venues?.setting_value || DEFAULT_VENUES_POLICIES,
    updated_at: updatedAt,
  };
}

function validatePolicyText(value, label) {
  const text = String(value || '').trim();
  if (text.length < 100) throw new Error(`${label} policies must contain at least 100 characters`);
  if (text.length > MAX_POLICY_LENGTH) {
    throw new Error(`${label} policies cannot exceed ${MAX_POLICY_LENGTH.toLocaleString()} characters`);
  }
  return text;
}

export async function updatePublicPolicies({ rooms, venues } = {}) {
  const nextRooms = validatePolicyText(rooms, 'Rooms / Accommodation');
  const nextVenues = validatePolicyText(venues, 'Venues / Facilities');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?), (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
      [ROOMS_KEY, nextRooms, VENUES_KEY, nextVenues]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getPublicPolicies();
}
