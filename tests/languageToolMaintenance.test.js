'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../backend/services/featurePolicy');

test('política de capacidades desactiva LanguageTool de forma explícita', () => {
    assert.equal(policy.languageTool, false);
    assert.ok(typeof policy.languageToolMaintenanceMessage === 'string');
    assert.ok(policy.languageToolMaintenanceMessage.length > 0);
});

test('endpoint /api/corregir-texto responde 503 cuando LanguageTool está desactivado', async (t) => {
    process.env.LOQUENDO_NO_AUTOSTART = '1';
    const serverModule = require('../server');
    const app = serverModule.expressApp;

    // Simular petición a /api/corregir-texto sin depender de servidor HTTP abierto
    const req = {
        method: 'POST',
        url: '/api/corregir-texto',
        headers: { 'content-type': 'application/json' },
        body: { texto: 'Prueba de correccion' }
    };

    let statusCode = null;
    let jsonResponse = null;

    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            jsonResponse = data;
            return this;
        }
    };

    // Invocar handler a través de la ruta express
    const route = app._router.stack.find(
        layer => layer.route && layer.route.path === '/api/corregir-texto' && layer.route.methods.post
    );

    assert.ok(route, 'Ruta /api/corregir-texto debe estar registrada');
    await route.route.stack[0].handle(req, res);

    assert.equal(statusCode, 503);
    assert.equal(jsonResponse?.code, 'LANGUAGETOOL_DISABLED');
});

test('endpoint /api/health reporta languageTool desactivado en capabilities', async () => {
    process.env.LOQUENDO_NO_AUTOSTART = '1';
    const serverModule = require('../server');
    const app = serverModule.expressApp;

    const req = { method: 'GET', url: '/api/health' };
    let jsonResponse = null;
    const res = {
        json(data) {
            jsonResponse = data;
            return this;
        }
    };

    const route = app._router.stack.find(
        layer => layer.route && layer.route.path === '/api/health' && layer.route.methods.get
    );

    assert.ok(route, 'Ruta /api/health debe estar registrada');
    route.route.stack[0].handle(req, res);

    assert.ok(jsonResponse);
    assert.equal(jsonResponse.capabilities?.languageTool, false);
});
