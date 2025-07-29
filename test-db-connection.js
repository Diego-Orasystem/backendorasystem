#!/usr/bin/env node

const sql = require('mssql');
const net = require('net');
const dns = require('dns');
const { promisify } = require('util');

// Configuración de la base de datos
const dbConfig = {
  server: 'securityorasystem.database.windows.net',
  database: 'OrasystemSecurity',
  user: 'administrador',
  password: 'Admin123.',
  options: {
    encrypt: true,
    trustServerCertificate: false,
    port: 1433,
    connectTimeout: 30000,
    requestTimeout: 30000
  }
};

console.log('🔍 DIAGNÓSTICO DE CONECTIVIDAD A AZURE SQL');
console.log('═══════════════════════════════════════════════════════════');

async function testDNSResolution() {
  console.log('\n1️⃣ Probando resolución DNS...');
  try {
    const lookup = promisify(dns.lookup);
    const result = await lookup(dbConfig.server);
    console.log(`✅ DNS resuelto: ${dbConfig.server} → ${result.address}`);
    return result.address;
  } catch (error) {
    console.log(`❌ Error DNS: ${error.message}`);
    return null;
  }
}

async function testPortConnectivity(host) {
  console.log('\n2️⃣ Probando conectividad de puerto...');
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      console.log(`❌ Timeout conectando a ${host}:${dbConfig.options.port}`);
      resolve(false);
    }, 10000);

    socket.connect(dbConfig.options.port, host, () => {
      clearTimeout(timeout);
      console.log(`✅ Puerto ${dbConfig.options.port} accesible en ${host}`);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      console.log(`❌ Error conectando al puerto: ${error.message}`);
      console.log(`🔧 Código de error: ${error.code}`);
      socket.destroy();
      resolve(false);
    });
  });
}

async function testSQLConnection() {
  console.log('\n3️⃣ Probando conexión SQL...');
  try {
    console.log('⏳ Conectando a SQL Server...');
    console.log(`📍 Servidor: ${dbConfig.server}`);
    console.log(`🗄️ Base de datos: ${dbConfig.database}`);
    console.log(`👤 Usuario: ${dbConfig.user}`);
    console.log(`🔐 Encriptación: ${dbConfig.options.encrypt}`);
    console.log(`⏰ Timeout: ${dbConfig.options.connectTimeout}ms`);
    
    const pool = await sql.connect(dbConfig);
    console.log('✅ Conexión SQL exitosa!');
    
    // Probar una consulta simple
    const result = await pool.request().query('SELECT @@VERSION as Version, GETDATE() as CurrentTime');
    console.log('✅ Consulta de prueba exitosa:');
    console.log(`📊 Versión: ${result.recordset[0].Version}`);
    console.log(`🕐 Hora del servidor: ${result.recordset[0].CurrentTime}`);
    
    await pool.close();
    return true;
  } catch (error) {
    console.log('❌ Error en conexión SQL:');
    console.log(`📝 Mensaje: ${error.message}`);
    console.log(`🔢 Código: ${error.code || 'No especificado'}`);
    console.log(`🎯 Tipo: ${error.constructor.name}`);
    console.log(`📊 Número: ${error.number || 'No especificado'}`);
    console.log(`⚡ Estado: ${error.state || 'No especificado'}`);
    
    if (error.originalError) {
      console.log(`🔍 Error original:`, error.originalError);
    }
    
    return false;
  }
}

async function showSystemInfo() {
  console.log('\n4️⃣ Información del sistema...');
  console.log(`💻 Plataforma: ${process.platform}`);
  console.log(`🔧 Arquitectura: ${process.arch}`);
  console.log(`📦 Node.js: ${process.version}`);
  console.log(`🌐 Hostname: ${require('os').hostname()}`);
  
  // Intentar obtener la IP externa
  try {
    const { execSync } = require('child_process');
    const ip = execSync('curl -s ifconfig.me', { timeout: 5000 }).toString().trim();
    console.log(`🌍 IP externa: ${ip}`);
  } catch (error) {
    console.log(`🌍 IP externa: No se pudo obtener`);
  }
}

async function runDiagnostics() {
  await showSystemInfo();
  
  const resolvedIP = await testDNSResolution();
  if (!resolvedIP) {
    console.log('\n❌ No se puede resolver el DNS. Verifica tu conexión a internet.');
    return;
  }
  
  const portOpen = await testPortConnectivity(resolvedIP);
  if (!portOpen) {
    console.log('\n❌ No se puede conectar al puerto 1433.');
    console.log('💡 Posibles causas:');
    console.log('   - Firewall local bloqueando el puerto 1433');
    console.log('   - Firewall de Azure SQL no permite tu IP');
    console.log('   - ISP bloqueando el puerto 1433');
    return;
  }
  
  const sqlConnected = await testSQLConnection();
  
  console.log('\n═══════════════════════════════════════════════════════════');
  if (sqlConnected) {
    console.log('🎉 ¡TODAS LAS PRUEBAS EXITOSAS!');
  } else {
    console.log('❌ PROBLEMAS DETECTADOS');
    console.log('\n💡 Soluciones sugeridas:');
    console.log('1. Verificar que tu IP esté en el firewall de Azure SQL');
    console.log('2. Comprobar que las credenciales sean correctas');
    console.log('3. Verificar que la base de datos no esté pausada');
    console.log('4. Intentar con trustServerCertificate: true');
  }
  console.log('═══════════════════════════════════════════════════════════');
}

// Ejecutar diagnósticos
runDiagnostics().catch(console.error); 