const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const sql = require('mssql');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
// Puerto para Vercel (usa process.env.PORT si está disponible, de lo contrario usa 3001)
const PORT = process.env.PORT || 3001;

// Middleware para registrar la IP del cliente en cada solicitud
app.use((req, res, next) => {
  const clientIP = req.headers['x-forwarded-for'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress;
  console.log(`Solicitud recibida desde IP: ${clientIP}`);
  next();
});

// Middleware para manejar solicitudes OPTIONS (CORS preflight)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Intercept OPTIONS method
  if (req.method === 'OPTIONS') {
    console.log('Recibida solicitud OPTIONS (CORS preflight)');
    return res.status(200).end();
  }
  
  return next();
});

// Configuración para subir archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // En Vercel, necesitamos usar /tmp para almacenamiento temporal
    const uploadDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'uploads');
    // Crear directorio si no existe
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    console.log(`Directorio para subida de archivos: ${uploadDir}`);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Asegurar que el nombre de archivo no contiene caracteres especiales
    const safeOriginalname = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    const filename = file.fieldname + '-' + uniqueSuffix + path.extname(safeOriginalname);
    console.log(`Guardando archivo como: ${filename}`);
    cb(null, filename);
  }
});

// Función para filtrar archivos
const fileFilter = function (req, file, cb) {
  console.log(`Archivo recibido: ${file.originalname}, tipo: ${file.mimetype}`);
  // Aceptar solo archivos PDF
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    console.log(`Tipo de archivo rechazado: ${file.mimetype}`);
    cb(new Error(`Solo se permiten archivos PDF. Tipo recibido: ${file.mimetype}`), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1 // Máximo 1 archivo
  },
  fileFilter: fileFilter
}).single('cv');

// Función auxiliar para manejar la carga de archivos con mejor manejo de errores
const handleUpload = (req, res) => {
  return new Promise((resolve, reject) => {
    upload(req, res, (err) => {
      if (err) {
        console.error('❌ Error en handleUpload:', err);
        if (err instanceof multer.MulterError) {
          // Error de Multer durante la carga
          console.error('❌ Error de Multer:', err.message, err.code);
          if (err.code === 'LIMIT_FILE_SIZE') {
            return reject({ status: 400, message: 'El archivo excede el límite de 5MB' });
          }
          return reject({ status: 400, message: 'Error al subir el archivo: ' + err.message });
        } else {
          // Otro tipo de error
          console.error('❌ Error al procesar la solicitud:', err.message);
          return reject({ status: 400, message: 'Error al procesar la solicitud: ' + err.message });
        }
      }
      if (req.file) {
        console.log(`✅ Archivo recibido correctamente: ${req.file.originalname} (${req.file.size} bytes)`);
      } else {
        console.log('ℹ️ No se recibió ningún archivo');
      }
      resolve();
    });
  });
};

// Debug de variables de entorno (sin mostrar la contraseña completa)
console.log('=== CONFIGURACIÓN DE ENTORNO ===');
console.log(`Puerto: ${PORT}`);
console.log(`EMAIL_USER: ${'servicio@orasystem.cl'}`);
console.log(`EMAIL_PASS configurado: Sí (valor oculto)`);
console.log(`EMAIL_TO: ${'comercial@orasystem.cl'}`);
console.log(`DB_SERVER: ${'seguridad.database.windows.net'}`);
console.log(`DB_NAME: ${'SeguridadBD'}`);
console.log('===============================');

// Middleware
app.use(cors({
  origin: '*', // Permite solicitudes desde cualquier origen
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'Accept', 'Accept-Version', 'Content-Length', 'Content-MD5', 'Date', 'X-Api-Version'],
  credentials: true,
  maxAge: 86400, // 24 horas en segundos
  preflightContinue: false
}));

// Configurar respuestas CORS para todas las rutas
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.')); // Sirve archivos estáticos desde la raíz
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuración de la base de datos SQL Server
const dbConfig = {
  server: 'seguridad.database.windows.net',
  database: 'SeguridadBD',
  user: 'orasystem',
  password: 'admin123.',
  options: {
    encrypt: true,
    trustServerCertificate: false,
    port: 1433
  }
};

