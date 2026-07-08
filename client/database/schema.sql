-- ============================================
-- AptSpace Database Schema v2
-- ============================================

CREATE DATABASE IF NOT EXISTS aptspace;
USE aptspace;

-- ============================================
-- BUILDINGS
-- ============================================

CREATE TABLE IF NOT EXISTS buildings (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- ROOMS
-- ============================================

CREATE TABLE IF NOT EXISTS rooms (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    building_id   INT NOT NULL,
    room_number   VARCHAR(50) NOT NULL,
    -- Free-form so admins can add new room categories at any time.
    -- Built-in types (Dorm, Superior Guest Room, Standard Apartment, Deluxe Apartment)
    -- map to seasonal pricing tiers in rates_rooms; custom types are managed by admins.
    room_type     VARCHAR(100) NOT NULL,
    bed_count     TINYINT      DEFAULT NULL,
    capacity_min  INT NOT NULL DEFAULT 1,
    capacity_max  INT NOT NULL DEFAULT 1,
    occupancy     INT NOT NULL DEFAULT 0,
    status        ENUM(
                    'Available',
                    'Occupied',
                    'Dirty',
                    'Maintenance'
                  ) NOT NULL DEFAULT 'Available',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_room_building
        FOREIGN KEY (building_id) REFERENCES buildings(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    UNIQUE KEY uq_building_room (building_id, room_number),

    CONSTRAINT chk_capacity CHECK (capacity_min >= 1 AND capacity_max >= capacity_min),
    CONSTRAINT chk_occupancy CHECK (occupancy >= 0 AND occupancy <= capacity_max)
);

-- ============================================
-- RATES: ROOMS
-- ============================================

CREATE TABLE IF NOT EXISTS rates_rooms (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    -- Free-form pricing tier so admins can price custom room types.
    -- Built-in tiers: Superior Guest Room, Standard Apartment, Deluxe 2 BR, Deluxe 3 BR, VIP.
    room_type VARCHAR(100) NOT NULL,
    item      VARCHAR(120) NOT NULL,
    season    ENUM('Regular', 'Peak', 'Super Peak') NOT NULL,
    rate      DECIMAL(10,2) NOT NULL,
    audience  VARCHAR(80)  NOT NULL DEFAULT 'Guest',
    age_band  VARCHAR(40)  NOT NULL DEFAULT 'Adult',
    currency  VARCHAR(8)   NOT NULL DEFAULT 'PHP',
    billing_unit VARCHAR(40) NOT NULL DEFAULT 'per night',
    notes     VARCHAR(255) DEFAULT NULL,
    -- Hash of rate variant dimensions — avoids utf8mb4 composite unique key length limits.
    variant_key CHAR(64) GENERATED ALWAYS AS (
        SHA2(CONCAT_WS(CHAR(31), room_type, item, season, audience, age_band, currency, billing_unit), 256)
    ) STORED NOT NULL,

    UNIQUE KEY uq_room_rate (variant_key),
    CONSTRAINT chk_room_rate CHECK (`rate` > 0),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- FACILITIES (bookable spaces — catalog)
-- Seasonal prices live in `rates_facilities`.
-- ============================================

CREATE TABLE IF NOT EXISTS facilities (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    room_code       VARCHAR(20)  DEFAULT NULL,
    description     TEXT         DEFAULT NULL,
    package_name    VARCHAR(100) DEFAULT NULL,
    facility_group  VARCHAR(50)  DEFAULT NULL,
    capacity_min    INT          DEFAULT NULL,
    capacity_max    INT          DEFAULT NULL,
    -- Minimum booking length in hours (e.g. 4 for GMC Chapel / Burdine Commons).
    -- NULL or 1 means the venue is billed purely by the hour.
    min_hours       INT          DEFAULT NULL,
    -- Price charged for each hour beyond the minimum block. NULL falls back to
    -- (base rate / min_hours). Ignored for purely hourly venues.
    hourly_rate     DECIMAL(10,2) DEFAULT NULL,
    -- Free-text notes shown to guests (what the price includes, house policies).
    inclusions      TEXT         DEFAULT NULL,
    policies        TEXT         DEFAULT NULL,

    UNIQUE KEY uq_facility_room (room_code),

    CONSTRAINT chk_facility_capacity CHECK (
        (capacity_min IS NULL AND capacity_max IS NULL) OR
        (capacity_min >= 1 AND capacity_max >= capacity_min)
    ),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- RATES: FACILITIES (seasonal venue pricing)
-- ============================================

CREATE TABLE IF NOT EXISTS rates_facilities (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    facility_id INT NOT NULL,
    season      ENUM('Regular', 'Peak', 'N/A') NOT NULL DEFAULT 'Regular',
    rate        DECIMAL(10,2) NOT NULL,
    audience    VARCHAR(80)  NOT NULL DEFAULT 'Guest',
    age_band    VARCHAR(40)  NOT NULL DEFAULT 'Adult',
    currency    VARCHAR(8)   NOT NULL DEFAULT 'PHP',
    billing_unit VARCHAR(40) NOT NULL DEFAULT 'per segment',
    notes       VARCHAR(255) DEFAULT NULL,

    UNIQUE KEY uq_facility_rate (facility_id, season, audience, age_band, currency, billing_unit),
    CONSTRAINT chk_facility_rate CHECK (`rate` > 0),

    CONSTRAINT fk_rates_facility
        FOREIGN KEY (facility_id) REFERENCES facilities(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- USERS
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    full_name  VARCHAR(150) NOT NULL,
    email      VARCHAR(150) NOT NULL UNIQUE,
    password   VARCHAR(255) NOT NULL,
    role       ENUM(
                 'Super Admin',
                 'Admin',
                 'Supervisory User',
                 'GMC',
                 'Faculty',
                 'Staff',
                 'Missionary',
                 'External Guest'
               ) NOT NULL DEFAULT 'Faculty',
    status              ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
    session_id          VARCHAR(64) NULL,
    session_expires_at  TIMESTAMP NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- LOGIN ATTEMPTS (per-account lockout)
-- ============================================

CREATE TABLE IF NOT EXISTS login_attempts (
    email         VARCHAR(150) PRIMARY KEY,
    attempt_count INT NOT NULL DEFAULT 0,
    locked_until  TIMESTAMP NULL,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- GUEST ACCESS REQUESTS
-- ============================================

CREATE TABLE IF NOT EXISTS guest_access_requests (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    full_name     VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    organization  VARCHAR(150) DEFAULT NULL,
    notes         TEXT DEFAULT NULL,
    status        ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
    user_id       INT DEFAULT NULL,
    reviewed_by   INT DEFAULT NULL,
    review_notes  TEXT DEFAULT NULL,
    reviewed_at   TIMESTAMP NULL DEFAULT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_guest_request_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_guest_request_reviewer
        FOREIGN KEY (reviewed_by) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- ============================================
-- AUDIT LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    actor_user_id INT DEFAULT NULL,
    action        VARCHAR(64) NOT NULL,
    entity_type   VARCHAR(32) NOT NULL,
    entity_id     INT DEFAULT NULL,
    details       JSON DEFAULT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_audit_actor
        FOREIGN KEY (actor_user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_audit_action (action),
    INDEX idx_audit_created (created_at)
);

-- ============================================
-- PASSWORD RESET TOKENS
-- ============================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    token      VARCHAR(191) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_reset_token_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- ============================================
-- RESERVATION GROUPS (multi-room stays)
-- ============================================

CREATE TABLE IF NOT EXISTS reservation_groups (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    group_name      VARCHAR(150) NOT NULL,
    contact_name    VARCHAR(150) NOT NULL,
    contact_phone   VARCHAR(30) DEFAULT NULL,
    contact_email   VARCHAR(150) DEFAULT NULL,
    check_in        DATE NOT NULL,
    check_out       DATE NOT NULL,
    total_guests    INT NOT NULL DEFAULT 1,
    rooms_requested INT DEFAULT NULL,
    status          ENUM(
                      'Pending',
                      'Approved',
                      'Rejected',
                      'Cancelled'
                    ) NOT NULL DEFAULT 'Pending',
    notes           TEXT DEFAULT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_group_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_group_dates CHECK (check_out > check_in),
    CONSTRAINT chk_group_guests CHECK (total_guests >= 1)
);

CREATE INDEX idx_groups_status ON reservation_groups (status);
CREATE INDEX idx_groups_dates ON reservation_groups (check_in, check_out);

-- ============================================
-- BOOKINGS: ROOMS
-- ============================================

CREATE TABLE IF NOT EXISTS bookings_rooms (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT NOT NULL,
    room_id        INT NOT NULL,
    group_id       INT DEFAULT NULL,
    check_in       DATE NOT NULL,
    check_out      DATE NOT NULL,
    season         ENUM(
                     'Regular',
                     'Peak',
                     'Super Peak'
                   ) NOT NULL DEFAULT 'Regular',
    occupancy_item VARCHAR(120) NOT NULL DEFAULT 'Single/Double Occupancy',
    guest_count    INT NOT NULL DEFAULT 1,
    total_amount   DECIMAL(10,2) DEFAULT NULL,
    status         ENUM(
                     'Pending',
                     'Approved',
                     'Rejected',
                     'Cancelled'
                   ) NOT NULL DEFAULT 'Pending',
    notes               TEXT DEFAULT NULL,
    contact_phone       VARCHAR(30) DEFAULT NULL,
    meal_allergen_notes TEXT DEFAULT NULL,

    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_booking_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_booking_room
        FOREIGN KEY (room_id) REFERENCES rooms(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_booking_group
        FOREIGN KEY (group_id) REFERENCES reservation_groups(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_dates  CHECK (check_out > check_in),
    CONSTRAINT chk_guests CHECK (guest_count >= 1),
    CONSTRAINT chk_total  CHECK (total_amount IS NULL OR total_amount > 0)
);

CREATE INDEX idx_bookings_rooms_room_dates ON bookings_rooms (room_id, check_in, check_out, status);
CREATE INDEX idx_bookings_rooms_group ON bookings_rooms (group_id);

CREATE TABLE IF NOT EXISTS bookings_meals (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    bookings_room_id INT NOT NULL,
    meal_type        ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL,
    quantity         INT NOT NULL DEFAULT 0,
    unit_price       DECIMAL(10,2) NOT NULL,
    subtotal         DECIMAL(10,2) NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bookings_meals_room FOREIGN KEY (bookings_room_id) REFERENCES bookings_rooms(id) ON DELETE CASCADE,
    UNIQUE KEY uq_bookings_meals (bookings_room_id, meal_type)
);

CREATE TABLE IF NOT EXISTS bookings_extra_services (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    bookings_room_id INT NOT NULL,
    service_name     VARCHAR(100) NOT NULL,
    amount           DECIMAL(10,2) NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bookings_extra_services_room FOREIGN KEY (bookings_room_id) REFERENCES bookings_rooms(id) ON DELETE CASCADE
);

-- ============================================
-- RATES: MEALS (room-stay add-ons, not venues)
-- ============================================

CREATE TABLE IF NOT EXISTS rates_meals (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    meal_type  ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL,
    rate       DECIMAL(10,2) NOT NULL,
    audience   VARCHAR(80)  NOT NULL DEFAULT 'Guest',
    age_band   VARCHAR(40)  NOT NULL DEFAULT 'Adult',
    currency   VARCHAR(8)   NOT NULL DEFAULT 'PHP',
    billing_unit VARCHAR(40) NOT NULL DEFAULT 'per meal',
    notes      VARCHAR(255) DEFAULT NULL,

    UNIQUE KEY uq_meal_type (meal_type, audience, age_band, currency, billing_unit),
    CONSTRAINT chk_meal_rate CHECK (`rate` > 0),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- RATES: EXTRA SERVICES (laundry, corkage, maid, etc.)
-- ============================================

CREATE TABLE IF NOT EXISTS rates_extra_services (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(50)  NOT NULL,
    item     VARCHAR(100) NOT NULL,
    season   ENUM('Regular', 'Peak', 'Super Peak', 'N/A') NOT NULL DEFAULT 'N/A',
    rate     DECIMAL(10,2) NOT NULL,
    audience VARCHAR(80)  NOT NULL DEFAULT 'Guest',
    age_band VARCHAR(40)  NOT NULL DEFAULT 'Adult',
    currency VARCHAR(8)   NOT NULL DEFAULT 'PHP',
    billing_unit VARCHAR(40) NOT NULL DEFAULT 'per item',
    notes    VARCHAR(255) DEFAULT NULL,
    variant_key CHAR(64) GENERATED ALWAYS AS (
        SHA2(CONCAT_WS(CHAR(31), category, item, season, audience, age_band, currency, billing_unit), 256)
    ) STORED NOT NULL,

    UNIQUE KEY uq_extra_service (variant_key),
    CONSTRAINT chk_extra_service_rate CHECK (`rate` > 0),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- TRIGGER
-- ============================================

DELIMITER //
CREATE TRIGGER trg_bookings_rooms_status_change
AFTER UPDATE ON bookings_rooms
FOR EACH ROW
BEGIN
    IF NEW.status = 'Approved' AND OLD.status != 'Approved' THEN
        UPDATE rooms
        SET status    = 'Occupied',
            occupancy = NEW.guest_count
        WHERE id = NEW.room_id;
    END IF;

    IF NEW.status IN ('Rejected', 'Cancelled') AND OLD.status = 'Approved' THEN
        UPDATE rooms
        SET status    = 'Available',
            occupancy = 0
        WHERE id = NEW.room_id;
    END IF;
END //
DELIMITER ;

-- ============================================
-- BOOKINGS: FACILITIES (venue / event spaces)
-- ============================================

CREATE TABLE IF NOT EXISTS bookings_facilities (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    facility_id  INT NOT NULL,
    event_date   DATE NOT NULL,
    start_time   TIME NOT NULL,
    end_time     TIME NOT NULL,
    guest_count  INT NOT NULL DEFAULT 1,
    season       ENUM(
                   'Regular',
                   'Peak',
                   'N/A'
                 ) NOT NULL DEFAULT 'Regular',
    total_amount DECIMAL(10,2) DEFAULT NULL,
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

    CONSTRAINT chk_fb_times  CHECK (end_time > start_time),
    CONSTRAINT chk_fb_guests CHECK (guest_count >= 1),
    CONSTRAINT chk_fb_total  CHECK (total_amount IS NULL OR total_amount > 0)
);

-- ============================================
-- PAYMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    bookings_room_id      INT NULL,
    bookings_facility_id  INT NULL,
    subtotal              DECIMAL(10,2) DEFAULT NULL,
    discount_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount_note         VARCHAR(255) DEFAULT NULL,
    amount                DECIMAL(10,2) NOT NULL,
    method     ENUM(
                 'Cash',
                 'GCash',
                 'Bank Transfer'
               ) DEFAULT NULL,
    status     ENUM(
                 'Pending',
                 'Partially Paid',
                 'Paid',
                 'Failed',
                 'Refunded'
               ) NOT NULL DEFAULT 'Pending',
    paid_at          TIMESTAMP NULL DEFAULT NULL,
    invoice_sent_at       TIMESTAMP NULL DEFAULT NULL,
    billing_invoice_sent_at TIMESTAMP NULL DEFAULT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_payments_bookings_room
        FOREIGN KEY (bookings_room_id) REFERENCES bookings_rooms(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_payments_bookings_facility
        FOREIGN KEY (bookings_facility_id) REFERENCES bookings_facilities(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_payment_booking_ref CHECK (
        (bookings_room_id IS NOT NULL AND bookings_facility_id IS NULL) OR
        (bookings_room_id IS NULL AND bookings_facility_id IS NOT NULL)
    ),

    CONSTRAINT chk_amount CHECK (amount > 0),

    UNIQUE KEY uq_payment_facility (bookings_facility_id)
);

-- ============================================
-- PAYMENT TRANSACTIONS (deposits, advances, settlements, refunds)
-- ============================================

CREATE TABLE IF NOT EXISTS payment_transactions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    payment_id  INT NOT NULL,
    type        ENUM('Deposit', 'Advance', 'Settlement', 'Refund', 'Adjustment') NOT NULL,
    amount      DECIMAL(10,2) NOT NULL,
    method      ENUM('Cash', 'GCash', 'Bank Transfer', 'Waived') NOT NULL,
    notes       VARCHAR(255) DEFAULT NULL,
    recorded_by INT DEFAULT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pt_payment
        FOREIGN KEY (payment_id) REFERENCES payments(id)
         ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT fk_pt_recorded_by
        FOREIGN KEY (recorded_by) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT chk_pt_amount CHECK (amount > 0),

    INDEX idx_pt_payment (payment_id),
    INDEX idx_pt_recorded (recorded_at)
);

-- ============================================
-- DATA MIGRATION: BUILDING RENAME & CLEANUP
-- (safe to re-run; no-op on fresh installs)
-- ============================================
-- Renames PCALM → Global Missions Center (bookings_rooms keep room_id links).
-- Removes deprecated buildings and their reservations in FK order.

UPDATE buildings
SET name        = 'Global Missions Center',
    description = 'Main Global Missions Center building'
WHERE name = 'PCALM';

DELETE p
FROM payments p
JOIN bookings_rooms bk ON bk.id = p.bookings_room_id
JOIN rooms r     ON r.id  = bk.room_id
JOIN buildings b ON b.id  = r.building_id
WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House');

DELETE bk
FROM bookings_rooms bk
JOIN rooms r     ON r.id  = bk.room_id
JOIN buildings b ON b.id  = r.building_id
WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House');

DELETE r
FROM rooms r
JOIN buildings b ON b.id = r.building_id
WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House');

DELETE FROM buildings
WHERE name IN ('Thesda', 'Sampaguita', 'Peranza', 'House');

-- Migrate legacy lodging room types (Superior Guest Room is the FY26 sheet name)
UPDATE rooms SET room_type = 'Superior Guest Room' WHERE room_type = 'Standard Guest Room';
UPDATE rates_rooms SET room_type = 'Superior Guest Room' WHERE room_type = 'Standard Guest Room';
DELETE FROM rates_rooms WHERE room_type IN ('Standard Guest Room', 'Uncategorized');

-- Remove reservations tied to retired lodging inventory or venue rows stored as rooms
DELETE p
FROM payments p
JOIN bookings_rooms bk ON bk.id = p.bookings_room_id
JOIN rooms r     ON r.id  = bk.room_id
JOIN buildings b ON b.id  = r.building_id
WHERE b.name = 'Global Missions Center'
  AND r.room_number IN (
    '104', '501', '504', '505', '506', '507', '601', '602', '703', 'COMMONS', 'CHAPEL'
  );

DELETE bk
FROM bookings_rooms bk
JOIN rooms r     ON r.id  = bk.room_id
JOIN buildings b ON b.id  = r.building_id
WHERE b.name = 'Global Missions Center'
  AND r.room_number IN (
    '104', '501', '504', '505', '506', '507', '601', '602', '703', 'COMMONS', 'CHAPEL'
  );

DELETE r
FROM rooms r
JOIN buildings b ON b.id = r.building_id
WHERE b.name = 'Global Missions Center'
  AND r.room_number IN (
    '104', '501', '504', '505', '506', '507', '601', '602', '703', 'COMMONS', 'CHAPEL'
  );

-- ============================================
-- SEED DATA: BUILDINGS
-- ============================================

INSERT INTO buildings (name, description) VALUES
    ('Global Missions Center', 'Main Global Missions Center building')
ON DUPLICATE KEY UPDATE name = name;

-- ============================================
-- SEED DATA: LODGING — Global Missions Center
-- ============================================

-- Deluxe apartments — bed_count = number of bedrooms (2 BR vs 3 BR pricing)
INSERT INTO rooms (building_id, room_number, room_type, bed_count, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), 'A-501', 'Deluxe Apartment', 2, 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '201',   'Deluxe Apartment', 3, 1, 6),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '301',   'Deluxe Apartment', 2, 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '304',   'Deluxe Apartment', 3, 1, 6),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '401',   'Deluxe Apartment', 2, 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '402',   'Deluxe Apartment', 2, 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '403',   'Deluxe Apartment', 2, 1, 4)
ON DUPLICATE KEY UPDATE room_type = VALUES(room_type), bed_count = VALUES(bed_count), capacity_min = VALUES(capacity_min), capacity_max = VALUES(capacity_max);

-- Standard Apartments (std apt)
INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '203', 'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '205', 'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '302', 'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '303', 'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '404', 'Standard Apartment', 1, 4)
ON DUPLICATE KEY UPDATE room_type = VALUES(room_type), capacity_min = VALUES(capacity_min), capacity_max = VALUES(capacity_max);

-- Superior Guest Rooms (sgr) — FY26 sheet: "Superior Guest Room"
INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '410', 'Superior Guest Room', 1, 2),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '411', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '412', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '413', 'Superior Guest Room', 1, 3),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '414', 'Superior Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '415', 'VIP', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '416', 'Superior Guest Room', 1, 4)
ON DUPLICATE KEY UPDATE room_type = VALUES(room_type), capacity_min = VALUES(capacity_min), capacity_max = VALUES(capacity_max);

-- Dormitories (dorm) — capacity_max = max pax per FY26 lodging sheet; min 5 where pricelist requires
INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '103', 'Dorm', 1, 2),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '202', 'Dorm', 5, 40),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '204', 'Dorm', 5, 16),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '206', 'Dorm', 5, 14),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '207', 'Dorm', 5, 14),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '208', 'Dorm', 5, 14),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '209', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '305', 'Dorm', 5, 20),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '306', 'Dorm', 5, 16),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '307', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '308', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '309', 'Dorm', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '310', 'Dorm', 1, 4)
ON DUPLICATE KEY UPDATE room_type = VALUES(room_type), capacity_min = VALUES(capacity_min), capacity_max = VALUES(capacity_max);

