const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const sql = require('mssql');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const ExcelJS = require('exceljs');

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
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
  
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
console.log(`EMAIL_USER: ${'ffigueroa@orasystem.cl'}`);
console.log(`EMAIL_PASS configurado: Sí (valor oculto)`);
console.log(`EMAIL_TO: ${'comercial@orasystem.cl'}`);
console.log(`DB_SERVER: ${'securityorasystem.database.windows.net'}`);
console.log(`DB_NAME: ${'SeguridadBD'}`);
console.log('===============================');

// Middleware
app.use(cors({
  origin: '*', // Permite solicitudes desde cualquier origen
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'Accept', 'Accept-Version', 'Content-Length', 'Content-MD5', 'Date', 'X-Api-Version', 'Cache-Control'],
  credentials: true,
  maxAge: 86400, // 24 horas en segundos
  preflightContinue: false
}));

// Configurar respuestas CORS para todas las rutas
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version, Cache-Control');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// Configuración optimizada para imágenes Base64 en Azure
// Límite reducido para mejor rendimiento y estabilidad
app.use(express.json({ 
  limit: '10mb',
  parameterLimit: 50000
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 50000
}));
app.use(express.static('.')); // Sirve archivos estáticos desde la raíz
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuración de la base de datos SQL Server
const dbConfig = {
  server: 'securityorasystem.database.windows.net',
  database: 'OrasystemSecurity',
  user: 'administrador',
  password: 'Admin123.',
  options: {
    encrypt: true,
    trustServerCertificate: false,
    port: 1433
  }
};

// Función para formatear RUT chileno
function formatearRUT(rut) {
  if (!rut) return rut;
  
  // Remover todos los caracteres que no sean números o K/k
  let rutLimpio = rut.toString().replace(/[^0-9Kk]/g, '');
  
  // Convertir k minúscula a mayúscula
  rutLimpio = rutLimpio.replace(/k/g, 'K');
  
  // Validar que tenga al menos 7 caracteres (mínimo para un RUT válido)
  if (rutLimpio.length < 7) {
    return rut; // Devolver original si es muy corto
  }
  
  // Separar el dígito verificador
  const cuerpo = rutLimpio.slice(0, -1);
  const dv = rutLimpio.slice(-1);
  
  // Formatear el cuerpo con puntos
  let cuerpoFormateado = '';
  for (let i = cuerpo.length - 1, j = 0; i >= 0; i--, j++) {
    if (j > 0 && j % 3 === 0) {
      cuerpoFormateado = '.' + cuerpoFormateado;
    }
    cuerpoFormateado = cuerpo[i] + cuerpoFormateado;
  }
  
  // Retornar RUT formateado
  return `${cuerpoFormateado}-${dv}`;
}

// Función para validar RUT chileno
function validarRUT(rut) {
  if (!rut) return false;
  
  // Limpiar RUT
  const rutLimpio = rut.replace(/[^0-9Kk]/g, '');
  
  if (rutLimpio.length < 7) return false;
  
  const cuerpo = rutLimpio.slice(0, -1);
  const dv = rutLimpio.slice(-1).toUpperCase();
  
  // Calcular dígito verificador
  let suma = 0;
  let multiplicador = 2;
  
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  
  const dvCalculado = 11 - (suma % 11);
  let dvEsperado;
  
  if (dvCalculado === 11) {
    dvEsperado = '0';
  } else if (dvCalculado === 10) {
    dvEsperado = 'K';
  } else {
    dvEsperado = dvCalculado.toString();
  }
  
  return dv === dvEsperado;
}

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

// Función para generar archivo Excel con postulaciones
async function generarExcelPostulaciones() {
  try {
    console.log('📊 Generando archivo Excel con postulaciones...');
    
    // Conectar a la base de datos
    const pool = await sql.connect(dbConfig);
    
    // Obtener todas las postulaciones de los últimos 30 días
    const result = await pool.request()
      .query(`
        SELECT 
          Id,
          Nombre,
          RUT,
          Email,
          Telefono,
          Cargo,
          Interes,
          Mensaje,
          NombreArchivoOriginal,
          FechaRegistro,
          AreaDeseada,
          PretensionRenta,
          Conocimientos,
          Contactado,
          FechaContactoUltimo,
          CertificacionPendiente,
          ExamenPsicologico,
          NombreReferencia,
          CorreoReferencia,
          NivelEstudio,
          Certificaciones,
          Experiencia,
          CASE WHEN ArchivoBase64 IS NULL THEN 'No' ELSE 'Sí' END as TieneCV
        FROM [dbo].[Postulaciones]
        WHERE FechaRegistro >= DATEADD(day, -30, GETDATE())
        ORDER BY FechaRegistro DESC
      `);
    
    console.log(`📋 Se encontraron ${result.recordset.length} postulaciones de los últimos 30 días`);
    
    // Crear un nuevo libro de Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Postulaciones');
    
    // Configurar las columnas
    worksheet.columns = [
      { header: 'ID', key: 'Id', width: 10 },
      { header: 'Nombre', key: 'Nombre', width: 25 },
      { header: 'RUT', key: 'RUT', width: 15 },
      { header: 'Email', key: 'Email', width: 30 },
      { header: 'Teléfono', key: 'Telefono', width: 15 },
      { header: 'Cargo', key: 'Cargo', width: 30 },
      { header: 'Área Deseada', key: 'AreaDeseada', width: 20 },
      { header: 'Pretensión Renta', key: 'PretensionRenta', width: 15 },
      { header: 'Nivel Estudio', key: 'NivelEstudio', width: 20 },
      { header: 'Experiencia', key: 'Experiencia', width: 15 },
      { header: 'Conocimientos', key: 'Conocimientos', width: 40 },
      { header: 'Certificaciones', key: 'Certificaciones', width: 30 },
      { header: 'Interés en Orasystem', key: 'Interes', width: 50 },
      { header: 'Mensaje', key: 'Mensaje', width: 40 },
      { header: 'Contactado', key: 'Contactado', width: 12 },
      { header: 'Fecha Último Contacto', key: 'FechaContactoUltimo', width: 20 },
      { header: 'Certificación Pendiente', key: 'CertificacionPendiente', width: 25 },
      { header: 'Examen Psicológico', key: 'ExamenPsicologico', width: 20 },
      { header: 'Nombre Referencia', key: 'NombreReferencia', width: 25 },
      { header: 'Correo Referencia', key: 'CorreoReferencia', width: 30 },
      { header: 'Tiene CV', key: 'TieneCV', width: 12 },
      { header: 'Nombre Archivo CV', key: 'NombreArchivoOriginal', width: 30 },
      { header: 'Fecha Registro', key: 'FechaRegistro', width: 20 }
    ];
    
    // Estilo para el encabezado
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0170B9' } // Color azul de Orasystem
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    
    // Agregar los datos
    result.recordset.forEach((postulacion, index) => {
      const row = worksheet.addRow({
        Id: postulacion.Id,
        Nombre: postulacion.Nombre,
        RUT: postulacion.RUT,
        Email: postulacion.Email,
        Telefono: postulacion.Telefono || 'No proporcionado',
        Cargo: postulacion.Cargo,
        AreaDeseada: postulacion.AreaDeseada || 'No especificada',
        PretensionRenta: postulacion.PretensionRenta || 'No especificada',
        NivelEstudio: postulacion.NivelEstudio || 'No especificado',
        Experiencia: postulacion.Experiencia || 'No especificada',
        Conocimientos: postulacion.Conocimientos || 'No especificados',
        Certificaciones: postulacion.Certificaciones || 'No especificadas',
        Interes: postulacion.Interes,
        Mensaje: postulacion.Mensaje || 'Sin mensaje adicional',
        Contactado: postulacion.Contactado || 'No',
        FechaContactoUltimo: postulacion.FechaContactoUltimo ? 
          new Date(postulacion.FechaContactoUltimo).toLocaleDateString('es-CL') : 'No contactado',
        CertificacionPendiente: postulacion.CertificacionPendiente || 'No especificada',
        ExamenPsicologico: postulacion.ExamenPsicologico || 'No realizado',
        NombreReferencia: postulacion.NombreReferencia || 'No proporcionado',
        CorreoReferencia: postulacion.CorreoReferencia || 'No proporcionado',
        TieneCV: postulacion.TieneCV,
        NombreArchivoOriginal: postulacion.NombreArchivoOriginal || 'Sin CV',
        FechaRegistro: new Date(postulacion.FechaRegistro).toLocaleDateString('es-CL')
      });
      
      // Alternar colores de fila para mejor legibilidad
      if (index % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8F9FA' }
          };
        });
      }
      
      // Agregar bordes a todas las celdas
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { vertical: 'top', wrapText: true };
      });
    });
    
    // Ajustar altura de filas
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // No ajustar el encabezado
        row.height = 60; // Altura suficiente para texto con wrap
      }
    });
    
    // Agregar información adicional en una hoja separada
    const summarySheet = workbook.addWorksheet('Resumen');
    
    // Configurar resumen
    summarySheet.addRow(['REPORTE DE POSTULACIONES - ÚLTIMOS 30 DÍAS']);
    summarySheet.addRow(['Generado el:', new Date().toLocaleDateString('es-CL')]);
    summarySheet.addRow(['Total de postulaciones:', result.recordset.length]);
    summarySheet.addRow([]);
    
    // Estadísticas por cargo
    const cargoStats = {};
    result.recordset.forEach(p => {
      cargoStats[p.Cargo] = (cargoStats[p.Cargo] || 0) + 1;
    });
    
    summarySheet.addRow(['POSTULACIONES POR CARGO:']);
    Object.entries(cargoStats).forEach(([cargo, count]) => {
      summarySheet.addRow([cargo, count]);
    });
    
    summarySheet.addRow([]);
    summarySheet.addRow(['ESTADÍSTICAS ADICIONALES:']);
    
    const conCV = result.recordset.filter(p => p.TieneCV === 'Sí').length;
    const contactados = result.recordset.filter(p => p.Contactado === 'Sí').length;
    
    summarySheet.addRow(['Postulaciones con CV:', conCV]);
    summarySheet.addRow(['Postulaciones sin CV:', result.recordset.length - conCV]);
    summarySheet.addRow(['Candidatos contactados:', contactados]);
    summarySheet.addRow(['Candidatos pendientes de contacto:', result.recordset.length - contactados]);
    
    // Estilo para el resumen
    summarySheet.getCell('A1').font = { bold: true, size: 14 };
    summarySheet.getCell('A5').font = { bold: true };
    summarySheet.getCell('A' + (7 + Object.keys(cargoStats).length)).font = { bold: true };
    
    // Generar el archivo
    const fileName = `postulaciones_${new Date().toISOString().split('T')[0]}.xlsx`;
    const filePath = path.join(process.env.VERCEL ? '/tmp' : __dirname, fileName);
    
    await workbook.xlsx.writeFile(filePath);
    console.log(`✅ Archivo Excel generado: ${fileName}`);
    
    return { filePath, fileName, count: result.recordset.length };
    
  } catch (error) {
    console.error('❌ Error al generar archivo Excel:');
    console.error(`Mensaje: ${error.message}`);
    throw error;
  }
}