// Configuración del transporte de correo
console.log('Configurando transporte de correo...');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'servicio@orasystem.cl',
    pass: 'uxwu evwz ecxr hmoa'
  },
  debug: true // Activar modo debug de nodemailer
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
  });

// Función para conectar a la base de datos con manejo de errores
const connectToDatabase = async () => {
  try {
    console.log('Intentando conectar a la base de datos...');
    await sql.connect(dbConfig);
    console.log('✅ Conexión a la base de datos SQL Server establecida correctamente');
    
    // Verificar si existe la tabla Formularios y crearla si no existe
    await sql.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Formularios]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[Formularios] (
          [Id] INT IDENTITY(1,1) PRIMARY KEY,
          [Nombre] NVARCHAR(100) NOT NULL,
          [Email] NVARCHAR(100) NOT NULL,
          [Mensaje] NVARCHAR(MAX) NOT NULL,
          [FechaRegistro] DATETIME DEFAULT GETDATE()
        )
        PRINT 'Tabla Formularios creada correctamente'
      END
      ELSE
      BEGIN
        PRINT 'La tabla Formularios ya existe'
      END
    `);
    
    // Verificar si existe la tabla Postulaciones y crearla si no existe
    await sql.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Postulaciones]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[Postulaciones] (
          [Id] INT IDENTITY(1,1) PRIMARY KEY,
          [Nombre] NVARCHAR(100) NOT NULL,
          [RUT] NVARCHAR(20) NOT NULL,
          [Email] NVARCHAR(100) NOT NULL,
          [Telefono] NVARCHAR(20) NULL,
          [Cargo] NVARCHAR(100) NOT NULL,
          [Interes] NVARCHAR(MAX) NOT NULL,
          [Mensaje] NVARCHAR(MAX) NULL,
          [RutaCV] NVARCHAR(255) NULL,
          [NombreArchivoOriginal] NVARCHAR(255) NULL,
          [FechaRegistro] DATETIME DEFAULT GETDATE()
        )
        PRINT 'Tabla Postulaciones creada correctamente'
      END
      ELSE
      BEGIN
        PRINT 'La tabla Postulaciones ya existe'
      END
    `);
    
    return true;
  } catch (error) {
    console.error('❌ Error al conectar con la base de datos:');
    console.error(`Tipo de error: ${error.name}`);
    console.error(`Mensaje: ${error.message}`);
    console.error('Este error no detendrá el servidor, pero la funcionalidad de base de datos no estará disponible');
    return null;
  }
};

