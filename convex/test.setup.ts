/// <reference types="vite/client" />

const discovered = import.meta.glob(['./**/*.ts', './**/*.js']);

// Convex-test needs the generated runtime modules as well as function files.
// Test/setup modules and declarations must not become registered functions.
export const modules = Object.fromEntries(
  Object.entries(discovered).filter(
    ([path]) =>
      !path.endsWith('.test.ts') &&
      !path.endsWith('.d.ts') &&
      path !== './test.setup.ts'
  )
);
