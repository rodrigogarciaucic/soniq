/* ============================================================
   SONIQ - Importación de productos desde Google Sheets
   ------------------------------------------------------------
   Cada pestaña (hoja) del Google Sheet es una categoría de
   bocinas (Chico, Mediano, Grande). Este script descarga cada
   hoja en formato CSV usando la API pública de Google
   Visualization (gviz) y arma las tarjetas dentro de su
   acordeón correspondiente.

   Columnas esperadas en cada hoja:
   id | Producto | Precio | Descuento | Stock | Imagen

   REQUISITO: el Google Sheet debe compartirse como
   "Cualquier usuario con el enlace - Lector" para que el
   fetch funcione sin iniciar sesión.
   ============================================================ */

(() => {
  const SHEET_ID = '1ansukTKyHMJjGrgs3dhghJtDnqVJaSOogiWPhe_r3F8';
  const REFRESH_MS = 60000; // vuelve a consultar el Sheet cada 60s

  // Clave del carrito en localStorage. DEBE ser la misma que usa carrito.js
  const CLAVE_CARRITO = 'carrito';

  // Catálogo en memoria: guarda los datos de cada producto cargado del Sheet
  // para que el botón "Comprar" sepa qué información enviar al carrito.
  // Llave: "hoja:id"  (ej. "Grande:9")
  const catalogo = new Map();

  // Relación entre cada sección del acordeón y su hoja de cálculo
  const SECCIONES = [
    { grid: 'grid-chico',   hoja: 'Chico' },
    { grid: 'grid-mediano', hoja: 'Mediano' },
    { grid: 'grid-grande',  hoja: 'Grande', tall: true },
  ];

  function urlHoja(nombreHoja) {
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nombreHoja)}`;
  }

  // Parser de CSV que respeta comillas y comas dentro de un mismo campo
  function parseCSV(texto) {
    const filas = [];
    let fila = [];
    let campo = '';
    let dentroComillas = false;

    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      const siguiente = texto[i + 1];

      if (dentroComillas) {
        if (c === '"' && siguiente === '"') { campo += '"'; i++; }
        else if (c === '"') { dentroComillas = false; }
        else { campo += c; }
      } else if (c === '"') {
        dentroComillas = true;
      } else if (c === ',') {
        fila.push(campo); campo = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && siguiente === '\n') i++;
        fila.push(campo); campo = '';
        filas.push(fila); fila = [];
      } else {
        campo += c;
      }
    }
    if (campo.length || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter(f => f.some(v => v.trim() !== ''));
  }

  function filasAProductos(filas) {
    if (!filas.length) return [];
    const encabezados = filas[0].map(h => h.trim().toLowerCase());
    const idx = {
      id: encabezados.indexOf('id'),
      nombre: encabezados.indexOf('producto'),
      precio: encabezados.indexOf('precio'),
      descuento: encabezados.indexOf('descuento'),
      stock: encabezados.indexOf('stock'),
      imagen: encabezados.indexOf('imagen'),
    };

    return filas.slice(1)
      .filter(f => f[idx.nombre] && f[idx.nombre].trim() !== '')
      .map(f => {
        const precio = parseFloat(f[idx.precio]) || 0;
        const descuento = parseFloat(f[idx.descuento]) || 0;
        const stock = idx.stock >= 0 ? (parseInt(f[idx.stock], 10) || 0) : 1;
        return {
          id: f[idx.id] || '',
          nombre: f[idx.nombre] || '',
          precio,
          descuento,
          precioFinal: +(precio * (1 - descuento / 100)).toFixed(2),
          stock,
          imagen: idx.imagen >= 0 ? (f[idx.imagen] || '').trim() : '',
        };
      });
  }

  function formatoMoneda(valor) {
    return valor.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  }

  function tarjetaProducto(producto, claseImagen, hoja) {
    const art = document.createElement('article');
    art.className = 'product-card';
    if (producto.stock <= 0) art.classList.add('product-card--agotado');

    const imgWrap = document.createElement('div');
    imgWrap.className = `product-card__image-placeholder ${claseImagen || ''}`.trim();
    if (producto.imagen) {
      const img = document.createElement('img');
      img.src = producto.imagen;
      img.alt = producto.nombre;
      img.className = 'product-card__img';
      img.loading = 'lazy';
      imgWrap.appendChild(img);
    }
    art.appendChild(imgWrap);

    const h3 = document.createElement('h3');
    h3.className = 'product-card__name';
    h3.textContent = producto.nombre;
    art.appendChild(h3);

    const precioP = document.createElement('p');
    precioP.className = 'product-card__price';
    if (producto.descuento > 0) {
      const spanOld = document.createElement('span');
      spanOld.className = 'product-card__price-old';
      spanOld.textContent = formatoMoneda(producto.precio);

      const spanDesc = document.createElement('span');
      spanDesc.className = 'product-card__discount';
      spanDesc.textContent = `-${producto.descuento}%`;

      const spanNew = document.createElement('span');
      spanNew.className = 'product-card__price-new';
      spanNew.textContent = formatoMoneda(producto.precioFinal);

      precioP.append(spanOld, spanDesc, spanNew);
    } else {
      const spanNew = document.createElement('span');
      spanNew.className = 'product-card__price-new';
      spanNew.textContent = formatoMoneda(producto.precio);
      precioP.append(spanNew);
    }
    art.appendChild(precioP);

    const btn = document.createElement('button');
    btn.className = 'product-card__btn';
    btn.dataset.id = producto.id;
    btn.dataset.hoja = hoja;
    btn.dataset.comprar = ''; // marca el botón para el listener de compra
    if (producto.stock <= 0) {
      btn.textContent = 'Agotado';
      btn.disabled = true;
    } else {
      btn.textContent = 'Comprar';
    }
    art.appendChild(btn);

    return art;
  }

  async function cargarSeccion({ grid, hoja, tall }) {
    const contenedor = document.getElementById(grid);
    if (!contenedor) return;

    try {
      const resp = await fetch(urlHoja(hoja), { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const texto = await resp.text();
      const productos = filasAProductos(parseCSV(texto));

      contenedor.innerHTML = '';
      if (!productos.length) {
        contenedor.innerHTML = '<p class="accordion__empty">No hay productos disponibles en esta categoría.</p>';
        return;
      }
      const claseImagen = tall ? 'product-card__image-placeholder--tall' : '';
      const fragmento = document.createDocumentFragment();
      productos.forEach(p => {
        catalogo.set(`${hoja}:${p.id}`, p); // se guarda para el botón "Comprar"
        fragmento.appendChild(tarjetaProducto(p, claseImagen, hoja));
      });
      contenedor.appendChild(fragmento);
    } catch (err) {
      console.error(`SONIQ: error al cargar la hoja "${hoja}"`, err);
      contenedor.innerHTML = '<p class="accordion__empty">No se pudieron cargar los productos. Verifica que el Google Sheet sea público ("Cualquiera con el enlace - Lector").</p>';
    }
  }

  function cargarTodasLasSecciones() {
    SECCIONES.forEach(cargarSeccion);
  }

  /* ============================================================
     CARRITO: botón "Comprar"
     Guarda el producto en localStorage (clave "carrito") con el
     mismo formato que lee carrito.js:
       { id, nombre, precio, descuento, imagen, cantidad }
     Si el producto ya estaba en el carrito, suma 1 a la cantidad
     (sin pasar del stock disponible).
     ============================================================ */
  function leerCarrito() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE_CARRITO) || '[]');
      return Array.isArray(datos) ? datos : [];
    } catch (err) {
      return []; // JSON dañado -> se empieza un carrito nuevo
    }
  }

  // Devuelve true si se pudo agregar, false si ya no hay más stock
  function agregarAlCarrito(producto) {
    const carrito = leerCarrito();
    const clave = String(producto.id || producto.nombre);
    const existente = carrito.find(p => String(p.id || p.nombre) === clave);
    const enCarrito = existente ? (parseInt(existente.cantidad, 10) || 1) : 0;

    if (enCarrito >= producto.stock) return false; // no exceder el stock

    if (existente) {
      existente.cantidad = enCarrito + 1;
    } else {
      carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,       // precio original, sin descuento
        descuento: producto.descuento, // porcentaje
        imagen: producto.imagen,
        cantidad: 1,
      });
    }

    try {
      localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito));
    } catch (err) {
      console.error('SONIQ: no se pudo guardar el carrito', err);
      return false;
    }
    return true;
  }

  // Mensaje breve en el botón tras hacer clic
  function avisoBoton(btn, texto) {
    const original = btn.dataset.textoOriginal || btn.textContent;
    btn.dataset.textoOriginal = original;
    btn.textContent = texto;
    clearTimeout(btn._aviso);
    btn._aviso = setTimeout(() => { btn.textContent = original; }, 1200);
  }

  // Un solo listener para todos los botones (las tarjetas se regeneran
  // cada 60 s, así que se delega sobre el document)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-comprar]');
    if (!btn || btn.disabled) return;

    const producto = catalogo.get(`${btn.dataset.hoja}:${btn.dataset.id}`);
    if (!producto) return;

    avisoBoton(btn, agregarAlCarrito(producto) ? '¡Agregado!' : 'Sin más stock');
  });

  document.addEventListener('DOMContentLoaded', () => {
    cargarTodasLasSecciones();
    setInterval(cargarTodasLasSecciones, REFRESH_MS);
  });
})();