// Función para enviar el reporte por correo
async function enviarReportePostulaciones() {
  try {
    console.log('📧 Iniciando envío de reporte mensual de postulaciones...');
    
    // Generar el archivo Excel
    const { filePath, fileName, count } = await generarExcelPostulaciones();
    
    // Plantilla HTML para el correo del reporte
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
            background-color: #0170B9;
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
          .stats {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .stat-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #e9ecef;
          }
          .stat-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
          }
          .stat-label {
            font-weight: 600;
            color: #0170B9;
          }
          .stat-value {
            font-weight: bold;
            color: #28a745;
          }
          .footer {
            background-color: #f1f1f1;
            padding: 15px;
            text-align: center;
            font-size: 14px;
            color: #666;
          }
          .attachment-info {
            background-color: #e7f3ff;
            border-left: 4px solid #0170B9;
            padding: 15px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Reporte Mensual de Postulaciones</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Período: Últimos 30 días</p>
          </div>
          <div class="content">
            <p>Se adjunta el reporte mensual automatizado con todas las postulaciones laborales recibidas en los últimos 30 días.</p>
            
            <div class="stats">
              <h3 style="margin-top: 0; color: #0170B9;">📈 Estadísticas del Período</h3>
              <div class="stat-item">
                <span class="stat-label">Total de postulaciones:</span>
                <span class="stat-value">${count}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Fecha de generación:</span>
                <span class="stat-value">${new Date().toLocaleDateString('es-CL')}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Período analizado:</span>
                <span class="stat-value">${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-CL')} - ${new Date().toLocaleDateString('es-CL')}</span>
              </div>
            </div>
            
            <div class="attachment-info">
              <h4 style="margin-top: 0; color: #0170B9;">📎 Archivo Adjunto</h4>
              <p style="margin-bottom: 0;"><strong>Nombre:</strong> ${fileName}</p>
              <p style="margin-bottom: 0;"><strong>Formato:</strong> Excel (.xlsx)</p>
              <p style="margin-bottom: 0;"><strong>Contenido:</strong> Datos completos de todas las postulaciones con información detallada de cada candidato</p>
            </div>
            
            <h4 style="color: #0170B9;">📋 Información Incluida en el Reporte:</h4>
            <ul>
              <li>Datos personales de contacto</li>
              <li>Cargo al que postulan</li>
              <li>Información académica y profesional</li>
              <li>Estado de contacto y seguimiento</li>
              <li>CVs adjuntos (indicador)</li>
              <li>Fechas de registro y contacto</li>
              <li>Resumen estadístico por cargo</li>
            </ul>
            
            <p><strong>Nota:</strong> Este reporte se genera automáticamente cada 30 días. Para consultas específicas o reportes adicionales, contacte al administrador del sistema.</p>
          </div>
          <div class="footer">
            <p>ORASYSTEM - Especialistas en Consultoría & Administración IT</p>
            <p>Reporte generado automáticamente el ${new Date().toLocaleDateString('es-CL')} a las ${new Date().toLocaleTimeString('es-CL')}</p>
            <p>© ${new Date().getFullYear()} Orasystem. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    // Configuración del correo
    const mailOptions = {
      from: 'servicio@orasystem.cl',
      to: 'rrhh@orasystem.cl',
      cc: 'comercial@orasystem.cl', // Copia a comercial
      subject: `📊 Reporte Mensual de Postulaciones - ${new Date().toLocaleDateString('es-CL')}`,
      html: htmlTemplate,
      attachments: [
        {
          filename: fileName,
          path: filePath
        }
      ]
    };
    
    console.log(`📧 Enviando reporte a: ${mailOptions.to}`);
    console.log(`📧 Copia a: ${mailOptions.cc}`);
    console.log(`📎 Archivo adjunto: ${fileName}`);
    
    // Enviar el correo
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Reporte mensual enviado correctamente');
    console.log('ID del mensaje:', info.messageId);
    
    // Eliminar el archivo temporal después del envío
    try {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Archivo temporal eliminado: ${fileName}`);
    } catch (deleteError) {
      console.error('⚠️ No se pudo eliminar el archivo temporal:', deleteError.message);
    }
    
    return {
      success: true,
      message: `Reporte enviado correctamente con ${count} postulaciones`,
      messageId: info.messageId
    };
    
  } catch (error) {
    console.error('❌ Error al enviar reporte mensual:');
    console.error(`Mensaje: ${error.message}`);
    throw error;
  }
}

// Configurar el scheduler para ejecutar cada 30 días
// Ejecutar el primer día de cada mes a las 9:00 AM
cron.schedule('0 9 1 * *', async () => {
  console.log('⏰ Ejecutando tarea programada: Reporte mensual de postulaciones');
  try {
    await enviarReportePostulaciones();
    console.log('✅ Tarea programada completada exitosamente');
  } catch (error) {
    console.error('❌ Error en tarea programada:', error.message);
  }
}, {
  scheduled: true,
  timezone: "America/Santiago" // Zona horaria de Chile
});

console.log('⏰ Scheduler configurado: Reporte mensual cada 1° de mes a las 9:00 AM (Chile)');

// Endpoint manual para generar y enviar el reporte (para pruebas)
app.post('/api/reporte/postulaciones', cors(), async (req, res) => {
  try {
    console.log('📧 Generando reporte manual de postulaciones...');
    
    const result = await enviarReportePostulaciones();
    
    res.status(200).json({
      success: true,
      message: result.message,
      messageId: result.messageId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error al generar reporte manual:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al generar el reporte',
      error: error.message
    });
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
    
    // Agregar índice único a la tabla ForoImagenes para título
    try {
      console.log('Verificando índice único para ForoImagenes...');
      await sql.query(`
        -- Verificar si la tabla existe primero
        IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ForoImagenes]') AND type in (N'U'))
        BEGIN
          -- Verificar si el índice único ya existe
          IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='UX_ForoImagenes_Titulo' AND object_id = OBJECT_ID(N'[dbo].[ForoImagenes]'))
          BEGIN
            -- Eliminar cualquier registro con título duplicado antes de crear el índice
            WITH DuplicatesByTitle AS (
              SELECT 
                Id,
                Titulo,
                ROW_NUMBER() OVER (PARTITION BY Titulo ORDER BY FechaCreacion DESC) as RowNum
              FROM [dbo].[ForoImagenes]
            )
            DELETE FROM [dbo].[ForoImagenes] 
            WHERE Id IN (
              SELECT Id FROM DuplicatesByTitle WHERE RowNum > 1
            );
            
            -- Crear índice único en la columna Titulo
            CREATE UNIQUE INDEX UX_ForoImagenes_Titulo ON [dbo].[ForoImagenes](Titulo);
            PRINT 'Índice único UX_ForoImagenes_Titulo creado correctamente'
          END
          ELSE
          BEGIN
            PRINT 'El índice único UX_ForoImagenes_Titulo ya existe'
          END
        END
      `);
      console.log('✅ Índice único para ForoImagenes verificado/creado correctamente');
    } catch (indexError) {
      console.error('❌ Error al verificar/crear índice único:');
      console.error(`Mensaje: ${indexError.message}`);
    }
    
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
    
    // Formatear y validar RUT
    const rutFormateado = formatearRUT(rut);
    const rutEsValido = validarRUT(rutFormateado);
    
    console.log(`📋 RUT original: "${rut}" → RUT formateado: "${rutFormateado}" → Válido: ${rutEsValido}`);
    
    if (!rutEsValido) {
      console.log('❌ Validación fallida: RUT inválido');
      return res.status(400).json({ 
        success: false, 
        message: 'El RUT ingresado no es válido' 
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
        .input('rut', sql.NVarChar, rutFormateado)
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
              <p class="value">${rutFormateado}</p>
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
          Id, Nombre, RUT, Email, Telefono, Cargo, 
          Interes, Mensaje, NombreArchivoOriginal, FechaRegistro, 
          CASE WHEN ArchivoBase64 IS NULL THEN 0 ELSE 1 END AS TieneCV,
          AreaDeseada, TipoArchivo, PretensionRenta, Conocimientos, Contactado,
          FechaContactoUltimo, CertificacionPendiente, ExamenPsicologico, 
          NombreReferencia, CorreoReferencia, NivelEstudio, Certificaciones,
          Experiencia
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

// Ruta de prueba para verificar que las APIs funcionan
app.get('/api/test', (req, res) => {
  console.log('🧪 Ruta de prueba API accedida');
  res.json({
    success: true,
    message: 'APIs funcionando correctamente',
    timestamp: new Date().toISOString(),
    server: 'Azure App Service',
    availableRoutes: [
      'GET /api/formularios',
      'POST /api/formulario',
      'GET /api/postulaciones', 
      'POST /api/postulacion',
      'GET /api/foroimagenes',
      'POST /api/foroimagenes',
      'GET /api/formulario-evaluacion',
      'POST /api/formulario-evaluacion',
      'GET /api/setup/formulario-evaluacion'
    ]
  });
});

// Ruta para actualizar una postulación
app.put('/api/postulacion/:id', cors(), async (req, res) => {
  // Establecer encabezados CORS explícitamente
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  console.log(`📥 Recibida petición PUT a /api/postulacion/${req.params.id}`);
  console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
  
  try {
    const postulacionId = req.params.id;
    
    // Validar que el ID sea un número
    if (!/^\d+$/.test(postulacionId)) {
      return res.status(400).json({
        success: false,
        message: 'El ID de la postulación debe ser un número'
      });
    }
    
    // Acceder a los campos
    console.log('Accediendo a los campos del body...');
    const campos = Object.keys(req.body);
    console.log('Campos disponibles:', campos);
    
    const { 
      Nombre, RUT, Email, Telefono, Cargo, 
      Interes, Mensaje, AreaDeseada, TipoArchivo, 
      PretensionRenta, Conocimientos, Contactado, 
      FechaContactoUltimo, CertificacionPendiente, 
      ExamenPsicologico, NombreReferencia, 
      CorreoReferencia, NivelEstudio, Certificaciones,
      Experiencia
    } = req.body;
    
    // Log de validación
    console.log('Validación de campos obligatorios:');
    console.log('Nombre:', Nombre);
    console.log('RUT:', RUT);
    console.log('Email:', Email);
    console.log('Cargo:', Cargo);
    
    // Validación básica
    if (!Nombre || !RUT || !Email || !Cargo) {
      return res.status(400).json({
        success: false,
        message: 'Los campos Nombre, RUT, Email y Cargo son obligatorios'
      });
    }
    
    // Formatear y validar RUT
    const rutFormateado = formatearRUT(RUT);
    const rutEsValido = validarRUT(rutFormateado);
    
    console.log(`📋 RUT original: "${RUT}" → RUT formateado: "${rutFormateado}" → Válido: ${rutEsValido}`);
    
    if (!rutEsValido) {
      console.log('❌ Validación fallida: RUT inválido');
      return res.status(400).json({ 
        success: false, 
        message: 'El RUT ingresado no es válido' 
      });
    }
    
    const pool = await sql.connect(dbConfig);
    
    // Verificar que existen las columnas adicionales y crearlas si no existen
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'AreaDeseada')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [AreaDeseada] NVARCHAR(100) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'TipoArchivo')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [TipoArchivo] NVARCHAR(100) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'PretensionRenta')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [PretensionRenta] NVARCHAR(50) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'Conocimientos')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [Conocimientos] NVARCHAR(MAX) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'Contactado')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [Contactado] NVARCHAR(2) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'FechaContactoUltimo')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [FechaContactoUltimo] DATETIME NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'CertificacionPendiente')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [CertificacionPendiente] NVARCHAR(100) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'ExamenPsicologico')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [ExamenPsicologico] NVARCHAR(100) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'NombreReferencia')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [NombreReferencia] NVARCHAR(100) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'CorreoReferencia')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [CorreoReferencia] NVARCHAR(100) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'NivelEstudio')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [NivelEstudio] NVARCHAR(100) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'Certificaciones')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [Certificaciones] NVARCHAR(MAX) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'Experiencia')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [Experiencia] NVARCHAR(100) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Postulaciones' AND COLUMN_NAME = 'ArchivoBase64')
      BEGIN
          ALTER TABLE [dbo].[Postulaciones] ADD [ArchivoBase64] NVARCHAR(MAX) NULL;
      END
    `);

    // Actualizar los datos de la postulación
    const result = await pool.request()
      .input('id', sql.Int, postulacionId)
      .input('nombre', sql.NVarChar, Nombre)
      .input('rut', sql.NVarChar, rutFormateado)
      .input('email', sql.NVarChar, Email)
      .input('telefono', sql.NVarChar, Telefono)
      .input('cargo', sql.NVarChar, Cargo)
      .input('interes', sql.NVarChar, Interes)
      .input('mensaje', sql.NVarChar, Mensaje)
      .input('areaDeseada', sql.NVarChar, AreaDeseada)
      .input('tipoArchivo', sql.NVarChar, TipoArchivo)
      .input('pretensionRenta', sql.NVarChar, PretensionRenta)
      .input('conocimientos', sql.NVarChar, Conocimientos)
      .input('contactado', sql.NVarChar, Contactado)
      .input('fechaContactoUltimo', sql.DateTime, FechaContactoUltimo)
      .input('certificacionPendiente', sql.NVarChar, CertificacionPendiente)
      .input('examenPsicologico', sql.NVarChar, ExamenPsicologico)
      .input('nombreReferencia', sql.NVarChar, NombreReferencia)
      .input('correoReferencia', sql.NVarChar, CorreoReferencia)
      .input('nivelEstudio', sql.NVarChar, NivelEstudio)
      .input('certificaciones', sql.NVarChar, Certificaciones)
      .input('experiencia', sql.NVarChar, Experiencia)
      .query(`
        UPDATE [dbo].[Postulaciones]
        SET 
          [Nombre] = @nombre,
          [RUT] = @rut,
          [Email] = @email,
          [Telefono] = @telefono,
          [Cargo] = @cargo,
          [Interes] = @interes,
          [Mensaje] = @mensaje,
          [AreaDeseada] = @areaDeseada,
          [TipoArchivo] = @tipoArchivo,
          [PretensionRenta] = @pretensionRenta,
          [Conocimientos] = @conocimientos,
          [Contactado] = @contactado,
          [FechaContactoUltimo] = @fechaContactoUltimo,
          [CertificacionPendiente] = @certificacionPendiente,
          [ExamenPsicologico] = @examenPsicologico,
          [NombreReferencia] = @nombreReferencia,
          [CorreoReferencia] = @correoReferencia,
          [NivelEstudio] = @nivelEstudio,
          [Certificaciones] = @certificaciones,
          [Experiencia] = @experiencia
        WHERE [Id] = @id;
        
        SELECT @@ROWCOUNT AS affectedRows;
      `);
    
    const affectedRows = result.recordset[0].affectedRows;
    
    if (affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Postulación no encontrada'
      });
    }
    
    console.log(`✅ Postulación ID ${postulacionId} actualizada correctamente`);
    
    res.status(200).json({
      success: true,
      message: 'Postulación actualizada correctamente'
    });
    
  } catch (error) {
    console.error('❌ Error al actualizar la postulación:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al actualizar la postulación',
      error: error.message
    });
  }
});

