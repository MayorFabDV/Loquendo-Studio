'use strict';

function normalizarPuerto(valor) {
    const puerto = Number(valor);
    return Number.isInteger(puerto) && puerto > 0 && puerto <= 65535 ? puerto : null;
}

function esperarPuertoLigado(obtenerPuerto, opciones = {}) {
    const intentosMaximos = Number.isInteger(opciones.maxAttempts) && opciones.maxAttempts > 0
        ? opciones.maxAttempts
        : 40;
    const demora = Number.isFinite(opciones.delay) && opciones.delay >= 0
        ? opciones.delay
        : 250;

    return new Promise((resolve, reject) => {
        let intentos = 0;

        const comprobar = () => {
            let puerto;
            try {
                puerto = normalizarPuerto(obtenerPuerto());
            } catch (error) {
                reject(error);
                return;
            }

            if (puerto) {
                resolve(puerto);
                return;
            }

            intentos++;
            if (intentos >= intentosMaximos) {
                reject(new Error('Express no informó un puerto ligado dentro del tiempo esperado'));
                return;
            }

            setTimeout(comprobar, demora);
        };

        comprobar();
    });
}

function escucharConFallback(app, puertoInicial, host = 'localhost', maxAttempts = 20, onFallback) {
    const inicial = normalizarPuerto(puertoInicial);
    if (!inicial) throw new TypeError('El puerto inicial debe ser un entero entre 1 y 65535');

    let servidorActual = null;
    let puertoLigado = null;
    let intentos = 0;

    const listo = new Promise((resolve, reject) => {
        const intentar = (puerto) => {
            if (puerto > 65535 || intentos >= maxAttempts) {
                reject(new Error(`No se pudo ligar Express después de ${intentos} intentos`));
                return;
            }

            intentos++;
            let servidor;
            try {
                servidor = app.listen(puerto, host);
            } catch (error) {
                reject(error);
                return;
            }
            servidorActual = servidor;

            servidor.once('listening', () => {
                const direccion = servidor.address();
                if (!direccion || typeof direccion === 'string') {
                    reject(new Error('Express informó una dirección de escucha no válida'));
                    return;
                }
                puertoLigado = direccion.port;
                resolve(servidor);
            });

            servidor.once('error', (error) => {
                if (error && error.code === 'EADDRINUSE') {
                    if (typeof onFallback === 'function') onFallback(puerto, puerto + 1);
                    intentar(puerto + 1);
                    return;
                }
                reject(error);
            });
        };

        intentar(inicial);
    });

    return {
        listo,
        getPuerto: () => puertoLigado,
        getServidor: () => servidorActual
    };
}

function origenLocalPermitido(origen, puerto) {
    const puertoEsperado = normalizarPuerto(puerto);
    if (typeof origen !== 'string' || !puertoEsperado) return false;

    try {
        const url = new URL(origen);
        return url.protocol === 'http:'
            && url.hostname.toLowerCase() === 'localhost'
            && Number(url.port) === puertoEsperado
            && url.origin === origen;
    } catch (error) {
        return false;
    }
}

module.exports = {
    normalizarPuerto,
    esperarPuertoLigado,
    escucharConFallback,
    origenLocalPermitido
};
