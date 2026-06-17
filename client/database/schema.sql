-- ============================================
-- AptSpace Database Schema v2
-- ============================================

CREATE DATABASE IF NOT EXISTS aptspace;
USE aptspace;

-- ============================================
-- BUILDINGS
-- Stores each physical building on the property
-- e.g. PCALM, House, Thesda, Sampaguita, Peranza
-- ============================================

CREATE TABLE IF NOT EXISTS buildings (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,   -- e.g. 'PCALM', 'Thesda'
    description VARCHAR(255),                   -- optional notes about the building
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- ROOMS
-- Each room belongs to a building.
-- capacity_min / capacity_max enforce the guest
-- count rules from the FY26 rate sheet:
--   Dorm             = min 5, max 10
--   Superior         = min 1, max 4
--   Standard Apt     = min 1, max 4
--   Deluxe 2 BR      = min 1, max 4
--   Deluxe 3 BR      = min 1, max 6
-- ============================================

CREATE TABLE IF NOT EXISTS rooms (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    building_id   INT NOT NULL,                 -- which building this room is in
    room_number   VARCHAR(50) NOT NULL,         -- e.g. '101', 'BG1', 'A', 'CHAPEL'
    room_type     ENUM(
                    'Dorm',
                    'Superior Guest Room',
                    'Standard Apartment',
                    'Deluxe 2 BR',
                    'Deluxe 3 BR'
                  ) NOT NULL,
    capacity_min  INT NOT NULL DEFAULT 1,       -- minimum guests allowed (Dorm = 5)
    capacity_max  INT NOT NULL DEFAULT 1,       -- maximum guests allowed
    occupancy     INT NOT NULL DEFAULT 0,       -- current number of guests in room
    status        ENUM(
                    'Available',
                    'Occupied',
                    'Maintenance'
                  ) NOT NULL DEFAULT 'Available',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- prevent deleting a building that still has rooms
    CONSTRAINT fk_room_building
        FOREIGN KEY (building_id) REFERENCES buildings(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- room numbers are unique per building
    -- (so PCALM 101 and Thesda 101 can both exist)
    UNIQUE KEY uq_building_room (building_id, room_number),

    -- min must be at least 1, max must be >= min
    CONSTRAINT chk_capacity CHECK (capacity_min >= 1 AND capacity_max >= capacity_min),

    -- current occupancy can never exceed the room max
    CONSTRAINT chk_occupancy CHECK (occupancy >= 0 AND occupancy <= capacity_max)
);

-- ============================================
-- ROOM RATES
-- Stores nightly rates per room type, occupancy
-- item, and season from the FY26 rate sheet.
-- Used to calculate booking total_amount.
-- ============================================

CREATE TABLE IF NOT EXISTS room_rates (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    room_type ENUM(
                'Dorm',
                'Superior Guest Room',
                'Standard Apartment',
                'Deluxe 2 BR',
                'Deluxe 3 BR'
              ) NOT NULL,
    item      ENUM(
                'Per person per Night',       -- Dorm only
                'Single/Double Occupancy',    -- 1-2 guests
                'Daily Maximum',              -- flat rate for 3-4 (or 3-6) guests
                'Extra Bed or Extra Person'   -- add-on per extra guest
              ) NOT NULL,
    season    ENUM('Regular', 'Peak', 'Super Peak') NOT NULL,
    rate      DECIMAL(10,2) NOT NULL,

    -- each combo of type + item + season must be unique
    UNIQUE KEY uq_room_rate (room_type, item, season),

    -- rate must always be a positive number
    CONSTRAINT chk_rate CHECK (rate > 0),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- SEASON DEFINITIONS
-- Maps date ranges to seasons so the app can
-- automatically determine Regular / Peak /
-- Super Peak for any given booking date.
-- Populate this each fiscal year.
-- ============================================

CREATE TABLE IF NOT EXISTS season_definitions (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    season     ENUM('Regular', 'Peak', 'Super Peak') NOT NULL,
    start_date DATE NOT NULL,                  -- first day of this season window
    end_date   DATE NOT NULL,                  -- last day of this season window
    label      VARCHAR(100),                   -- optional label e.g. 'Christmas Peak 2026'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- end date must be on or after start date
    CONSTRAINT chk_season_dates CHECK (end_date >= start_date)
);

-- ============================================
-- FACILITIES
-- Non-room bookable spaces and services from
-- the FY26 rate sheet: chapel, garden, laundry,
-- food, courts, prayer mountain, etc.
-- capacity_min/max are NULL for services that
-- have no headcount limit (e.g. laundry, food).
-- ============================================

CREATE TABLE IF NOT EXISTS facilities (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    category     VARCHAR(50)  NOT NULL,        -- e.g. 'GMC Chapel', 'Garden', 'Laundry'
    item         VARCHAR(100) NOT NULL,        -- e.g. 'Wedding 4 hrs', 'Breakfast'
    season       ENUM('Regular', 'Peak', 'N/A') NOT NULL DEFAULT 'N/A',
    rate         DECIMAL(10,2) NOT NULL,       -- rate in PHP
    capacity_min INT DEFAULT NULL,             -- NULL = no minimum headcount
    capacity_max INT DEFAULT NULL,             -- NULL = no maximum headcount

    UNIQUE KEY uq_facility_rate (category, item, season),

    CONSTRAINT chk_facility_rate CHECK (rate > 0),

    -- if one capacity is set, both must be set and valid
    CONSTRAINT chk_facility_capacity CHECK (
        (capacity_min IS NULL AND capacity_max IS NULL) OR
        (capacity_min >= 1 AND capacity_max >= capacity_min)
    ),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- USERS
-- All staff and guests who use the system.
-- Roles control what each user can see/do.
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    full_name  VARCHAR(150) NOT NULL,
    email      VARCHAR(150) NOT NULL UNIQUE,
    password   VARCHAR(255) NOT NULL,          -- always stored as bcrypt hash, never plain text
    role       ENUM(
                 'Super Admin',                -- full access
                 'Admin',                      -- manage bookings and users
                 'GNC View Only',              -- read-only access
                 'Faculty',
                 'Staff',
                 'Missionary',
                 'Student'
               ) NOT NULL DEFAULT 'Student',
    status     ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- BOOKINGS
-- A booking links a user to a room for a date
-- range. total_amount is stored at booking time
-- so historical prices are preserved even if
-- rates change in future fiscal years.
-- ============================================

CREATE TABLE IF NOT EXISTS bookings (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT NOT NULL,               -- the guest making the booking
    room_id        INT NOT NULL,               -- the room being booked
    check_in       DATE NOT NULL,
    check_out      DATE NOT NULL,
    season         ENUM(
                     'Regular',
                     'Peak',
                     'Super Peak'
                   ) NOT NULL DEFAULT 'Regular',
    occupancy_item ENUM(
                     'Per person per Night',
                     'Single/Double Occupancy',
                     'Daily Maximum',
                     'Extra Bed or Extra Person'
                   ) NOT NULL DEFAULT 'Single/Double Occupancy',
    guest_count    INT NOT NULL DEFAULT 1,     -- number of guests in this booking
    total_amount   DECIMAL(10,2) DEFAULT NULL, -- computed and stored at booking creation
    status         ENUM(
                     'Pending',                -- just submitted
                     'Approved',              -- confirmed by admin
                     'Rejected',              -- denied by admin
                     'Cancelled'              -- cancelled by guest or admin
                   ) NOT NULL DEFAULT 'Pending',
    notes          TEXT DEFAULT NULL,          -- any special requests or remarks

    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- prevent deleting a user who has bookings
    CONSTRAINT fk_booking_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- prevent deleting a room that has bookings
    CONSTRAINT fk_booking_room
        FOREIGN KEY (room_id) REFERENCES rooms(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- check_out must always be after check_in
    CONSTRAINT chk_dates  CHECK (check_out > check_in),

    -- at least 1 guest required
    CONSTRAINT chk_guests CHECK (guest_count >= 1),

    -- total must be positive if set
    CONSTRAINT chk_total  CHECK (total_amount IS NULL OR total_amount > 0)
);

-- ============================================
-- TRIGGER: auto-update room status and
-- occupancy when a booking is approved,
-- rejected, or cancelled.
-- Approved   -> room becomes Occupied
-- Rejected / Cancelled -> room becomes Available
-- ============================================

DELIMITER //
CREATE TRIGGER trg_booking_status_change
AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
    -- when booking is approved, mark the room as Occupied
    IF NEW.status = 'Approved' AND OLD.status != 'Approved' THEN
        UPDATE rooms
        SET status    = 'Occupied',
            occupancy = NEW.guest_count
        WHERE id = NEW.room_id;
    END IF;

    -- when a previously approved booking is cancelled or rejected,
    -- free up the room
    IF NEW.status IN ('Rejected', 'Cancelled') AND OLD.status = 'Approved' THEN
        UPDATE rooms
        SET status    = 'Available',
            occupancy = 0
        WHERE id = NEW.room_id;
    END IF;
END //
DELIMITER ;

-- ============================================
-- PAYMENTS
-- One or more payments can be linked to a
-- booking (supports partial payments).
-- paid_at records the exact timestamp a
-- payment was marked as Paid.
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,                   -- which booking this payment is for
    amount     DECIMAL(10,2) NOT NULL,         -- amount paid in PHP
    method     ENUM(
                 'Cash',
                 'GCash',
                 'Bank Transfer'
               ) NOT NULL,
    status     ENUM(
                 'Pending',                    -- payment submitted but not confirmed
                 'Paid',                       -- confirmed received
                 'Failed'                      -- payment did not go through
               ) NOT NULL DEFAULT 'Pending',
    paid_at    TIMESTAMP NULL DEFAULT NULL,    -- set when status changes to Paid

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- prevent deleting a booking that has payments
    CONSTRAINT fk_payment_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- payment amount must always be positive
    CONSTRAINT chk_amount CHECK (amount > 0)
);

-- ============================================
-- FACILITY BOOKINGS
-- Allows users to reserve facilities like the
-- chapel, garden, basketball court, etc.
-- Works the same as room bookings but for
-- facilities instead of rooms.
-- ============================================

CREATE TABLE IF NOT EXISTS facility_bookings (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,                 -- the guest making the reservation
    facility_id  INT NOT NULL,                 -- which facility is being booked
    event_date   DATE NOT NULL,                -- date of the event
    start_time   TIME NOT NULL,                -- event start time
    end_time     TIME NOT NULL,                -- event end time
    guest_count  INT NOT NULL DEFAULT 1,       -- expected number of attendees
    season       ENUM(
                   'Regular',
                   'Peak',
                   'N/A'
                 ) NOT NULL DEFAULT 'Regular',
    total_amount DECIMAL(10,2) DEFAULT NULL,   -- stored at booking time
    status       ENUM(
                   'Pending',
                   'Approved',
                   'Rejected',
                   'Cancelled'
                 ) NOT NULL DEFAULT 'Pending',
    notes        TEXT DEFAULT NULL,

    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_fbooking_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_fbooking_facility
        FOREIGN KEY (facility_id) REFERENCES facilities(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- end time must be after start time
    CONSTRAINT chk_fb_times  CHECK (end_time > start_time),

    -- at least 1 attendee required
    CONSTRAINT chk_fb_guests CHECK (guest_count >= 1),

    -- total must be positive if set
    CONSTRAINT chk_fb_total  CHECK (total_amount IS NULL OR total_amount > 0)
);

-- ============================================
-- SEED DATA: BUILDINGS
-- ============================================

INSERT INTO buildings (name, description) VALUES
    ('PCALM',      'Main PCALM building'),
    ('House',      'Guest house units A-J'),
    ('Thesda',     'Thesda dormitory building'),
    ('Sampaguita', 'Sampaguita residential building'),
    ('Peranza',    'Peranza residential building')
ON DUPLICATE KEY UPDATE name = name;

-- ============================================
-- SEED DATA: ROOMS
-- room_type assignments are best guesses based
-- on the room board photo. Update any that are
-- wrong once confirmed with housing staff.
-- ============================================

INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='PCALM'), '104',    'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '201',    'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '202',    'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '203',    'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '204',    'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '205',    'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '206',    'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '207',    'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '208',    'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '209',    'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '301',    'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '302',    'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '303',    'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '304',    'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '305',    'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '306',    'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '307',    'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '308',    'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '309',    'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '310',    'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '401',    'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '402',    'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '403',    'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '404',    'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '410',    'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '411',    'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '412',    'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '413',    'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '414',    'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '415',    'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '416',    'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '501',    'Deluxe 3 BR',         1, 6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '504',    'Deluxe 3 BR',         1, 6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '505',    'Deluxe 3 BR',         1, 6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '506',    'Deluxe 3 BR',         1, 6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '507',    'Deluxe 3 BR',         1, 6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '601',    'Deluxe 3 BR',         1, 6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '602',    'Deluxe 3 BR',         1, 6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '703',    'Deluxe 3 BR',         1, 6),
    ((SELECT id FROM buildings WHERE name='PCALM'), 'COMMONS','Superior Guest Room',  1, 4),
    ((SELECT id FROM buildings WHERE name='PCALM'), 'CHAPEL', 'Superior Guest Room',  1, 4)
ON DUPLICATE KEY UPDATE room_number = room_number;

INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='House'), 'A',  'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='House'), 'B',  'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='House'), 'C',  'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='House'), 'D',  'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='House'), 'E1', 'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='House'), 'E2', 'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='House'), 'F',  'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='House'), 'G',  'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='House'), 'H',  'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='House'), 'J1', 'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='House'), 'J2', 'Standard Apartment', 1, 4)
ON DUPLICATE KEY UPDATE room_number = room_number;

INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Thesda'), 'BG1', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Thesda'), 'BG2', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Thesda'), 'BG3', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Thesda'), 'BG4', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Thesda'), 'BG5', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Thesda'), '101', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '102', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '103', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '104', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '106', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '107', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '108', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '109', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '111', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '201', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '208', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '209', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '301', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '302', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '303', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '304', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '305', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '306', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '307', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '308', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '311', 'Standard Apartment',  1, 4)
ON DUPLICATE KEY UPDATE room_number = room_number;

INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '101', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '102', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '103', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '104', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '105', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '106', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '107', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '108', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '201', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '202', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '203', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '204', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '205', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '206', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '207', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '208', 'Standard Apartment',  1, 4)
ON DUPLICATE KEY UPDATE room_number = room_number;

INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Peranza'), '101', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '102', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '103', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '104', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '201', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '202', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '203', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '204', 'Standard Apartment',  1, 4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '300', 'Deluxe 2 BR',         1, 4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '400', 'Deluxe 2 BR',         1, 4)
ON DUPLICATE KEY UPDATE room_number = room_number;

-- ============================================
-- SEED DATA: ROOM RATES (FY26)
-- Source: Housing_Guest_Services_Rate_FY26
-- All amounts in Philippine Peso (PHP)
-- ============================================

