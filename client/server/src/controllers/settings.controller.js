import {
  getPublicFiscalYearInfo,
  getFiscalYearSettings,
  updateFiscalYearSettings,
} from '../services/fiscalYear.service.js';
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
    const info = await getPublicFiscalYearInfo({ bypassAdvanceLimit: true });
    bustFiscalYearSettings();
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
