import {
  getPublicFiscalYearInfo,
  getFiscalYearSettings,
  updateFiscalYearSettings,
  normalizeSeasonPeriodList,
  normalizeWeekendRule,
} from '../services/fiscalYear.service.js';
import { previewStayNights } from '../services/season.service.js';
import { bustFiscalYearSettings } from '../utils/cache.js';

const ADMIN_ROLES = ['Super Admin', 'Admin'];

export const getFiscalYear = async (req, res) => {
  try {
    const bypassAdvanceLimit = ADMIN_ROLES.includes(req.user?.role);
    const info = await getPublicFiscalYearInfo({ bypassAdvanceLimit });
    res.status(200).json(info);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateFiscalYear = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
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

export const getFiscalYearSettingsOnly = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const settings = await getFiscalYearSettings();
    res.status(200).json({ settings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const previewSeasonCalendar = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
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
