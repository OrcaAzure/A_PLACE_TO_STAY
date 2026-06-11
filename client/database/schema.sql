-- ============================================
-- AptSpace Database Schema
-- ============================================

CREATE DATABASE IF NOT EXISTS aptspace;
USE aptspace;

-- ============================================
-- USERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM(
        'Super Admin',
        'Admin',
        'GNC View Only',
        'Faculty',
        'Staff',
        'Missionary',
        'Student'
    ) NOT NULL DEFAULT 'Student',
    status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- BUILDINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS buildings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- ROOMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    building_id INT NOT NULL,
    room_number VARCHAR(50) NOT NULL,
    room_type ENUM(
        'Dorm',
        'Superior Guest Room',
        'Standard Apartment',
        'Deluxe 2 BR',
        'Deluxe 3 BR'
    ) NOT NULL,
    capacity INT NOT NULL DEFAULT 1,
    occupancy INT NOT NULL DEFAULT 0,
    status ENUM('Available', 'Occupied', 'Maintenance') NOT NULL DEFAULT 'Available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_room_building FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
    UNIQUE KEY uq_building_room (building_id, room_number)
);

-- ============================================
-- ROOM RATES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS room_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_type ENUM(
        'Dorm',
        'Superior Guest Room',
        'Standard Apartment',
        'Deluxe 2 BR',
        'Deluxe 3 BR'
    ) NOT NULL,
    item VARCHAR(100) NOT NULL,
    season ENUM('Regular', 'Peak', 'Super Peak') NOT NULL,
    rate DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_room_rate (room_type, item, season)
);

-- ============================================
-- FACILITIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS facilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    item VARCHAR(100) NOT NULL,
    season ENUM('Regular', 'Peak', 'N/A') NOT NULL DEFAULT 'N/A',
    rate DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_facility_rate (category, item, season)
);

-- ============================================
-- BOOKINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    room_id INT NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    season ENUM('Regular', 'Peak', 'Super Peak') NOT NULL DEFAULT 'Regular',
    occupancy_item VARCHAR(100) NOT NULL DEFAULT 'Single/Double Occupancy',
    status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_booking_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- ============================================
-- PAYMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    method ENUM('Cash', 'GCash', 'Bank Transfer') NOT NULL,
    status ENUM('Pending', 'Paid', 'Failed') NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- ============================================
-- SEED DATA: USERS
-- Password is bcrypt hash of 'aptspace'. Change after first login.
-- ============================================

INSERT INTO users (full_name, email, password, role, status)
VALUES (
    'System Administrator',
    'admin@aptspace.com',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'Super Admin',
    'Active'
) ON DUPLICATE KEY UPDATE email = email;

-- ============================================
-- SEED DATA: BUILDINGS
-- ============================================

INSERT INTO buildings (name, description) VALUES
    ('PCALM',      'Main PCALM building'),
    ('House',      'Guest house units A–J'),
    ('Thesda',     'Thesda dormitory building'),
    ('Sampaguita', 'Sampaguita residential building'),
    ('Peranza',    'Peranza residential building')
ON DUPLICATE KEY UPDATE name = name;

-- ============================================
-- SEED DATA: ROOMS
-- room_type assignments are best guesses from room numbers.
-- Please update any that are incorrect.
-- ============================================

-- PCALM
INSERT INTO rooms (building_id, room_number, room_type, capacity) VALUES
    ((SELECT id FROM buildings WHERE name='PCALM'), '104',    'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='PCALM'), '201',    'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='PCALM'), '202',    'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='PCALM'), '203',    'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='PCALM'), '204',    'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='PCALM'), '205',    'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='PCALM'), '206',    'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='PCALM'), '207',    'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='PCALM'), '208',    'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='PCALM'), '209',    'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='PCALM'), '301',    'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '302',    'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '303',    'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '304',    'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '305',    'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '306',    'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '307',    'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '308',    'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '309',    'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '310',    'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '401',    'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '402',    'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '403',    'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '404',    'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '410',    'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '411',    'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '412',    'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '413',    'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '414',    'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '415',    'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '416',    'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='PCALM'), '501',    'Deluxe 3 BR',         6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '504',    'Deluxe 3 BR',         6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '505',    'Deluxe 3 BR',         6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '506',    'Deluxe 3 BR',         6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '507',    'Deluxe 3 BR',         6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '601',    'Deluxe 3 BR',         6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '602',    'Deluxe 3 BR',         6),
    ((SELECT id FROM buildings WHERE name='PCALM'), '703',    'Deluxe 3 BR',         6),
    ((SELECT id FROM buildings WHERE name='PCALM'), 'COMMONS','Superior Guest Room',  2),
    ((SELECT id FROM buildings WHERE name='PCALM'), 'CHAPEL', 'Superior Guest Room',  2)