-- A-501 is the only A-block lodging room (Deluxe Apartment). Conference/classroom spaces
-- are bookable venues under facilities (GMC category), not lodging rooms.

-- ============================================
-- SEED DATA: ROOM RATES (FY26)
-- ============================================

INSERT INTO rates_rooms (room_type, item, season, rate) VALUES
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

    ('Deluxe 2 BR', 'Single/Double Occupancy',   'Regular',    3000.00),
    ('Deluxe 2 BR', 'Single/Double Occupancy',   'Peak',       3275.00),
    ('Deluxe 2 BR', 'Single/Double Occupancy',   'Super Peak', 3650.00),
    ('Deluxe 2 BR', 'Daily Maximum',             'Regular',    3750.00),
    ('Deluxe 2 BR', 'Daily Maximum',             'Peak',       4150.00),
    ('Deluxe 2 BR', 'Daily Maximum',             'Super Peak', 4500.00),

    ('Deluxe 3 BR', 'Single/Double Occupancy',   'Regular',    3600.00),
    ('Deluxe 3 BR', 'Single/Double Occupancy',   'Peak',       3650.00),
    ('Deluxe 3 BR', 'Single/Double Occupancy',   'Super Peak', 4450.00),
    ('Deluxe 3 BR', 'Daily Maximum',             'Regular',    4350.00),
    ('Deluxe 3 BR', 'Daily Maximum',             'Peak',       4750.00),
    ('Deluxe 3 BR', 'Daily Maximum',             'Super Peak', 5200.00)
