import { pool } from '../../config/db.js';

/** guest_access_requests, audit_logs, and login_attempts. */
export async function runGuestAccessRequestsTable() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS guest_access_requests (
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
     )`
  );
}

export async function runAuditLogsTable() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS audit_logs (
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
     )`
  );
}

export async function runLoginAttemptsTable() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS login_attempts (
       email VARCHAR(150) PRIMARY KEY,
       attempt_count INT NOT NULL DEFAULT 0,
       locked_until TIMESTAMP NULL,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`
  );
}
