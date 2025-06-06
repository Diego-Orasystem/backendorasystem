# API para Formulario de Contacto

Una API sencilla desarrollada con Express.js para procesar formularios de contacto y enviar correos electrónicos.

## Requisitos

- Node.js (v14 o superior)
- Cuenta de Gmail (para enviar correos)

## Instalación

1. Clona este repositorio o descarga los archivos
2. Ejecuta `npm install` para instalar las dependencias
3. Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```
PORT=3000
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=tu_contraseña_de_aplicacion
EMAIL_TO=ivera@orasystem.cl
```

Para usar Gmail, debes generar una "contraseña de aplicación":
1. Activa la verificación en dos pasos en tu cuenta de Google
2. Ve a "Seguridad" > "Contraseñas de aplicaciones"
3. Crea una nueva contraseña para la aplicación

## Uso

1. Inicia el servidor con `npm start` o `npm run dev` (para desarrollo con nodemon)
2. El servidor estará funcionando en `http://localhost:3000`
3. Puedes probar el formulario abriendo el archivo `formulario.html` en tu navegador

## Endpoints

- `GET /`: Página de bienvenida para comprobar que la API está funcionando
- `POST /api/formulario`: Endpoint para recibir datos del formulario
  - Espera un JSON con los campos: `name`, `email` y `message`
  - Responde con un JSON de éxito o error

## Integración con tu formulario existente

Para integrar esta API con tu formulario actual, necesitas:

1. Cambiar la acción del formulario para enviar los datos a tu API en lugar de Formspree:
   ```html
   <form id="contactForm">
     <!-- Mantén los mismos campos con los mismos nombres -->
   </form>
   ```

2. Agregar JavaScript para enviar los datos vía AJAX:
   ```javascript
   document.getElementById('contactForm').addEventListener('submit', async function(event) {
     event.preventDefault();
     
     const formData = {
       name: document.getElementById('name').value,
       email: document.getElementById('email').value,
       message: document.getElementById('message').value
     };
     
     try {
       const response = await fetch('http://tudominio.com/api/formulario', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json'
         },
         body: JSON.stringify(formData)
       });
       
       // Manejar la respuesta
     } catch (error) {
       // Manejar errores
     }
   });
   ```

## Personalización

Puedes personalizar la plantilla HTML del correo electrónico modificando la variable `htmlTemplate` en el archivo `index.js`. 