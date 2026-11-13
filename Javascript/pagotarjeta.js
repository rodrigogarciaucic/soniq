/* ============================================================
   SONIQ - Pago con tarjeta (simulado)
   ------------------------------------------------------------
   1) Lee el carrito de localStorage (clave "carrito", el mismo
      formato que usan sheets-productos.js y carrito.js).
   2) Calcula el resumen de compra con LA MISMA fórmula que
      carrito.js, para que los totales coincidan.
   3) Da formato a los campos de la tarjeta y los valida.
   4) Simula el pago: NO se guarda ni se envía ningún dato de la
      tarjeta (ni a localStorage ni a Google Sheets).

   AL APROBARSE EL PAGO:
     - El mensaje "Pago aprobado" se queda fijo en pantalla.
     - Se guarda una marca en sessionStorage ("pagoAprobado") con
       los totales de la compra. Así, si la persona recarga la
       página, el pago sigue viéndose aprobado.
     - Se vacía el carrito.
     - "Datos de envío" ya funciona y lleva a datosenvio.html.
     - "Seguir comprando" queda bloqueado.

   ANTES DE PAGAR:
     - "Datos de envío" NO funciona (avisa que falta pagar).
     - "Seguir comprando" funciona normal.

   Si el carrito está vacío y NO hay pago aprobado:
     muestra el aviso y redirige a bocinas.html tras 1 segundo.

   PARA TU PÁGINA datosenvio.html (recomendado):
     al cargar, revisa sessionStorage.getItem('pagoAprobado').
     Si es null, redirige a pagotarjeta.html.
   ============================================================ */