// Intentar la conexión inicial a la base de datos
connectToDatabase()
  .then(result => {
    if (result) {
      console.log('Resultado de la verificación de tabla:', result);
    }
  })
  .catch(err => {
    console.error('Error en la conexión inicial a la base de datos:', err);
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
    
    // Guardar en la base de datos
    console.log('Intentando guardar datos en la base de datos...');
    try {
      const pool = await sql.connect(dbConfig);
      const result = await pool.request()
        .input('nombre', sql.NVarChar, name)
        .input('email', sql.NVarChar, email)
        .input('mensaje', sql.NVarChar, message)
        .query(`
          INSERT INTO [dbo].[Formularios] 
            ([Nombre], [Email], [Mensaje]) 
          VALUES 
            (@nombre, @email, @mensaje);
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      const insertedId = result.recordset[0].id;
      console.log(`✅ Datos guardados correctamente en la base de datos con ID: ${insertedId}`);
    } catch (dbError) {
      console.error('❌ Error al guardar en la base de datos:');
      console.error(`Mensaje: ${dbError.message}`);
      console.error('Continuando con el envío de correo...');
    }
    
    // Plantilla HTML para el correo
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 650px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
          }
          .header {
            background-color: #e73c30;
            color: #ffffff;
            padding: 25px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            padding: 30px;
          }
          .field {
            margin-bottom: 25px;
            border-bottom: 1px solid #eee;
            padding-bottom: 15px;
          }
          .field:last-child {
            border-bottom: none;
            margin-bottom: 0;
          }
          .label {
            font-weight: 600;
            color: #e73c30;
            margin-bottom: 5px;
            font-size: 16px;
          }
          .value {
            margin: 0;
            font-size: 16px;
            color: #212121;
          }
          .footer {
            background-color: #f1f1f1;
            padding: 15px;
            text-align: center;
            font-size: 14px;
            color: #666;
          }
          .logo {
            margin-bottom: 15px;
          }
          .logo img {
            max-width: 200px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Solicitud de Consultoría</h1>
          </div>
          <div class="content">
            <p>Se ha recibido una nueva solicitud de información de un cliente potencial a través del formulario de contacto del sitio web corporativo.</p>
            
            <div class="field">
              <p class="label">Nombre del solicitante:</p>
              <p class="value">${name}</p>
            </div>
            <div class="field">
              <p class="label">Correo electrónico de contacto:</p>
              <p class="value">${email}</p>
            </div>
            <div class="field">
              <p class="label">Mensaje:</p>
              <p class="value">${message}</p>
            </div>
          </div>
          <div class="footer">
            <p>ORASYSTEM - Especialistas en Consultoría & Administración IT</p>
            <p>Este mensaje ha sido generado automáticamente. Por favor, no responda directamente a este correo.</p>
            <p>© ${new Date().getFullYear()} Orasystem. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Configuración del correo
    console.log('Preparando opciones de correo...');
    const mailOptions = {
      from: 'servicio@orasystem.cl',
      to: 'comercial@orasystem.cl',
      subject: 'Nueva Solicitud de Consultoría - Formulario Web',
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

// Ruta para obtener los registros de la tabla
app.get('/api/formularios', async (req, res) => {
  console.log('📥 Recibida petición GET a /api/formularios');
  
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .query('SELECT * FROM [dbo].[Formularios] ORDER BY [FechaRegistro] DESC');
    
    console.log(`✅ Recuperados ${result.recordset.length} registros de la base de datos`);
    
    res.status(200).json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('❌ Error al obtener registros de la base de datos:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al obtener los registros',
      error: error.message
    });
  }
});

// Ruta para la página de registros
app.get('/registros', (req, res) => {
  res.sendFile(__dirname + '/registros.html');
});

// Ruta para el formulario de "Trabaja con Nosotros"
app.post('/api/postulacion', cors(), async function(req, res) {
  // Establecer encabezados CORS explícitamente
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  // Si es una solicitud OPTIONS, responder inmediatamente
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  console.log('📨 Recibida petición POST a /api/postulacion');
  console.log('Encabezados:', JSON.stringify(req.headers));
  console.log('Content-Type:', req.headers['content-type']);
  
  // Manejar la carga del archivo
  try {
    // Manejar la subida del archivo
    await handleUpload(req, res);
    
    console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    // Validar los datos del formulario
    const { nombre, rut, email, telefono, cargo, interes, mensaje, privacidad } = req.body;
    
    if (!nombre || !rut || !email || !cargo || !interes) {
      console.log('❌ Validación fallida: Datos incompletos');
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos obligatorios son requeridos' 
      });
    }
    
    console.log('✅ Validación de datos correcta');
    
    // Procesar el archivo
    let archivoBase64 = null;
    let nombreArchivoOriginal = null;
    let tipoArchivo = null;
    
    if (req.file) {
      try {
        // Leer el archivo y convertirlo a base64
        const fileBuffer = fs.readFileSync(req.file.path);
        archivoBase64 = fileBuffer.toString('base64');
        nombreArchivoOriginal = req.file.originalname;
        tipoArchivo = req.file.mimetype;
        console.log(`✅ Archivo CV recibido y convertido a base64: ${nombreArchivoOriginal} (${fileBuffer.length} bytes)`);
        
        // Eliminar el archivo físico después de convertirlo a base64
        fs.unlinkSync(req.file.path);
        console.log(`✅ Archivo físico eliminado: ${req.file.path}`);
      } catch (fileError) {
        console.error('❌ Error al procesar el archivo:', fileError);
        // Continuamos con el proceso aunque haya error con el archivo
      }
    } else {
      console.log('⚠️ No se recibió archivo CV');
    }
    
    // Guardar en la base de datos
    console.log('Intentando guardar datos en la base de datos...');
    let insertedId = null;
    
    try {
      // Verificar si la tabla tiene la columna para el archivo base64
      await sql.connect(dbConfig);
      
      // Verificar si existe la columna ArchivoBase64 y agregarla si no existe
      await sql.query(`
        IF NOT EXISTS (
          SELECT * FROM sys.columns 
          WHERE object_id = OBJECT_ID(N'[dbo].[Postulaciones]') AND name = 'ArchivoBase64'
        )
        BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [ArchivoBase64] NVARCHAR(MAX) NULL;
          ALTER TABLE [dbo].[Postulaciones] ADD [TipoArchivo] NVARCHAR(100) NULL;
          PRINT 'Columnas ArchivoBase64 y TipoArchivo agregadas correctamente'
        END
        ELSE
        BEGIN
          PRINT 'Las columnas ArchivoBase64 y TipoArchivo ya existen'
        END
      `);
      
      const pool = await sql.connect(dbConfig);
      const result = await pool.request()
        .input('nombre', sql.NVarChar, nombre)
        .input('rut', sql.NVarChar, rut)
        .input('email', sql.NVarChar, email)
        .input('telefono', sql.NVarChar, telefono || null)
        .input('cargo', sql.NVarChar, cargo)
        .input('interes', sql.NVarChar, interes)
        .input('mensaje', sql.NVarChar, mensaje || null)
        .input('archivoBase64', sql.NVarChar, archivoBase64)
        .input('nombreArchivoOriginal', sql.NVarChar, nombreArchivoOriginal)
        .input('tipoArchivo', sql.NVarChar, tipoArchivo)
        .query(`
          INSERT INTO [dbo].[Postulaciones] 
            ([Nombre], [RUT], [Email], [Telefono], [Cargo], [Interes], [Mensaje], [ArchivoBase64], [NombreArchivoOriginal], [TipoArchivo]) 
          VALUES 
            (@nombre, @rut, @email, @telefono, @cargo, @interes, @mensaje, @archivoBase64, @nombreArchivoOriginal, @tipoArchivo);
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      insertedId = result.recordset[0].id;
      console.log(`✅ Datos guardados correctamente en la base de datos con ID: ${insertedId}`);
    } catch (dbError) {
      console.error('❌ Error al guardar en la base de datos:');
      console.error(`Mensaje: ${dbError.message}`);
      console.error('Continuando con el envío de correo...');
    }
    
    // Plantilla HTML para el correo
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f9f9f9;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 650px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
          }
          .header {
            background-color: #e73c30;
            color: #ffffff;
            padding: 25px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content {
            padding: 30px;
          }
          .field {
            margin-bottom: 25px;
            border-bottom: 1px solid #eee;
            padding-bottom: 15px;
          }
          .field:last-child {
            border-bottom: none;
            margin-bottom: 0;
          }
          .label {
            font-weight: 600;
            color: #e73c30;
            margin-bottom: 5px;
            font-size: 16px;
          }
          .value {
            margin: 0;
            font-size: 16px;
            color: #212121;
          }
          .footer {
            background-color: #f1f1f1;
            padding: 15px;
            text-align: center;
            font-size: 14px;
            color: #666;
          }
          .logo {
            margin-bottom: 15px;
          }
          .logo img {
            max-width: 200px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Nueva Postulación Laboral</h1>
          </div>
          <div class="content">
            <p>Se ha recibido una nueva postulación laboral a través del formulario "Trabaja con Nosotros" del sitio web corporativo.</p>
            
            <div class="field">
              <p class="label">Nombre completo:</p>
              <p class="value">${nombre}</p>
            </div>
            <div class="field">
              <p class="label">RUT:</p>
              <p class="value">${rut}</p>
            </div>
            <div class="field">
              <p class="label">Correo electrónico:</p>
              <p class="value">${email}</p>
            </div>
            ${telefono ? `
            <div class="field">
              <p class="label">Teléfono:</p>
              <p class="value">${telefono}</p>
            </div>
            ` : ''}
            <div class="field">
              <p class="label">Cargo al que postula:</p>
              <p class="value">${cargo}</p>
            </div>
            <div class="field">
              <p class="label">Interés en Orasystem:</p>
              <p class="value">${interes}</p>
            </div>
            ${mensaje ? `
            <div class="field">
              <p class="label">Mensaje adicional:</p>
              <p class="value">${mensaje}</p>
            </div>
            ` : ''}
            ${nombreArchivoOriginal ? `
            <div class="field">
              <p class="label">CV adjunto:</p>
              <p class="value">${nombreArchivoOriginal}</p>
            </div>
            ` : `
            <div class="field">
              <p class="label">CV adjunto:</p>
              <p class="value">No se adjuntó CV</p>
            </div>
            `}
          </div>
          <div class="footer">
            <p>ORASYSTEM - Especialistas en Consultoría & Administración IT</p>
            <p>Este mensaje ha sido generado automáticamente. Por favor, no responda directamente a este correo.</p>
            <p>© ${new Date().getFullYear()} Orasystem. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Configuración del correo
    console.log('Preparando opciones de correo...');
    const mailOptions = {
      from: 'servicio@orasystem.cl',
      to: 'rrhh@orasystem.cl',
      subject: 'Nueva Postulación Laboral - Trabaja con Nosotros',
      html: htmlTemplate
    };
    
    // Adjuntar CV si existe
    if (archivoBase64 && nombreArchivoOriginal) {
      mailOptions.attachments = [
        {
          filename: nombreArchivoOriginal,
          content: archivoBase64,
          encoding: 'base64'
        }
      ];
      console.log(`✅ CV adjuntado al correo: ${nombreArchivoOriginal}`);
    }
    
    console.log(`De: ${mailOptions.from}`);
    console.log(`Para: ${mailOptions.to}`);
    console.log(`Asunto: ${mailOptions.subject}`);
    console.log('Intentando enviar correo...');

    // Enviar el correo
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Correo enviado correctamente');
    console.log('ID del mensaje:', info.messageId);
    console.log('Respuesta del servidor:', info.response);

    // Enviar respuesta exitosa
    res.status(200).json({ 
      success: true, 
      message: 'Postulación enviada correctamente' 
    });
    
  } catch (error) {
    // Manejar cualquier error durante el proceso
    console.error('❌ Error al procesar la postulación:');
    console.error(`Mensaje: ${error.message}`);
    
    if (error.stack) {
      console.error('Stack de error:');
      console.error(error.stack);
    }
    
    return res.status(400).json({
      success: false,
      message: 'Error al procesar la postulación: ' + error.message
    });
  }
});

// Ruta para obtener las postulaciones
app.get('/api/postulaciones', cors(), async (req, res) => {
  // Establecer encabezados CORS explícitamente
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  console.log('📥 Recibida petición GET a /api/postulaciones');
  
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .query('SELECT * FROM [dbo].[Postulaciones] ORDER BY [FechaRegistro] DESC');
    
    console.log(`✅ Recuperadas ${result.recordset.length} postulaciones de la base de datos`);
    
    res.status(200).json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('❌ Error al obtener postulaciones de la base de datos:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al obtener las postulaciones',
      error: error.message
    });
  }
});

