fetch("header.html")
    .then(respuesta => respuesta.text())
    .then(datos => {
        document.getElementById("header").innerHTML = datos;
        
        // --- INICIO DEL CÓDIGO DEL CONTADOR ---
              function actualizarContadorHeader() {
            const enlaceCarrito = document.querySelector('.header__icons-placeholder a[href*="carrito.html"]');
            if (!enlaceCarrito) return;

            const contenedor = enlaceCarrito.parentElement;
            if (window.getComputedStyle(contenedor).position === 'static') {
                contenedor.style.position = 'relative';
            }

            let contadorEl = document.getElementById('cart-count');
            if (!contadorEl) {
                contadorEl = document.createElement('span');
                contadorEl.id = 'cart-count';
                contadorEl.className = 'cart-counter hidden';
                enlaceCarrito.appendChild(contadorEl);
            }

            try {
                const crudo = localStorage.getItem('carrito');
                if (!crudo) {
                    contadorEl.classList.add('hidden');
                    return;
                }

                const datosStorage = JSON.parse(crudo);
                if (!Array.isArray(datosStorage) || datosStorage.length === 0) {
                    contadorEl.classList.add('hidden');
                    return;
                }

                const totalArticulos = datosStorage.reduce((acc, p) => acc + (parseInt(p.cantidad, 10) || 1), 0);

                if (totalArticulos > 0) {
                    contadorEl.textContent = totalArticulos > 99 ? '99+' : totalArticulos;
                    contadorEl.classList.remove('hidden');
                } else {
                    contadorEl.classList.add('hidden');
                }
            } catch (err) {
                contadorEl.classList.add('hidden');
            }
        }

        actualizarContadorHeader();
        window.addEventListener('storage', actualizarContadorHeader);
        setInterval(actualizarContadorHeader, 300);
        // --- FIN DEL CÓDIGO DEL CONTADOR ---
    });

fetch("footer.html")
    .then(respuesta => respuesta.text())
    .then(datos => {
        document.getElementById("footer").innerHTML = datos;
    });