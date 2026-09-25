/**
 * Test bootstrap, loaded via `node --test --require .../register.js`.
 *
 * Redirects native-only imports to the in-file mocks so the REAL store,
 * services, and utilities execute under plain Node:
 * - `react-native-mmkv` -> in-memory Map mock
 * - `expo-notifications` -> controllable call-recording mock
 * - `react-native` -> AppState stub
 *
 * Everything else (zustand, src/*) loads unmodified.
 */

interface ResolveFilename {
  (this: unknown, request: string, ...args: unknown[]): string;
}

// `require` here is Node's real CommonJS loader hook point. This file is
// compiled to CommonJS, so this call survives compilation as-is.
const NodeModule = require('node:module') as {
  _resolveFilename: ResolveFilename;
};

const originalResolve = NodeModule._resolveFilename;

function mockTarget(request: string): string | null {
  switch (request) {
    case 'react-native-mmkv':
      return require.resolve('./mmkv-mock.js');
    case 'expo-notifications':
      return require.resolve('./expo-notifications-mock.js');
    case 'react-native':
      return require.resolve('./react-native-mock.js');
    default:
      return null;
  }
}

NodeModule._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
): string {
  return mockTarget(request) ?? originalResolve.call(this, request, ...args);
};
