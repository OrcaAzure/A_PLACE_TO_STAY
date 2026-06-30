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
    room_type     ENUM(
                    'Dorm',
                    'Standard Guest Room',
                    'Standard Apartment',
                    'Deluxe Apartment',
                    'Uncategorized'
                  ) NOT NULL,
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
-- ROOM RATES
-- ============================================

CREATE TABLE IF NOT EXISTS room_rates (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    room_type ENUM(
                'Dorm',
                'Standard Guest Room',
                'Standard Apartment',
                'Deluxe Apartment',
                'Uncategorized'
              ) NOT NULL,
    item      ENUM(
                'Per person per Night',
                'Single/Double Occupancy',
                'Daily Maximum',
                'Extra Bed or Extra Person'
              ) NOT NULL,
    season    ENUM('Regular', 'Peak', 'Super Peak') NOT NULL,
    rate      DECIMAL(10,2) NOT NULL,

    UNIQUE KEY uq_room_rate (room_type, item, season),
    CONSTRAINT chk_rate CHECK (rate > 0),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- SEASON DEFINITIONS
-- ============================================

CREATE TABLE IF NOT EXISTS season_definitions (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    season     ENUM('Regular', 'Peak', 'Super Peak') NOT NULL,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    label      VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_season_dates CHECK (end_date >= start_date)
);

-- ============================================
-- FACILITIES
-- ============================================

CREATE TABLE IF NOT EXISTS facilities (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    category     VARCHAR(50)  NOT NULL,
    item         VARCHAR(100) NOT NULL,
    season       ENUM('Regular', 'Peak', 'N/A') NOT NULL DEFAULT 'N/A',
    rate         DECIMAL(10,2) NOT NULL,
    capacity_min INT DEFAULT NULL,
    capacity_max INT DEFAULT NULL,

    UNIQUE KEY uq_facility_rate (category, item, season),
    CONSTRAINT chk_facility_rate CHECK (rate > 0),
    CONSTRAINT chk_facility_capacity CHECK (
        (capacity_min IS NULL AND capacity_max IS NULL) OR
        (capacity_min >= 1 AND capacity_max >= capacity_min)
    ),

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
    status     ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
-- BOOKINGS
-- ============================================

CREATE TABLE IF NOT EXISTS bookings (
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
    occupancy_item ENUM(
                     'Per person per Night',
                     'Single/Double Occupancy',
                     'Daily Maximum',
                     'Extra Bed or Extra Person'
                   ) NOT NULL DEFAULT 'Single/Double Occupancy',
    guest_count    INT NOT NULL DEFAULT 1,
    total_amount   DECIMAL(10,2) DEFAULT NULL,
    status         ENUM(
                     'Pending',
                     'Approved',
                     'Rejected',
                     'Cancelled'
                   ) NOT NULL DEFAULT 'Pending',
    notes          TEXT DEFAULT NULL,
    contact_phone  VARCHAR(30) DEFAULT NULL,

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

CREATE INDEX idx_bookings_room_dates ON bookings (room_id, check_in, check_out, status);
CREATE INDEX idx_bookings_group ON bookings (group_id);

CREATE TABLE IF NOT EXISTS booking_meals (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    meal_type  ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack') NOT NULL,
    quantity   INT NOT NULL DEFAULT 0,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal   DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_meal_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    UNIQUE KEY uq_booking_meal (booking_id, meal_type)
);

CREATE TABLE IF NOT EXISTS booking_fees (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    fee_name   VARCHAR(100) NOT NULL,
    amount     DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_fee_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- ============================================
-- TRIGGER
-- ============================================

DELIMITER //
CREATE TRIGGER trg_booking_status_change
AFTER UPDATE ON bookings
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
-- PAYMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    amount     DECIMAL(10,2) NOT NULL,
    method     ENUM(
                 'Cash',
                 'GCash',
                 'Bank Transfer'
               ) NOT NULL,
    status     ENUM(
                 'Pending',
                 'Paid',
                 'Failed'
               ) NOT NULL DEFAULT 'Pending',
    paid_at    TIMESTAMP NULL DEFAULT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_payment_booking
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT chk_amount CHECK (amount > 0)
);

-- ============================================
-- FACILITY BOOKINGS
-- ============================================

CREATE TABLE IF NOT EXISTS facility_bookings (
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
-- DATA MIGRATION: BUILDING RENAME & CLEANUP
-- (safe to re-run; no-op on fresh installs)
-- ============================================
-- Renames PCALM → Global Missions Center (bookings keep room_id links).
-- Removes deprecated buildings and their reservations in FK order.

UPDATE buildings
SET name        = 'Global Missions Center',
    description = 'Main Global Missions Center building'
WHERE name = 'PCALM';

DELETE p
FROM payments p
JOIN bookings bk ON bk.id = p.booking_id
JOIN rooms r     ON r.id  = bk.room_id
JOIN buildings b ON b.id  = r.building_id
WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House');

DELETE bk
FROM bookings bk
JOIN rooms r     ON r.id  = bk.room_id
JOIN buildings b ON b.id  = r.building_id
WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House');

DELETE r
FROM rooms r
JOIN buildings b ON b.id = r.building_id
WHERE b.name IN ('Thesda', 'Sampaguita', 'Peranza', 'House');

DELETE FROM buildings
WHERE name IN ('Thesda', 'Sampaguita', 'Peranza', 'House');

-- Migrate legacy lodging room types
UPDATE rooms SET room_type = 'Standard Guest Room' WHERE room_type = 'Superior Guest Room';
UPDATE rooms SET room_type = 'Deluxe Apartment'     WHERE room_type IN ('Deluxe 2 BR', 'Deluxe 3 BR');

UPDATE room_rates SET room_type = 'Standard Guest Room' WHERE room_type = 'Superior Guest Room';
UPDATE room_rates SET room_type = 'Deluxe Apartment'     WHERE room_type IN ('Deluxe 2 BR', 'Deluxe 3 BR');
DELETE FROM room_rates WHERE room_type IN ('Deluxe 2 BR', 'Deluxe 3 BR', 'Superior Guest Room');

-- Remove reservations tied to retired lodging inventory or venue rows stored as rooms
DELETE p
FROM payments p
JOIN bookings bk ON bk.id = p.booking_id
JOIN rooms r     ON r.id  = bk.room_id
JOIN buildings b ON b.id  = r.building_id
WHERE b.name = 'Global Missions Center'
  AND r.room_number IN (
    '104', '501', '504', '505', '506', '507', '601', '602', '703', 'COMMONS', 'CHAPEL'
  );

DELETE bk
FROM bookings bk
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

-- Deluxe Apartments (dlx apt)
INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), 'A-501', 'Deluxe Apartment', 1, 6),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '201',   'Deluxe Apartment', 1, 6),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '301',   'Deluxe Apartment', 1, 6),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '304',   'Deluxe Apartment', 1, 6),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '401',   'Deluxe Apartment', 1, 6),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '402',   'Deluxe Apartment', 1, 6),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '403',   'Deluxe Apartment', 1, 6)
ON DUPLICATE KEY UPDATE room_type = VALUES(room_type), capacity_min = VALUES(capacity_min), capacity_max = VALUES(capacity_max);