ON DUPLICATE KEY UPDATE rate = VALUES(rate);

-- ============================================
-- SEED DATA: FACILITIES & RATES (FY26)
-- Event spaces — not lodging rooms
-- ============================================

INSERT INTO facilities (name, room_code, description, package_name, facility_group, capacity_min, capacity_max, min_hours) VALUES
    ('GMC Chapel', NULL, NULL, 'Church',  'GMC Chapel', NULL, NULL, 4),
    ('GMC Chapel', NULL, NULL, 'Wedding', 'GMC Chapel', NULL, NULL, 4),
    ('Burdine Commons', NULL, NULL, 'Meeting and other functions', 'Burdine Commons', NULL, NULL, 4),
    ('Burdine Commons', NULL, NULL, 'Wedding and reception', 'Burdine Commons', NULL, NULL, 4),
    ('Osgood Garden', NULL, 'Outdoor garden venue.', NULL, 'Garden', 1, 150, NULL),
    ('Prayer Mountain', NULL, NULL, 'Retreat use', 'Prayer Mountain', NULL, NULL, NULL),
    ('Prayer Tower', NULL, NULL, 'Function', 'Prayer Tower', NULL, NULL, NULL),
    ('Prayer Tower', NULL, NULL, 'Baptism', 'Prayer Tower', NULL, NULL, NULL),
    ('Basketball Court', NULL, NULL, 'Sporting event', 'Recreation', NULL, NULL, NULL),
    ('Childrens Playground', NULL, NULL, 'Playground use', 'Recreation', NULL, NULL, NULL),
    ('Recreational Center', NULL, NULL, 'Recreation use', 'Recreation', NULL, NULL, NULL),
    ('Russ Turney Educational Center', 'A-101', 'Large educational and meeting hall on the A-block.', NULL, 'GMC Conference Rooms', 1, 100, NULL),
    ('Classroom Multi-Purpose Room', 'A-504', 'Multi-purpose classroom space.', NULL, 'GMC Conference Rooms', 1, 30, NULL),
    ('Classroom Multi-Purpose Room', 'A-505', 'Multi-purpose classroom space.', NULL, 'GMC Conference Rooms', 1, 30, NULL),
    ('Conference Room', 'A-506', 'Conference room on the A-block.', NULL, 'GMC Conference Rooms', 1, 15, NULL),
    ('Conference Room', 'A-507', 'Conference room on the A-block (formerly A-105).', NULL, 'GMC Conference Rooms', 1, 15, NULL)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    package_name = VALUES(package_name),
    facility_group = VALUES(facility_group),
    capacity_min = VALUES(capacity_min),
    capacity_max = VALUES(capacity_max),
    min_hours = VALUES(min_hours);