INSERT INTO room_rates (room_type, item, season, rate) VALUES
    ('Dorm', 'Per person per Night', 'Regular',    450.00),
    ('Dorm', 'Per person per Night', 'Peak',       500.00),
    ('Dorm', 'Per person per Night', 'Super Peak', 550.00),

    ('Superior Guest Room', 'Single/Double Occupancy', 'Regular',    2250.00),
    ('Superior Guest Room', 'Single/Double Occupancy', 'Peak',       2500.00),
    ('Superior Guest Room', 'Single/Double Occupancy', 'Super Peak', 2750.00),
    ('Superior Guest Room', 'Daily Maximum',           'Regular',    2800.00),
    ('Superior Guest Room', 'Daily Maximum',           'Peak',       3050.00),
    ('Superior Guest Room', 'Daily Maximum',           'Super Peak', 3400.00),

    ('Standard Apartment', 'Single/Double Occupancy',   'Regular',    2500.00),
    ('Standard Apartment', 'Single/Double Occupancy',   'Peak',       2700.00),
    ('Standard Apartment', 'Single/Double Occupancy',   'Super Peak', 3000.00),
    ('Standard Apartment', 'Daily Maximum',             'Regular',    3050.00),
    ('Standard Apartment', 'Daily Maximum',             'Peak',       3350.00),
    ('Standard Apartment', 'Daily Maximum',             'Super Peak', 3700.00),
    ('Standard Apartment', 'Extra Bed or Extra Person', 'Regular',     450.00),
    ('Standard Apartment', 'Extra Bed or Extra Person', 'Peak',        500.00),
    ('Standard Apartment', 'Extra Bed or Extra Person', 'Super Peak',  550.00),

    ('Deluxe 2 BR', 'Single/Double Occupancy',   'Regular',    3000.00),
    ('Deluxe 2 BR', 'Single/Double Occupancy',   'Peak',       3275.00),
    ('Deluxe 2 BR', 'Single/Double Occupancy',   'Super Peak', 3650.00),
    ('Deluxe 2 BR', 'Daily Maximum',             'Regular',    3750.00),
    ('Deluxe 2 BR', 'Daily Maximum',             'Peak',       4150.00),
    ('Deluxe 2 BR', 'Daily Maximum',             'Super Peak', 4500.00),
    ('Deluxe 2 BR', 'Extra Bed or Extra Person', 'Regular',     450.00),
    ('Deluxe 2 BR', 'Extra Bed or Extra Person', 'Peak',        500.00),
    ('Deluxe 2 BR', 'Extra Bed or Extra Person', 'Super Peak',  550.00),

    ('Deluxe 3 BR', 'Single/Double Occupancy',   'Regular',    3600.00),
    ('Deluxe 3 BR', 'Single/Double Occupancy',   'Peak',       3650.00),
    ('Deluxe 3 BR', 'Single/Double Occupancy',   'Super Peak', 4450.00),
    ('Deluxe 3 BR', 'Daily Maximum',             'Regular',    4350.00),
    ('Deluxe 3 BR', 'Daily Maximum',             'Peak',       4750.00),
    ('Deluxe 3 BR', 'Daily Maximum',             'Super Peak', 5200.00),
    ('Deluxe 3 BR', 'Extra Bed or Extra Person', 'Regular',     450.00),
    ('Deluxe 3 BR', 'Extra Bed or Extra Person', 'Peak',        500.00),
    ('Deluxe 3 BR', 'Extra Bed or Extra Person', 'Super Peak',  550.00)
