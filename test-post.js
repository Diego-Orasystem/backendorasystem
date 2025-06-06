const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testPostulacion() {
  try {
    console.log('Iniciando prueba de POST a la API de postulación...');
    
    // Crear un FormData para simular el envío del formulario
    const form = new FormData();
    
    // Añadir los datos del formulario
    form.append('nombre', 'Usuario de Prueba');
    form.append('rut', '12.345.678-5');
    form.append('email', 'prueba@example.com');
    form.append('telefono', '912345678');
    form.append('cargo', 'Desarrollador Full Stack');
    form.append('interes', 'Este es un mensaje de prueba para verificar el funcionamiento de la API.');
    form.append('mensaje', 'Mensaje adicional de prueba.');
    form.append('privacidad', 'true');
    
    // Opcional: Añadir un archivo CV de prueba si existe
    const testCVPath = path.join(__dirname, 'test-cv.pdf');
    let fileAttached = false;
    
    try {
      if (fs.existsSync(testCVPath)) {
        const fileStats = fs.statSync(testCVPath);
        const fileSizeMB = fileStats.size / (1024 * 1024);
        
        // Verificar tamaño del archivo
        if (fileSizeMB > 5) {
          console.log(`⚠️ El archivo CV es demasiado grande (${fileSizeMB.toFixed(2)} MB). Debe ser menor a 5 MB.`);
        } else {
          console.log(`📎 Adjuntando archivo CV: ${testCVPath} (${fileSizeMB.toFixed(2)} MB)`);
          const fileStream = fs.createReadStream(testCVPath);
          form.append('cv', fileStream, { filename: 'test-cv.pdf', contentType: 'application/pdf' });
          fileAttached = true;
        }
      } else {
        console.log('ℹ️ No se encontró archivo CV para adjuntar (test-cv.pdf)');
      }
    } catch (fileError) {
      console.error('❌ Error al procesar el archivo CV:');
      console.error(fileError.message);
    }
    
    // Mostrar los límites de los chunks de datos para debugging
    form.getLength((err, length) => {
      if (err) {
        console.error('Error al obtener el tamaño del form data:', err);
      } else {
        console.log(`Tamaño total de los datos a enviar: ${(length / (1024 * 1024)).toFixed(2)} MB`);
      }
    });
    
    // Realizar la solicitud POST con timeout ampliado
    console.log('Enviando solicitud...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos de timeout
    
    try {
      const response = await fetch('https://backend-orasystem-cyo2.vercel.app/api/postulacion', {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId); // Limpiar el timeout si la respuesta llega a tiempo
      
      // Mostrar el código de estado
      console.log(`Estado de la respuesta: ${response.status} ${response.statusText}`);
      
      // Obtener y mostrar el cuerpo de la respuesta
      const data = await response.json();
      console.log('Respuesta del servidor:');
      console.log(JSON.stringify(data, null, 2));
      
      // Verificar si la solicitud fue exitosa
      if (data.success) {
        console.log('✅ La prueba fue exitosa!');
        if (fileAttached) {
          console.log('✅ El archivo se envió correctamente');
        }
      } else {
        console.log('❌ La prueba falló. Revisa los detalles de la respuesta.');
      }
    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        console.error('❌ La solicitud fue abortada por timeout (30 segundos).');
      } else {
        console.error('❌ Error al realizar la solicitud:');
        console.error(fetchError.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error general en la prueba:');
    console.error(error);
  }
}

// Ejecutar la función de prueba
testPostulacion(); 