INSERT INTO rates_facilities (facility_id, season, rate)
SELECT f.id, s.season, s.rate
FROM facilities f
JOIN (
    SELECT 'GMC Chapel' AS grp, 'Church' AS pkg, NULL AS code, 'Regular' AS season, 3250.00 AS rate UNION ALL
    SELECT 'GMC Chapel', 'Church', NULL, 'Peak', 4050.00 UNION ALL
    SELECT 'GMC Chapel', 'Wedding', NULL, 'Regular', 7000.00 UNION ALL
    SELECT 'GMC Chapel', 'Wedding', NULL, 'Peak', 8250.00 UNION ALL
    SELECT 'Burdine Commons', 'Meeting and other functions', NULL, 'Regular', 4500.00 UNION ALL
    SELECT 'Burdine Commons', 'Meeting and other functions', NULL, 'Peak', 5500.00 UNION ALL
    SELECT 'Burdine Commons', 'Wedding and reception', NULL, 'Regular', 4125.00 UNION ALL
    SELECT 'Burdine Commons', 'Wedding and reception', NULL, 'Peak', 4750.00 UNION ALL
    SELECT 'Garden', NULL, NULL, 'Regular', 17500.00 UNION ALL
    SELECT 'Garden', NULL, NULL, 'Peak', 20000.00 UNION ALL
    SELECT 'Prayer Mountain', 'Retreat use', NULL, 'Regular', 6000.00 UNION ALL
    SELECT 'Prayer Mountain', 'Retreat use', NULL, 'Peak', 6500.00 UNION ALL
    SELECT 'Prayer Tower', 'Function', NULL, 'Regular', 5500.00 UNION ALL
    SELECT 'Prayer Tower', 'Function', NULL, 'Peak', 6000.00 UNION ALL
    SELECT 'Prayer Tower', 'Baptism', NULL, 'Regular', 1000.00 UNION ALL
    SELECT 'Prayer Tower', 'Baptism', NULL, 'Peak', 1000.00 UNION ALL
    SELECT 'Recreation', 'Sporting event', NULL, 'Regular', 500.00 UNION ALL
    SELECT 'Recreation', 'Sporting event', NULL, 'Peak', 625.00 UNION ALL
    SELECT 'Recreation', 'Playground use', NULL, 'Regular', 250.00 UNION ALL
    SELECT 'Recreation', 'Playground use', NULL, 'Peak', 375.00 UNION ALL
    SELECT 'Recreation', 'Recreation use', NULL, 'Regular', 500.00 UNION ALL
    SELECT 'Recreation', 'Recreation use', NULL, 'Peak', 625.00 UNION ALL
    SELECT 'GMC Conference Rooms', NULL, 'A-101', 'Regular', 4500.00 UNION ALL
    SELECT 'GMC Conference Rooms', NULL, 'A-101', 'Peak', 5500.00 UNION ALL
    SELECT 'GMC Conference Rooms', NULL, 'A-504', 'Regular', 3000.00 UNION ALL
    SELECT 'GMC Conference Rooms', NULL, 'A-504', 'Peak', 3500.00 UNION ALL
    SELECT 'GMC Conference Rooms', NULL, 'A-505', 'Regular', 3000.00 UNION ALL
    SELECT 'GMC Conference Rooms', NULL, 'A-505', 'Peak', 3500.00 UNION ALL
    SELECT 'GMC Conference Rooms', NULL, 'A-506', 'Regular', 2100.00 UNION ALL
    SELECT 'GMC Conference Rooms', NULL, 'A-506', 'Peak', 2500.00 UNION ALL
    SELECT 'GMC Conference Rooms', NULL, 'A-507', 'Regular', 2100.00 UNION ALL
    SELECT 'GMC Conference Rooms', NULL, 'A-507', 'Peak', 2500.00
) s ON f.facility_group = s.grp
   AND (f.package_name <=> s.pkg)
   AND (s.code IS NULL OR f.room_code = s.code)
