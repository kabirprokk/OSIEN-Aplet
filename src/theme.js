(function attachApletTheme(root) {
  const theme = {
    resolveTheme(savedTheme, prefersDark) {
      if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
      return prefersDark ? 'dark' : 'light';
    },
    nextTheme(currentTheme) {
      return currentTheme === 'dark' ? 'light' : 'dark';
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = theme;
  if (root) root.ApletTheme = theme;
})(typeof window === 'undefined' ? null : window);