ON DUPLICATE KEY UPDATE room_number = room_number;

-- HOUSE
INSERT INTO rooms (building_id, room_number, room_type, capacity) VALUES
    ((SELECT id FROM buildings WHERE name='House'), 'A',  'Standard Apartment', 4),
    ((SELECT id FROM buildings WHERE name='House'), 'B',  'Standard Apartment', 4),
    ((SELECT id FROM buildings WHERE name='House'), 'C',  'Standard Apartment', 4),
    ((SELECT id FROM buildings WHERE name='House'), 'D',  'Standard Apartment', 4),
    ((SELECT id FROM buildings WHERE name='House'), 'E1', 'Standard Apartment', 4),
    ((SELECT id FROM buildings WHERE name='House'), 'E2', 'Standard Apartment', 4),
    ((SELECT id FROM buildings WHERE name='House'), 'F',  'Standard Apartment', 4),
    ((SELECT id FROM buildings WHERE name='House'), 'G',  'Standard Apartment', 4),
    ((SELECT id FROM buildings WHERE name='House'), 'H',  'Standard Apartment', 4),
    ((SELECT id FROM buildings WHERE name='House'), 'J1', 'Standard Apartment', 4),
    ((SELECT id FROM buildings WHERE name='House'), 'J2', 'Standard Apartment', 4)
ON DUPLICATE KEY UPDATE room_number = room_number;

-- THESDA
INSERT INTO rooms (building_id, room_number, room_type, capacity) VALUES
    ((SELECT id FROM buildings WHERE name='Thesda'), 'BG1', 'Dorm', 10),
    ((SELECT id FROM buildings WHERE name='Thesda'), 'BG2', 'Dorm', 10),
    ((SELECT id FROM buildings WHERE name='Thesda'), 'BG3', 'Dorm', 10),
    ((SELECT id FROM buildings WHERE name='Thesda'), 'BG4', 'Dorm', 10),
    ((SELECT id FROM buildings WHERE name='Thesda'), 'BG5', 'Dorm', 10),
    ((SELECT id FROM buildings WHERE name='Thesda'), '101', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '102', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '103', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '104', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '106', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '107', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '108', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '109', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '111', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '201', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '208', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '209', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Thesda'), '301', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '302', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '303', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '304', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '305', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '306', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '307', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '308', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Thesda'), '311', 'Standard Apartment',  4)
ON DUPLICATE KEY UPDATE room_number = room_number;

-- SAMPAGUITA
INSERT INTO rooms (building_id, room_number, room_type, capacity) VALUES
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '101', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '102', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '103', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '104', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '105', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '106', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '107', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '108', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '201', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '202', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '203', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '204', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '205', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '206', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '207', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Sampaguita'), '208', 'Standard Apartment',  4)
ON DUPLICATE KEY UPDATE room_number = room_number;

-- PERANZA
INSERT INTO rooms (building_id, room_number, room_type, capacity) VALUES
    ((SELECT id FROM buildings WHERE name='Peranza'), '101', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Peranza'), '102', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Peranza'), '103', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Peranza'), '104', 'Superior Guest Room', 2),
    ((SELECT id FROM buildings WHERE name='Peranza'), '201', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '202', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '203', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '204', 'Standard Apartment',  4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '300', 'Deluxe 2 BR',         4),
    ((SELECT id FROM buildings WHERE name='Peranza'), '400', 'Deluxe 2 BR',         4)
ON DUPLICATE KEY UPDATE room_number = room_number;

-- ============================================
-- SEED DATA: ROOM RATES (FY26 Rate Sheet)
-- All amounts in Philippine Peso (PHP)
-- ============================================