ON DUPLICATE KEY UPDATE rate = VALUES(rate);

-- ============================================
-- SEED DATA: MEAL RATES (FY26)
-- ============================================

INSERT INTO rates_meals (meal_type, rate) VALUES
    ('Breakfast', 175.00),
    ('Lunch',     225.00),
    ('Dinner',    225.00),
    ('Snack',      85.00)
ON DUPLICATE KEY UPDATE rate = VALUES(rate);

-- ============================================
-- SEED DATA: EXTRA SERVICE RATES (FY26)
-- ============================================

INSERT INTO rates_extra_services (category, item, season, rate) VALUES
    ('Laundry', 'Wash Spin and Dry per load 5kg', 'N/A', 200.00),
    ('Laundry', 'Bleach additional per load', 'N/A',      50.00),
    ('Laundry', 'Spin Only Washer per load 5kg', 'N/A',   75.00),

    ('Laundry-Iron', 'Short Sleeved Shirts Blouses', 'N/A',                    25.00),
    ('Laundry-Iron', 'Long Sleeved Shirts Blouses Light Slacks Skirts', 'N/A', 30.00),
    ('Laundry-Iron', 'Heavy Slacks Pants Skirts', 'N/A',                       35.00),
    ('Laundry-Iron', 'Dresses', 'N/A',                                         45.00),

    ('Corkage Fee',  'Per person', 'N/A',  65.00),
    ('Maid Service', 'Per person', 'N/A', 200.00),

    ('Accommodation Extras', 'Per person per Night', 'Regular',    450.00),
    ('Accommodation Extras', 'Per person per Night', 'Peak',       500.00),
    ('Accommodation Extras', 'Per person per Night', 'Super Peak', 550.00),
    ('Accommodation Extras', 'Extra Bed or Extra Person', 'Regular',    450.00),
    ('Accommodation Extras', 'Extra Bed or Extra Person', 'Peak',       500.00),
    ('Accommodation Extras', 'Extra Bed or Extra Person', 'Super Peak', 550.00),

    ('GMC Chapel', 'Aircon', 'N/A', 275.00)
ON DUPLICATE KEY UPDATE rate = VALUES(rate);

-- ============================================
-- SEED DATA: USERS
-- NOTE: User passwords are NOT seeded here.
-- Run `node seedUsers.js` after importing this schema
-- to insert users with properly hashed passwords.
-- ============================================

-- ============================================
-- SYSTEM SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS system_settings (
    setting_key   VARCHAR(64) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO system_settings (setting_key, setting_value) VALUES
    ('fiscal_year_start_month', '7'),
    ('fiscal_year_start_day', '1'),
    ('booking_advance_months', '12'),
    ('active_lodging_season', 'Regular'),
    ('deposit_required', '0'),
    ('deposit_mode', 'percent'),
    ('deposit_value', '50')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- Demo bookings, payments, and room status samples are seeded by the server
-- on startup (see client/server/src/config/seed.js) after users are created.