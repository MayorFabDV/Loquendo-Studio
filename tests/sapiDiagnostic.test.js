'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('diagnóstico SAPI: etapas COM/HRESULT, privacidad, timeout y ausencia de fallback engañoso', () => {
    const root = path.resolve(__dirname, '..');
    const result = spawnSync(path.join(root, 'backend/python/python.exe'), ['-B', path.join(__dirname, 'sapi_diagnostic_test.py')], {
        encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
    });
    assert.equal(result.status, 0, result.error?.message || result.stdout + result.stderr);
});