// Ruta para obtener el CV de una postulación específica
app.get('/api/postulacion/:id/cv', cors(), async (req, res) => {
  // Establecer encabezados CORS explícitamente
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  console.log(`📥 Recibida petición GET a /api/postulacion/${req.params.id}/cv`);
  
  try {
    const postulacionId = req.params.id;
    
    // Validar que el ID sea un número
    if (!/^\d+$/.test(postulacionId)) {
      return res.status(400).json({
        success: false,
        message: 'El ID de la postulación debe ser un número'
      });
    }
    
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('id', sql.Int, postulacionId)
      .query('SELECT [ArchivoBase64], [NombreArchivoOriginal], [TipoArchivo] FROM [dbo].[Postulaciones] WHERE [Id] = @id');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Postulación no encontrada'
      });
    }
    
    const postulacion = result.recordset[0];
    
    if (!postulacion.ArchivoBase64 || !postulacion.NombreArchivoOriginal) {
      return res.status(404).json({
        success: false,
        message: 'Esta postulación no tiene CV adjunto'
      });
    }
    
    console.log(`✅ CV encontrado para la postulación ID ${postulacionId}: ${postulacion.NombreArchivoOriginal}`);
    
    // Configurar cabeceras para la descarga del archivo
    res.setHeader('Content-Type', postulacion.TipoArchivo || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${postulacion.NombreArchivoOriginal}"`);
    
    // Decodificar y enviar el archivo
    const buffer = Buffer.from(postulacion.ArchivoBase64, 'base64');
    res.end(buffer);
    
  } catch (error) {
    console.error('❌ Error al obtener el CV:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al obtener el CV',
      error: error.message
    });
  }
});

