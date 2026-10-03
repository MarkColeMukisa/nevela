import assert from 'node:assert/strict';
import { test } from 'node:test';
import { satisfiesCaret } from './packagist.mjs';

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