INSERT INTO room_rates (room_type, item, season, rate) VALUES
    -- Dorm
    ('Dorm', 'Per person per Night (Min. 5 persons)', 'Regular',    450.00),
    ('Dorm', 'Per person per Night (Min. 5 persons)', 'Peak',       500.00),
    ('Dorm', 'Per person per Night (Min. 5 persons)', 'Super Peak', 550.00),

    -- Superior Guest Room
    ('Superior Guest Room', 'Single/Double Occupancy', 'Regular',    2250.00),
    ('Superior Guest Room', 'Single/Double Occupancy', 'Peak',       2500.00),
    ('Superior Guest Room', 'Single/Double Occupancy', 'Super Peak', 2750.00),
    ('Superior Guest Room', 'Daily Maximum (3-4 pax)', 'Regular',    2800.00),
    ('Superior Guest Room', 'Daily Maximum (3-4 pax)', 'Peak',       3050.00),
    ('Superior Guest Room', 'Daily Maximum (3-4 pax)', 'Super Peak', 3400.00),

    -- Standard Apartment
    ('Standard Apartment', 'Single/Double Occupancy',   'Regular',    2500.00),
    ('Standard Apartment', 'Single/Double Occupancy',   'Peak',       2700.00),
    ('Standard Apartment', 'Single/Double Occupancy',   'Super Peak', 3000.00),
    ('Standard Apartment', 'Daily Maximum (3-4 pax)',   'Regular',    3050.00),
    ('Standard Apartment', 'Daily Maximum (3-4 pax)',   'Peak',       3350.00),
    ('Standard Apartment', 'Daily Maximum (3-4 pax)',   'Super Peak', 3700.00),
    ('Standard Apartment', 'Extra Bed or Extra Person', 'Regular',     450.00),
    ('Standard Apartment', 'Extra Bed or Extra Person', 'Peak',        500.00),
    ('Standard Apartment', 'Extra Bed or Extra Person', 'Super Peak',  550.00),

    -- Deluxe 2 BR
    ('Deluxe 2 BR', 'Single/Double Occupancy',   'Regular',    3000.00),
    ('Deluxe 2 BR', 'Single/Double Occupancy',   'Peak',       3275.00),
    ('Deluxe 2 BR', 'Single/Double Occupancy',   'Super Peak', 3650.00),
    ('Deluxe 2 BR', 'Daily Maximum (3-4 pax)',   'Regular',    3750.00),
    ('Deluxe 2 BR', 'Daily Maximum (3-4 pax)',   'Peak',       4150.00),
    ('Deluxe 2 BR', 'Daily Maximum (3-4 pax)',   'Super Peak', 4500.00),
    ('Deluxe 2 BR', 'Extra Bed or Extra Person', 'Regular',     450.00),
    ('Deluxe 2 BR', 'Extra Bed or Extra Person', 'Peak',        500.00),
    ('Deluxe 2 BR', 'Extra Bed or Extra Person', 'Super Peak',  550.00),

    -- Deluxe 3 BR
    ('Deluxe 3 BR', 'Single/Double Occupancy',   'Regular',    3600.00),
    ('Deluxe 3 BR', 'Single/Double Occupancy',   'Peak',       3650.00),
    ('Deluxe 3 BR', 'Single/Double Occupancy',   'Super Peak', 4450.00),
    ('Deluxe 3 BR', 'Daily Maximum (3-6 pax)',   'Regular',    4350.00),
    ('Deluxe 3 BR', 'Daily Maximum (3-6 pax)',   'Peak',       4750.00),
    ('Deluxe 3 BR', 'Daily Maximum (3-6 pax)',   'Super Peak', 5200.00),
    ('Deluxe 3 BR', 'Extra Bed or Extra Person', 'Regular',     450.00),
    ('Deluxe 3 BR', 'Extra Bed or Extra Person', 'Peak',        500.00),
    ('Deluxe 3 BR', 'Extra Bed or Extra Person', 'Super Peak',  550.00)

ON DUPLICATE KEY UPDATE rate = VALUES(rate);

-- ============================================
-- SEED DATA: FACILITIES & SERVICES (FY26 Rate Sheet)
-- All amounts in Philippine Peso (PHP)
-- ============================================

