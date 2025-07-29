#!/usr/bin/env node

const sql = require('mssql');
const net = require('net');
const dns = require('dns');
const { promisify } = require('util');
const { execSync } = require('child_process');

// Configuraciones a probar
const configurations = [
  {
    name: 'Configuración original',
    config: {
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
    }
  },
  {
    name: 'Con trustServerCertificate true',
    config: {
      server: 'securityorasystem.database.windows.net',
      database: 'OrasystemSecurity',
      user: 'administrador',
      password: 'Admin123.',
      options: {
        encrypt: true,
        trustServerCertificate: true,
        port: 1433,
        connectTimeout: 30000,
        requestTimeout: 30000
      }
    }
  },
  {
    name: 'Sin encriptación',
    config: {
      server: 'securityorasystem.database.windows.net',
      database: 'OrasystemSecurity',
      user: 'administrador',
      password: 'Admin123.',
      options: {
        encrypt: false,
        port: 1433,
        connectTimeout: 30000,
        requestTimeout: 30000
      }
    }
  }
];

console.log('🐧 DIAGNÓSTICO ESPECÍFICO PARA ORACLE LINUX');
console.log('═══════════════════════════════════════════════════════════');

async function checkSystemRequirements() {
  console.log('\n🔧 Verificando requisitos del sistema...');
  
  try {
    // Verificar versión de OpenSSL
    const opensslVersion = execSync('openssl version', { encoding: 'utf8' }).trim();
    console.log(`🔐 OpenSSL: ${opensslVersion}`);
    
    // Verificar conectividad básica a internet
    try {
      execSync('ping -c 1 google.com', { timeout: 5000 });
      console.log('🌐 Conectividad a internet: ✅');
    } catch {
      console.log('🌐 Conectividad a internet: ❌');
    }
    
    // Verificar si el puerto 1433 está bloqueado localmente
    try {
      execSync('ss -tuln | grep :1433', { encoding: 'utf8' });
      console.log('🔌 Puerto 1433 local: En uso');
    } catch {
      console.log('🔌 Puerto 1433 local: Libre');
    }
    
    // Verificar firewall
    try {
      const firewallStatus = execSync('systemctl status firewalld', { encoding: 'utf8' });
      if (firewallStatus.includes('active (running)')) {
        console.log('🔥 Firewall: Activo');
        try {
          const firewallRules = execSync('firewall-cmd --list-ports', { encoding: 'utf8' });
          console.log(`🔥 Puertos abiertos: ${firewallRules.trim()}`);
        } catch {
          console.log('🔥 No se pudieron obtener las reglas del firewall');
        }
      } else {
        console.log('🔥 Firewall: Inactivo');
      }
    } catch {
      console.log('🔥 Firewall: No disponible o no es firewalld');
    }
    
  } catch (error) {
    console.log(`❌ Error verificando requisitos: ${error.message}`);
  }
}

async function testNetworkConnectivity() {
  console.log('\n🌐 Probando conectividad de red...');
  
  try {
    // Resolver DNS
    const lookup = promisify(dns.lookup);
    const result = await lookup('securityorasystem.database.windows.net');
    console.log(`✅ DNS resuelto: ${result.address}`);
    
    // Probar conexión TCP al puerto 1433
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        console.log(`❌ Timeout conectando a ${result.address}:1433`);
        resolve(false);
      }, 10000);

      socket.connect(1433, result.address, () => {
        clearTimeout(timeout);
        console.log(`✅ Puerto 1433 accesible`);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        console.log(`❌ Error conectando: ${error.message}`);
        console.log(`🔧 Código: ${error.code}`);
        socket.destroy();
        resolve(false);
      });
    });
    
  } catch (error) {
    console.log(`❌ Error de red: ${error.message}`);
    return false;
  }
}

async function testSQLConfiguration(configName, dbConfig) {
  console.log(`\n🔍 Probando: ${configName}`);
  console.log('─'.repeat(50));
  
  try {
    console.log('⏳ Conectando...');
    const startTime = Date.now();
    const pool = await sql.connect(dbConfig);
    const duration = Date.now() - startTime;
    
    console.log(`✅ Conexión exitosa en ${duration}ms`);
    
    // Probar consulta
    const result = await pool.request().query('SELECT @@VERSION as Version');
    console.log('✅ Consulta exitosa');
    
    await pool.close();
    console.log('✅ Configuración funcionando correctamente');
    return true;
    
  } catch (error) {
    console.log('❌ Error de conexión:');
    console.log(`📝 Mensaje: ${error.message}`);
    console.log(`🔢 Código: ${error.code || 'No especificado'}`);
    console.log(`🎯 Tipo: ${error.constructor.name}`);
    
    // Análisis específico del error
    if (error.message.includes('certificate')) {
      console.log('💡 Sugerencia: Problema de certificado SSL/TLS');
    } else if (error.message.includes('current state')) {
      console.log('💡 Sugerencia: Base de datos pausada o IP no autorizada');
    } else if (error.message.includes('timeout')) {
      console.log('💡 Sugerencia: Problema de firewall o red');
    } else if (error.message.includes('ENOTFOUND')) {
      console.log('💡 Sugerencia: Problema de DNS');
    }
    
    return false;
  }
}

async function getCurrentIP() {
  console.log('\n🌍 Obteniendo IP externa...');
  try {
    const ip = execSync('curl -s ifconfig.me --connect-timeout 5', { encoding: 'utf8' }).trim();
    console.log(`🌍 Tu IP externa es: ${ip}`);
    console.log(`💡 Asegúrate de que esta IP esté autorizada en Azure SQL Server`);
    return ip;
  } catch (error) {
    console.log('❌ No se pudo obtener la IP externa');
    try {
      const ip = execSync('wget -qO- ifconfig.me --timeout=5', { encoding: 'utf8' }).trim();
      console.log(`🌍 Tu IP externa es: ${ip}`);
      return ip;
    } catch {
      console.log('❌ No se pudo obtener la IP con ningún método');
      return null;
    }
  }
}

async function runFullDiagnostic() {
  await checkSystemRequirements();
  await getCurrentIP();
  
  const networkOK = await testNetworkConnectivity();
  if (!networkOK) {
    console.log('\n❌ Problemas de conectividad básica detectados');
    console.log('💡 Verifica firewall local y conectividad a internet');
    return;
  }
  
  console.log('\n🧪 Probando diferentes configuraciones de SQL...');
  
  let workingConfig = null;
  for (const { name, config } of configurations) {
    const works = await testSQLConfiguration(name, config);
    if (works && !workingConfig) {
      workingConfig = { name, config };
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  if (workingConfig) {
    console.log(`🎉 ¡CONFIGURACIÓN EXITOSA ENCONTRADA!`);
    console.log(`✅ ${workingConfig.name} funciona correctamente`);
    console.log('\n📋 Usar esta configuración en tu aplicación:');
    console.log(JSON.stringify(workingConfig.config, null, 2));
  } else {
    console.log('❌ NINGUNA CONFIGURACIÓN FUNCIONÓ');
    console.log('\n💡 Soluciones sugeridas:');
    console.log('1. Agregar tu IP al firewall de Azure SQL Server');
    console.log('2. Verificar que las credenciales sean correctas');
    console.log('3. Contactar al administrador de Azure');
    console.log('4. Verificar que la base de datos no esté pausada');
  }
  console.log('═══════════════════════════════════════════════════════════');
}

runFullDiagnostic().catch(console.error); 