(() => {
  // ---------- Configuración ----------
  const CLAVE_CARRITO = 'carrito';          // misma clave que carrito.js
  const CLAVE_PAGO = 'pagoAprobado';        // marca de pago aprobado (sessionStorage)
  const PAGINA_BOCINAS = 'bocinas.html';    // catálogo
  const PAGINA_ENVIO = 'datosenvio.html';   // destino de "Datos de envío"
  const ESPERA_REDIRECCION_MS = 1000;       // solo para carrito vacío
  const MENSAJE_VACIO = 'CARRITO VACIO AGREGA PRODUCTO';
  const MENSAJE_PAGO_OK = 'Pago simulado aprobado. ¡Gracias por tu compra! Continúa con tus datos de envío.';
  const MENSAJE_FALTA_PAGO = 'Primero completa el pago para continuar con los datos de envío.';

  // ---------- Utilidades (copiadas de carrito.js) ----------
  const formatoMoneda = (valor) =>
    valor.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  // Precio final de una unidad aplicando el descuento
  const precioFinal = (p) => +(p.precio * (1 - p.descuento / 100)).toFixed(2);

  // Lee el carrito de forma segura y descarta productos inválidos
  function leerCarrito() {
    try {
      const crudo = localStorage.getItem(CLAVE_CARRITO);
      if (!crudo) return [];
      const datos = JSON.parse(crudo);
      if (!Array.isArray(datos)) return [];

      return datos
        .map((p) => ({
          id: p.id ?? '',
          nombre: String(p.nombre ?? '').trim(),
          precio: parseFloat(p.precio) || 0,
          descuento: parseFloat(p.descuento) || 0,
          cantidad: Math.max(1, parseInt(p.cantidad, 10) || 1),
        }))
        .filter((p) => p.nombre !== '');
    } catch (err) {
      console.error('SONIQ: no se pudo leer el carrito', err);
      return [];
    }
  }

  // ---------- Marca de pago aprobado (sessionStorage) ----------
  // Devuelve los totales guardados al aprobar el pago, o null si no hay pago
  function leerPago() {
    try {
      const crudo = sessionStorage.getItem(CLAVE_PAGO);
      return crudo ? JSON.parse(crudo) : null;
    } catch (err) {
      return null;
    }
  }

  function guardarPago(resumen) {
    try {
      sessionStorage.setItem(CLAVE_PAGO, JSON.stringify({
        ...resumen,
        fecha: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('SONIQ: no se pudo guardar el pago', err);
    }
  }

  function borrarPago() {
    try {
      sessionStorage.removeItem(CLAVE_PAGO);
    } catch (err) { /* sin acción */ }
  }

  // ---------- Resumen de compra ----------
  function calcularTotales(carrito) {
    let subtotal = 0;     // suma de precios originales
    let totalFinal = 0;   // suma con descuento aplicado

    carrito.forEach((p) => {
      subtotal += p.precio * p.cantidad;
      totalFinal += precioFinal(p) * p.cantidad;
    });
    return { subtotal, descuentoTotal: subtotal - totalFinal, totalFinal };
  }

  function pintarResumen({ subtotal, descuentoTotal, totalFinal }) {
    document.getElementById('resumen-subtotal').textContent = formatoMoneda(subtotal);
    document.getElementById('resumen-descuento').textContent =
      descuentoTotal > 0 ? `-${formatoMoneda(descuentoTotal)}` : formatoMoneda(0);
    document.getElementById('resumen-total').textContent = formatoMoneda(totalFinal);
  }

  // ---------- Carrito vacío: mensaje + redirección ----------
  function mostrarVacio() {
    const main = document.querySelector('.checkout');
    main.innerHTML = '';

    const msg = document.createElement('p');
    msg.className = 'checkout-empty';
    msg.textContent = MENSAJE_VACIO;
    main.appendChild(msg);

    setTimeout(() => {
      window.location.href = PAGINA_BOCINAS;
    }, ESPERA_REDIRECCION_MS);
  }

  // ---------- Formato de campos (solo apariencia) ----------
  function activarFormato() {
    const numero = document.getElementById('numero');
    const expiracion = document.getElementById('expiracion');
    const cvv = document.getElementById('cvv');

    // Número: solo dígitos, agrupados de 4 en 4
    numero.addEventListener('input', () => {
      const digitos = numero.value.replace(/\D/g, '').slice(0, 16);
      numero.value = digitos.replace(/(.{4})/g, '$1 ').trim();
    });

    // Fecha: formato MM/AA
    expiracion.addEventListener('input', () => {
      const digitos = expiracion.value.replace(/\D/g, '').slice(0, 4);
      expiracion.value = digitos.length > 2
        ? digitos.slice(0, 2) + '/' + digitos.slice(2)
        : digitos;
    });

    // CVV: solo dígitos
    cvv.addEventListener('input', () => {
      cvv.value = cvv.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  // ---------- Validación ----------
  // Devuelve { campo, mensaje } con el primer error, o null si todo está bien
  function validar(form) {
    const titular = form.titular.value.trim();
    const numero = form.numero.value.replace(/\s/g, '');
    const [mm, aa] = form.expiracion.value.split('/');
    const cvv = form.cvv.value;

    if (titular.length < 3) {
      return { campo: form.titular, mensaje: 'Escribe el nombre del titular tal como aparece en la tarjeta.' };
    }
    if (!/^\d{16}$/.test(numero)) {
      return { campo: form.numero, mensaje: 'El número de tarjeta debe tener 16 dígitos.' };
    }

    const mes = parseInt(mm, 10);
    const anio = 2000 + parseInt(aa, 10);
    if (!(mes >= 1 && mes <= 12) || !aa || aa.length !== 2) {
      return { campo: form.expiracion, mensaje: 'La fecha de expiración debe tener el formato MM/AA.' };
    }
    // La tarjeta vence al terminar el mes indicado
    const finDeMes = new Date(anio, mes, 0, 23, 59, 59);
    if (finDeMes < new Date()) {
      return { campo: form.expiracion, mensaje: 'La tarjeta está vencida.' };
    }

    if (!/^\d{3,4}$/.test(cvv)) {
      return { campo: form.cvv, mensaje: 'El código de seguridad debe tener 3 o 4 dígitos.' };
    }
    return null;
  }

  // ---------- Estado "pago aprobado" ----------
  // Deja la pantalla fija: mensaje visible, formulario bloqueado
  // y "Seguir comprando" desactivado.
  function aplicarEstadoPagado() {
    const form = document.getElementById('card-form');
    const msgError = document.getElementById('form-error');
    const msgOk = document.getElementById('form-ok');
    const seguir = document.getElementById('btn-seguir');

    // Bloquea todos los campos y el botón de pagar (evita pagar dos veces)
    form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });

    msgError.hidden = true;
    msgOk.textContent = MENSAJE_PAGO_OK;
    msgOk.hidden = false;

    // "Seguir comprando" se ve atenuado y deja de funcionar
    seguir.classList.add('is-disabled');
    seguir.setAttribute('aria-disabled', 'true');
  }

  // ---------- Botones del resumen ----------
  function activarNavegacion() {
    const envio = document.getElementById('btn-envio');
    const seguir = document.getElementById('btn-seguir');
    const msgError = document.getElementById('form-error');

    // "Datos de envío": solo avanza si el pago está aprobado
    envio.addEventListener('click', (e) => {
      if (!leerPago()) {
        e.preventDefault(); // cancela la navegación
        msgError.textContent = MENSAJE_FALTA_PAGO;
        msgError.hidden = false;
      }
      // Si hay pago aprobado, el enlace funciona normal (href="datosenvio.html")
    });

    // "Seguir comprando": normal antes de pagar, bloqueado después
    seguir.addEventListener('click', (e) => {
      if (leerPago()) e.preventDefault();
    });
  }

  // ---------- Envío del formulario (pago simulado) ----------
  function activarPago() {
    const form = document.getElementById('card-form');
    const msgError = document.getElementById('form-error');

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      // Limpia errores anteriores
      msgError.hidden = true;
      form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));

      // Revisa de nuevo el carrito por si cambió en otra pestaña
      const carrito = leerCarrito();
      if (carrito.length === 0) {
        mostrarVacio();
        return;
      }

      const error = validar(form);
      if (error) {
        error.campo.setAttribute('aria-invalid', 'true');
        msgError.textContent = error.mensaje;
        msgError.hidden = false;
        error.campo.focus();
        return;
      }

      // ---- Pago simulado aprobado ----
      guardarPago(calcularTotales(carrito)); // marca el pago como aprobado


      form.reset(); // borra los datos de la tarjeta de la pantalla
      aplicarEstadoPagado();
      // El mensaje se queda fijo: no hay redirección automática
    });
  }

  // ---------- Inicio ----------
  document.addEventListener('DOMContentLoaded', () => {
    const carrito = leerCarrito();
    const pago = leerPago();

    if (carrito.length > 0) {
      // Hay productos en el carrito = compra nueva.
      // Si quedaba una marca de un pago anterior, se descarta.
      borrarPago();
      pintarResumen(calcularTotales(carrito));
      activarFormato();
      activarPago();
      activarNavegacion();
      return;
    }

    if (pago) {
      // Carrito vacío pero con pago aprobado (ej. la persona recargó la página):
      // se vuelve a mostrar el pago aprobado con los totales guardados.
      pintarResumen(pago);
      activarFormato();
      aplicarEstadoPagado();
      activarNavegacion();
      return;
    }

    // Carrito vacío y sin pago: no hay nada que cobrar
    mostrarVacio();
  });
})();
