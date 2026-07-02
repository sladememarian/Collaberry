// Expo's shared ESLint config. Keep it light — the compiler (strict tsc) does
// the heavy lifting; ESLint just catches the obvious stuff.
module.exports = {
  root: true,
  extends: ["expo"],
  ignorePatterns: ["/dist/*", "/.expo/*", "node_modules/*"],
};