-- Standard Apartments (std apt)
INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '203', 'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '205', 'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '302', 'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '303', 'Standard Apartment', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '404', 'Standard Apartment', 1, 4)
ON DUPLICATE KEY UPDATE room_type = VALUES(room_type), capacity_min = VALUES(capacity_min), capacity_max = VALUES(capacity_max);

-- Standard Guest Rooms (sgr)
INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '410', 'Standard Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '411', 'Standard Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '412', 'Standard Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '413', 'Standard Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '414', 'Standard Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '415', 'Standard Guest Room', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '416', 'Standard Guest Room', 1, 4)
ON DUPLICATE KEY UPDATE room_type = VALUES(room_type), capacity_min = VALUES(capacity_min), capacity_max = VALUES(capacity_max);

-- Dormitories (dorm)
INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '103', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '202', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '204', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '206', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '207', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '208', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '209', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '305', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '306', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '307', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '308', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '309', 'Dorm', 5, 10),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), '310', 'Dorm', 5, 10)
ON DUPLICATE KEY UPDATE room_type = VALUES(room_type), capacity_min = VALUES(capacity_min), capacity_max = VALUES(capacity_max);

-- Uncategorized (A-block, no assigned lodging class)
INSERT INTO rooms (building_id, room_number, room_type, capacity_min, capacity_max) VALUES
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), 'A-101', 'Uncategorized', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), 'A-105', 'Uncategorized', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), 'A-505', 'Uncategorized', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), 'A-504', 'Uncategorized', 1, 4),
    ((SELECT id FROM buildings WHERE name='Global Missions Center'), 'A-506', 'Uncategorized', 1, 4)
ON DUPLICATE KEY UPDATE room_type = VALUES(room_type), capacity_min = VALUES(capacity_min), capacity_max = VALUES(capacity_max);

-- ============================================
-- SEED DATA: ROOM RATES (FY26)
-- ============================================

