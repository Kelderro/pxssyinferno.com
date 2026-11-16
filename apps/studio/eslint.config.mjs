import studio from '@sanity/eslint-config-studio'

export default [
  ...studio,
  {
    // One-off Node scripts (run with `node scripts/...`), not Studio code.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
      },
    },
  },
]
