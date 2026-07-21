# AptSpace Bug Fix Pass — Changelog (Jul 2026)

Notes from the 18-item bug-fix pass. Tests: run `npm test` under `client/server/` after each area; no dedicated regression suite existed for most UI flows at time of writing.

---

## 1. Duplicate reservation requests (admin + guest)

**Symptom:** The same booking request appeared twice (single card + group card, or N+1 cards for multi-room).

**Root cause:** Guest room requests were stored as both a `reservation_groups` row and child `bookings_rooms` rows with `group_id` set, while `GET /api/bookings` returned all room rows. UIs merged `getBookings()` + `getGroups()` and only filtered duplicates client-side via `isStandaloneRoomBooking`.

**Fix:** `getAllBookings` now excludes `group_id IS NOT NULL` rows by default (`include_group_children=1` opt-in for calendar). Single-room booking-request submissions create a standalone `bookings_rooms` row (no group wrapper). Multi-room submissions still use `reservation_groups`. Frontend keeps `isStandaloneRoomBooking` as a safety net.

**Tests:** `client/server/test/integration/api.reservation-flows.test.js` — no duplicate-list assertion; manual verify pending lists.

---

## 2. Meal counting for multi-night stays

**Symptom:** Meals stored as flat totals with no date; kitchen could not see which days needed which meals.

**Root cause:** `bookings_meals` had `(bookings_room_id, meal_type)` unique key only; UI collected `{ Breakfast: 3 }` for the whole stay.

**Fix:** Migration `bookings-meals-per-day.js` adds `meal_date DATE NOT NULL` and unique `(bookings_room_id, meal_type, meal_date)`. Backend `normalizeMealsPayload` / `saveBookingMeals` / `calcMealsTotal` accept per-day `{ byDate: { 'YYYY-MM-DD': { Breakfast: 1 } } }` or legacy flat totals (expanded across stay nights). Admin/guest detail uses `formatMealsBreakdownDisplay`.

**Tests:** `client/server/test/unit/booking-pricing.test.js` — extend for per-day meals if adding coverage.

---

## 3. Booking ref inside guest notes

**Symptom:** `Booking request ref: BR-…` appended to free-text notes.

**Root cause:** Workaround before dedicated columns existed.

**Fix:** Migration adds `booking_ref` on `bookings_rooms`, `reservation_groups`, and `bookings_facilities`. Submission writes `booking_ref` column only; notes left for guest text. Existing refs in notes remain until manually cleaned.

---

## 4. Fee breakdown before final submit

**Symptom:** Guest review step showed totals without full itemization; frontend math could drift from server.

**Fix:** Added `POST /api/bookings/stay-quote` → `getStayQuote()` returning room nights, meal lines, fee lines, and grand total from shared `computeGrandTotal` / seasonal room pricing. Guest booking-request review and room modal wired to use quote where implemented.

**Tests:** None for stay-quote endpoint yet.

---

## 5. Extra bed / extra person rate tiers guest-selectable

**Symptom:** Guests picked Regular / Peak / Super Peak for extra bed/person.

**Fix:** Guest fee picker collapses accommodation extras to one “Extra bed / extra person” action. `resolveGuestLodgingExtraFees` resolves total from stay dates via `calculateLodgingExtraTotalForStay` (per-night seasons). `sanitizeGuestSubmittedFees` accepts lodging-extra intent without guest-supplied tier amount.

---

## 6. Single-room booking flagged as group stay

**Symptom:** One-room requests showed as “Group stay” because every booking-request created a `reservation_groups` row.

**Fix:** Migration adds `is_group_stay TINYINT` on `reservation_groups`. Single-room booking-request path creates standalone pending booking; multi-room sets `is_group_stay=1`. UI uses `is_group_stay` / `isGroupStayRecord()` — not room count alone.

---

## 7. False “already booked” on approval, stuck pending, missing from calendar

**Symptoms:** Approve failed but UI looked approved; calendar missing group stays; overlap false positives.