INSERT INTO facilities (category, item, season, rate) VALUES
    ('Food Service', 'Breakfast', 'N/A', 175.00),
    ('Food Service', 'Lunch', 'N/A', 225.00),
    ('Food Service', 'Dinner', 'N/A', 225.00),
    ('Food Service', 'Snack', 'N/A', 85.00),
    ('Laundry', 'Wash, Spin, and Dry (per load 5.0 kg)', 'N/A', 200.00),
    ('Laundry', 'Bleach, additional per load', 'N/A', 50.00),
    ('Laundry', 'Spin Only Washer (per load 5.0 kg)', 'N/A', 75.00),
    ('Laundry-Iron', 'Short Sleeved Shirts / Blouses', 'N/A', 25.00),
    ('Laundry-Iron', 'Long Sleeved Shirts / Blouses / Light Slacks / Skirts', 'N/A', 30.00),
    ('Laundry-Iron', 'Heavy Slacks / Pants / Skirts', 'N/A', 35.00),
    ('Laundry-Iron', 'Dresses', 'N/A', 45.00),
    ('Garden', 'Osgood Garden (up to 150 persons)', 'Regular', 17500.00),
    ('Garden', 'Osgood Garden (up to 150 persons)', 'Peak', 20000.00),
    ('GMC Chapel', 'Church (4 hrs)', 'Regular', 13000.00),
    ('GMC Chapel', 'Church (4 hrs)', 'Peak', 16200.00),
    ('GMC Chapel', 'Wedding (4 hrs)', 'Regular', 28000.00),
    ('GMC Chapel', 'Wedding (4 hrs)', 'Peak', 33000.00),
    ('GMC Chapel', 'Aircon (4 hrs)', 'Regular', 1100.00),
    ('GMC Chapel', 'Aircon (4 hrs)', 'Peak', 1100.00),
    ('Burdine Commons', 'Meeting and other functions', 'Regular', 4500.00),
    ('Burdine Commons', 'Meeting and other functions', 'Peak', 5500.00),
    ('Burdine Commons', 'Wedding and/or reception (4 hrs)', 'Regular', 16500.00),
    ('Burdine Commons', 'Wedding and/or reception (4 hrs)', 'Peak', 19000.00),
    ('GMC', 'Russ Turney Educational Center (up to 100 persons)', 'Regular', 4500.00),
    ('GMC', 'Russ Turney Educational Center (up to 100 persons)', 'Peak', 5500.00),
    ('GMC', 'Classroom / Multi-Purpose Room (up to 30 persons)', 'Regular', 3000.00),
    ('GMC', 'Classroom / Multi-Purpose Room (up to 30 persons)', 'Peak', 3500.00),
    ('GMC', 'Conference Room (15 persons)', 'Regular', 2100.00),
    ('GMC', 'Conference Room (15 persons)', 'Peak', 2500.00),
    ('Prayer Mountain', 'Four Hour minimum', 'Regular', 24000.00),
    ('Prayer Mountain', 'Four Hour minimum', 'Peak', 26000.00),
    ('Prayer Mountain', 'Extra hour', 'Regular', 6000.00),
    ('Prayer Mountain', 'Extra hour', 'Peak', 6500.00),
    ('Prayer Tower', 'Function', 'Regular', 5500.00),
    ('Prayer Tower', 'Function', 'Peak', 6000.00),
    ('Prayer Tower', 'Baptism', 'Regular', 1000.00),
    ('Prayer Tower', 'Baptism', 'Peak', 1000.00),
    ('Basketball Court', 'Sporting event (4 hr)', 'Regular', 2000.00),
    ('Basketball Court', 'Sporting event (4 hr)', 'Peak', 2500.00),
    ('Childrens Playground', '4 hour', 'Regular', 1000.00),
    ('Childrens Playground', '4 hour', 'Peak', 1500.00),
    ('Rec Center', '4 hour', 'Regular', 2000.00),
    ('Rec Center', '4 hour', 'Peak', 2500.00),
    ('Corkage Fee', 'Per person', 'N/A', 65.00),
    ('Maid Service', 'Per person', 'N/A', 200.00)
ON DUPLICATE KEY UPDATE rate = VALUES(rate);