// Ruta para obtener información básica de una postulación específica
app.get('/api/postulacion/:id', cors(), async (req, res) => {
  // Establecer encabezados CORS explícitamente
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  console.log(`📥 Recibida petición GET a /api/postulacion/${req.params.id}`);
  
  try {
    const postulacionId = req.params.id;
    
    // Validar que el ID sea un número
    if (!/^\d+$/.test(postulacionId)) {
      return res.status(400).json({
        success: false,
        message: 'El ID de la postulación debe ser un número'
      });
    }
    
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('id', sql.Int, postulacionId)
      .query(`
        SELECT 
          [Id], [Nombre], [RUT], [Email], [Telefono], [Cargo], 
          [Interes], [Mensaje], [NombreArchivoOriginal], [FechaRegistro], 
          CASE WHEN [ArchivoBase64] IS NULL THEN 0 ELSE 1 END AS [TieneCV]
        FROM [dbo].[Postulaciones] 
        WHERE [Id] = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Postulación no encontrada'
      });
    }
    
    console.log(`✅ Información encontrada para la postulación ID ${postulacionId}`);
    
    res.status(200).json({
      success: true,
      data: result.recordset[0]
    });
    
  } catch (error) {
    console.error('❌ Error al obtener la información de la postulación:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al obtener la información de la postulación',
      error: error.message
    });
  }
});

// Ruta para la página de postulaciones
app.get('/postulaciones', (req, res) => {
  res.sendFile(__dirname + '/postulaciones.html');
});

// Ruta para comprobar que el servidor está funcionando
app.get('/', (req, res) => {
  console.log('📥 Recibida petición GET a /');
  
  // Obtener la IP del cliente
  const clientIP = req.headers['x-forwarded-for'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress;
  
  // Crear un objeto con información de diagnóstico
  const diagnosticInfo = {
    message: 'API para formulario de contacto funcionando correctamente',
    timestamp: new Date().toISOString(),
    clientIP: clientIP,
    headers: req.headers,
    nodeVersion: process.version,
    envVars: {
      PORT: PORT,
      NODE_ENV: process.env.NODE_ENV || 'not set'
    }
  };
  
  // Mostrar información en los logs del servidor
  console.log('Información de diagnóstico:');
  console.log(JSON.stringify(diagnosticInfo, null, 2));
  
  // Enviar respuesta con la información de diagnóstico
  res.json(diagnosticInfo);
});

// Iniciar el servidor
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor Express iniciado en puerto ${PORT}`);
}).on('error', (err) => {
  console.error('Error al iniciar el servidor:', err.message);
});

// Exportar la app para uso en funciones de Netlify
module.exports = app; 