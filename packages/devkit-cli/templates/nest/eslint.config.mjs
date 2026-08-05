import nest from '@cheolubak/eslint-config-nest';

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'jest.config.js', 'jest-e2e.config.js'],
  },
  ...nest,
];
