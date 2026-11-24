/* Pantallas de la app. Todo texto que viene de los correos se pinta con textContent, nunca como HTML. */
(function () {
  'use strict';

  var ZONA = 'America/Bogota';
  var MEDIA_HORA = 30 * 60 * 1000;

  function $(id) { return document.getElementById(id); }

  var NOMBRES_TIPO = {
    compra_debito: 'Compra',
    retiro: 'Retiro',
    transferencia_recibida: 'Transferencia recibida',
    transferencia_enviada: 'Transferencia enviada',
    llave_enviada: 'Envío por llave',
    llave_recibida: 'Recibido por llave',
    pago_qr: 'Pago con QR',
    nomina: 'Nómina',
    pago_recibido: 'Pago recibido',
    consignacion: 'Consignación',
    pago_pse: 'Pago PSE',
    pago_proveedor: 'Pago de proveedor',
    ajuste: 'Ajuste de saldo',
    desconocido: 'Correo sin entender'
  };

  var MENSAJES_ERROR = {
    clave: 'La clave no coincide con la del puente.',
    red: 'No se pudo llegar al puente. Revisa tu conexión a internet.',
    respuesta: 'El puente respondió algo inesperado. Revisa que al publicarlo, en "Quién tiene acceso", esté "Cualquier usuario".',
    sin_conexion: 'Falta la dirección del puente o la clave.',
    categoria_invalida: 'Esa categoría no sirve. Usa hasta 30 letras y no empieces con símbolos.',
    movimiento_no_existe: 'Ese movimiento ya no está en la hoja.',
    movimiento_no_editable: 'A ese movimiento no se le puede poner categoría.',
    saldo_invalido: 'Ese saldo no es un número válido.',
    falta_saldo_inicial: 'Primero pon el saldo inicial en la hoja (menú Finanzas).',
    interno: 'El puente tuvo un error. Intenta de nuevo en un minuto.'
  };

  var estado = {
    mes: mesActual(),
    datos: null,
    fresco: false,       // true si los datos acaban de llegar del puente
    guardadoEn: 0,       // cuándo se guardaron los datos que se están mostrando
    vista: 'resumen',
    filtro: 'todos',
    cargando: false,
    ultimaCarga: 0,
    movimiento: null,
    categoria: ''
  };

  // ---------- Fechas y plata ----------

  function partes(fecha, opciones) {
    var o = {};
    new Intl.DateTimeFormat('en-CA', Object.assign({ timeZone: ZONA }, opciones))
      .formatToParts(fecha).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }

  function mesActual() {
    var p = partes(new Date(), { year: 'numeric', month: '2-digit' });
    return p.year + '-' + p.month;
  }

  function moverMes(mes, delta) {
    var a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7)) - 1 + delta;
    var f = new Date(Date.UTC(a, m, 15));
    return f.getUTCFullYear() + '-' + String(f.getUTCMonth() + 1).padStart(2, '0');
  }

  function nombreMes(mes) {
    var f = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 15));
    var t = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(f);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  var fmtPlata = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  function plata(n) { return fmtPlata.format(n); }

  function hora(ms) {
    return new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date(ms));
  }

  function fechaCorta(ms) {
    return new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, day: 'numeric', month: 'short' })
      .format(new Date(ms)) + ', ' + hora(ms);
  }

  /** Por ejemplo "13 oct, 15:12". */
  function fechaCompacta(ms) {
    var p = {};
    new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, day: 'numeric', month: 'short' })
      .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return p.day + ' ' + String(p.month || '').replace('.', '') + ', ' + hora(ms);
  }

  function claveDia(ms) {
    var p = partes(new Date(ms), { year: 'numeric', month: '2-digit', day: '2-digit' });
    return p.year + '-' + p.month + '-' + p.day;
  }

  function nombreDia(ms) {
    var t = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' })
      .format(new Date(ms));
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // ---------- Utilidades de pantalla ----------

  function el(etiqueta, clase, texto) {
    var e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }

  function vaciar(nodo) { while (nodo.firstChild) nodo.removeChild(nodo.firstChild); }

  var relojFlotante = null;
  function flotante(texto) {
    var f = $('aviso-flotante');
    f.textContent = texto;
    f.hidden = false;
    clearTimeout(relojFlotante);
    relojFlotante = setTimeout(function () { f.hidden = true; }, 3500);
  }

  function mensajeError(e) {
    var codigo = (e && e.codigo) || 'respuesta';
    return MENSAJES_ERROR[codigo] || MENSAJES_ERROR.respuesta;
  }

  function mostrarError(id, texto) {
    var p = $(id);
    p.textContent = texto || '';
    p.hidden = !texto;
  }

  function mostrarPantalla(conectado) {
    $('conexion').hidden = conectado;
    $('app').hidden = !conectado;
  }

  // ---------- Íconos ----------

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ICONOS = {
    entra: [['path', { d: 'M17 7 7 17M7 9v8h8' }]],
    sale: [['path', { d: 'M7 17 17 7M9 7h8v8' }]],
    compra: [['path', { d: 'M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.4a1 1 0 0 0 1-.8L19.5 7H6.2' }],
      ['circle', { cx: 9.5, cy: 19, r: 1.4 }], ['circle', { cx: 16.5, cy: 19, r: 1.4 }]],
    efectivo: [['rect', { x: 3, y: 6.5, width: 18, height: 11, rx: 2 }], ['circle', { cx: 12, cy: 12, r: 2.5 }]],
    duda: [['circle', { cx: 12, cy: 12, r: 9 }],
      ['path', { d: 'M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.4-1 .9-1 1.7M12 16.6v.1' }]],
    ajuste: [['path', { d: 'M4 7h10M18 7h2M4 17h4M12 17h8' }],
      ['circle', { cx: 16, cy: 7, r: 2 }], ['circle', { cx: 10, cy: 17, r: 2 }]]
  };

  function svg(etiqueta, attrs) {
    var e = document.createElementNS(SVG_NS, etiqueta);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  function icono(nombre) {
    var s = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    ICONOS[nombre].forEach(function (p) { s.appendChild(svg(p[0], p[1])); });
    return s;
  }

  function iconoDe(m) {
    if (m.estado === 'por_revisar') return 'duda';
    if (m.tipo === 'ajuste') return 'ajuste';
    if (m.tipo === 'retiro') return 'efectivo';
    if (m.tipo === 'compra_debito' || m.tipo === 'pago_qr') return 'compra';
    return m.sentido === 'ingreso' ? 'entra' : 'sale';
  }

  // ---------- Gráficas ----------

  var SIN_CATEGORIA = 'Sin categoría';
  var COLORES = ['#4F46E5', '#F59E0B', '#0EA5A4', '#A5B4FC', '#DB2777'];
  var COLOR_SIN = '#C4C9D2';
  var COLOR_OTRAS = '#8B93A1';

  /** Da un color a cada categoría: las 5 mayores con color propio, el resto en gris. */
  function coloresDe(cats) {
    var mapa = {}, usados = 0;
    cats.forEach(function (c) {
      if (c.categoria === SIN_CATEGORIA) mapa[c.categoria] = COLOR_SIN;
      else if (usados < COLORES.length) mapa[c.categoria] = COLORES[usados++];
      else mapa[c.categoria] = COLOR_OTRAS;
    });
    return mapa;
  }

  function pintarDona(cats, total, colores) {
    var caja = $('dona');
    vaciar(caja);
    $('dona-caja').hidden = !(total > 0);
    if (!(total > 0)) return;
    $('dona-total').textContent = plata(total);

    // Junta en un solo trozo todo lo que comparte el gris de "otras".
    var trozos = [], otras = 0;
    cats.forEach(function (c) {
      if (colores[c.categoria] === COLOR_OTRAS) otras += c.total;
      else trozos.push({ color: colores[c.categoria], valor: c.total, nombre: c.categoria });
    });
    if (otras > 0) trozos.push({ color: COLOR_OTRAS, valor: otras, nombre: 'Otras' });

    var radio = 74, largo = 2 * Math.PI * radio;
    var hueco = trozos.length > 1 ? 2 : 0;
    var dibujo = svg('svg', { viewBox: '0 0 190 190', role: 'img' });
    dibujo.setAttribute('aria-label', 'Gastos por categoría: ' + trozos.map(function (t) {
      return t.nombre + ' ' + Math.round(t.valor / total * 100) + '%';
    }).join(', '));
    var grupo = svg('g', { transform: 'rotate(-90 95 95)' });
    var acumulado = 0;
    trozos.forEach(function (t) {
      var tramo = t.valor / total * largo;
      grupo.appendChild(svg('circle', {
        cx: 95, cy: 95, r: radio, stroke: t.color,
        'stroke-dasharray': Math.max(0.5, tramo - hueco).toFixed(2) + ' ' + largo.toFixed(2),
        'stroke-dashoffset': (-acumulado).toFixed(2)
      }));
      acumulado += tramo;
    });
    dibujo.appendChild(grupo);
    caja.appendChild(dibujo);
  }

  function pintarBalance(ingresos, gastos) {
    var barra = $('balance'), texto = $('balance-texto');
    var suma = ingresos + gastos;
    barra.hidden = texto.hidden = !(suma > 0);
    if (!(suma > 0)) return;
    var parte = Math.round(ingresos / suma * 100);
    if (ingresos > 0 && gastos > 0) parte = Math.min(97, Math.max(3, parte));
    $('balance-ingresos').style.width = parte + '%';
    $('balance-ingresos').hidden = !(ingresos > 0);
    $('balance-gastos').hidden = !(gastos > 0);
    var frase = ingresos >= gastos
      ? 'Entró ' + plata(ingresos - gastos) + ' más de lo que salió.'
      : 'Salió ' + plata(gastos - ingresos) + ' más de lo que entró.';
    texto.textContent = frase;
    barra.setAttribute('aria-label', frase);
  }

  function pintarDias(movs, mes) {
    var caja = $('grafica-dias');
    vaciar(caja);
    var anio = Number(mes.slice(0, 4)), numMes = Number(mes.slice(5, 7));
    var dias = new Date(Date.UTC(anio, numMes, 0)).getUTCDate();
    var porDia = [];
    for (var i = 0; i < dias; i++) porDia.push(0);
    movs.forEach(function (m) {
      if (m.estado !== 'ok' || m.sentido !== 'gasto' || typeof m.monto !== 'number') return;
      var dia = Number(claveDia(m.fecha).slice(8, 10));
      if (dia >= 1 && dia <= dias) porDia[dia - 1] += m.monto;
    });
    var mayor = Math.max.apply(null, porDia);
    $('dias-caja').hidden = !(mayor > 0);
    if (!(mayor > 0)) return;
    var diaMayor = porDia.indexOf(mayor) + 1;

    var paso = 10, alto = 60;
    var dibujo = svg('svg', { viewBox: '0 0 ' + (dias * paso) + ' 76', role: 'img' });
    porDia.forEach(function (v, idx) {
      var h = v > 0 ? Math.max(3, v / mayor * 56) : 2;
      dibujo.appendChild(svg('rect', {
        x: idx * paso + 2, y: (alto - h).toFixed(1), width: 6, height: h.toFixed(1), rx: 2,
        fill: v > 0 ? (idx + 1 === diaMayor ? '#4F46E5' : '#A5B4FC') : '#E5E7EB'
      }));
      var d = idx + 1;
      if (d === 1 || d % 5 === 0) {
        var t = svg('text', { x: idx * paso + 5, y: 73, 'text-anchor': 'middle' });
        t.textContent = String(d);
        dibujo.appendChild(t);
      }
    });
    var frase = 'El día de más gasto fue el ' + diaMayor + ': ' + plata(mayor) + '.';
    dibujo.setAttribute('aria-label', 'Gastos por día del mes. ' + frase);
    caja.appendChild(dibujo);
    $('dias-texto').textContent = frase;
  }

  // ---------- Pintar ----------

  function esSinCategoria(m) {
    return m.estado === 'ok' && !!m.sentido && (!m.categoria || m.categoria === SIN_CATEGORIA);
  }

  function pintar() {
    var d = estado.datos;
    $('mes-nombre').textContent = nombreMes(estado.mes);
    $('mes-despues').disabled = estado.mes >= mesActual();
    if (!d) {
      $('saldo').textContent = '—';
      $('saldo-pie').textContent = estado.cargando ? 'Cargando…' : '';
      return;
    }

    // Saldo
    $('saldo').textContent = (typeof d.saldo === 'number') ? plata(d.saldo) : '—';
    var pie = '';
    if (typeof d.saldo !== 'number') pie = 'Falta poner el saldo inicial en la hoja (menú Finanzas).';
    else if (d.ultima_lectura) pie = 'Correo leído por última vez: ' + fechaCorta(d.ultima_lectura);
    $('saldo-pie').textContent = pie;

    // Avisos
    var avisos = $('avisos');
    vaciar(avisos);
    if (!estado.fresco && estado.guardadoEn) {
      avisos.appendChild(el('p', 'aviso', 'Sin conexión con el puente. Estos son los datos guardados el ' +
        fechaCorta(estado.guardadoEn) + '.'));
    }
    if (estado.fresco && (!d.ultima_lectura || (d.ahora - d.ultima_lectura) > MEDIA_HORA)) {
      avisos.appendChild(el('p', 'aviso alerta',
        'El robot lleva más de 30 minutos sin leer el correo. Revisa la hoja (menú Finanzas).'));
    }
    if (d.por_revisar > 0) {
      avisos.appendChild(el('p', 'aviso',
        (d.por_revisar === 1
          ? 'Hay 1 correo que el robot no entendió. No cambia el saldo; sale'
          : 'Hay ' + d.por_revisar + ' correos que el robot no entendió. No cambian el saldo; salen') +
        ' en Movimientos como "Por revisar".'));
    }

    // Resumen: totales y gráficas
    var movs = d.movimientos || [];
    var cats = d.resumen.por_categoria || [];
    $('total-ingresos').textContent = plata(d.resumen.ingresos);
    $('total-gastos').textContent = plata(d.resumen.gastos);
    pintarBalance(d.resumen.ingresos, d.resumen.gastos);

    var colores = coloresDe(cats);
    pintarDona(cats, d.resumen.gastos, colores);
    var lista = $('lista-categorias');
    vaciar(lista);
    cats.forEach(function (c) {
      var li = el('li');
      var punto = el('span', 'cat-punto');
      punto.style.background = colores[c.categoria];
      li.appendChild(punto);
      li.appendChild(el('span', 'cat-nombre', c.categoria));
      li.appendChild(el('span', 'cat-porcentaje',
        d.resumen.gastos > 0 ? Math.round(c.total / d.resumen.gastos * 100) + '%' : ''));
      li.appendChild(el('span', 'cat-total', plata(c.total)));
      lista.appendChild(li);
    });
    $('sin-gastos').hidden = cats.length > 0;
    pintarDias(movs, d.mes);

    var ultimos = $('ultimos');
    vaciar(ultimos);
    movs.slice(0, 3).forEach(function (m) { ultimos.appendChild(filaMovimiento(m, true)); });
    $('sin-ultimos').hidden = movs.length > 0;
    $('ver-todos').hidden = movs.length === 0;

    // Movimientos, con filtro y agrupados por día
    var cuantosSin = movs.filter(esSinCategoria).length;
    var cuantosRevisar = movs.filter(function (m) { return m.estado === 'por_revisar'; }).length;
    Array.prototype.forEach.call($('filtros').children, function (b) {
      var f = b.getAttribute('data-filtro');
      var activo = f === estado.filtro;
      b.classList.toggle('elegido', activo);
      b.setAttribute('aria-pressed', activo ? 'true' : 'false');
      if (f === 'sin') b.textContent = 'Sin categoría' + (cuantosSin ? ' (' + cuantosSin + ')' : '');
      if (f === 'revisar') b.textContent = 'Por revisar' + (cuantosRevisar ? ' (' + cuantosRevisar + ')' : '');
    });
    var visibles = movs.filter(function (m) {
      if (estado.filtro === 'sin') return esSinCategoria(m);
      if (estado.filtro === 'revisar') return m.estado === 'por_revisar';
      return true;
    });
    var caja = $('lista-movimientos');
    vaciar(caja);
    var diaActual = '', ul = null;
    visibles.forEach(function (m) {
      var dia = claveDia(m.fecha);
      if (dia !== diaActual) {
        diaActual = dia;
        caja.appendChild(el('h2', 'dia', nombreDia(m.fecha)));
        ul = el('ul', 'filas');
        caja.appendChild(ul);
      }
      ul.appendChild(filaMovimiento(m, false));
    });
    $('sin-movimientos').hidden = visibles.length > 0;

    $('estado-conexion').textContent = estado.fresco
      ? 'Conectado. Datos recibidos a las ' + hora(estado.ultimaCarga) + '.'
      : 'Sin conexión con el puente en este momento.';
  }

  function filaMovimiento(m, conFecha) {
    var li = el('li');
    var b = el('button', 'mov');
    b.type = 'button';
    var porRevisar = m.estado === 'por_revisar';

    var caja = el('span', 'mov-icono' + (porRevisar ? ' revisar' : (m.sentido === 'ingreso' ? ' ingreso' : '')));
    caja.appendChild(icono(iconoDe(m)));
    b.appendChild(caja);

    var izq = el('div', 'mov-izq');
    izq.appendChild(el('span', 'mov-nombre', m.contraparte || NOMBRES_TIPO[m.tipo] || 'Movimiento'));
    // En "Últimos movimientos" va la fecha; en la lista por día, el tipo y la hora.
    // Si no hay comercio ni persona, el nombre ya es el tipo: no se repite.
    var meta = conFecha ? fechaCompacta(m.fecha)
      : (m.contraparte ? (NOMBRES_TIPO[m.tipo] || m.tipo) + ', ' + hora(m.fecha) : hora(m.fecha));
    izq.appendChild(el('span', 'mov-meta', meta));
    b.appendChild(izq);

    var der = el('div', 'mov-der');
    if (typeof m.monto === 'number') {
      var signo = m.sentido === 'ingreso' ? '+ ' : (m.sentido === 'gasto' ? '− ' : '');
      der.appendChild(el('span', 'mov-monto ' + (m.sentido || 'neutro'), signo + plata(m.monto)));
    }
    if (porRevisar) {
      der.appendChild(el('span', 'marca revisar', 'Por revisar'));
    } else {
      var sinCat = !m.categoria || m.categoria === SIN_CATEGORIA;
      der.appendChild(el('span', 'marca' + (sinCat ? ' sin' : ''), sinCat ? SIN_CATEGORIA : m.categoria));
    }
    b.appendChild(der);

    b.addEventListener('click', function () {
      if (porRevisar) abrirTexto(m); else abrirCategoria(m);
    });
    li.appendChild(b);
    return li;
  }

  // ---------- Cargar datos ----------

  function cargar(silencioso) {
    if (estado.cargando) return Promise.resolve();
    estado.cargando = true;
    $('btn-actualizar').classList.add('girando');
    var mes = estado.mes;

    // Primero lo guardado en el celular, para mostrar algo al instante.
    if (!estado.datos || estado.datos.mes !== mes) {
      var guardado = Api.leerCache(mes);
      estado.datos = guardado ? guardado.datos : null;
      estado.guardadoEn = guardado ? guardado.cuando : 0;
      estado.fresco = false;
    }
    pintar();

    return Api.inicio(mes).then(function (datos) {
      if (mes !== estado.mes) return;
      estado.datos = datos;
      estado.fresco = true;
      estado.ultimaCarga = Date.now();
      estado.guardadoEn = estado.ultimaCarga;
      Api.guardarCache(mes, { cuando: estado.ultimaCarga, datos: datos });
    }).catch(function (e) {
      if (e && e.codigo === 'clave') {
        mostrarPantalla(false);
        mostrarError('conexion-error', 'La clave dejó de funcionar. Escribe la dirección y la clave otra vez.');
        return;
      }
      estado.fresco = false;
      if (!silencioso) flotante(mensajeError(e));
    }).then(function () {
      estado.cargando = false;
      $('btn-actualizar').classList.remove('girando');
      pintar();
    });
  }

  // ---------- Categoría ----------

  function abrirCategoria(m) {
    if (!m.sentido) return;
    estado.movimiento = m;
    estado.categoria = (m.categoria && m.categoria !== SIN_CATEGORIA) ? m.categoria : '';
    $('cat-titulo').textContent = m.contraparte || 'Categoría';
    $('cat-detalle').textContent = (NOMBRES_TIPO[m.tipo] || m.tipo) + ' · ' +
      (typeof m.monto === 'number' ? plata(m.monto) : '') + ' · ' + fechaCorta(m.fecha);
    $('cat-nueva').value = '';
    $('cat-recordar').checked = true;
    var fijo = (m.tipo === 'retiro' || m.tipo === 'ajuste');
    $('cat-recordar').parentNode.hidden = fijo;
    mostrarError('cat-error', '');
    pintarChips();
    $('dlg-categoria').showModal();
  }

  function pintarChips() {
    var caja = $('cat-opciones');
    vaciar(caja);
    var lista = (estado.datos && estado.datos.categorias) || [];
    lista.forEach(function (c) {
      var b = el('button', 'chip' + (c === estado.categoria ? ' elegido' : ''), c);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', c === estado.categoria ? 'true' : 'false');
      b.addEventListener('click', function () {
        estado.categoria = c;
        $('cat-nueva').value = '';
        pintarChips();
      });
      caja.appendChild(b);
    });
  }

  function guardarCategoria(ev) {
    ev.preventDefault();
    var m = estado.movimiento;
    if (!m) return;
    var nueva = $('cat-nueva').value.replace(/\s+/g, ' ').trim();
    var categoria = nueva || estado.categoria;
    if (!categoria) return mostrarError('cat-error', 'Elige una categoría o escribe una nueva.');
    if (categoria.length > 30) return mostrarError('cat-error', 'Usa máximo 30 letras.');
    var boton = $('cat-guardar');
    boton.disabled = true;
    Api.ponerCategoria(m.id, categoria, $('cat-recordar').checked).then(function (r) {
      $('dlg-categoria').close();
      flotante(r.cambiados > 1
        ? 'Listo. Se cambiaron ' + r.cambiados + ' movimientos de ese mismo comercio o persona.'
        : 'Categoría guardada.');
      return cargar(true);
    }).catch(function (e) {
      mostrarError('cat-error', mensajeError(e));
    }).then(function () {
      boton.disabled = false;
    });
  }

  function abrirTexto(m) {
    $('texto-correo').textContent = m.texto || 'No hay texto guardado para este correo.';
    $('dlg-texto').showModal();
  }

  // ---------- Ajustes ----------

  function numeroEscrito(texto) {
    var limpio = String(texto || '').replace(/[^\d]/g, '');
    return limpio ? Number(limpio) : null;
  }

  function pintarDiferencia() {
    var n = numeroEscrito($('ajuste-saldo').value);
    var p = $('ajuste-diferencia');
    var saldo = estado.datos && estado.datos.saldo;
    if (n === null || typeof saldo !== 'number') { p.hidden = true; return; }
    var dif = n - saldo;
    p.textContent = dif === 0
      ? 'Es igual al saldo de la app. No hay nada que ajustar.'
      : 'Diferencia con el saldo de la app: ' + (dif > 0 ? '+ ' : '− ') + plata(Math.abs(dif)) + '.';
    p.hidden = false;
  }

  function guardarAjuste(ev) {
    ev.preventDefault();
    mostrarError('ajuste-error', '');
    var n = numeroEscrito($('ajuste-saldo').value);
    if (n === null) return mostrarError('ajuste-error', 'Escribe el saldo real, solo números.');
    if (!window.confirm('¿Ajustar el saldo de la app a ' + plata(n) + '?')) return;
    var boton = $('ajuste-guardar');
    boton.disabled = true;
    Api.ajustarSaldo(n, $('ajuste-nota').value.trim()).then(function (r) {
      $('ajuste-saldo').value = '';
      $('ajuste-nota').value = '';
      $('ajuste-diferencia').hidden = true;
      $('dlg-ajustes').close();
      flotante(r.creado ? 'Saldo ajustado.' : 'El saldo ya era ese. No se creó ningún ajuste.');
      return cargar(true);
    }).catch(function (e) {
      mostrarError('ajuste-error', mensajeError(e));
    }).then(function () {
      boton.disabled = false;
    });
  }

  // ---------- Exportar ----------

  function celdaCsv(v) {
    var t = (v === null || v === undefined) ? '' : String(v);
    // Para que Excel no tome un texto como fórmula.
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return '"' + t.replace(/"/g, '""') + '"';
  }

  function exportar() {
    var d = estado.datos;
    if (!d || !d.movimientos || !d.movimientos.length) return flotante('No hay movimientos para exportar en este mes.');
    var filas = [['Fecha', 'Hora', 'Tipo', 'Sentido', 'Monto', 'Comercio o persona', 'Categoría', 'Estado']
      .map(celdaCsv).join(';')];
    d.movimientos.slice().reverse().forEach(function (m) {
      var p = partes(new Date(m.fecha), { year: 'numeric', month: '2-digit', day: '2-digit' });
      filas.push([
        celdaCsv(p.day + '/' + p.month + '/' + p.year),
        celdaCsv(hora(m.fecha)),
        celdaCsv(NOMBRES_TIPO[m.tipo] || m.tipo),
        celdaCsv(m.sentido),
        (typeof m.monto === 'number') ? String(Math.round(m.monto)) : '',
        celdaCsv(m.contraparte),
        celdaCsv(m.categoria),
        celdaCsv(m.estado === 'ok' ? 'ok' : 'por revisar')
      ].join(';'));
    });
    var nombre = 'finanzas-' + d.mes + '.csv';
    var blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var archivo = null;
    try { archivo = new File([blob], nombre, { type: 'text/csv' }); } catch (e) { archivo = null; }
    if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      navigator.share({ files: [archivo], title: nombre }).catch(function () { /* canceló */ });
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  // ---------- Conexión ----------

  function conectar(ev) {
    ev.preventDefault();
    mostrarError('conexion-error', '');
    var url = $('campo-url').value.trim();
    var clave = $('campo-clave').value.trim();
    if (!Api.urlValida(url)) {
      return mostrarError('conexion-error',
        'La dirección debe empezar por https://script.google.com/macros/s/ y terminar en /exec.');
    }
    if (!clave) return mostrarError('conexion-error', 'Escribe la clave.');
    var boton = $('btn-conectar');
    boton.disabled = true;
    boton.textContent = 'Probando…';
    Api.conectar(url, clave, estado.mes).then(function (datos) {
      $('campo-clave').value = '';
      estado.datos = datos;
      estado.fresco = true;
      estado.ultimaCarga = Date.now();
      estado.guardadoEn = estado.ultimaCarga;
      Api.guardarCache(estado.mes, { cuando: estado.ultimaCarga, datos: datos });
      mostrarPantalla(true);
      pintar();
    }).catch(function (e) {
      mostrarError('conexion-error', mensajeError(e));
    }).then(function () {
      boton.disabled = false;
      boton.textContent = 'Probar y conectar';
    });
  }

  function desconectar() {
    if (!window.confirm('¿Borrar de este celular la dirección y la clave? Tus datos en la hoja no se tocan.')) return;
    Api.desconectar();
    estado.datos = null;
    $('dlg-ajustes').close();
    mostrarPantalla(false);
  }

  // ---------- Arranque ----------

  function cambiarVista(vista) {
    estado.vista = vista;
    $('vista-resumen').hidden = vista !== 'resumen';
    $('vista-movimientos').hidden = vista !== 'movimientos';
    // En Movimientos se esconde el saldo para que la lista tenga toda la pantalla.
    $('app').classList.toggle('solo-lista', vista === 'movimientos');
    $('tab-resumen').classList.toggle('activa', vista === 'resumen');
    $('tab-movimientos').classList.toggle('activa', vista === 'movimientos');
    window.scrollTo(0, 0);
  }

  function cambiarMes(delta) {
    var nuevo = moverMes(estado.mes, delta);
    if (nuevo > mesActual()) return;
    estado.mes = nuevo;
    estado.datos = null;
    cargar(true);
  }

  function cerrarAlTocarFuera(dlg) {
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) dlg.close(); });
  }

  function iniciar() {
    $('form-conexion').addEventListener('submit', conectar);
    $('btn-actualizar').addEventListener('click', function () { cargar(false); });
    $('btn-ajustes').addEventListener('click', function () {
      mostrarError('ajuste-error', '');
      pintarDiferencia();
      $('dlg-ajustes').showModal();
    });
    $('ajustes-cerrar').addEventListener('click', function () { $('dlg-ajustes').close(); });
    $('texto-cerrar').addEventListener('click', function () { $('dlg-texto').close(); });
    $('cat-cancelar').addEventListener('click', function () { $('dlg-categoria').close(); });
    $('form-categoria').addEventListener('submit', guardarCategoria);
    $('cat-nueva').addEventListener('input', function () {
      if ($('cat-nueva').value.trim()) { estado.categoria = ''; pintarChips(); }
    });
    $('form-ajuste').addEventListener('submit', guardarAjuste);
    $('ajuste-saldo').addEventListener('input', pintarDiferencia);
    $('btn-exportar').addEventListener('click', exportar);
    $('btn-desconectar').addEventListener('click', desconectar);
    $('tab-resumen').addEventListener('click', function () { cambiarVista('resumen'); });
    $('tab-movimientos').addEventListener('click', function () { cambiarVista('movimientos'); });
    $('mes-antes').addEventListener('click', function () { cambiarMes(-1); });
    $('mes-despues').addEventListener('click', function () { cambiarMes(1); });
    $('ver-todos').addEventListener('click', function () { cambiarVista('movimientos'); });
    Array.prototype.forEach.call($('filtros').children, function (b) {
      b.addEventListener('click', function () { estado.filtro = b.getAttribute('data-filtro'); pintar(); });
    });
    ['dlg-categoria', 'dlg-texto', 'dlg-ajustes'].forEach(function (id) { cerrarAlTocarFuera($(id)); });

    // Se actualiza sola al volver a la app.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Api.conectado() && Date.now() - estado.ultimaCarga > 60000) {
        estado.mes = estado.mes > mesActual() ? mesActual() : estado.mes;
        cargar(true);
      }
    });

    if (Api.conectado()) {
      mostrarPantalla(true);
      cargar(false);
    } else {
      mostrarPantalla(false);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* la app funciona igual sin esto */ });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
