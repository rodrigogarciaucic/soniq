/* ============================================================
   SONIQ - Datos de envío (simulado y conectado a Sheets)
   ============================================================ */

(() => {
  const CLAVE_PAGO = 'pagoAprobado';
  const CLAVE_ENVIO = 'datosEnvio';
  const CLAVE_FINAL = 'compraFinalizada';
  const PAGINA_PAGO = 'pagotarjeta.html';

  const CAMPOS = [
    { id: 'nombre',   etiqueta: 'Nombre completo',    ayuda: 'mínimo 3 letras',        valido: (v) => v.length >= 3 },
    { id: 'telefono', etiqueta: 'Teléfono',           ayuda: 'debe tener 10 dígitos',  valido: (v) => /^\d{10}$/.test(v) },
    { id: 'correo',   etiqueta: 'Correo electrónico', ayuda: 'ej. nombre@correo.com',  valido: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) },
    { id: 'calle',    etiqueta: 'Calle y número',     ayuda: 'escribe calle y número', valido: (v) => v.length >= 3 },
    { id: 'colonia',  etiqueta: 'Colonia',            ayuda: 'mínimo 2 letras',        valido: (v) => v.length >= 2 },
    { id: 'cp',       etiqueta: 'Código postal',      ayuda: 'debe tener 5 dígitos',   valido: (v) => /^\d{5}$/.test(v) },
    { id: 'ciudad',   etiqueta: 'Ciudad o municipio', ayuda: 'mínimo 2 letras',        valido: (v) => v.length >= 2 },
    { id: 'estado',   etiqueta: 'Estado',             ayuda: 'selecciona un estado',   valido: (v) => v !== '' },
  ];
  const TODOS_LOS_IDS = [...CAMPOS.map((c) => c.id), 'referencias'];

  const formatoMoneda = (valor) => Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  const porId = (id) => document.getElementById(id);

  function leer(clave) {
    try { const crudo = sessionStorage.getItem(clave); return crudo ? JSON.parse(crudo) : null; } catch (err) { return null; }
  }

  function guardar(clave, valor) {
    try { sessionStorage.setItem(clave, JSON.stringify(valor)); } catch (err) { console.error('Error', err); }
  }

  function borrar(clave) {
    try { sessionStorage.removeItem(clave); } catch (err) { }
  }

  let datosValidados = false;
  let compraFinalizada = false;
  let pagoActual = null;

  function pintarResumen({ subtotal, descuentoTotal, totalFinal }) {
    porId('resumen-subtotal').textContent = formatoMoneda(subtotal);
    porId('resumen-descuento').textContent = descuentoTotal > 0 ? `-${formatoMoneda(descuentoTotal)}` : formatoMoneda(0);
    porId('resumen-total').textContent = formatoMoneda(totalFinal);
  }

  function leerDatos() {
    const datos = {};
    TODOS_LOS_IDS.forEach((id) => { datos[id] = porId(id).value.trim(); });
    return datos;
  }

  function validar(datos) {
    return CAMPOS.filter((c) => !c.valido(datos[c.id])).map((c) => ({
      campo: porId(c.id),
      texto: datos[c.id] === '' ? c.etiqueta : `${c.etiqueta} (${c.ayuda})`,
    }));
  }

  function limpiarMarcasDeError() {
    porId('envio-form').querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  function mostrarProblemas(problemas) {
    const msgError = porId('form-error');
    problemas.forEach((p) => p.campo.setAttribute('aria-invalid', 'true'));
    msgError.textContent = `Faltan datos por completar o corregir: ${problemas.map((p) => p.texto).join(', ')}.`;
    msgError.hidden = false;
    problemas[0].campo.focus();
  }

  function actualizarFinalizar() {
    porId('btn-finalizar').disabled = !datosValidados || compraFinalizada;
    porId('hint-finalizar').hidden = datosValidados || compraFinalizada;
  }

  function aplicarEstadoFinal() {
    compraFinalizada = true;
    porId('envio-form').querySelectorAll('input, select, textarea, button').forEach((el) => { el.disabled = true; });
    porId('form-error').hidden = true;
    porId('form-ok').hidden = true;
    porId('final-ok').hidden = false;
    actualizarFinalizar();
  }

  function activarFormato() {
    ['telefono', 'cp'].forEach((id) => {
      const el = porId(id);
      el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, ''); });
    });
  }

  function activarEventos() {
    const form = porId('envio-form');

    ['input', 'change'].forEach((evento) => {
      form.addEventListener(evento, (e) => {
        if (compraFinalizada) return;
        e.target.removeAttribute('aria-invalid');
        if (datosValidados) {
          datosValidados = false;
          borrar(CLAVE_ENVIO);
          porId('form-ok').hidden = true;
          actualizarFinalizar();
        }
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (compraFinalizada) return;
      limpiarMarcasDeError();
      porId('form-error').hidden = true;
      const datos = leerDatos();
      const problemas = validar(datos);

      if (problemas.length > 0) {
        datosValidados = false;
        borrar(CLAVE_ENVIO);
        porId('form-ok').hidden = true;
        mostrarProblemas(problemas);
        actualizarFinalizar();
        return;
      }
      datosValidados = true;
      guardar(CLAVE_ENVIO, { datos, fechaPago: pagoActual.fecha });
      porId('form-ok').hidden = false;
      actualizarFinalizar();
    });

    const btnFinalizar = porId('btn-finalizar');
    btnFinalizar.addEventListener('click', async () => {
      if (!datosValidados || compraFinalizada) return;
      
      const datos = leerDatos();
      const problemas = validar(datos);
      
      if (problemas.length > 0) {
        datosValidados = false;
        porId('form-ok').hidden = true;
        mostrarProblemas(problemas);
        actualizarFinalizar();
        return;
      }

      // === PROCESO GOOGLE SHEETS ===
      const textoOriginal = btnFinalizar.textContent;
      btnFinalizar.textContent = "Procesando pedido...";
      btnFinalizar.disabled = true;

      try {
        // Leer carrito (asumiendo que la clave de tu LocalStorage es 'carrito')
        const carritoLocal = JSON.parse(localStorage.getItem('carrito') || '[]');
        const productosStr = carritoLocal.length > 0 
          ? carritoLocal.map(p => `${p.nombre || p.titulo} (x${p.cantidad || 1})`).join(' | ') 
          : "Sin productos";

        const payload = {
          productos: productosStr,
          pagoTotal: pagoActual.totalFinal || 0,
          nombre: datos.nombre,
          telefono: datos.telefono,
          correo: datos.correo,
          calle: datos.calle,
          colonia: datos.colonia,
          cp: datos.cp,
          ciudad: datos.ciudad,
          estado: datos.estado,
          referencias: datos.referencias || 'N/A'
        };

        // Reemplaza esta línea con el enlace de tu Apps Script
        const URL_SCRIPT = 'https://script.google.com/macros/s/AKfycbxSSYv82nejCiD-jyWiVgY6mBqK2kF6fMUq4Q7x09aRXEP2OiCht7ajEp7PCMim9ciBkQ/exec';

        await fetch(URL_SCRIPT, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });

        // Limpia el carrito al terminar
        localStorage.removeItem('carrito');

        guardar(CLAVE_FINAL, { fechaPago: pagoActual.fecha });
        aplicarEstadoFinal();

      } catch (error) {
        console.error("Error al registrar pedido:", error);
        alert("Ocurrió un problema de conexión al registrar el pedido. Intenta nuevamente.");
        btnFinalizar.textContent = textoOriginal;
        btnFinalizar.disabled = false;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    pagoActual = leer(CLAVE_PAGO);
    if (!pagoActual) {
      window.location.replace(PAGINA_PAGO);
      return;
    }

    let envio = leer(CLAVE_ENVIO);
    if (envio && envio.fechaPago !== pagoActual.fecha) { borrar(CLAVE_ENVIO); envio = null; }
    let final = leer(CLAVE_FINAL);
    if (final && final.fechaPago !== pagoActual.fecha) { borrar(CLAVE_FINAL); final = null; }

    pintarResumen(pagoActual);
    activarFormato();
    activarEventos();

    if (envio && envio.datos) {
      TODOS_LOS_IDS.forEach((id) => { porId(id).value = envio.datos[id] || ''; });
      datosValidados = validar(leerDatos()).length === 0;
      porId('form-ok').hidden = !datosValidados;
    }
    actualizarFinalizar();
    if (final) aplicarEstadoFinal();
  });
})();