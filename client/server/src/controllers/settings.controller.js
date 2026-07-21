import {
  getPublicFiscalYearInfo,
  updateFiscalYearSettings,
  normalizeSeasonPeriodList,
  normalizeWeekendRule,
} from '../services/fiscalYear.service.js';
import { previewStayNights } from '../services/season.service.js';
import { bustFiscalYearSettings } from '../utils/cache.js';
import { getPublicPolicies, updatePublicPolicies } from '../services/policies.service.js';
import { updateSupportContactDetails } from '../services/support-contact.service.js';
import { logAudit } from '../services/audit.service.js';

import { isAdminRole } from '../utils/constants.js';

export const getFiscalYear = async (req, res) => {
  try {
    const bypassAdvanceLimit = isAdminRole(req.user?.role);
    const info = await getPublicFiscalYearInfo({ bypassAdvanceLimit });
    res.status(200).json(info);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateFiscalYear = async (req, res) => {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const settings = await updateFiscalYearSettings(req.body || {});
    bustFiscalYearSettings();
    const info = await getPublicFiscalYearInfo({ bypassAdvanceLimit: true });
    res.status(200).json({
      message: 'Fiscal year settings updated',
      settings,
      ...info,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const previewSeasonCalendar = async (req, res) => {
  try {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { check_in: checkIn, check_out: checkOut } = req.body || {};
    if (!checkIn || !checkOut) {
      return res.status(400).json({ message: 'check_in and check_out are required' });
    }
    if (checkOut <= checkIn) {
      return res.status(400).json({ message: 'check_out must be after check_in' });
    }

    const nights = previewStayNights(checkIn, checkOut, {
      season_periods: normalizeSeasonPeriodList(req.body?.season_periods),
      weekend_rule: normalizeWeekendRule(req.body?.weekend_rule),
    });
    const seasons = [...new Set(nights.map((n) => n.season))];

    res.status(200).json({ nights, seasons });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getPolicies = async (_req, res) => {
  try {
    res.status(200).json(await getPublicPolicies());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updatePolicies = async (req, res) => {
  try {
    const policies = await updatePublicPolicies(req.body || {});
    try {
      await logAudit({
        actorUserId: req.user.id,
        action: 'policies_updated',
        entityType: 'system_setting',
        details: {
          rooms_length: policies.rooms.length,
          venues_length: policies.venues.length,
        },
      });
    } catch (auditError) {
      console.error('[audit] Policies were published but audit logging failed:', auditError);
    }
    res.status(200).json({
      message: 'Policies and guidelines published',
      ...policies,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateSupportContact = async (req, res) => {
  try {
    const contact = await updateSupportContactDetails(req.body || {});
    try {
      await logAudit({
        actorUserId: req.user.id,
        action: 'support_contact_updated',
        entityType: 'system_setting',
        details: { name: contact.name, telephone: contact.telephone, mobile: contact.mobile },
      });
    } catch (auditError) {
      console.error('[audit] Contact details were updated but audit logging failed:', auditError);
    }
    res.status(200).json({
      message: 'Contact information updated',
      ...contact,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
