const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Debug de variables de entorno (sin mostrar la contraseña completa)
console.log('=== CONFIGURACIÓN DE ENTORNO ===');
console.log(`Puerto: ${PORT}`);
console.log(`EMAIL_USER: ${process.env.EMAIL_USER || 'No configurado'}`);
console.log(`EMAIL_PASS configurado: ${process.env.EMAIL_PASS ? 'Sí (valor oculto)' : 'No'}`);
console.log(`EMAIL_TO: ${process.env.EMAIL_TO || 'No configurado'}`);
console.log('===============================');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración del transporte de correo - VERSIÓN ALTERNATIVA
// Esta versión usa servidor SMTP genérico en lugar del servicio Gmail
console.log('Configurando transporte de correo (modo alternativo)...');

// Opción 1: Usando un servicio SMTP externo como Outlook
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-mail.outlook.com', // Por defecto usamos Outlook
  port: process.env.SMTP_PORT || 587,
  secure: false, // true para 465, false para otros puertos
  auth: {
    user: process.env.EMAIL_USER || 'tu_correo@outlook.com',
    pass: process.env.EMAIL_PASS || 'tu_contraseña'
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false // Solo para pruebas, no recomendado en producción
  },
  debug: true
});

// Verificar conexión al servidor de correo
transporter.verify()
  .then(() => {
    console.log('✅ Conexión al servidor de correo verificada correctamente');
  })
  .catch((error) => {
    console.error('❌ Error al verificar la conexión al servidor de correo:');
    console.error(`Código: ${error.code}`);
    console.error(`Mensaje: ${error.message}`);
    if (error.response) {
      console.error(`Respuesta del servidor: ${error.response}`);
    }
    
    // Ejemplo de configuración alternativa con otro servicio 
    console.log('\n⚠️ Si tienes problemas, puedes modificar .env para usar otro servicio SMTP:');
    console.log('SMTP_HOST=smtp.office365.com  # Para Outlook/Office365');
    console.log('SMTP_PORT=587');
    console.log('EMAIL_USER=tu_correo@outlook.com');
    console.log('EMAIL_PASS=tu_contraseña_normal'); 
    console.log('EMAIL_TO=ivera@orasystem.cl');
  });

// Ruta para el formulario
app.post('/api/formulario', async (req, res) => {
  console.log('📨 Recibida petición POST a /api/formulario');
  console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
  
  try {
    const { name, email, message } = req.body;
    
    // Validación básica
    if (!name || !email || !message) {
      console.log('❌ Validación fallida: Datos incompletos');
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos son obligatorios' 
      });
    }

    console.log('✅ Validación de datos correcta');
    
    // Plantilla HTML para el correo
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
          h1 { color: #333; }
          .field { margin-bottom: 15px; }
          .label { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Nuevo mensaje del formulario de contacto</h1>
          <div class="field">
            <p class="label">Nombre:</p>
            <p>${name}</p>
          </div>
          <div class="field">
            <p class="label">Correo electrónico:</p>
            <p>${email}</p>
          </div>
          <div class="field">
            <p class="label">Mensaje:</p>
            <p>${message}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Configuración del correo
    console.log('Preparando opciones de correo...');
    const mailOptions = {
      from: process.env.EMAIL_USER || 'tu_correo@outlook.com',
      to: process.env.EMAIL_TO || 'ivera@orasystem.cl',
      subject: 'Nuevo mensaje del formulario de contacto',
      html: htmlTemplate
    };
    
    console.log(`De: ${mailOptions.from}`);
    console.log(`Para: ${mailOptions.to}`);
    console.log(`Asunto: ${mailOptions.subject}`);
    console.log('Intentando enviar correo...');

    // Enviar el correo
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Correo enviado correctamente');
    console.log('ID del mensaje:', info.messageId);
    console.log('Respuesta del servidor:', info.response);

    res.status(200).json({ 
      success: true, 
      message: 'Formulario enviado correctamente' 
    });
  } catch (error) {
    console.error('❌ Error al enviar el formulario:');
    console.error(`Tipo de error: ${error.name}`);
    console.error(`Mensaje: ${error.message}`);
    
    if (error.code) {
      console.error(`Código: ${error.code}`);
    }
    
    if (error.response) {
      console.error(`Respuesta del servidor: ${error.response}`);
    }
    
    if (error.stack) {
      console.error('Stack de error:');
      console.error(error.stack);
    }

    res.status(500).json({ 
      success: false, 
      message: 'Error al procesar el formulario',
      error: error.message
    });
  }
});

// Ruta para comprobar que el servidor está funcionando
app.get('/', (req, res) => {
  console.log('📥 Recibida petición GET a /');
  res.send('API para formulario de contacto funcionando correctamente');
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
}); 