INSERT INTO room_rates (room_type, item, season, rate) VALUES
    ('Dorm', 'Per person per Night', 'Regular',    450.00),
    ('Dorm', 'Per person per Night', 'Peak',       500.00),
    ('Dorm', 'Per person per Night', 'Super Peak', 550.00),

    ('Standard Guest Room', 'Single/Double Occupancy', 'Regular',    2250.00),
    ('Standard Guest Room', 'Single/Double Occupancy', 'Peak',       2500.00),
    ('Standard Guest Room', 'Single/Double Occupancy', 'Super Peak', 2750.00),
    ('Standard Guest Room', 'Daily Maximum',           'Regular',    2800.00),
    ('Standard Guest Room', 'Daily Maximum',           'Peak',       3050.00),
    ('Standard Guest Room', 'Daily Maximum',           'Super Peak', 3400.00),

    ('Standard Apartment', 'Single/Double Occupancy',   'Regular',    2500.00),
    ('Standard Apartment', 'Single/Double Occupancy',   'Peak',       2700.00),
    ('Standard Apartment', 'Single/Double Occupancy',   'Super Peak', 3000.00),
    ('Standard Apartment', 'Daily Maximum',             'Regular',    3050.00),
    ('Standard Apartment', 'Daily Maximum',             'Peak',       3350.00),
    ('Standard Apartment', 'Daily Maximum',             'Super Peak', 3700.00),
    ('Standard Apartment', 'Extra Bed or Extra Person', 'Regular',     450.00),
    ('Standard Apartment', 'Extra Bed or Extra Person', 'Peak',        500.00),
    ('Standard Apartment', 'Extra Bed or Extra Person', 'Super Peak',  550.00),

    ('Deluxe Apartment', 'Single/Double Occupancy',   'Regular',    3000.00),
    ('Deluxe Apartment', 'Single/Double Occupancy',   'Peak',       3275.00),
    ('Deluxe Apartment', 'Single/Double Occupancy',   'Super Peak', 3650.00),
    ('Deluxe Apartment', 'Daily Maximum',             'Regular',    3750.00),
    ('Deluxe Apartment', 'Daily Maximum',             'Peak',       4150.00),
    ('Deluxe Apartment', 'Daily Maximum',             'Super Peak', 4500.00),
    ('Deluxe Apartment', 'Extra Bed or Extra Person', 'Regular',     450.00),
    ('Deluxe Apartment', 'Extra Bed or Extra Person', 'Peak',        500.00),
    ('Deluxe Apartment', 'Extra Bed or Extra Person', 'Super Peak',  550.00),

    ('Uncategorized', 'Single/Double Occupancy', 'Regular',    2250.00),
    ('Uncategorized', 'Single/Double Occupancy', 'Peak',       2500.00),
    ('Uncategorized', 'Single/Double Occupancy', 'Super Peak', 2750.00),
    ('Uncategorized', 'Daily Maximum',           'Regular',    2800.00),
    ('Uncategorized', 'Daily Maximum',           'Peak',       3050.00),
    ('Uncategorized', 'Daily Maximum',           'Super Peak', 3400.00)
ON DUPLICATE KEY UPDATE rate = VALUES(rate);

-- ============================================
-- SEED DATA: FACILITIES & VENUES (FY26)
-- Event spaces — not lodging rooms
-- ============================================

INSERT INTO facilities (category, item, season, rate, capacity_min, capacity_max) VALUES
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

    ('Garden', 'Osgood Garden', 'Regular', 17500.00, 1, 150),
    ('Garden', 'Osgood Garden', 'Peak',    20000.00, 1, 150),

    ('Prayer Mountain', 'Four Hour minimum', 'Regular', 24000.00, NULL, NULL),
    ('Prayer Mountain', 'Four Hour minimum', 'Peak',    26000.00, NULL, NULL),
    ('Prayer Mountain', 'Extra hour',        'Regular',  6000.00, NULL, NULL),
    ('Prayer Mountain', 'Extra hour',        'Peak',     6500.00, NULL, NULL)
ON DUPLICATE KEY UPDATE rate = VALUES(rate);

-- ============================================
-- SEED DATA: ANCILLARY FACILITIES & SERVICES (FY26)
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

    ('GMC', 'Russ Turney Educational Center', 'Regular', 4500.00, 1, 100),
    ('GMC', 'Russ Turney Educational Center', 'Peak',    5500.00, 1, 100),
    ('GMC', 'Classroom Multi-Purpose Room',   'Regular', 3000.00, 1,  30),
    ('GMC', 'Classroom Multi-Purpose Room',   'Peak',    3500.00, 1,  30),
    ('GMC', 'Conference Room',                'Regular', 2100.00, 1,  15),
    ('GMC', 'Conference Room',                'Peak',    2500.00, 1,  15),

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

-- ============================================
-- SEED DATA: SEASON DEFINITIONS (FY26)
-- ============================================

INSERT INTO season_definitions (season, start_date, end_date, label) VALUES
    ('Regular',    '2026-01-01', '2026-03-31', 'Regular Jan-Mar 2026'),
    ('Peak',       '2026-04-01', '2026-05-31', 'Peak Summer 2026'),
    ('Regular',    '2026-06-01', '2026-10-31', 'Regular Jun-Oct 2026'),
    ('Peak',       '2026-11-01', '2026-11-30', 'Peak Nov 2026'),
    ('Super Peak', '2026-12-01', '2026-12-31', 'Super Peak Christmas 2026');

INSERT INTO system_settings (setting_key, setting_value) VALUES
    ('fiscal_year_start_month', '7'),
    ('fiscal_year_start_day', '1'),
    ('booking_advance_months', '12')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- Demo bookings, payments, and room status samples are seeded by the server
-- on startup (see client/server/src/config/seed.js) after users are created.