ON DUPLICATE KEY UPDATE rate = VALUES(rate);

-- ============================================
-- SEED DATA: FACILITIES (FY26)
-- Source: Housing_Guest_Services_Rate_FY26
-- capacity_min/max from person limits in sheet
-- All amounts in Philippine Peso (PHP)
-- ============================================

INSERT INTO facilities (category, item, season, rate, capacity_min, capacity_max) VALUES
    ('Food Service', 'Breakfast', 'N/A', 175.00, 1, NULL),
    ('Food Service', 'Lunch',     'N/A', 225.00, 1, NULL),
    ('Food Service', 'Dinner',    'N/A', 225.00, 1, NULL),
    ('Food Service', 'Snack',     'N/A',  85.00, 1, NULL),

    ('Laundry', 'Wash Spin and Dry per load 5kg', 'N/A', 200.00, NULL, NULL),
    ('Laundry', 'Bleach additional per load',     'N/A',  50.00, NULL, NULL),
    ('Laundry', 'Spin Only Washer per load 5kg',  'N/A',  75.00, NULL, NULL),

    ('Laundry-Iron', 'Short Sleeved Shirts Blouses',                    'N/A', 25.00, NULL, NULL),
    ('Laundry-Iron', 'Long Sleeved Shirts Blouses Light Slacks Skirts', 'N/A', 30.00, NULL, NULL),
    ('Laundry-Iron', 'Heavy Slacks Pants Skirts',                       'N/A', 35.00, NULL, NULL),
    ('Laundry-Iron', 'Dresses',                                         'N/A', 45.00, NULL, NULL),

    ('Garden', 'Osgood Garden', 'Regular', 17500.00, 1, 150),
    ('Garden', 'Osgood Garden', 'Peak',    20000.00, 1, 150),

    ('GMC Chapel', 'Church 4 hrs',  'Regular', 13000.00, NULL, NULL),
    ('GMC Chapel', 'Church 4 hrs',  'Peak',    16200.00, NULL, NULL),
    ('GMC Chapel', 'Wedding 4 hrs', 'Regular', 28000.00, NULL, NULL),
    ('GMC Chapel', 'Wedding 4 hrs', 'Peak',    33000.00, NULL, NULL),
    ('GMC Chapel', 'Aircon 4 hrs',  'Regular',  1100.00, NULL, NULL),
    ('GMC Chapel', 'Aircon 4 hrs',  'Peak',     1100.00, NULL, NULL),

    ('Burdine Commons', 'Meeting and other functions',  'Regular',  4500.00, NULL, NULL),
    ('Burdine Commons', 'Meeting and other functions',  'Peak',     5500.00, NULL, NULL),
    ('Burdine Commons', 'Wedding and reception 4 hrs',  'Regular', 16500.00, NULL, NULL),
    ('Burdine Commons', 'Wedding and reception 4 hrs',  'Peak',    19000.00, NULL, NULL),

    ('GMC', 'Russ Turney Educational Center', 'Regular', 4500.00, 1, 100),
    ('GMC', 'Russ Turney Educational Center', 'Peak',    5500.00, 1, 100),
    ('GMC', 'Classroom Multi-Purpose Room',   'Regular', 3000.00, 1,  30),
    ('GMC', 'Classroom Multi-Purpose Room',   'Peak',    3500.00, 1,  30),
    ('GMC', 'Conference Room',                'Regular', 2100.00, 1,  15),
    ('GMC', 'Conference Room',                'Peak',    2500.00, 1,  15),

    ('Prayer Mountain', 'Four Hour minimum', 'Regular', 24000.00, NULL, NULL),
    ('Prayer Mountain', 'Four Hour minimum', 'Peak',    26000.00, NULL, NULL),
    ('Prayer Mountain', 'Extra hour',        'Regular',  6000.00, NULL, NULL),
    ('Prayer Mountain', 'Extra hour',        'Peak',     6500.00, NULL, NULL),

    ('Prayer Tower', 'Function', 'Regular', 5500.00, NULL, NULL),
    ('Prayer Tower', 'Function', 'Peak',    6000.00, NULL, NULL),
    ('Prayer Tower', 'Baptism',  'Regular', 1000.00, NULL, NULL),
    ('Prayer Tower', 'Baptism',  'Peak',    1000.00, NULL, NULL),

    ('Basketball Court',     'Sporting event 4 hr', 'Regular', 2000.00, NULL, NULL),
    ('Basketball Court',     'Sporting event 4 hr', 'Peak',    2500.00, NULL, NULL),
    ('Childrens Playground', '4 hour',              'Regular', 1000.00, NULL, NULL),
    ('Childrens Playground', '4 hour',              'Peak',    1500.00, NULL, NULL),
    ('Rec Center',           '4 hour',              'Regular', 2000.00, NULL, NULL),
    ('Rec Center',           '4 hour',              'Peak',    2500.00, NULL, NULL),

    ('Corkage Fee',  'Per person', 'N/A',  65.00, 1, NULL),
    ('Maid Service', 'Per person', 'N/A', 200.00, 1, NULL)