// Handler específico para OPTIONS en las rutas de postulaciones
app.options('/api/postulacion/:id', (req, res) => {
  console.log('OPTIONS específico para /api/postulacion/:id');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.sendStatus(200);
});

// Verificar si existe la tabla ForoImagenes y crearla si no existe
app.get('/api/setup/foroimagenes', cors(), async (req, res) => {
  try {
    console.log('🔧 Verificando tabla ForoImagenes...');
    
    // Conectar a la base de datos
    const pool = await sql.connect(dbConfig);
    
    // Crear la tabla si no existe
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ForoImagenes]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[ForoImagenes] (
          [Id] INT IDENTITY(1,1) PRIMARY KEY,
          [Titulo] NVARCHAR(100) NOT NULL,
          [Descripcion] NVARCHAR(255) NULL,
          [ImagenBase64] NVARCHAR(MAX) NOT NULL,
          [TipoImagen] NVARCHAR(30) NULL,
          [NombreArchivo] NVARCHAR(255) NULL,
          [Orden] INT NULL,
          [FechaCreacion] DATETIME DEFAULT GETDATE()
        )
        PRINT 'Tabla ForoImagenes creada correctamente'
      END
    `);
    
    console.log('✅ Tabla ForoImagenes verificada/creada correctamente');
    
    res.status(200).json({
      success: true,
      message: 'Tabla ForoImagenes verificada/creada correctamente'
    });
    
  } catch (error) {
    console.error('❌ Error al verificar/crear tabla ForoImagenes:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al verificar/crear tabla ForoImagenes',
      error: error.message
    });
  }
});

// API para obtener todas las imágenes del foro (SIN Base64 para mejor rendimiento)
app.get('/api/foroimagenes', cors(), async (req, res) => {
  try {
    console.log('📊 Obteniendo imágenes del foro (metadata solamente)...');
    
    // Conectar a la base de datos con timeout extendido
    const pool = await sql.connect(dbConfig);
    
    // Verificar si la tabla existe y crearla si no existe
    console.log('🔍 Verificando existencia de tabla ForoImagenes...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ForoImagenes]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[ForoImagenes] (
          [Id] INT IDENTITY(1,1) PRIMARY KEY,
          [Titulo] NVARCHAR(100) NOT NULL,
          [Descripcion] NVARCHAR(255) NULL,
          [ImagenBase64] NVARCHAR(MAX) NULL,
          [TipoImagen] NVARCHAR(30) NULL,
          [NombreArchivo] NVARCHAR(255) NULL,
          [Orden] INT NULL,
          [FechaCreacion] DATETIME DEFAULT GETDATE()
        );
        PRINT 'Tabla ForoImagenes creada correctamente';
      END
      ELSE
      BEGIN
        PRINT 'La tabla ForoImagenes ya existe';
      END
    `);
    
    console.log('✅ Tabla ForoImagenes verificada/creada');
    
    // Consultar SOLO los metadatos (SIN ImagenBase64 para mejor rendimiento)
    const result = await pool.request()
      .query(`
        SELECT 
          Id, 
          Titulo, 
          Descripcion, 
          TipoImagen, 
          NombreArchivo, 
          Orden, 
          FechaCreacion,
          CASE 
            WHEN ImagenBase64 IS NOT NULL AND LEN(ImagenBase64) > 0 
            THEN 'true' 
            ELSE 'false' 
          END as TieneImagen,
          CASE 
            WHEN ImagenBase64 IS NOT NULL 
            THEN LEN(ImagenBase64) 
            ELSE 0 
          END as TamanoImagen
        FROM [dbo].[ForoImagenes]
        ORDER BY Orden, FechaCreacion DESC
      `);
    
    console.log(`✅ ${result.recordset.length} imágenes de foro obtenidas correctamente (solo metadata)`);
    
    res.status(200).json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
      message: 'Metadata de imágenes obtenida. Use /api/foroimagenes/:id para obtener imagen completa.'
    });
    
  } catch (error) {
    console.error('❌ Error al obtener imágenes del foro:');
    console.error(`Tipo de error: ${error.name}`);
    console.error(`Mensaje: ${error.message}`);
    console.error(`Código de error: ${error.code}`);
    
    // Información específica para errores de timeout o memoria
    if (error.code === 'ETIMEOUT' || error.message.includes('timeout')) {
      console.error('⏰ Error de timeout - posiblemente por imágenes muy grandes');
    }
    if (error.message.includes('memory') || error.message.includes('Memory')) {
      console.error('💾 Error de memoria - posiblemente por imágenes muy grandes en Base64');
    }
    
    res.status(500).json({
      success: false,
      message: 'Error al obtener imágenes del foro',
      error: error.message,
      errorType: error.name,
      errorCode: error.code,
      suggestion: 'Posible problema con imágenes grandes en Base64. Intente con imágenes más pequeñas.'
    });
  }
});

