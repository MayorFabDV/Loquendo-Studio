'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { registrarLimpiezaAntesDeSalir } = require('../backend/services/electronQuit');
const {
    normalizarPuerto,
    esperarPuertoLigado,
    escucharConFallback,
    origenLocalPermitido
} = require('../backend/services/serverNetwork');

function cerrarServidor(servidor) {
    return new Promise((resolve, reject) => {
        if (!servidor || !servidor.listening) return resolve();
        servidor.close((error) => error ? reject(error) : resolve());
    });
}

test('normalizarPuerto acepta solo puertos válidos', () => {
    assert.equal(normalizarPuerto(3000), 3000);
    assert.equal(normalizarPuerto('3001'), 3001);
    assert.equal(normalizarPuerto(0), null);
    assert.equal(normalizarPuerto(65536), null);
    assert.equal(normalizarPuerto('abc'), null);
});

test('esperarPuertoLigado espera el puerto real y no inventa un fallback', async () => {
    const valores = [null, undefined, 3001];
    const puerto = await esperarPuertoLigado(() => valores.shift(), {
        maxAttempts: 4,
        delay: 0
    });
    assert.equal(puerto, 3001);

    await assert.rejects(
        esperarPuertoLigado(() => null, { maxAttempts: 2, delay: 0 }),
        /no informó un puerto ligado/
    );
});

test('escucharConFallback avanza cuando el puerto inicial está ocupado', async (t) => {
    const bloqueador = http.createServer();
    await new Promise((resolve, reject) => {
        bloqueador.once('error', reject);
        bloqueador.listen(0, 'localhost', resolve);
    });
    t.after(() => cerrarServidor(bloqueador));

    const puertoOcupado = bloqueador.address().port;
    const appPrueba = {
        listen(puerto, host) {
            return http.createServer((req, res) => res.end('ok')).listen(puerto, host);
        }
    };
    const escucha = escucharConFallback(appPrueba, puertoOcupado, 'localhost', 10);
    const servidor = await escucha.listo;
    t.after(() => cerrarServidor(servidor));

    assert.ok(escucha.getPuerto() > puertoOcupado);
    assert.equal(servidor.address().port, escucha.getPuerto());
    assert.ok(net.isIP(servidor.address().address) > 0);
    assert.ok(
        ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(servidor.address().address),
        `El servidor debe escuchar solo en loopback: ${servidor.address().address}`
    );
});

test('origen CORS permitido queda limitado al localhost y puerto de la aplicación', () => {
    assert.equal(origenLocalPermitido('http://localhost:3001', 3001), true);
    assert.equal(origenLocalPermitido('http://localhost:3000', 3001), false);
    assert.equal(origenLocalPermitido('https://localhost:3001', 3001), false);
    assert.equal(origenLocalPermitido('http://example.com:3001', 3001), false);
    assert.equal(origenLocalPermitido('null', 3001), false);
});

test('before-quit espera a la limpieza asíncrona y ejecuta quit una sola vez', async () => {
    const app = new EventEmitter();
    let resolverLimpieza;
    let limpiezas = 0;
    let quits = 0;
    app.quit = () => {
        quits++;
        app.emit('before-quit', { preventDefault() { throw new Error('no debe cancelar el cierre completado'); } });
    };

    registrarLimpiezaAntesDeSalir(app, () => {
        limpiezas++;
        return new Promise((resolve) => { resolverLimpieza = resolve; });
    });

    let prevenido = false;
    app.emit('before-quit', { preventDefault() { prevenido = true; } });
    assert.equal(prevenido, true);
    await Promise.resolve();
    assert.equal(limpiezas, 1);
    assert.equal(quits, 0);

    app.emit('before-quit', { preventDefault() { prevenido = true; } });
    assert.equal(limpiezas, 1);
    resolverLimpieza();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(quits, 1);
});

test('before-quit continúa el cierre si la limpieza falla', async () => {
    const app = new EventEmitter();
    let quits = 0;
    let logged = false;
    app.quit = () => {
        quits++;
        app.emit('before-quit', { preventDefault() {} });
    };

    registrarLimpiezaAntesDeSalir(
        app,
        () => Promise.reject(new Error('fallo simulado')),
        () => { logged = true; }
    );
    app.emit('before-quit', { preventDefault() {} });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(logged, true);
    assert.equal(quits, 1);
});
