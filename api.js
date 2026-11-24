/*
 * Habla con el puente (Apps Script) y guarda en este celular la dirección y la clave.
 * Nada de esto va escrito en el código: se pide una vez en la pantalla de conexión.
 */
(function () {
  'use strict';

  var K_URL = 'finanzas_url';
  var K_CLAVE = 'finanzas_clave';
  var K_CACHE = 'finanzas_cache_';
  var memoria = {};

  function leer(k) {
    try {
      var v = localStorage.getItem(k);
      return v === null ? (memoria[k] || '') : v;
    } catch (e) {
      return memoria[k] || '';
    }
  }

  function escribir(k, v) {
    memoria[k] = v;
    try { localStorage.setItem(k, v); } catch (e) { /* se queda en memoria */ }
  }

  function borrar(k) {
    delete memoria[k];
    try { localStorage.removeItem(k); } catch (e) { /* nada */ }
  }

  // Solo se acepta la dirección de un puente de Apps Script, para no mandar la clave a otro sitio por error.
  function urlValida(u) {
    return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(u || ''));
  }

  function ErrorApi(codigo) {
    this.name = 'ErrorApi';
    this.codigo = codigo;
    this.message = codigo;
  }
  ErrorApi.prototype = Object.create(Error.prototype);

  function llamarCon(url, clave, accion, datos) {
    if (!urlValida(url) || !clave) return Promise.reject(new ErrorApi('sin_conexion'));
    var cuerpo = {};
    var k;
    for (k in (datos || {})) if (Object.prototype.hasOwnProperty.call(datos, k)) cuerpo[k] = datos[k];
    cuerpo.clave = clave;
    cuerpo.accion = accion;
    return fetch(url, {
      method: 'POST',
      // Texto simple: así el navegador no hace una consulta previa que Apps Script no responde.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo),
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then(function (resp) {
      return resp.text();
    }, function () {
      throw new ErrorApi('red');
    }).then(function (texto) {
      var j;
      try { j = JSON.parse(texto); } catch (e) { throw new ErrorApi('respuesta'); }
      if (!j || j.ok !== true) throw new ErrorApi((j && j.error) || 'respuesta');
      return j;
    });
  }

  window.Api = {
    ErrorApi: ErrorApi,
    urlValida: urlValida,

    conectado: function () {
      return urlValida(leer(K_URL)) && !!leer(K_CLAVE);
    },

    /** Prueba una dirección y una clave; solo las guarda si el puente responde bien. */
    conectar: function (url, clave, mes) {
      url = String(url || '').trim();
      clave = String(clave || '').trim();
      return llamarCon(url, clave, 'inicio', { mes: mes }).then(function (datos) {
        escribir(K_URL, url);
        escribir(K_CLAVE, clave);
        return datos;
      });
    },

    desconectar: function () {
      borrar(K_URL);
      borrar(K_CLAVE);
      try {
        var quitar = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(K_CACHE) === 0) quitar.push(k);
        }
        quitar.forEach(function (k2) { localStorage.removeItem(k2); });
      } catch (e) { /* nada */ }
    },

    inicio: function (mes) {
      return llamarCon(leer(K_URL), leer(K_CLAVE), 'inicio', { mes: mes });
    },

    ponerCategoria: function (id, categoria, recordar) {
      return llamarCon(leer(K_URL), leer(K_CLAVE), 'ponerCategoria',
        { id: id, categoria: categoria, recordar: !!recordar });
    },

    ajustarSaldo: function (saldoReal, nota) {
      return llamarCon(leer(K_URL), leer(K_CLAVE), 'ajustarSaldo',
        { saldo_real: saldoReal, nota: nota || '' });
    },

    guardarCache: function (mes, datos) {
      try { localStorage.setItem(K_CACHE + mes, JSON.stringify(datos)); } catch (e) { /* nada */ }
    },

    leerCache: function (mes) {
      try {
        var t = localStorage.getItem(K_CACHE + mes);
        return t ? JSON.parse(t) : null;
      } catch (e) {
        return null;
      }
    }
  };
})();
