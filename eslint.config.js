import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly', process: 'readonly', fetch: 'readonly',
        Buffer: 'readonly', URL: 'readonly',
      },
    },
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        performance: 'readonly', requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly', localStorage: 'readonly',
        console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        HTMLElement: 'readonly', HTMLCanvasElement: 'readonly',
        HTMLInputElement: 'readonly', HTMLSelectElement: 'readonly',
        PointerEvent: 'readonly', WheelEvent: 'readonly', KeyboardEvent: 'readonly',
        TouchEvent: 'readonly', MouseEvent: 'readonly', Image: 'readonly',
        matchMedia: 'readonly', devicePixelRatio: 'readonly', ResizeObserver: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
