'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTheme, nextTheme } = require('../src/theme.js');

test('uses an explicit saved theme when valid', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
});

test('follows the system theme when no valid preference is saved', () => {
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme('invalid', true), 'dark');
});

test('toggles between dark and light modes', () => {
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
});
