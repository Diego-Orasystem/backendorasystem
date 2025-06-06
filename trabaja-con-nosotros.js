document.addEventListener('DOMContentLoaded', function() {
    // Referencia al formulario
    const form = document.getElementById('trabaja-con-nosotros-form');
    
    if (form) {
        // Prevenir el comportamiento por defecto del formulario
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            
            // Validar el formulario antes de enviar
            if (validarFormulario()) {
                enviarFormulario();
            }
        });
    }
    
    // Función para validar el formulario
    function validarFormulario() {
        let esValido = true;
        
        // Validar campos requeridos
        const nombre = document.getElementById('nombre').value.trim();
        const rut = document.getElementById('rut').value.trim();
        const email = document.getElementById('email').value.trim();
        const cargo = document.getElementById('cargo').value;
        const interes = document.getElementById('interes').value.trim();
        const privacidad = document.getElementById('privacidad').checked;
        
        // Validar nombre
        if (!nombre) {
            mostrarError('nombre', 'El nombre es obligatorio');
            esValido = false;
        } else {
            limpiarError('nombre');
        }
        
        // Validar RUT
        if (!rut) {
            mostrarError('rut', 'El RUT es obligatorio');
            esValido = false;
        } else if (!validarRut(rut)) {
            mostrarError('rut', 'El formato del RUT no es válido');
            esValido = false;
        } else {
            limpiarError('rut');
        }
        
        // Validar email
        if (!email) {
            mostrarError('email', 'El correo electrónico es obligatorio');
            esValido = false;
        } else if (!validarEmail(email)) {
            mostrarError('email', 'El formato del correo electrónico no es válido');
            esValido = false;
        } else {
            limpiarError('email');
        }
        
        // Validar cargo
        if (!cargo) {
            mostrarError('cargo', 'Debe seleccionar un cargo');
            esValido = false;
        } else {
            limpiarError('cargo');
        }
        
        // Validar interés
        if (!interes) {
            mostrarError('interes', 'Debe indicar su interés en trabajar con nosotros');
            esValido = false;
        } else {
            limpiarError('interes');
        }
        
        // Validar política de privacidad
        if (!privacidad) {
            mostrarError('privacidad', 'Debe aceptar la política de privacidad');
            esValido = false;
        } else {
            limpiarError('privacidad');
        }
        
        // Validar archivo CV (opcional pero con restricciones si se proporciona)
        const cvInput = document.getElementById('cv');
        if (cvInput.files.length > 0) {
            const archivo = cvInput.files[0];
            
            // Validar tipo de archivo (solo PDF)
            if (archivo.type !== 'application/pdf') {
                mostrarError('cv', 'El CV debe ser un archivo PDF');
                esValido = false;
            } 
            // Validar tamaño del archivo (máximo 5MB)
            else if (archivo.size > 5 * 1024 * 1024) {
                mostrarError('cv', 'El tamaño del CV no debe exceder los 5MB');
                esValido = false;
            } else {
                limpiarError('cv');
            }
        }
        
        return esValido;
    }
    
    // Función para mostrar mensajes de error
    function mostrarError(idCampo, mensaje) {
        const campo = document.getElementById(idCampo);
        const contenedorError = document.createElement('div');
        
        // Eliminar mensajes de error previos
        limpiarError(idCampo);
        
        contenedorError.className = 'error-mensaje';
        contenedorError.style.color = '#d32f2f';
        contenedorError.style.fontSize = '0.85rem';
        contenedorError.style.marginTop = '4px';
        contenedorError.textContent = mensaje;
        
        // Insertar el mensaje después del campo
        campo.parentNode.insertBefore(contenedorError, campo.nextSibling);
        
        // Destacar visualmente el campo con error
        campo.style.borderColor = '#d32f2f';
    }
    
    // Función para limpiar mensajes de error
    function limpiarError(idCampo) {
        const campo = document.getElementById(idCampo);
        const contenedorPadre = campo.parentNode;
        
        // Buscar y eliminar mensajes de error previos
        const erroresPrevios = contenedorPadre.querySelectorAll('.error-mensaje');
        erroresPrevios.forEach(error => error.remove());
        
        // Restaurar estilo del campo
        campo.style.borderColor = '#e0e0e0';
    }
    
    // Función para validar formato de email
    function validarEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }
    
    // Función para validar formato de RUT chileno
    function validarRut(rut) {
        // Eliminar puntos y guiones
        rut = rut.replace(/\./g, '').replace('-', '');
        
        // Validar longitud mínima
        if (rut.length < 7) return false;
        
        // Separar cuerpo y dígito verificador
        const cuerpo = rut.slice(0, -1);
        const dv = rut.slice(-1).toUpperCase();
        
        // Calcular dígito verificador
        let suma = 0;
        let multiplicador = 2;
        
        for (let i = cuerpo.length - 1; i >= 0; i--) {
            suma += parseInt(cuerpo.charAt(i)) * multiplicador;
            multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
        }
        
        const dvEsperado = 11 - (suma % 11);
        const dvCalculado = dvEsperado === 11 ? '0' : dvEsperado === 10 ? 'K' : dvEsperado.toString();
        
        // Comparar dígito verificador
        return dv === dvCalculado;
    }
    
    // Función para enviar el formulario
    function enviarFormulario() {
        // Mostrar indicador de carga
        mostrarCargando(true);
        
        // Crear objeto FormData para enviar datos incluyendo archivos
        const formData = new FormData(form);
        const messageDiv = document.getElementById('form-message');
        
        if (!messageDiv) {
            console.error('Elemento form-message no encontrado');
        }
        
        const submitButton = form.querySelector('button[type="submit"]');
        
        // Cambiar estado del botón
        submitButton.disabled = true;
        submitButton.innerText = 'ENVIANDO...';
        submitButton.style.backgroundColor = '#999';
        
        // Ocultar mensajes previos
        if (messageDiv) {
            messageDiv.style.display = 'none';
        }
        
        // Manejar el archivo CV correctamente
        const cvFile = document.getElementById('cv').files[0];
        if (cvFile) {
            formData.set('cv', cvFile);
        }
        
        // Convertir checkbox a booleano
        formData.set('privacidad', document.getElementById('privacidad').checked);
        
        // Enviar datos al servidor
        fetch('https://backend-orasystem-cyo2.vercel.app/api/postulacion', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            mostrarCargando(false);
            
            if (data.success) {
                // Mostrar mensaje de éxito
                if (messageDiv) {
                    messageDiv.style.backgroundColor = '#e8f5e9';
                    messageDiv.style.color = '#2e7d32';
                    messageDiv.innerHTML = '¡Postulación enviada correctamente! Gracias por tu interés.';
                    messageDiv.style.display = 'block';
                } else {
                    mostrarMensajeExito();
                }
                // Limpiar formulario
                form.reset();
            } else {
                // Mostrar mensaje de error
                if (messageDiv) {
                    messageDiv.style.backgroundColor = '#ffebee';
                    messageDiv.style.color = '#c62828';
                    messageDiv.innerHTML = 'Error: ' + (data.message || 'No se pudo procesar tu solicitud');
                    messageDiv.style.display = 'block';
                } else {
                    mostrarMensajeError(data.message || 'Error al procesar la solicitud');
                }
            }
        })
        .catch(error => {
            mostrarCargando(false);
            if (messageDiv) {
                messageDiv.style.backgroundColor = '#ffebee';
                messageDiv.style.color = '#c62828';
                messageDiv.innerHTML = 'Error de conexión. Por favor, intenta nuevamente.';
                messageDiv.style.display = 'block';
            } else {
                mostrarMensajeError('Error de conexión. Por favor, inténtelo de nuevo más tarde.');
            }
            console.error('Error:', error);
        })
        .finally(() => {
            // Restaurar estado del botón
            submitButton.disabled = false;
            submitButton.innerText = 'ENVIAR';
            submitButton.style.backgroundColor = '#d32f2f';
        });
    }
    
    // Función para mostrar/ocultar indicador de carga
    function mostrarCargando(mostrar) {
        // Buscar o crear el elemento de carga
        let cargando = document.getElementById('cargando-postulacion');
        
        if (!cargando && mostrar) {
            cargando = document.createElement('div');
            cargando.id = 'cargando-postulacion';
            cargando.style.position = 'fixed';
            cargando.style.top = '0';
            cargando.style.left = '0';
            cargando.style.width = '100%';
            cargando.style.height = '100%';
            cargando.style.backgroundColor = 'rgba(255,255,255,0.8)';
            cargando.style.display = 'flex';
            cargando.style.justifyContent = 'center';
            cargando.style.alignItems = 'center';
            cargando.style.zIndex = '10000';
            
            const spinner = document.createElement('div');
            spinner.style.border = '5px solid #f3f3f3';
            spinner.style.borderTop = '5px solid #d32f2f';
            spinner.style.borderRadius = '50%';
            spinner.style.width = '50px';
            spinner.style.height = '50px';
            spinner.style.animation = 'spin 1s linear infinite';
            
            const keyframes = document.createElement('style');
            keyframes.innerHTML = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            
            document.head.appendChild(keyframes);
            cargando.appendChild(spinner);
            document.body.appendChild(cargando);
        } else if (cargando && !mostrar) {
            cargando.remove();
        }
    }
    
    // Función para mostrar mensaje de éxito
    function mostrarMensajeExito() {
        const modal = document.getElementById('modal-trabaja-nosotros');
        
        // Crear contenedor de mensaje
        const mensajeExito = document.createElement('div');
        mensajeExito.style.textAlign = 'center';
        mensajeExito.style.padding = '30px 20px';
        
        // Icono de éxito
        const icono = document.createElement('div');
        icono.innerHTML = '✓';
        icono.style.fontSize = '3rem';
        icono.style.color = '#4CAF50';
        icono.style.marginBottom = '15px';
        
        // Título del mensaje
        const titulo = document.createElement('h3');
        titulo.textContent = '¡Postulación Enviada!';
        titulo.style.color = '#333';
        titulo.style.marginBottom = '15px';
        
        // Texto del mensaje
        const texto = document.createElement('p');
        texto.textContent = 'Gracias por tu interés en formar parte de nuestro equipo. Hemos recibido tu postulación y la revisaremos a la brevedad.';
        texto.style.marginBottom = '20px';
        
        // Botón para cerrar
        const boton = document.createElement('button');
        boton.textContent = 'Cerrar';
        boton.style.background = '#d32f2f';
        boton.style.color = '#fff';
        boton.style.padding = '10px 20px';
        boton.style.border = 'none';
        boton.style.borderRadius = '4px';
        boton.style.cursor = 'pointer';
        boton.style.fontSize = '1rem';
        
        boton.onclick = function() {
            // Restaurar el contenido original del modal
            modal.style.display = 'none';
            modal.querySelector('.modal-content').innerHTML = contenidoOriginal;
        };
        
        // Guardar el contenido original del modal
        const contenidoOriginal = modal.querySelector('.modal-content').innerHTML;
        
        // Limpiar y añadir nuevo contenido
        const contenido = modal.querySelector('.modal-content');
        contenido.innerHTML = '';
        mensajeExito.appendChild(icono);
        mensajeExito.appendChild(titulo);
        mensajeExito.appendChild(texto);
        mensajeExito.appendChild(boton);
        contenido.appendChild(mensajeExito);
    }
    
    // Función para mostrar mensaje de error
    function mostrarMensajeError(mensaje) {
        // Crear elemento para el mensaje
        const mensajeError = document.createElement('div');
        mensajeError.style.backgroundColor = '#ffebee';
        mensajeError.style.color = '#d32f2f';
        mensajeError.style.padding = '10px 15px';
        mensajeError.style.borderRadius = '4px';
        mensajeError.style.marginBottom = '15px';
        mensajeError.style.fontSize = '0.9rem';
        mensajeError.textContent = mensaje;
        
        // Insertar al principio del formulario
        form.insertBefore(mensajeError, form.firstChild);
        
        // Eliminar después de 5 segundos
        setTimeout(() => {
            mensajeError.remove();
        }, 5000);
    }
    
    // Formatear RUT mientras se escribe
    const inputRut = document.getElementById('rut');
    if (inputRut) {
        inputRut.addEventListener('input', function() {
            let valor = this.value.replace(/\./g, '').replace('-', '');
            
            // Eliminar caracteres no numéricos ni K
            valor = valor.replace(/[^0-9kK]/g, '');
            
            // Formatear con puntos y guión
            if (valor.length > 1) {
                const dv = valor.slice(-1);
                let cuerpo = valor.slice(0, -1);
                
                // Agregar puntos
                if (cuerpo.length > 3) {
                    cuerpo = cuerpo.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
                }
                
                this.value = cuerpo + '-' + dv;
            } else {
                this.value = valor;
            }
        });
    }
}); 