// API para obtener una imagen del foro por su ID
app.get('/api/foroimagenes/:id', cors(), async (req, res) => {
  try {
    const imagenId = req.params.id;
    console.log(`📊 Obteniendo imagen del foro con ID ${imagenId}...`);
    
    // Conectar a la base de datos
    const pool = await sql.connect(dbConfig);
    
    // Consultar la imagen por ID
    const result = await pool.request()
      .input('id', sql.Int, imagenId)
      .query(`
        SELECT Id, Titulo, Descripcion, ImagenBase64, TipoImagen, NombreArchivo, Orden, FechaCreacion
        FROM [dbo].[ForoImagenes]
        WHERE Id = @id
      `);
    
    if (result.recordset.length === 0) {
      console.log(`❌ No se encontró ninguna imagen con ID ${imagenId}`);
      return res.status(404).json({
        success: false,
        message: 'Imagen no encontrada'
      });
    }
    
    console.log(`✅ Imagen del foro con ID ${imagenId} obtenida correctamente`);
    
    res.status(200).json({
      success: true,
      data: result.recordset[0]
    });
    
  } catch (error) {
    console.error('❌ Error al obtener imagen del foro:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al obtener imagen del foro',
      error: error.message
    });
  }
});

// API para crear una nueva imagen en el foro
app.post('/api/foroimagenes', cors(), async (req, res) => {
  try {
    console.log('📝 Creando nueva imagen en el foro...');
    console.log('📊 Tamaño del body:', JSON.stringify(req.body).length, 'caracteres');
    
    const { Titulo, Descripcion, ImagenBase64, TipoImagen, NombreArchivo, Orden } = req.body;
    
    // Log adicional para debugging
    console.log('📋 Datos recibidos:');
    console.log('- Título:', Titulo);
    console.log('- Descripción:', Descripcion ? Descripcion.substring(0, 50) + '...' : 'Sin descripción');
    console.log('- Tipo de imagen:', TipoImagen);
    console.log('- Nombre archivo:', NombreArchivo);
    console.log('- Orden:', Orden);
    console.log('- Tamaño imagen Base64:', ImagenBase64 ? ImagenBase64.length : 0, 'caracteres');
    
    // Validar campos obligatorios
    if (!Titulo || !ImagenBase64) {
      console.log('❌ Error: Campos obligatorios faltantes');
      return res.status(400).json({
        success: false,
        message: 'El título y la imagen son obligatorios'
      });
    }
    
    // Validar tamaño de imagen (máximo 5MB en Base64 para mejor rendimiento en Azure)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (ImagenBase64.length > maxSize) {
      console.log('❌ Error: Imagen demasiado grande:', ImagenBase64.length, 'caracteres');
      console.log('💡 Sugerencia: Comprima la imagen o use un formato más eficiente');
      return res.status(400).json({
        success: false,
        message: `La imagen es demasiado grande. Máximo ${Math.round(maxSize / (1024 * 1024))}MB permitido.`,
        currentSize: `${Math.round(ImagenBase64.length / (1024 * 1024) * 100) / 100}MB`,
        suggestion: 'Comprima la imagen o use un formato más eficiente (JPEG con menor calidad)'
      });
    }
    
    // Validar formato Base64
    if (!ImagenBase64.startsWith('data:image/')) {
      console.log('❌ Error: Formato de imagen inválido');
      return res.status(400).json({
        success: false,
        message: 'Formato de imagen inválido. Debe ser una imagen en Base64.'
      });
    }
    
    console.log(`🔍 Verificando duplicados para título: "${Titulo}"`);
    
    // Conectar a la base de datos y crear una transacción con timeout extendido
    // Esto garantiza que todas las operaciones se completen o ninguna
    const pool = await sql.connect(dbConfig);
    const transaction = new sql.Transaction(pool);
    
    // Configurar timeout extendido para imágenes grandes (60 segundos)
    transaction.config.requestTimeout = 60000;
    
    try {
      // Iniciar transacción
      await transaction.begin();
      
      // Crear un objeto de solicitud vinculado a la transacción
      const request = new sql.Request(transaction);

      // PASO CRÍTICO 1: Bloquear la tabla para evitar inserciones concurrentes con el mismo título
      // Esto previene race conditions que podrían causar duplicados
      await request.query(`
        -- Bloquear tabla para lectura con intención de actualización
        -- Esto evita que dos usuarios inserten el mismo título simultáneamente
        SELECT TOP 1 Id FROM [dbo].[ForoImagenes] WITH (UPDLOCK, HOLDLOCK) 
        WHERE Id = -1; -- No bloquea ningún registro real, solo la tabla
      `);
      
      // PASO CRÍTICO 2: Verificar duplicados por título exacto
      const checkDuplicateRequest = new sql.Request(transaction);
      const existingByTitle = await checkDuplicateRequest
        .input('titulo', sql.NVarChar(100), Titulo)
        .query(`
          SELECT Id FROM [dbo].[ForoImagenes] 
          WHERE Titulo = @titulo
        `);
      
      if (existingByTitle.recordset.length > 0) {
        // Terminar transacción antes de devolver error
        await transaction.rollback();
        
        const duplicateId = existingByTitle.recordset[0].Id;
        console.log(`⚠️ Imagen duplicada detectada con título exacto "${Titulo}" (ID: ${duplicateId})`);
        return res.status(409).json({
          success: false,
          message: 'Ya existe una imagen con este título exacto',
          data: { id: duplicateId }
        });
      }

      // PASO CRÍTICO 3: Eliminar cualquier registro huérfano o parcial con este título
      // (una capa adicional de seguridad)
      const cleanupRequest = new sql.Request(transaction);
      await cleanupRequest
        .input('titulo', sql.NVarChar(100), Titulo)
        .query(`
          DELETE FROM [dbo].[ForoImagenes]
          WHERE Titulo = @titulo AND (ImagenBase64 IS NULL OR LEN(ImagenBase64) < 100)
        `);
      
      console.log(`✓ No se encontraron duplicados para título: "${Titulo}"`);
      
      // PASO CRÍTICO 4: Insertar la nueva imagen en una sola transacción
      const insertRequest = new sql.Request(transaction);
      const result = await insertRequest
        .input('titulo', sql.NVarChar(100), Titulo)
        .input('descripcion', sql.NVarChar(255), Descripcion || null)
        .input('imagenBase64', sql.NVarChar(sql.MAX), ImagenBase64)
        .input('tipoImagen', sql.NVarChar(30), TipoImagen || null)
        .input('nombreArchivo', sql.NVarChar(255), NombreArchivo || null)
        .input('orden', sql.Int, Orden || null)
        .query(`
          INSERT INTO [dbo].[ForoImagenes]
            (Titulo, Descripcion, ImagenBase64, TipoImagen, NombreArchivo, Orden, FechaCreacion)
          VALUES
            (@titulo, @descripcion, @imagenBase64, @tipoImagen, @nombreArchivo, @orden, GETDATE());
          
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      // Confirmar transacción
      await transaction.commit();
      
      const id = result.recordset[0].id;
      console.log(`✅ Imagen del foro creada correctamente con ID ${id}`);
      
      res.status(201).json({
        success: true,
        message: 'Imagen del foro creada correctamente',
        data: { id }
      });
      
    } catch (transactionError) {
      // Si hay cualquier error durante la transacción, hacer rollback
      if (transaction._aborted) {
        console.log('La transacción ya fue abortada');
      } else {
        try {
          await transaction.rollback();
          console.log('Transacción revertida debido a un error');
        } catch (rollbackError) {
          console.error('Error al revertir la transacción:', rollbackError.message);
        }
      }
      
      throw transactionError; // Re-lanzar para manejarlo en el catch exterior
    }
    
  } catch (error) {
    console.error('❌ Error al crear imagen del foro:');
    console.error(`Tipo de error: ${error.name}`);
    console.error(`Mensaje: ${error.message}`);
    console.error(`Código de error: ${error.code}`);
    
    // Información específica para errores comunes con imágenes grandes
    if (error.code === 'ETIMEOUT' || error.message.includes('timeout')) {
      console.error('⏰ Error de timeout - la imagen puede ser demasiado grande para procesar');
    }
    if (error.message.includes('memory') || error.message.includes('Memory')) {
      console.error('💾 Error de memoria - la imagen Base64 es demasiado grande');
    }
    if (error.message.includes('String or binary data would be truncated')) {
      console.error('📏 Error de truncamiento - algún campo excede el tamaño máximo permitido');
    }
    
    // Determinar mensaje de error específico
    let errorMessage = 'Error al crear imagen del foro';
    let suggestion = 'Intente con una imagen más pequeña o en formato JPEG';
    
    if (error.code === 'ETIMEOUT' || error.message.includes('timeout')) {
      errorMessage = 'Timeout al procesar la imagen - demasiado grande';
      suggestion = 'Reduzca el tamaño de la imagen a menos de 2MB';
    } else if (error.message.includes('memory') || error.message.includes('Memory')) {
      errorMessage = 'Error de memoria al procesar la imagen';
      suggestion = 'La imagen es demasiado grande. Use una imagen más pequeña';
    } else if (error.message.includes('String or binary data would be truncated')) {
      errorMessage = 'Datos demasiado grandes para almacenar';
      suggestion = 'Reduzca el tamaño de la imagen o use menor calidad';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message,
      errorType: error.name,
      errorCode: error.code,
      suggestion: suggestion
    });
  }
});

// Endpoint para limpiar duplicados (uso administrativo)
app.post('/api/foroimagenes/limpiar-duplicados', cors(), async (req, res) => {
  try {
    console.log('🧹 Iniciando limpieza de imágenes duplicadas...');
    
    // Conectar a la base de datos
    const pool = await sql.connect(dbConfig);
    
    // 1. Eliminar duplicados por título (mantener el más reciente)
    const duplicatesByTitle = await pool.request().query(`
      WITH DuplicatesByTitle AS (
        SELECT 
          Id,
          Titulo,
          ROW_NUMBER() OVER (PARTITION BY Titulo ORDER BY FechaCreacion DESC) as RowNum
        FROM [dbo].[ForoImagenes]
      )
      DELETE FROM [dbo].[ForoImagenes] 
      WHERE Id IN (
        SELECT Id FROM DuplicatesByTitle WHERE RowNum > 1
      );
      
      SELECT @@ROWCOUNT AS affectedRows;
    `);
    
    const deletedByTitle = duplicatesByTitle.recordset[0].affectedRows;
    console.log(`✅ Se eliminaron ${deletedByTitle} imágenes duplicadas por título`);
    
    // 2. Eliminar registros huérfanos (sin imagen)
    const orphanedRecords = await pool.request().query(`
      DELETE FROM [dbo].[ForoImagenes]
      WHERE ImagenBase64 IS NULL OR LEN(ImagenBase64) < 100;
      
      SELECT @@ROWCOUNT AS affectedRows;
    `);
    
    const deletedOrphans = orphanedRecords.recordset[0].affectedRows;
    console.log(`✅ Se eliminaron ${deletedOrphans} registros huérfanos sin imagen`);
    
    res.status(200).json({
      success: true,
      message: `Limpieza completada. Se eliminaron ${deletedByTitle + deletedOrphans} registros en total.`,
      data: {
        deletedByTitle,
        deletedOrphans
      }
    });
    
  } catch (error) {
    console.error('❌ Error al limpiar duplicados:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al limpiar duplicados',
      error: error.message
    });
  }
});

// API para actualizar una imagen del foro
app.put('/api/foroimagenes/:id', cors(), async (req, res) => {
  try {
    const imagenId = req.params.id;
    console.log(`📝 Actualizando imagen del foro con ID ${imagenId}...`);
    
    const { Titulo, Descripcion, ImagenBase64, TipoImagen, NombreArchivo, Orden } = req.body;
    
    // Validar campos obligatorios
    if (!Titulo) {
      console.log('❌ Error: Título obligatorio faltante');
      return res.status(400).json({
        success: false,
        message: 'El título es obligatorio'
      });
    }
    
    // Conectar a la base de datos y crear una transacción
    const pool = await sql.connect(dbConfig);
    const transaction = new sql.Transaction(pool);
    
    try {
      // Iniciar transacción
      await transaction.begin();
      
      // Crear un objeto de solicitud vinculado a la transacción
      const request = new sql.Request(transaction);
      
      // PASO CRÍTICO 1: Bloquear para prevenir actualizaciones conflictivas
      await request.query(`
        -- Bloquear tabla para prevenir conflictos
        SELECT TOP 1 Id FROM [dbo].[ForoImagenes] WITH (UPDLOCK, HOLDLOCK) 
        WHERE Id = -1;
      `);
      
      // PASO CRÍTICO 2: Verificar si existe otra imagen con el mismo título (excluyendo la actual)
      const checkDuplicateRequest = new sql.Request(transaction);
      const existingImage = await checkDuplicateRequest
        .input('titulo', sql.NVarChar(100), Titulo)
        .input('id', sql.Int, imagenId)
        .query(`
          SELECT Id FROM [dbo].[ForoImagenes] 
          WHERE Titulo = @titulo AND Id != @id
        `);
      
      if (existingImage.recordset.length > 0) {
        // Terminar transacción antes de devolver error
        await transaction.rollback();
        
        const duplicateId = existingImage.recordset[0].Id;
        console.log(`⚠️ Imagen duplicada detectada con título "${Titulo}" (ID: ${duplicateId})`);
        return res.status(409).json({
          success: false,
          message: 'Ya existe otra imagen con este título',
          data: { id: duplicateId }
        });
      }
      
      // PASO CRÍTICO 3: Verificar si la imagen a actualizar existe y obtener sus datos actuales
      const checkExistsRequest = new sql.Request(transaction);
      const imageExistsResult = await checkExistsRequest
        .input('id', sql.Int, imagenId)
        .query(`
          SELECT Id, TipoImagen, NombreArchivo FROM [dbo].[ForoImagenes] 
          WHERE Id = @id
        `);
      
      if (imageExistsResult.recordset.length === 0) {
        // Terminar transacción antes de devolver error
        await transaction.rollback();
        
        console.log(`⚠️ No se encontró imagen con ID ${imagenId} para actualizar`);
        return res.status(404).json({
          success: false,
          message: 'Imagen no encontrada'
        });
      }
      
      // Obtener los datos actuales para mantenerlos si no se proporcionan nuevos
      const currentData = imageExistsResult.recordset[0];
      const currentTipoImagen = currentData.TipoImagen || 'image/jpeg'; // Valor por defecto si es NULL
      const currentNombreArchivo = currentData.NombreArchivo || 'imagen.jpg'; // Valor por defecto si es NULL
      
      // PASO CRÍTICO 4: Construir y ejecutar la consulta de actualización
      let query = `UPDATE [dbo].[ForoImagenes] SET Titulo = @titulo, Descripcion = @descripcion`;
      
      // Preparar parámetros con valores actuales como respaldo
      const tipoImagenToUse = TipoImagen || (ImagenBase64 ? ImagenBase64.split(';')[0].split(':')[1] : currentTipoImagen);
      const nombreArchivoToUse = NombreArchivo || currentNombreArchivo;
      
      if (ImagenBase64) {
        query += `, ImagenBase64 = @imagenBase64`;
      }
      
      query += `, TipoImagen = @tipoImagen, NombreArchivo = @nombreArchivo, Orden = @orden WHERE Id = @id; SELECT @@ROWCOUNT AS affectedRows;`;
      
      // Ejecutar la consulta dentro de la transacción
      const updateRequest = new sql.Request(transaction);
      const result = await updateRequest
        .input('id', sql.Int, imagenId)
        .input('titulo', sql.NVarChar(100), Titulo)
        .input('descripcion', sql.NVarChar(255), Descripcion || null)
        .input('imagenBase64', sql.NVarChar(sql.MAX), ImagenBase64)
        .input('tipoImagen', sql.NVarChar(30), tipoImagenToUse)
        .input('nombreArchivo', sql.NVarChar(255), nombreArchivoToUse)
        .input('orden', sql.Int, Orden || null)
        .query(query);
      
      const affectedRows = result.recordset[0].affectedRows;
      
      if (affectedRows === 0) {
        // Caso raro pero posible: la fila fue eliminada entre la verificación y la actualización
        await transaction.rollback();
        
        console.log(`⚠️ No se actualizó ninguna fila con ID ${imagenId}`);
        return res.status(404).json({
          success: false,
          message: 'No se pudo actualizar la imagen, posiblemente fue eliminada'
        });
      }
      
      // Confirmar transacción
      await transaction.commit();
      
      console.log(`✅ Imagen del foro con ID ${imagenId} actualizada correctamente`);
      
      res.status(200).json({
        success: true,
        message: 'Imagen del foro actualizada correctamente'
      });
      
    } catch (transactionError) {
      // Si hay cualquier error durante la transacción, hacer rollback
      if (transaction._aborted) {
        console.log('La transacción ya fue abortada');
      } else {
        try {
          await transaction.rollback();
          console.log('Transacción revertida debido a un error en actualización');
        } catch (rollbackError) {
          console.error('Error al revertir la transacción de actualización:', rollbackError.message);
        }
      }
      
      throw transactionError; // Re-lanzar para manejarlo en el catch exterior
    }
    
  } catch (error) {
    console.error('❌ Error al actualizar imagen del foro:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al actualizar imagen del foro',
      error: error.message
    });
  }
});

// API para eliminar una imagen del foro
app.delete('/api/foroimagenes/:id', cors(), async (req, res) => {
  try {
    const imagenId = req.params.id;
    console.log(`🗑️ Eliminando imagen del foro con ID ${imagenId}...`);
    
    // Conectar a la base de datos
    const pool = await sql.connect(dbConfig);
    
    // Eliminar la imagen
    const result = await pool.request()
      .input('id', sql.Int, imagenId)
      .query(`
        DELETE FROM [dbo].[ForoImagenes]
        WHERE Id = @id;
        
        SELECT @@ROWCOUNT AS affectedRows;
      `);
    
    const affectedRows = result.recordset[0].affectedRows;
    
    if (affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Imagen no encontrada'
      });
    }
    
    console.log(`✅ Imagen del foro con ID ${imagenId} eliminada correctamente`);
    
    res.status(200).json({
      success: true,
      message: 'Imagen del foro eliminada correctamente'
    });
    
  } catch (error) {
    console.error('❌ Error al eliminar imagen del foro:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al eliminar imagen del foro',
      error: error.message
    });
  }
});

// ==========================================
// API PARA FORMULARIO DE EVALUACIÓN DE SEGURIDAD
// ==========================================

// Verificar si existe la tabla FormularioEvaluacionSeguridad y crearla si no existe
app.get('/api/setup/formulario-evaluacion', cors(), async (req, res) => {
  try {
    console.log('🔧 Verificando tabla FormularioEvaluacionSeguridad...');
    
    // Conectar a la base de datos
    const pool = await sql.connect(dbConfig);
    
    // Crear la tabla si no existe
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FormularioEvaluacionSeguridad]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[FormularioEvaluacionSeguridad] (
          [ID] INT IDENTITY(1,1) PRIMARY KEY,
          
          -- Datos de contacto
          [CorreoElectronico] NVARCHAR(255) NOT NULL,
          [NombreCompleto] NVARCHAR(255) NOT NULL,
          [Empresa] NVARCHAR(255) NOT NULL,
          [TelefonoContacto] NVARCHAR(50),
          
          -- Fecha y motor de BD
          [FechaPropuestaEvaluacion] DATE,
          [MotorBDOracle] BIT DEFAULT 0,
          [MotorBDSQLServer] BIT DEFAULT 0,
          [MotorBDMongoDB] BIT DEFAULT 0,
          [MotorBDOtros] NVARCHAR(255),
          
          -- Preguntas de evaluación
          [Pregunta1_Respuesta] TINYINT CHECK ([Pregunta1_Respuesta] BETWEEN 1 AND 4),
          [Pregunta2_Respuesta] TINYINT CHECK ([Pregunta2_Respuesta] BETWEEN 1 AND 4),
          [Pregunta3_Respuesta] TINYINT CHECK ([Pregunta3_Respuesta] BETWEEN 1 AND 4),
          [Pregunta4_Respuesta] BIT,
          [Pregunta5_Respuesta] BIT,
          [Pregunta6_Respuesta] BIT,
          
          -- Campos de auditoría
          [FechaCreacion] DATETIME2 DEFAULT GETDATE(),
          [FechaModificacion] DATETIME2 DEFAULT GETDATE(),
          [UsuarioCreacion] NVARCHAR(100) DEFAULT SYSTEM_USER
        );
        
        -- Crear índices
        CREATE INDEX IX_FormularioEvaluacion_CorreoElectronico 
        ON [dbo].[FormularioEvaluacionSeguridad] ([CorreoElectronico]);
        
        CREATE INDEX IX_FormularioEvaluacion_Empresa 
        ON [dbo].[FormularioEvaluacionSeguridad] ([Empresa]);
        
        CREATE INDEX IX_FormularioEvaluacion_FechaCreacion 
        ON [dbo].[FormularioEvaluacionSeguridad] ([FechaCreacion]);
        
        PRINT 'Tabla FormularioEvaluacionSeguridad creada correctamente'
      END
      ELSE
      BEGIN
        PRINT 'La tabla FormularioEvaluacionSeguridad ya existe'
      END
    `);
    
    console.log('✅ Tabla FormularioEvaluacionSeguridad verificada/creada correctamente');
    
    res.status(200).json({
      success: true,
      message: 'Tabla FormularioEvaluacionSeguridad verificada/creada correctamente'
    });
    
  } catch (error) {
    console.error('❌ Error al verificar/crear tabla FormularioEvaluacionSeguridad:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al verificar/crear tabla FormularioEvaluacionSeguridad',
      error: error.message
    });
  }
});

