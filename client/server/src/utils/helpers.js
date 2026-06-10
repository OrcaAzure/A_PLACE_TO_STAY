export const safeUser = (user) => {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
};

export const isEmpty = (value) =>
  value === undefined || value === null || String(value).trim() === '';