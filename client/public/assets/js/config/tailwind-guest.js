tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      ...window.APTSPACE_THEME_EXTEND,
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
    },
  },
};
