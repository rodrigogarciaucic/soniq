/* ============================================================
   SONIQ - Carrito de compras (lectura desde Local Storage)
   ------------------------------------------------------------
   Lee los productos guardados en localStorage, los dibuja en
   carrito.html y calcula el resumen de compra.

   Si el carrito está vacío:
     1) muestra el mensaje "CARRITO VACIO AGREGA PRODUCTO"
     2) después de 1 segundo redirige a bocinas.html

   FORMATO ESPERADO en localStorage (clave "carrito"):
   [
     {
       "id": "9",
       "nombre": "Sony ULT Tower 9",
       "precio": 12699,        // precio original, sin descuento
       "descuento": 20,        // porcentaje (0 si no hay)
       "imagen": "url.png",    // opcional
       "cantidad": 1
     }
   ]
   ============================================================ */

(() => {
  // ---------- Configuración ----------
  const CLAVE_CARRITO = 'carrito';        // clave usada en localStorage
  const PAGINA_BOCINAS = 'bocinas.html';  // destino de la redirección
  const ESPERA_REDIRECCION_MS = 1000;     // 1 segundo
  const MENSAJE_VACIO = 'CARRITO VACIO AGREGA PRODUCTO';

  // ---------- Utilidades ----------
  const formatoMoneda = (valor) =>
    valor.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  // Lee el carrito de localStorage de forma segura.
  // Si no existe, está dañado o el navegador bloquea el storage -> [].
  function leerCarrito() {
    try {
      const crudo = localStorage.getItem(CLAVE_CARRITO);
      if (!crudo) return [];
      const datos = JSON.parse(crudo);
      if (!Array.isArray(datos)) return [];

      // Normaliza cada producto y descarta los inválidos
      return datos
        .map((p) => ({
          id: p.id ?? '',
          nombre: String(p.nombre ?? '').trim(),
          precio: parseFloat(p.precio) || 0,
          descuento: parseFloat(p.descuento) || 0,
          imagen: String(p.imagen ?? '').trim(),
          cantidad: Math.max(1, parseInt(p.cantidad, 10) || 1),
        }))
        .filter((p) => p.nombre !== '');
    } catch (err) {
      console.error('SONIQ: no se pudo leer el carrito', err);
      return [];
    }
  }

  function guardarCarrito(carrito) {
    try {
      localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito));
    } catch (err) {
      console.error('SONIQ: no se pudo guardar el carrito', err);
    }
  }

  // Precio final de una unidad aplicando el descuento
  const precioFinal = (p) => +(p.precio * (1 - p.descuento / 100)).toFixed(2);

  // ---------- Estilos del mensaje de carrito vacío ----------
  // Se inyectan desde JS para no depender de editar carrito.css
  function inyectarEstilos() {
    const style = document.createElement('style');
    style.textContent = `
      .cart-empty {
        padding: 60px 20px;
        text-align: center;
        font-family: 'Anton', Arial, sans-serif;
        font-size: 28px;
        letter-spacing: 1px;
        color: #ff2b2b;
        text-shadow: 0 0 10px #ff3b3b, 0 0 24px #ff0000;
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- Construcción de una fila de producto ----------
  function crearFila(producto, indice) {
    const art = document.createElement('article');
    art.className = 'cart-item';
    art.dataset.cartItem = '';
    art.dataset.index = indice;

    // Imagen
    const imgWrap = document.createElement('div');
    imgWrap.className = 'cart-item__image-placeholder';
    if (producto.imagen) {
      const img = document.createElement('img');
      img.src = producto.imagen;
      img.alt = producto.nombre;
      img.className = 'cart-item__image-img';
      imgWrap.appendChild(img);
    }
    art.appendChild(imgWrap);

    // Nombre y precios
    const info = document.createElement('div');
    info.className = 'cart-item__info';

    const nombre = document.createElement('h3');
    nombre.className = 'cart-item__name';
    nombre.textContent = producto.nombre;
    info.appendChild(nombre);

    const precio = document.createElement('p');
    precio.className = 'cart-item__price';

    if (producto.descuento > 0) {
      const viejo = document.createElement('span');
      viejo.className = 'cart-item__price-old';
      viejo.textContent = formatoMoneda(producto.precio);

      const desc = document.createElement('span');
      desc.className = 'cart-item__discount';
      desc.textContent = `-${producto.descuento}%`;

      const nuevo = document.createElement('span');
      nuevo.className = 'cart-item__price-new';
      nuevo.textContent = formatoMoneda(precioFinal(producto));

      precio.append(viejo, desc, nuevo);
    } else {
      const nuevo = document.createElement('span');
      nuevo.className = 'cart-item__price-new';
      nuevo.textContent = formatoMoneda(producto.precio);
      precio.append(nuevo);
    }
    info.appendChild(precio);
    art.appendChild(info);

    // Control de cantidad  - / valor / +
    const qty = document.createElement('div');
    qty.className = 'cart-item__qty';
    qty.dataset.qty = '';

    const menos = document.createElement('button');
    menos.className = 'cart-item__qty-btn';
    menos.type = 'button';
    menos.dataset.qtyMinus = '';
    menos.setAttribute('aria-label', 'Disminuir cantidad');
    menos.textContent = '−';

    const valor = document.createElement('span');
    valor.className = 'cart-item__qty-value';
    valor.dataset.qtyValue = '';
    valor.textContent = producto.cantidad;

    const mas = document.createElement('button');
    mas.className = 'cart-item__qty-btn';
    mas.type = 'button';
    mas.dataset.qtyPlus = '';
    mas.setAttribute('aria-label', 'Aumentar cantidad');
    mas.textContent = '+';

    qty.append(menos, valor, mas);
    art.appendChild(qty);

    // Botón eliminar (mismo icono SVG del diseño original)
    const quitar = document.createElement('button');
    quitar.className = 'cart-item__remove';
    quitar.type = 'button';
    quitar.dataset.removeItem = '';
    quitar.setAttribute('aria-label', 'Eliminar producto');
    quitar.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-7 0 1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13" ' +
      'stroke="#ff2b2b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    art.appendChild(quitar);

    return art;
  }

  // ---------- Resumen de compra ----------
  function actualizarResumen(carrito) {
    let subtotal = 0;       // suma de precios originales
    let totalFinal = 0;     // suma con descuento aplicado

    carrito.forEach((p) => {
      subtotal += p.precio * p.cantidad;
      totalFinal += precioFinal(p) * p.cantidad;
    });
    const descuentoTotal = subtotal - totalFinal;

    document.getElementById('resumen-subtotal').textContent = formatoMoneda(subtotal);
    document.getElementById('resumen-descuento').textContent =
      descuentoTotal > 0 ? `-${formatoMoneda(descuentoTotal)}` : formatoMoneda(0);
    document.getElementById('resumen-total').textContent = formatoMoneda(totalFinal);
  }

  // ---------- Carrito vacío: mensaje + redirección ----------
  let redireccionProgramada = false;

  function mostrarVacio() {
    const lista = document.getElementById('cart-items');
    lista.innerHTML = '';

    const msg = document.createElement('p');
    msg.className = 'cart-empty';
    msg.textContent = MENSAJE_VACIO;
    lista.appendChild(msg);

    // Oculta el resumen: no tiene sentido sin productos
    const resumen = document.querySelector('.cart-summary');
    if (resumen) resumen.style.display = 'none';

    // Redirige a bocinas.html después de 1 segundo (una sola vez)
    if (!redireccionProgramada) {
      redireccionProgramada = true;
      setTimeout(() => {
        window.location.href = PAGINA_BOCINAS;
      }, ESPERA_REDIRECCION_MS);
    }
  }

  // ---------- Render principal ----------
  function render() {
    const carrito = leerCarrito();

    if (carrito.length === 0) {
      mostrarVacio();
      return;
    }

    const lista = document.getElementById('cart-items');
    lista.innerHTML = '';
    const fragmento = document.createDocumentFragment();
    carrito.forEach((p, i) => fragmento.appendChild(crearFila(p, i)));
    lista.appendChild(fragmento);

    actualizarResumen(carrito);
  }

  // ---------- Eventos (delegación sobre la lista) ----------
  function activarEventos() {
    const lista = document.getElementById('cart-items');

    lista.addEventListener('click', (e) => {
      const fila = e.target.closest('[data-cart-item]');
      if (!fila) return;

      const indice = parseInt(fila.dataset.index, 10);
      const carrito = leerCarrito();
      if (!carrito[indice]) return;

      if (e.target.closest('[data-qty-plus]')) {
        carrito[indice].cantidad += 1;
      } else if (e.target.closest('[data-qty-minus]')) {
        if (carrito[indice].cantidad > 1) {
          carrito[indice].cantidad -= 1;
        } else {
          carrito.splice(indice, 1); // Elimina el producto si la cantidad es 1 y se presiona menos
        }
      } else if (e.target.closest('[data-remove-item]')) {
        carrito.splice(indice, 1);
      }

      guardarCarrito(carrito);
      render(); // si se quitó el último producto, mostrará el mensaje y redirigirá
    });

    // Botón "Seguir comprando" -> vuelve al catálogo
    const seguir = document.querySelector('.cart-summary__btn--secondary');
    if (seguir) {
      seguir.addEventListener('click', () => {
        window.location.href = PAGINA_BOCINAS;
        
      });
    }
    // Botón "Proceder al pago" -> va a la página de pago con tarjeta
    const pagar = document.querySelector('.cart-summary__btn--primary');
    if (pagar) {
      pagar.addEventListener('click', () => {
        window.location.href = 'pagotarjeta.html';
      });
    }

    // Si el carrito cambia en otra pestaña, se actualiza esta vista
    window.addEventListener('storage', (e) => {
      if (e.key === CLAVE_CARRITO) render();
      
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    inyectarEstilos();
    activarEventos();
    render();
  });
})();
