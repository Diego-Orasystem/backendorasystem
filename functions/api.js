const express = require('express');
const serverless = require('serverless-http');
const app = require('../index'); // Importa la aplicación Express de index.js

// Exportar la aplicación envuelta con serverless-http
module.exports.handler = serverless(app); 