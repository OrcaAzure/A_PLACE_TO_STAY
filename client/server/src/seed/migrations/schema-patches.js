import { safeRun } from '../helpers.js';
import { runTableRenameMigration } from './legacy-renames.js';
import {
  runDeluxeRoomTypeMigration,
  runDormCapacityMigration,
  runSuperiorGuestRoomCapacityMigration,
  runVipRoomMigration,
  runSeasonSettingsMigration,
  runLodgingExtrasMigration,
  runRoomGuestCopyMigration,
  runRoomsDirtyStatusMigration,
  runRoomTypeVarcharMigration,
} from './rooms.js';
import { runGuestOnlyRateCleanup } from './guest-only-rates-cleanup.js';
import {
  runBookingsMealsSnackEnum,
  runMealTypeVarcharMigration,
} from './meal-type-varchar.js';
import {
  runFacilitiesCatalogMigration,
  runGmcAblockMigration,
  runVenueFieldsMigration,
} from './facilities.js';
import { runBookingsMealsPerDayMigration } from './bookings-meals-per-day.js';
import { runBookingRefMigration } from './booking-ref.js';
import { runReservationGroupsIsGroupStayMigration } from './reservation-groups-is-group-stay.js';
import {
  runPaymentsTableCreate,
  runPaymentsEvolution,
} from './payments.js';
import {
  runUsersRoleExpansion,
  runUsersSessionColumns,
  runUsersRoleSimplify,
  runUsersViewOnlyAdminRole,
  runUsersRemoveSupervisoryRole,
  runUsersEmptyRoleRepair,
  runUsersProfileCleanup,
} from './users.js';
import {
  runBookingsMealAllergenNotes,
  runBookingsFacilitiesCreate,
  runBookingsOccupancyItemVarchar,
  runBookingsPricingCategory,
  runBookingsFacilitiesContactPhone,
} from './bookings.js';
import {
  runSystemSettingsBootstrap,
  runGuestCancellationCutoffHours,
} from './system-settings.js';
import {
  runGuestAccessRequestsTable,
  runAuditLogsTable,
  runLoginAttemptsTable,
} from './auth-tables.js';
import { runBuildingsCleanup } from './buildings-cleanup.js';
import { runRatesAncillaryExtract } from './rates-ancillary-extract.js';
import { runRatesVariantsMigration } from './rates-variants.js';
import { runExtraGuestVisibleMigration } from './extra-guest-visible.js';
import { runBookingUxRecycleMigration } from './booking-ux-recycle.js';

export async function runSchemaPatches() {
  // 1. Rooms Dirty ENUM
  await safeRun('rooms Dirty status ENUM', runRoomsDirtyStatusMigration);
  // 2. Payments table create (before legacy rename)
  await safeRun('payments table create', runPaymentsTableCreate);
  // 3. Bookings snack / allergen (early)
  await safeRun('bookings_meals Snack ENUM', runBookingsMealsSnackEnum);
  await safeRun('bookings_rooms meal_allergen_notes', runBookingsMealAllergenNotes);
  // 4. Users role expansion stages
  await safeRun('users role expansion', runUsersRoleExpansion);
  // 5. bookings_facilities create (before rename)
  await safeRun('bookings_facilities create', runBookingsFacilitiesCreate);
  // 6. System settings → guest cutoff
  await safeRun('system_settings bootstrap', runSystemSettingsBootstrap);
  await safeRun('guest cancellation cutoff hours', runGuestCancellationCutoffHours);
  // 7. Auth tables
  await safeRun('guest_access_requests', runGuestAccessRequestsTable);
  await safeRun('audit_logs', runAuditLogsTable);
  // 8. Buildings cleanup (before GMC name lookups)
  await safeRun('buildings rename/removal', runBuildingsCleanup);
  // 9. Rates ancillary extract (before facilities catalog)
  await safeRun('ancillary rates extract', runRatesAncillaryExtract);
  // 10. legacy-renames
  await safeRun('table rename migration', runTableRenameMigration);
  // 11. Facilities: A-block → catalog → venue fields
  await safeRun('GMC A-block migration', runGmcAblockMigration);
  await safeRun('facilities catalog migration', runFacilitiesCatalogMigration);
  await safeRun('venue fields migration', runVenueFieldsMigration);
  // 12. Rooms: deluxe → dorm → superior → season → lodging extras → guest copy
  await safeRun('deluxe room type migration', runDeluxeRoomTypeMigration);
  await safeRun('dorm capacity migration', runDormCapacityMigration);
  await safeRun('superior guest room capacity migration', runSuperiorGuestRoomCapacityMigration);
  await safeRun('season settings migration', runSeasonSettingsMigration);
  await safeRun('lodging extras migration', runLodgingExtrasMigration);
  await safeRun('room guest copy migration', runRoomGuestCopyMigration);
  // 13. Room type VARCHAR → VIP
  await safeRun('room type column migration', runRoomTypeVarcharMigration);
  await safeRun('VIP room migration', runVipRoomMigration);
  // 14. Bookings occupancy_item
  await safeRun('bookings_rooms.occupancy_item', runBookingsOccupancyItemVarchar);
  // 15. Rates variants → guest-only cleanup → meal VARCHAR
  await safeRun('rates variants migration', runRatesVariantsMigration);
  await safeRun('guest-only rate cleanup', runGuestOnlyRateCleanup);
  await safeRun('meal type varchar migration', runMealTypeVarcharMigration);
  await safeRun('extra guest visible migration', runExtraGuestVisibleMigration);
  // 16. Payments evolution
  await safeRun('payments evolution', runPaymentsEvolution);
  // 17. Login attempts → user sessions → pricing_category
  await safeRun('login_attempts table', runLoginAttemptsTable);
  await safeRun('users session columns', runUsersSessionColumns);
  await safeRun('pricing_category migration', runBookingsPricingCategory);
  // 18. Users role simplify → facilities contact_phone → empty role → profile
  await safeRun('users role simplification', runUsersRoleSimplify);
  await safeRun('users view-only admin role', runUsersViewOnlyAdminRole);
  await safeRun('users remove supervisory role', runUsersRemoveSupervisoryRole);
  await safeRun('bookings_facilities.contact_phone', runBookingsFacilitiesContactPhone);
  await safeRun('users empty role repair', runUsersEmptyRoleRepair);
  await safeRun('users profile fields', runUsersProfileCleanup);
  // 19. Meals per-day → booking_ref → is_group_stay
  await safeRun('bookings-meals-per-day migration', runBookingsMealsPerDayMigration);
  await safeRun('booking-ref migration', runBookingRefMigration);
  await safeRun('reservation-groups is_group_stay migration', runReservationGroupsIsGroupStayMigration);
  // 20. Booking UX: fee qty, arrival time, soft-delete recycle
  await safeRun('booking UX recycle migration', runBookingUxRecycleMigration);
}
