import { pool } from '../config/db.js';
import { getSupportEmail } from './email.service.js';

const TELEPHONE_KEY = 'support_telephone';
const MOBILE_KEY = 'support_mobile';
const NAME_KEY = 'support_contact_name';

const DEFAULTS = {
  name: 'Merlyn Ramos',
  label: 'Housing & Guest Services Supervisor',
  telephone: '(6374) 442-2779 / 442-7068 Ext. 283',
  fax: '(6374) 442-6378',
  mobile: '0929-599-1831',
  address: '444 Ambuklao, Baguio City',
  country: 'Philippines',
  website: 'www.apts.edu',
};

export async function getSupportContactDetails() {
  const [rows] = await pool.query(
    'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (?, ?, ?)',
    [NAME_KEY, TELEPHONE_KEY, MOBILE_KEY]
  );
  const settings = new Map(rows.map((row) => [row.setting_key, row.setting_value]));
  return {
    ...DEFAULTS,
    name: settings.get(NAME_KEY) || DEFAULTS.name,
    email: getSupportEmail(),
    telephone: settings.get(TELEPHONE_KEY) || DEFAULTS.telephone,
    mobile: settings.get(MOBILE_KEY) || DEFAULTS.mobile,
  };
}

function validateContactValue(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > 80) throw new Error(`${label} cannot exceed 80 characters`);
  return text;
}

export async function updateSupportContactDetails({ name, telephone, mobile } = {}) {
  const nextName = validateContactValue(name, 'Contact person');
  const nextTelephone = validateContactValue(telephone, 'Telephone number');
  const nextMobile = validateContactValue(mobile, 'Mobile number');
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?), (?, ?), (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
    [NAME_KEY, nextName, TELEPHONE_KEY, nextTelephone, MOBILE_KEY, nextMobile]
  );
  return getSupportContactDetails();
}