ON DUPLICATE KEY UPDATE rate = VALUES(rate);

-- ============================================
-- SEED DATA: USERS
-- Default admin account for first login.
-- Password is bcrypt hash of 'aptspace'.
-- IMPORTANT: Change this password immediately
-- after first login via the app.
-- ============================================

INSERT INTO users (full_name, email, password, role, status)
VALUES (
    'System Administrator',
    'admin@aptspace.com',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.ucrm3a.O2',
    'Super Admin',
    'Active'
) ON DUPLICATE KEY UPDATE email = email;

-- ============================================
-- SEED DATA: SEASON DEFINITIONS (FY26 example)
-- Add your actual peak/super peak date ranges
-- here. These are placeholders -- update with
-- real dates from your housing calendar.
-- ============================================

INSERT INTO season_definitions (season, start_date, end_date, label) VALUES
    ('Regular',    '2026-01-01', '2026-03-31', 'Regular Jan-Mar 2026'),
    ('Peak',       '2026-04-01', '2026-05-31', 'Peak Summer 2026'),
    ('Regular',    '2026-06-01', '2026-10-31', 'Regular Jun-Oct 2026'),
    ('Peak',       '2026-11-01', '2026-11-30', 'Peak Nov 2026'),
    ('Super Peak', '2026-12-01', '2026-12-31', 'Super Peak Christmas 2026');