**Root causes:**
- Group header `status` updated before child `bookings_rooms` in separate transactions.
- Client pre-check in `approveSingleRequest` stricter than server.
- Overlap check counted sibling pending rows; no skip on status-only Pending→Approved.
- Calendar only listed standalone bookings.

**Fix:** Group approve updates metadata first, then `saveGroupBookings` commits status atomically with children; cascade-approve children when approving group without room payload. Removed redundant client availability pre-check. `validateBookingUpdate` skips overlap on status-only approval; passes `excludeGroupId`. Calendar merges group child bookings from `getGroups()`. Pending unassigned groups included.

**Tests:** Integration reservation-flow tests do not cover approve overlap edge cases.

---

## 8. Billing amounts must match approved reservations

**Symptom:** Billing could show wrong totals vs wizard.

**Fix:** Invoices still snapshot `bookings_rooms.total_amount` at approve time, but that total is now computed via shared `computeGrandTotal` with per-day meals and resolved lodging extras. `listAllPaymentRows` continues to filter `Approved` only. Payment venue query uses `DISTINCT` pattern via separate room/venue queries (no meal JOIN fan-out).

---

## 9. Billing modal stuck / unclosable

**Symptom:** Clicking a billing row left a blocking overlay; close did nothing.

**Root cause:** Async race — `openInvoiceModal` re-rendered after close; `reload()` used stale `modalOpen`; confirm sub-dialog could block float close.

**Fix:** Open-generation token bails stale fetches; `reload()` re-checks `isBillingInvoiceModalOpen()` after fetch; existing busy-state guard retained.

---

## 10. Prayer Mountain 4-hour minimum

**Symptom:** Prayer Mountain allowed sub-4-hour bookings.

**Fix:** Migration sets `min_hours = 4` for `facility_group = 'Prayer Mountain'`. Existing `validateVenueDuration` / guest wizard client validation pick up `min_hours` from catalog.

---

## 11. Pending venues under Reservations → Venues

**Symptom:** Pending venue requests appeared in Venues tab.

**Fix:** Venues tab filters to `approved` / `cancelled` only; pending venues stay on Pending tab. Active venue filter no longer includes `pending`.

---

## 12. Venue “request received” email not sending

**Symptom:** Only venue request-received email broken.

**Root cause:** No `sendVenueBookingRequestReceivedEmail` wired on guest create paths (room/group had equivalent).

**Fix:** Implemented email template and call from `facilityBooking.controller.js` (guest pending create) and `booking-request.service.js` (batch venue lines).

**Recommendation:** The on-screen copy (“Venue booking submitted! You'll be notified once it's approved.” / batch success UI) already confirms receipt. Email is optional redundancy for guests who leave the page — **keep the fixed email** for parity with room request-received mail, but it is not strictly necessary if product prefers fewer emails later.

---

## 13. Guest reservation history — expandable detail

**Fix:** “View details” button per card opens modal with rooms, dates, per-day meals, extras, total (from stored booking/group payload). Compact list unchanged.

---

## 14. Calendar color coding for pending items

**Fix:** Calendar includes pending room rows (standalone + group children) and pending venues. Existing `statusPillClass` / `borderAccent` use amber for pending vs green for approved.

---

## 15. Pending requests whose dates have passed

**Product decision:** Do **not** auto-reject or auto-delete. Surface **“Dates passed”** badge on pending requests in admin lists when `check_out < today` so staff can manually reject or follow up.

---

## 16. Remove “Book another room” after single-room reserve

**Fix:** Removed post-submit “Book another room” CTA from single-room modal success state (multi-room remains via group/booking-request flow).

---

## 17. Dashboard “Today” — in-house guests

**Fix:** `stats.controller.js` adds `inHouse` query (`check_in <= today < check_out`, Approved). Dashboard Today card shows Coming in / In-house / Leaving / Events columns.

---

## 18. Hide dashboard poll flash on “Waiting for you”

**Fix:** `loadDashboard({ background: true })` passes `{ background }` to render helpers; fingerprint compare skips DOM writes when unchanged; `staggerReveal` skipped on background polls for action queue.
