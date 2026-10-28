'use strict';

function registrarLimpiezaAntesDeSalir(app, limpiar, alFallar = console.error) {
    let estado = 'pendiente';

    app.on('before-quit', (event) => {
        if (estado === 'completa') return;

        event.preventDefault();
        if (estado === 'ejecutando') return;

        estado = 'ejecutando';
        Promise.resolve()
            .then(limpiar)
            .catch((error) => {
                try { alFallar(error); } catch (e) { /* el cierre no debe quedar bloqueado */ }
            })
            .finally(() => {
                estado = 'completa';
                app.quit();
            });
    });
}

module.exports = { registrarLimpiezaAntesDeSalir };
