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

    status ENUM(
        'Active',
        'Inactive'
    ) NOT NULL DEFAULT 'Active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- ROOMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,

    room_number VARCHAR(50) NOT NULL UNIQUE,

    room_type VARCHAR(100) NOT NULL,

    capacity INT NOT NULL DEFAULT 1,

    occupancy INT NOT NULL DEFAULT 0,

    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,

    status ENUM(
        'Available',
        'Occupied',
        'Maintenance'
    ) NOT NULL DEFAULT 'Available',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
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

    status ENUM(
        'Pending',
        'Approved',
        'Rejected',
        'Cancelled'
    ) NOT NULL DEFAULT 'Pending',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_booking_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_booking_room
        FOREIGN KEY (room_id)
        REFERENCES rooms(id)
        ON DELETE CASCADE
);

-- ============================================
-- PAYMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,

    booking_id INT NOT NULL,

    amount DECIMAL(10,2) NOT NULL,

    method ENUM(
        'Cash',
        'GCash',
        'Bank Transfer'
    ) NOT NULL,

    status ENUM(
        'Pending',
        'Paid',
        'Failed'
    ) NOT NULL DEFAULT 'Pending',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_payment_booking
        FOREIGN KEY (booking_id)
        REFERENCES bookings(id)
        ON DELETE CASCADE
);

-- ============================================
-- SAMPLE DATA
-- ============================================

INSERT INTO users (
    full_name,
    email,
    password,
    role,
    status
)
VALUES (
    'System Administrator',
    'admin@aptspace.com',
    'aptspace',
    'Super Admin',
    'Active'
)
ON DUPLICATE KEY UPDATE email = email;

INSERT INTO rooms (
    room_number,
    room_type,
    capacity,
    occupancy,
    price,
    status
)
VALUES
    ('A101', 'Single Room', 1, 0, 5000.00, 'Available'),
    ('A102', 'Double Room', 2, 0, 8500.00, 'Available'),
    ('B201', 'Dormitory', 4, 0, 12000.00, 'Available')
ON DUPLICATE KEY UPDATE room_number = room_number;