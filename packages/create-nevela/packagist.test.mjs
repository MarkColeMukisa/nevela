import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNewer, satisfiesCaret } from './packagist.mjs';

test('a newer installer is only announced for a higher stable version', () => {
  assert.equal(isNewer('0.1.2', '0.1.1'), true);
  assert.equal(isNewer('0.2.0', '0.1.9'), true);
  assert.equal(isNewer('1.0.0', '0.9.9'), true);
  assert.equal(isNewer('0.1.10', '0.1.9'), true);
  assert.equal(isNewer('0.1.1', '0.1.1'), false);
  assert.equal(isNewer('0.1.0', '0.1.1'), false);
  assert.equal(isNewer('0.0.0-stage', '0.1.1'), false);
  assert.equal(isNewer(undefined, '0.1.1'), false);
});

test('below 1.0, only the same minor version is accepted', () => {
  assert.equal(satisfiesCaret('v0.1.0', [0, 1]), true);
  assert.equal(satisfiesCaret('0.1.7', [0, 1]), true);
  assert.equal(satisfiesCaret('v0.2.0', [0, 1]), false);
  assert.equal(satisfiesCaret('v1.0.0', [0, 1]), false);
});

test('from 1.0, the same major and an equal or later minor are accepted', () => {
  assert.equal(satisfiesCaret('v1.2.0', [1, 2]), true);
  assert.equal(satisfiesCaret('v1.5.3', [1, 2]), true);
  assert.equal(satisfiesCaret('v1.1.9', [1, 2]), false);
  assert.equal(satisfiesCaret('v2.0.0', [1, 2]), false);
});

test('branches and pre-releases are not releases', () => {
  assert.equal(satisfiesCaret('dev-main', [0, 1]), false);
  assert.equal(satisfiesCaret('v0.1.0-beta.1', [0, 1]), false);
  assert.equal(satisfiesCaret('0.1.x-dev', [0, 1]), false);
});
