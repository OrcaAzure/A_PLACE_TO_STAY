import { pool } from '../src/config/db.js';

async function tableExists(name) {
  const [rows] = await pool.query('SHOW TABLES LIKE ?', [name]);
  return rows.length > 0;
}

if (!(await tableExists('payment_transactions'))) {
  await pool.query(
    `CREATE TABLE payment_transactions (
       id          INT AUTO_INCREMENT PRIMARY KEY,
       payment_id  INT NOT NULL,
       type        ENUM('Deposit', 'Advance', 'Settlement', 'Refund', 'Adjustment') NOT NULL,
       amount      DECIMAL(10,2) NOT NULL,
       method      ENUM('Cash', 'GCash', 'Bank Transfer', 'Waived') NOT NULL,
       notes       VARCHAR(255) DEFAULT NULL,
       recorded_by INT DEFAULT NULL,
       recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT fk_pt_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
         ON DELETE RESTRICT ON UPDATE CASCADE,
       CONSTRAINT fk_pt_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id)
         ON DELETE SET NULL ON UPDATE CASCADE,
       CONSTRAINT chk_pt_amount CHECK (amount > 0),
       INDEX idx_pt_payment (payment_id),
       INDEX idx_pt_recorded (recorded_at)
     )`
  );
  console.log('Created payment_transactions table');
} else {
  console.log('payment_transactions already exists');
}

try {
  await pool.query(
    `ALTER TABLE payments MODIFY status ENUM(
       'Pending', 'Partially Paid', 'Paid', 'Failed', 'Refunded'
     ) NOT NULL DEFAULT 'Pending'`
  );
  console.log('Updated payments.status enum');
} catch (err) {
  console.warn('payments.status enum:', err.message);
}

await pool.query(
  `INSERT INTO system_settings (setting_key, setting_value) VALUES
     ('deposit_required', '0'),
     ('deposit_mode', 'percent'),
     ('deposit_value', '50')
   ON DUPLICATE KEY UPDATE setting_key = setting_key`
);
console.log('Deposit settings ensured');

const [count] = await pool.query('SELECT COUNT(*) AS n FROM payment_transactions');
console.log('Payment transactions:', count[0].n);

await pool.end();
