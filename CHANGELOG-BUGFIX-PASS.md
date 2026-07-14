# AptSpace Bug Fix Pass — Changelog (Jul 2026)

## 1. Duplicate reservation requests
**Root cause:** `GET /api/bookings` returned group child rows (`bookings_rooms` with `group_id` set) alongside `GET /api/groups`, so the UI showed one group card plus N room-line duplicates.

**Fix:** `getAllBookings` now excludes `group_id IS NOT NULL` rows by default (`?include_group_children=1` opt-in). Frontend `isStandaloneRoomBooking` kept as safety net.

**Tests:** Existing integration tests pass; no dedicated dedup test.

---

## 2. Per-day meal counting
**Model:** `bookings_meals` now has `meal_date` (migration `bug-fix-pass-jul2026.js`). Meals stored as `(meal_date, meal_type, quantity)`.

**API:** `normalizeMealsPayload` accepts `{ byDate: { 'YYYY-MM-DD': { Breakfast: 2 } } }` or legacy flat totals (interpreted as same qty each stay night).

**UI:** `formatMealsBreakdownDisplay` for admin/guest detail views. Guest per-day picker in `guest-booking-extras` — wire `setStayDates(checkIn, checkOut)` when dates are known (room modal / booking request drawer).

**Tests:** `booking-pricing.test.js` passes; no per-day meal integration test yet.

---

## 3. Booking ref in guest notes
**Fix:** Dedicated `booking_ref` column on `bookings_rooms`, `reservation_groups`, and `bookings_facilities`. Submission writes ref to column, not concatenated into `notes`.

---

## 4. Fee breakdown before submit
**Fix:** New `POST /api/bookings/stay-quote` → `getStayQuote()` — shared itemized breakdown (room nights, per-day meals, resolved extras, grand total). Guest wizards should call `getStayQuote()` on review step (wire in `reservation-wizard.js` / `group-reservation-wizard.js`).

---

## 5. Extra bed/person rate tiers
**Fix:** Guest fee picker shows one "Extra bed / extra person" option (no Regular/Peak/Super Peak choice). `resolveGuestLodgingExtraFees()` prices each stay night by season via `calculateLodgingExtraTotalForStay()`.

---

## 6. Single-room flagged as group stay
**Fix:** `is_group_stay` on `reservation_groups`. Single-room booking-request submissions create standalone `bookings_rooms` (no group parent). UI classifies `kind: 'group'` only when `is_group_stay` is true.

---

## 7. False "already booked" / stuck pending / calendar gaps
**Fixes:**
- Deduped bookings list reduces false overlap positives.
- Calendar (`timeline.js`) merges group child room rows from `getGroups()` so approved/pending group stays appear.
- Approval UI already awaits server response (`manage-requests.js`, `admin-reservations-hub.js`).

---

## 8. Billing amounts
**Fix:** Invoices use `bookings_rooms.total_amount` computed via shared `computeGrandTotal` / `getStayQuote` path. Billing list excludes group child duplicates via Item 1 API filter.

**Tests:** No billing-specific tests; payment flows covered indirectly.

---

## 9. Billing modal stuck
**Fix:** `admin-payments.js` uses event delegation on `#invoice-list` instead of rebinding click handlers on every `renderList()` poll.

---

## 10. Prayer Mountain 4-hour minimum
**Fix:** Migration sets `facilities.min_hours = 4` and `hourly_rate` to the Regular catalog rate for `facility_group = 'Prayer Mountain'`. Duration is enforced by `validateVenueDuration()`; billing stays hourly (`rate × hours`) via `isHourlyMinimumVenue()` — not a flat ₱6,000 package for 4 hours.

**Note:** An earlier pass set only `min_hours`, which made saves recalculate 4-hour bookings to ₱6,000 and kept resurfacing the billing “Confirm reservation changes” dialog. Re-run seed/migrations (or restart the API so schema patches apply) so `hourly_rate` is populated.

---

## 11. Pending venues in Reservations → Venues
**Fix:** Admin reservations hub venues tab filters to `approved` and `cancelled` only; pending stays in pending tab.

---

## 12. Venue request received email
**Root cause:** `createFacilityBooking` and booking-request venue path never called a request-received email (unlike room bookings).

**Fix:** Added `sendVenueBookingRequestReceivedEmail()`; triggered on guest pending venue create.

**Recommendation:** The on-screen "Venue booking submitted!" message already covers the moment. Email is optional for guests who leave the page immediately — **keep the email** as a paper trail, but consider making it opt-in via guest notification preferences in a future pass.

---

## 13. Guest reservation detail modal
**Fix:** "View details" on My Stays opens modal with dates, rooms, per-day meals, extras, total.

---

## 14. Calendar pending color
**Status:** Existing `mac-event--pending` / amber styling applies once pending rows reach calendar dataset (Item 7).

---

## 15. Past-date pending requests
**Product decision:** Do **not** auto-reject or auto-delete. Show **"Dates passed"** badge on pending requests in `manage-requests.js` for admin manual resolution.

---

## 16. Remove "Book another room"
**Fix:** Removed button and copy from single-room success panel (`reservations.html`, `facilities.html`, `guest-room-booking-modal.js`). Multi-room remains via group wizard.

---

## 17. Dashboard Today — in-house guests
**Fix:** `stats.controller` adds `inHouse` query (`check_in <= today < check_out`, approved). Dashboard renders "In-house" column.

---

## 18. Silent dashboard poll
**Fix:** `dashboard.js` fingerprints action queue and today board; background refresh skips DOM rewrite when data unchanged and skips entry animations.

---

## Migration
Run on server start via `runSchemaPatches()` → `runBugFixPassJul2026Migration()`:
- `bookings_meals.meal_date`
- `booking_ref` columns
- `reservation_groups.is_group_stay`
- Prayer Mountain `min_hours`

Update `schema.sql` separately for fresh installs if desired.
