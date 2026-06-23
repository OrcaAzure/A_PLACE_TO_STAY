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
                    'Superior Guest Room',
                    'Standard Apartment',
                    'Deluxe 2 BR',
                    'Deluxe 3 BR'
                  ) NOT NULL,
    capacity_min  INT NOT NULL DEFAULT 1,
    capacity_max  INT NOT NULL DEFAULT 1,
    occupancy     INT NOT NULL DEFAULT 0,
    status        ENUM(
                    'Available',
                    'Occupied',
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
                'Superior Guest Room',
                'Standard Apartment',
                'Deluxe 2 BR',
                'Deluxe 3 BR'
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
                 'GNC View Only',
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
-- ============================================

CREATE TABLE IF NOT EXISTS bookings (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT NOT NULL,
    room_id        INT NOT NULL,
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

    CONSTRAINT chk_dates  CHECK (check_out > check_in),
    CONSTRAINT chk_guests CHECK (guest_count >= 1),
    CONSTRAINT chk_total  CHECK (total_amount IS NULL OR total_amount > 0)
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
-- Password = bcrypt hash of 'aptspace'
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
-- SEED DATA: SEASON DEFINITIONS (FY26)
-- ============================================

INSERT INTO season_definitions (season, start_date, end_date, label) VALUES
    ('Regular',    '2026-01-01', '2026-03-31', 'Regular Jan-Mar 2026'),
    ('Peak',       '2026-04-01', '2026-05-31', 'Peak Summer 2026'),
    ('Regular',    '2026-06-01', '2026-10-31', 'Regular Jun-Oct 2026'),
    ('Peak',       '2026-11-01', '2026-11-30', 'Peak Nov 2026'),
    ('Super Peak', '2026-12-01', '2026-12-31', 'Super Peak Christmas 2026');

-- ============================================
-- SEED DATA: GUEST USERS
-- Password for all = aptspace123
-- ============================================

INSERT INTO users (full_name, email, password, role, status) VALUES
    ('Maria Santos',    'maria.santos@apts.edu.ph',    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p398ItxvFO9TNFBXMMEZ.a', 'Faculty',       'Active'),
    ('James Reyes',     'james.reyes@apts.edu.ph',     '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p398ItxvFO9TNFBXMMEZ.a', 'Student',       'Active'),
    ('Ruth Villanueva', 'ruth.villanueva@apts.edu.ph', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p398ItxvFO9TNFBXMMEZ.a', 'Staff',         'Active'),
    ('Paul Mendoza',    'paul.mendoza@apts.edu.ph',    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p398ItxvFO9TNFBXMMEZ.a', 'Missionary',    'Active'),
    ('Grace Tan',       'grace.tan@apts.edu.ph',       '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p398ItxvFO9TNFBXMMEZ.a', 'GNC View Only', 'Active'),
    ('Admin User',      'admin2@aptspace.com',          '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p398ItxvFO9TNFBXMMEZ.a', 'Admin',         'Active')
ON DUPLICATE KEY UPDATE email = email;

-- ============================================
-- SEED DATA: SAMPLE BOOKINGS
-- ============================================

INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
SELECT u.id, r.id, '2026-07-01', '2026-07-05', 2, 'Regular', 'Single/Double Occupancy', 10000.00, 'Approved', 'Conference attendance'
FROM users u, rooms r
WHERE u.email = 'maria.santos@apts.edu.ph'
  AND r.room_number = '201' AND r.building_id = (SELECT id FROM buildings WHERE name='PCALM') LIMIT 1;

INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
SELECT u.id, r.id, '2026-07-10', '2026-07-12', 1, 'Regular', 'Single/Double Occupancy', 4500.00, 'Pending', 'Short study visit'
FROM users u, rooms r
WHERE u.email = 'james.reyes@apts.edu.ph'
  AND r.room_number = 'BG1' AND r.building_id = (SELECT id FROM buildings WHERE name='Thesda') LIMIT 1;

INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
SELECT u.id, r.id, '2026-06-20', '2026-06-25', 3, 'Regular', 'Daily Maximum', 15250.00, 'Approved', 'Staff retreat'
FROM users u, rooms r
WHERE u.email = 'ruth.villanueva@apts.edu.ph'
  AND r.room_number = 'A' AND r.building_id = (SELECT id FROM buildings WHERE name='House') LIMIT 1;

INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
SELECT u.id, r.id, '2026-08-01', '2026-08-07', 2, 'Regular', 'Single/Double Occupancy', 15000.00, 'Pending', 'Mission partner visit'
FROM users u, rooms r
WHERE u.email = 'paul.mendoza@apts.edu.ph'
  AND r.room_number = '101' AND r.building_id = (SELECT id FROM buildings WHERE name='Sampaguita') LIMIT 1;

INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
SELECT u.id, r.id, '2026-07-15', '2026-07-20', 4, 'Regular', 'Daily Maximum', 22750.00, 'Rejected', 'Family retreat — rejected due to room conflict'
FROM users u, rooms r
WHERE u.email = 'maria.santos@apts.edu.ph'
  AND r.room_number = '401' AND r.building_id = (SELECT id FROM buildings WHERE name='PCALM') LIMIT 1;

INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
SELECT u.id, r.id, '2026-09-05', '2026-09-10', 1, 'Regular', 'Single/Double Occupancy', 11250.00, 'Approved', 'Academic conference'
FROM users u, rooms r
WHERE u.email = 'james.reyes@apts.edu.ph'
  AND r.room_number = '101' AND r.building_id = (SELECT id FROM buildings WHERE name='Thesda') LIMIT 1;

INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
SELECT u.id, r.id, '2026-10-01', '2026-10-03', 6, 'Regular', 'Daily Maximum', 8700.00, 'Pending', 'Mission team accommodation'
FROM users u, rooms r
WHERE u.email = 'paul.mendoza@apts.edu.ph'
  AND r.room_number = '501' AND r.building_id = (SELECT id FROM buildings WHERE name='PCALM') LIMIT 1;

INSERT INTO bookings (user_id, room_id, check_in, check_out, guest_count, season, occupancy_item, total_amount, status, notes)
SELECT u.id, r.id, '2026-07-22', '2026-07-24', 2, 'Regular', 'Single/Double Occupancy', 5000.00, 'Cancelled', 'Cancelled — travel plans changed'
FROM users u, rooms r
WHERE u.email = 'ruth.villanueva@apts.edu.ph'
  AND r.room_number = '202' AND r.building_id = (SELECT id FROM buildings WHERE name='Sampaguita') LIMIT 1;

-- ============================================
-- SEED DATA: PAYMENTS
-- ============================================

INSERT INTO payments (booking_id, amount, method, status, paid_at)
SELECT b.id, 10000.00, 'GCash', 'Paid', '2026-07-01 10:00:00'
FROM bookings b JOIN users u ON b.user_id = u.id
WHERE u.email = 'maria.santos@apts.edu.ph' AND b.check_in = '2026-07-01' LIMIT 1;

INSERT INTO payments (booking_id, amount, method, status, paid_at)
SELECT b.id, 15250.00, 'Bank Transfer', 'Paid', '2026-06-20 09:00:00'
FROM bookings b JOIN users u ON b.user_id = u.id
WHERE u.email = 'ruth.villanueva@apts.edu.ph' AND b.status = 'Approved' LIMIT 1;

INSERT INTO payments (booking_id, amount, method, status, paid_at)
SELECT b.id, 11250.00, 'Cash', 'Paid', '2026-09-05 08:30:00'
FROM bookings b JOIN users u ON b.user_id = u.id
WHERE u.email = 'james.reyes@apts.edu.ph' AND b.status = 'Approved' LIMIT 1;

INSERT INTO payments (booking_id, amount, method, status)
SELECT b.id, 15000.00, 'GCash', 'Pending'
FROM bookings b JOIN users u ON b.user_id = u.id
WHERE u.email = 'paul.mendoza@apts.edu.ph' AND b.check_in = '2026-08-01' LIMIT 1;

-- ============================================
-- SEED DATA: ROOM STATUSES
-- Occupied, Maintenance, and Available samples
-- ============================================

-- Occupied rooms (linked to approved bookings)
UPDATE rooms SET status = 'Occupied', occupancy = 2
WHERE room_number = '201' AND building_id = (SELECT id FROM buildings WHERE name='PCALM');

UPDATE rooms SET status = 'Occupied', occupancy = 3
WHERE room_number = 'A' AND building_id = (SELECT id FROM buildings WHERE name='House');

UPDATE rooms SET status = 'Occupied', occupancy = 1
WHERE room_number = '101' AND building_id = (SELECT id FROM buildings WHERE name='Thesda');

UPDATE rooms SET status = 'Occupied', occupancy = 2
WHERE room_number = '101' AND building_id = (SELECT id FROM buildings WHERE name='Sampaguita');

UPDATE rooms SET status = 'Occupied', occupancy = 4
WHERE room_number = '302' AND building_id = (SELECT id FROM buildings WHERE name='PCALM');

UPDATE rooms SET status = 'Occupied', occupancy = 2
WHERE room_number = '104' AND building_id = (SELECT id FROM buildings WHERE name='Thesda');

UPDATE rooms SET status = 'Occupied', occupancy = 1
WHERE room_number = 'B' AND building_id = (SELECT id FROM buildings WHERE name='House');

-- Maintenance rooms
UPDATE rooms SET status = 'Maintenance', occupancy = 0
WHERE room_number = '303' AND building_id = (SELECT id FROM buildings WHERE name='PCALM');

UPDATE rooms SET status = 'Maintenance', occupancy = 0
WHERE room_number = 'BG3' AND building_id = (SELECT id FROM buildings WHERE name='Thesda');

UPDATE rooms SET status = 'Maintenance', occupancy = 0
WHERE room_number = '204' AND building_id = (SELECT id FROM buildings WHERE name='Sampaguita');

UPDATE rooms SET status = 'Maintenance', occupancy = 0
WHERE room_number = '203' AND building_id = (SELECT id FROM buildings WHERE name='Peranza');

UPDATE rooms SET status = 'Maintenance', occupancy = 0
WHERE room_number = '410' AND building_id = (SELECT id FROM buildings WHERE name='PCALM');

-- Everything else stays Available (the default)