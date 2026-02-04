/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  // Run Prettier and typecheck on JavaScript and TypeScript files
  '**/*.{js,jsx,ts,tsx}': ['prettier --write', () => 'pnpm typecheck'],

  // Run Prettier on all other supported files
  '**/*.{json,css,scss,md}': ['prettier --write'],
};