// API para crear una nueva evaluación de seguridad
app.post('/api/formulario-evaluacion', cors(), async (req, res) => {
  console.log('📨 Recibida petición POST a /api/formulario-evaluacion');
  console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
  
  try {
    const {
      correoElectronico,
      nombreCompleto,
      empresa,
      telefonoContacto,
      fechaPropuestaEvaluacion,
      motorBDOracle,
      motorBDSQLServer,
      motorBDMongoDB,
      motorBDOtros,
      pregunta1Respuesta,
      pregunta2Respuesta,
      pregunta3Respuesta,
      pregunta4Respuesta,
      pregunta5Respuesta,
      pregunta6Respuesta
    } = req.body;
    
    // Validación básica de campos obligatorios
    if (!correoElectronico || !nombreCompleto || !empresa) {
      console.log('❌ Validación fallida: Datos obligatorios incompletos');
      return res.status(400).json({ 
        success: false, 
        message: 'Los campos correo electrónico, nombre completo y empresa son obligatorios' 
      });
    }
    
    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correoElectronico)) {
      console.log('❌ Validación fallida: Formato de email inválido');
      return res.status(400).json({ 
        success: false, 
        message: 'El formato del correo electrónico no es válido' 
      });
    }
    
    // Validar respuestas de preguntas (deben estar en el rango correcto)
    if (pregunta1Respuesta && (pregunta1Respuesta < 1 || pregunta1Respuesta > 4)) {
      return res.status(400).json({ 
        success: false, 
        message: 'La respuesta de la pregunta 1 debe estar entre 1 y 4' 
      });
    }
    
    if (pregunta2Respuesta && (pregunta2Respuesta < 1 || pregunta2Respuesta > 4)) {
      return res.status(400).json({ 
        success: false, 
        message: 'La respuesta de la pregunta 2 debe estar entre 1 y 4' 
      });
    }
    
    if (pregunta3Respuesta && (pregunta3Respuesta < 1 || pregunta3Respuesta > 4)) {
      return res.status(400).json({ 
        success: false, 
        message: 'La respuesta de la pregunta 3 debe estar entre 1 y 4' 
      });
    }
    
    console.log('✅ Validación de datos correcta');
    
    // Guardar en la base de datos
    console.log('Intentando guardar datos en la base de datos...');
    let insertedId = null;
    
    try {
      // Verificar/crear tabla primero
      const pool = await sql.connect(dbConfig);
      
      // Verificar si existe la tabla y crearla si no existe
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FormularioEvaluacionSeguridad]') AND type in (N'U'))
        BEGIN
          CREATE TABLE [dbo].[FormularioEvaluacionSeguridad] (
            [ID] INT IDENTITY(1,1) PRIMARY KEY,
            [CorreoElectronico] NVARCHAR(255) NOT NULL,
            [NombreCompleto] NVARCHAR(255) NOT NULL,
            [Empresa] NVARCHAR(255) NOT NULL,
            [TelefonoContacto] NVARCHAR(50),
            [FechaPropuestaEvaluacion] DATE,
            [MotorBDOracle] BIT DEFAULT 0,
            [MotorBDSQLServer] BIT DEFAULT 0,
            [MotorBDMongoDB] BIT DEFAULT 0,
            [MotorBDOtros] NVARCHAR(255),
            [Pregunta1_Respuesta] TINYINT CHECK ([Pregunta1_Respuesta] BETWEEN 1 AND 4),
            [Pregunta2_Respuesta] TINYINT CHECK ([Pregunta2_Respuesta] BETWEEN 1 AND 4),
            [Pregunta3_Respuesta] TINYINT CHECK ([Pregunta3_Respuesta] BETWEEN 1 AND 4),
            [Pregunta4_Respuesta] BIT,
            [Pregunta5_Respuesta] BIT,
            [Pregunta6_Respuesta] BIT,
            [FechaCreacion] DATETIME2 DEFAULT GETDATE(),
            [FechaModificacion] DATETIME2 DEFAULT GETDATE(),
            [UsuarioCreacion] NVARCHAR(100) DEFAULT SYSTEM_USER
          );
          
          CREATE INDEX IX_FormularioEvaluacion_CorreoElectronico 
          ON [dbo].[FormularioEvaluacionSeguridad] ([CorreoElectronico]);
          
          PRINT 'Tabla FormularioEvaluacionSeguridad creada correctamente'
        END
      `);
      
      // Insertar los datos
      const result = await pool.request()
        .input('correoElectronico', sql.NVarChar(255), correoElectronico)
        .input('nombreCompleto', sql.NVarChar(255), nombreCompleto)
        .input('empresa', sql.NVarChar(255), empresa)
        .input('telefonoContacto', sql.NVarChar(50), telefonoContacto || null)
        .input('fechaPropuestaEvaluacion', sql.Date, fechaPropuestaEvaluacion || null)
        .input('motorBDOracle', sql.Bit, motorBDOracle ? 1 : 0)
        .input('motorBDSQLServer', sql.Bit, motorBDSQLServer ? 1 : 0)
        .input('motorBDMongoDB', sql.Bit, motorBDMongoDB ? 1 : 0)
        .input('motorBDOtros', sql.NVarChar(255), motorBDOtros || null)
        .input('pregunta1Respuesta', sql.TinyInt, pregunta1Respuesta || null)
        .input('pregunta2Respuesta', sql.TinyInt, pregunta2Respuesta || null)
        .input('pregunta3Respuesta', sql.TinyInt, pregunta3Respuesta || null)
        .input('pregunta4Respuesta', sql.Bit, pregunta4Respuesta !== undefined ? (pregunta4Respuesta ? 1 : 0) : null)
        .input('pregunta5Respuesta', sql.Bit, pregunta5Respuesta !== undefined ? (pregunta5Respuesta ? 1 : 0) : null)
        .input('pregunta6Respuesta', sql.Bit, pregunta6Respuesta !== undefined ? (pregunta6Respuesta ? 1 : 0) : null)
        .query(`
          INSERT INTO [dbo].[FormularioEvaluacionSeguridad] 
            ([CorreoElectronico], [NombreCompleto], [Empresa], [TelefonoContacto], 
             [FechaPropuestaEvaluacion], [MotorBDOracle], [MotorBDSQLServer], [MotorBDMongoDB], [MotorBDOtros],
             [Pregunta1_Respuesta], [Pregunta2_Respuesta], [Pregunta3_Respuesta], 
             [Pregunta4_Respuesta], [Pregunta5_Respuesta], [Pregunta6_Respuesta]) 
          VALUES 
            (@correoElectronico, @nombreCompleto, @empresa, @telefonoContacto,
             @fechaPropuestaEvaluacion, @motorBDOracle, @motorBDSQLServer, @motorBDMongoDB, @motorBDOtros,
             @pregunta1Respuesta, @pregunta2Respuesta, @pregunta3Respuesta,
             @pregunta4Respuesta, @pregunta5Respuesta, @pregunta6Respuesta);
          SELECT SCOPE_IDENTITY() AS id;
        `);
      
      insertedId = result.recordset[0].id;
      console.log(`✅ Evaluación de seguridad guardada correctamente en la base de datos con ID: ${insertedId}`);
    } catch (dbError) {
      console.error('❌ Error al guardar en la base de datos:');
      console.error(`Mensaje: ${dbError.message}`);
      console.error('Continuando con el envío de correo...');
    }
    
    // Función auxiliar para obtener texto descriptivo de las respuestas
    const getTextoRespuesta = (pregunta, valor) => {
      if (valor === null || valor === undefined) return 'Sin respuesta';
      
      switch (pregunta) {
        case 1:
        case 2:
          const textos = {
            1: {
              1: 'Sí, contamos con políticas y herramientas específicas',
              2: 'Parcialmente, algunos controles están implementados',
              3: 'No, confiamos en configuraciones básicas del motor de base de datos',
              4: 'No estoy seguro'
            },
            2: {
              1: 'Sí, de forma automatizada y con reportes periódicos',
              2: 'Lo hacemos ocasionalmente o de forma manual',
              3: 'No realizamos este tipo de actividades',
              4: 'No estoy seguro'
            }
          };
          return textos[pregunta][valor] || 'Respuesta inválida';
        case 3:
          const textos3 = {
            1: 'Alto interés: es una prioridad para este año',
            2: 'Interés medio: lo estamos evaluando para el mediano plazo',
            3: 'Bajo interés: no es una prioridad actualmente',
            4: 'No aplica / no tengo información'
          };
          return textos3[valor] || 'Respuesta inválida';
        case 4:
        case 5:
        case 6:
          return valor ? 'Sí' : 'No';
        default:
          return 'Sin respuesta';
      }
    };
    
    // Obtener lista de motores de BD seleccionados
    const motoresBD = [];
    if (motorBDOracle) motoresBD.push('Oracle');
    if (motorBDSQLServer) motoresBD.push('SQL Server');
    if (motorBDMongoDB) motoresBD.push('MongoDB');
    if (motorBDOtros) motoresBD.push(`Otros: ${motorBDOtros}`);
    
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
            max-width: 700px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
          }
          .header {
            background-color: #0170B9;
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
          .section {
            margin-bottom: 30px;
            border-bottom: 2px solid #f0f0f0;
            padding-bottom: 20px;
          }
          .section:last-child {
            border-bottom: none;
          }
          .section-title {
            font-size: 18px;
            font-weight: 600;
            color: #0170B9;
            margin-bottom: 15px;
          }
          .field {
            margin-bottom: 15px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .label {
            font-weight: 600;
            color: #666;
            margin-right: 15px;
            min-width: 200px;
          }
          .value {
            flex: 1;
            text-align: right;
            color: #212121;
          }
          .question {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 15px;
            border-left: 4px solid #0170B9;
          }
          .question-title {
            font-weight: 600;
            color: #0170B9;
            margin-bottom: 8px;
          }
          .question-answer {
            color: #333;
          }
          .footer {
            background-color: #f1f1f1;
            padding: 15px;
            text-align: center;
            font-size: 14px;
            color: #666;
          }
          .motors-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }
          .motor-tag {
            background-color: #e7f3ff;
            color: #0170B9;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 Nueva Evaluación de Seguridad de BD</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Formulario de Evaluación de Seguridad</p>
          </div>
          <div class="content">
            <p>Se ha recibido una nueva respuesta al formulario de evaluación de seguridad de bases de datos.</p>
            
            <div class="section">
              <div class="section-title">👤 Información de Contacto</div>
              <div class="field">
                <span class="label">Nombre completo:</span>
                <span class="value">${nombreCompleto}</span>
              </div>
              <div class="field">
                <span class="label">Correo electrónico:</span>
                <span class="value">${correoElectronico}</span>
              </div>
              <div class="field">
                <span class="label">Empresa:</span>
                <span class="value">${empresa}</span>
              </div>
              ${telefonoContacto ? `
              <div class="field">
                <span class="label">Teléfono:</span>
                <span class="value">${telefonoContacto}</span>
              </div>
              ` : ''}
              ${fechaPropuestaEvaluacion ? `
              <div class="field">
                <span class="label">Fecha propuesta:</span>
                <span class="value">${new Date(fechaPropuestaEvaluacion).toLocaleDateString('es-CL')}</span>
              </div>
              ` : ''}
            </div>
            
            <div class="section">
              <div class="section-title">💾 Motores de Base de Datos</div>
              <div class="field">
                <span class="label">Motores seleccionados:</span>
                <div class="value">
                  <div class="motors-list">
                    ${motoresBD.length > 0 ? motoresBD.map(motor => `<span class="motor-tag">${motor}</span>`).join('') : '<span class="motor-tag">No especificado</span>'}
                  </div>
                </div>
              </div>
            </div>
            
            <div class="section">
              <div class="section-title">📋 Respuestas de Evaluación</div>
              
              <div class="question">
                <div class="question-title">1. ¿Su organización cuenta con controles específicos de acceso y gestión de privilegios para bases de datos?</div>
                <div class="question-answer">${getTextoRespuesta(1, pregunta1Respuesta)}</div>
              </div>
              
              <div class="question">
                <div class="question-title">2. ¿Realizan evaluaciones periódicas de vulnerabilidades en sus bases de datos?</div>
                <div class="question-answer">${getTextoRespuesta(2, pregunta2Respuesta)}</div>
              </div>
              
              <div class="question">
                <div class="question-title">3. ¿Cuál es su nivel de interés en implementar una auditoría de seguridad en bases de datos?</div>
                <div class="question-answer">${getTextoRespuesta(3, pregunta3Respuesta)}</div>
              </div>
              
              <div class="question">
                <div class="question-title">4. ¿Cuenta con mecanismos para limitar la exposición de datos sensibles en producción?</div>
                <div class="question-answer">${getTextoRespuesta(4, pregunta4Respuesta)}</div>
              </div>
              
              <div class="question">
                <div class="question-title">5. ¿Implementa protección de datos sensibles en ambientes no productivos?</div>
                <div class="question-answer">${getTextoRespuesta(5, pregunta5Respuesta)}</div>
              </div>
              
              <div class="question">
                <div class="question-title">6. ¿Su organización comparte información sensible con terceros?</div>
                <div class="question-answer">${getTextoRespuesta(6, pregunta6Respuesta)}</div>
              </div>
            </div>
          </div>
          <div class="footer">
            <p>ORASYSTEM - Especialistas en Consultoría & Administración IT</p>
            <p>Este mensaje ha sido generado automáticamente el ${new Date().toLocaleDateString('es-CL')} a las ${new Date().toLocaleTimeString('es-CL')}</p>
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
      cc: 'seguridad@orasystem.cl', // Copia al área de seguridad
      subject: `🔒 Nueva Evaluación de Seguridad BD - ${empresa}`,
      html: htmlTemplate
    };
    
    console.log(`De: ${mailOptions.from}`);
    console.log(`Para: ${mailOptions.to}`);
    console.log(`CC: ${mailOptions.cc}`);
    console.log(`Asunto: ${mailOptions.subject}`);
    console.log('Intentando enviar correo...');

    // Enviar el correo
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Correo enviado correctamente');
    console.log('ID del mensaje:', info.messageId);
    console.log('Respuesta del servidor:', info.response);

    res.status(200).json({ 
      success: true, 
      message: 'Evaluación de seguridad enviada correctamente',
      data: { id: insertedId }
    });
    
  } catch (error) {
    console.error('❌ Error al procesar formulario de evaluación:');
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
      message: 'Error al procesar el formulario de evaluación',
      error: error.message
    });
  }
});

// API para obtener todas las evaluaciones de seguridad
app.get('/api/formulario-evaluacion', cors(), async (req, res) => {
  console.log('📥 Recibida petición GET a /api/formulario-evaluacion');
  
  try {
    const pool = await sql.connect(dbConfig);
    
    // Verificar si la tabla existe
    const tableExists = await pool.request()
      .query(`
        SELECT COUNT(*) as count
        FROM sys.objects 
        WHERE object_id = OBJECT_ID(N'[dbo].[FormularioEvaluacionSeguridad]') AND type in (N'U')
      `);
    
    if (tableExists.recordset[0].count === 0) {
      console.log('⚠️ La tabla FormularioEvaluacionSeguridad no existe');
      return res.status(404).json({
        success: false,
        message: 'La tabla de evaluaciones no existe. Use /api/setup/formulario-evaluacion para crearla.',
        data: []
      });
    }
    
    const result = await pool.request()
      .query(`
        SELECT 
          ID,
          CorreoElectronico,
          NombreCompleto,
          Empresa,
          TelefonoContacto,
          FechaPropuestaEvaluacion,
          MotorBDOracle,
          MotorBDSQLServer,
          MotorBDMongoDB,
          MotorBDOtros,
          Pregunta1_Respuesta,
          Pregunta2_Respuesta,
          Pregunta3_Respuesta,
          Pregunta4_Respuesta,
          Pregunta5_Respuesta,
          Pregunta6_Respuesta,
          FechaCreacion,
          FechaModificacion,
          UsuarioCreacion
        FROM [dbo].[FormularioEvaluacionSeguridad] 
        ORDER BY [FechaCreacion] DESC
      `);
    
    console.log(`✅ Recuperadas ${result.recordset.length} evaluaciones de seguridad de la base de datos`);
    
    res.status(200).json({
      success: true,
      data: result.recordset,
      count: result.recordset.length
    });
  } catch (error) {
    console.error('❌ Error al obtener evaluaciones de seguridad:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al obtener las evaluaciones de seguridad',
      error: error.message
    });
  }
});

// API para obtener una evaluación específica por ID
app.get('/api/formulario-evaluacion/:id', cors(), async (req, res) => {
  console.log(`📥 Recibida petición GET a /api/formulario-evaluacion/${req.params.id}`);
  
  try {
    const evaluacionId = req.params.id;
    
    // Validar que el ID sea un número
    if (!/^\d+$/.test(evaluacionId)) {
      return res.status(400).json({
        success: false,
        message: 'El ID de la evaluación debe ser un número'
      });
    }
    
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('id', sql.Int, evaluacionId)
      .query(`
        SELECT 
          ID,
          CorreoElectronico,
          NombreCompleto,
          Empresa,
          TelefonoContacto,
          FechaPropuestaEvaluacion,
          MotorBDOracle,
          MotorBDSQLServer,
          MotorBDMongoDB,
          MotorBDOtros,
          Pregunta1_Respuesta,
          Pregunta2_Respuesta,
          Pregunta3_Respuesta,
          Pregunta4_Respuesta,
          Pregunta5_Respuesta,
          Pregunta6_Respuesta,
          FechaCreacion,
          FechaModificacion,
          UsuarioCreacion
        FROM [dbo].[FormularioEvaluacionSeguridad] 
        WHERE [ID] = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Evaluación no encontrada'
      });
    }
    
    console.log(`✅ Evaluación encontrada para ID ${evaluacionId}`);
    
    res.status(200).json({
      success: true,
      data: result.recordset[0]
    });
    
  } catch (error) {
    console.error('❌ Error al obtener la evaluación:');
    console.error(`Mensaje: ${error.message}`);
    
    res.status(500).json({
      success: false,
      message: 'Error al obtener la evaluación',
      error: error.message
    });
  }
});

// Iniciar el servidor solo si se ejecuta directamente (no en Azure)
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor Express iniciado en puerto ${PORT}`);
    console.log(`📧 Correo configurado para: servicio@orasystem.cl`);
    console.log(`🗄️ Base de datos: ${dbConfig.database} en ${dbConfig.server}`);
  }).on('error', (err) => {
    console.error('Error al iniciar el servidor:', err.message);
  });
}

// Exportar la app para Azure y otras plataformas
module.exports = app; 