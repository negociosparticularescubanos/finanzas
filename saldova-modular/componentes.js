/* Saldova modular — piezas visuales compartidas como Web Components.
 * Se escriben UNA vez aquí y todos los módulos las usan iguales:
 * imposible que un módulo se vea distinto de otro. */

/* Indicador de conexión con la base de datos (regla de Leonardo:
 * verde si hay conexión, rojo si no, comprobado contra la base real).
 * Estados: conectada (verde), arrancando (ámbar), ocupada (ámbar),
 * error (rojo). */
class SaldovaIndicador extends HTMLElement {
    connectedCallback() {
        this.innerHTML =
            '<span class="punto" style="display:inline-block;width:11px;height:11px;border-radius:50%;' +
            'background:#C9A227;box-shadow:0 0 6px rgba(0,0,0,.35);vertical-align:-1px"></span> ' +
            '<span class="texto">Comprobando la base…</span>';
    }
    fijar(estado, texto) {
        const colores = { conectada: '#2FA84F', arrancando: '#C9A227', ocupada: '#E08A00', error: '#D33A2C' };
        const punto = this.querySelector('.punto');
        const txt = this.querySelector('.texto');
        if (punto) punto.style.background = colores[estado] || '#D33A2C';
        if (txt) txt.textContent = texto;
        this.dataset.estado = estado;
    }
}
customElements.define('saldova-indicador', SaldovaIndicador);

/* La cinta principal estilo Versat: orbe, título, botones de los
 * módulos y, a la derecha, el altavoz de sonidos y el indicador.
 * Al pulsar un módulo emite el evento «abrir-modulo» con su id. */
class SaldovaCinta extends HTMLElement {
    set modulos(lista) {
        this._modulos = lista || [];
        this.render();
    }
    get modulos() { return this._modulos || []; }
    connectedCallback() { this.render(); }
    render() {
        const botones = this.modulos.map((m) =>
            '<button type="button" class="modulo' + (m.activo ? '' : ' apagado') + '" data-id="' + m.id + '"' +
            (m.activo ? '' : ' disabled') + '>' +
            '<img src="' + (m.icono || 'icono.svg') + '" alt="">' +
            '<span>' + m.titulo + (m.activo ? '' : '<br><small>próximamente</small>') + '</span></button>'
        ).join('');
        this.innerHTML =
            '<div class="orbe" title="Saldova"></div>' +
            '<div class="botones">' + botones + '</div>' +
            '<div class="derecha">' +
            '<button type="button" class="sonido" title="Sonidos de la app">🔊</button>' +
            '<saldova-indicador></saldova-indicador>' +
            '</div>';
        this.querySelectorAll('button.modulo:not([disabled])').forEach((b) => {
            b.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('abrir-modulo', {
                    detail: { id: b.dataset.id }, bubbles: true,
                }));
            });
        });
        const snd = this.querySelector('button.sonido');
        snd.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('alternar-sonido', { bubbles: true }));
            snd.textContent = snd.textContent === '🔊' ? '🔇' : '🔊';
        });
    }
    get indicador() { return this.querySelector('saldova-indicador'); }
}
customElements.define('saldova-cinta', SaldovaCinta);

/* ===== Ficha del actor económico (fase 38) =====
 * La ficha completa del negocio se pide ANTES de crear la base
 * (asistente de arranque en la puerta) y vive en fiscal.meta.perfil.
 * Los campos cambian según el actor: lo común a los tres, más lo
 * propio de cada uno. El logo se reduce a 256 px y se guarda como
 * data URL dentro del documento: no sale del dispositivo. */
export const PERFIL_ACTORES = [
    { id: 'tcp', nombre: 'Trabajador por Cuenta Propia', corto: 'TCP', desc: 'Persona natural que ejerce una actividad autorizada por cuenta propia.' },
    { id: 'mipyme', nombre: 'MIPYME', corto: 'MIPYME', desc: 'Micro, pequeña o mediana empresa: S.U.R.L., S.A. o S.R.L., con socios y escritura notarial.' },
    { id: 'pdl', nombre: 'Proyecto de Desarrollo Local', corto: 'PDL', desc: 'Proyecto aprobado por el CAM, con fuentes de financiamiento del art. 43.1 del Decreto 174/2026.' },
];
export const PERFIL_PROVINCIAS = ['Pinar del Río', 'Artemisa', 'La Habana', 'Mayabeque', 'Matanzas', 'Cienfuegos', 'Villa Clara', 'Sancti Spíritus', 'Ciego de Ávila', 'Camagüey', 'Las Tunas', 'Holguín', 'Granma', 'Santiago de Cuba', 'Guantánamo', 'Isla de la Juventud'];
/* Las 14 fuentes del art. 43.1 del Decreto 174/2026, en el mismo
 * orden y con las mismas palabras que Fiscal (FUENTES). */
export const PERFIL_FUENTES_PDL = ['Fondo para el Desarrollo Local', 'Fondo de Fideicomiso', 'Fondos para proyectos de desarrollo local', 'Fondo del Gobierno Provincial', 'Fondo Nacional de Medio Ambiente', 'Fondo Nacional para el Desarrollo Forestal', 'Fondo Financiero de Ciencia e Innovación', 'Fondo financiero de programas de ciencia, tecnología e innovación', 'Fondo de la cooperación internacional', 'Recursos financieros propios de los actores locales', 'Créditos bancarios', 'Presupuesto del Estado', 'Otros recursos financieros del exterior', 'Cualquier otro fondo o recurso financiero'];
export function perfilActorNombre(actor) {
    const a = PERFIL_ACTORES.find((x) => x.id === actor);
    return a ? a.nombre : 'Actor económico';
}
function perfilEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function perfilIn(etiqueta, ruta, valor, tipo, attrs) {
    return '<label>' + etiqueta + '<input data-p="' + ruta + '" type="' + (tipo || 'text') + '" value="' + perfilEsc(valor) + '"' + (attrs || '') + '></label>';
}
function perfilSel(etiqueta, ruta, valor, opciones) {
    return '<label>' + etiqueta + '<select data-p="' + ruta + '">' + opciones.map((o) => '<option value="' + perfilEsc(o.v) + '"' + (String(valor) === String(o.v) ? ' selected' : '') + '>' + perfilEsc(o.t) + '</option>').join('') + '</select></label>';
}
function perfilChk(etiqueta, ruta, valor, nota) {
    return '<label style="display:block;margin:6px 0"><input data-p="' + ruta + '" type="checkbox"' + (valor ? ' checked' : '') + '> ' + etiqueta + (nota ? ' <span class="tenue">' + nota + '</span>' : '') + '</label>';
}
function perfilArea(etiqueta, ruta, valor, attrs) {
    return '<label>' + etiqueta + '<textarea data-p="' + ruta + '"' + (attrs || '') + '>' + perfilEsc(valor) + '</textarea></label>';
}
function perfilSocioFilaHTML(s) {
    s = s || {};
    return '<div class="perfil-socio" style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0">' +
        '<input data-socio="nombre" placeholder="Nombre del socio" value="' + perfilEsc(s.nombre) + '" style="flex:2;min-width:140px">' +
        '<input data-socio="ci" placeholder="Carnet de identidad" value="' + perfilEsc(s.ci) + '" style="flex:1;min-width:110px">' +
        '<input data-socio="porciento" type="number" min="0" max="100" step="0.01" placeholder="% participación" value="' + perfilEsc(s.porciento) + '" style="width:110px">' +
        '<button type="button" class="secundario chico perfilSocioDel">Quitar</button></div>';
}
export function perfilVacio(actor) {
    return { actor: actor || 'tcp', razon: '', nombreComercial: '', nit: '', telefono: '', correo: '', provincia: '', municipio: '', direccion: '', entreCalles: '', cp: '', inicioActividad: '', representante: { nombre: '', ci: '', cargo: '', telefono: '', correo: '' }, bancoCup: '', cuentaCup: '', bancoUsd: '', cuentaUsd: '', logo: '', qrPago: '', tcp: { actividad: '', regimen: 'general', licencia: '', codigoContribuyente: '', trabajadores: '', recienGraduado: false, zonaRural: false }, mipyme: { forma: 'S.U.R.L.', escrituraNumero: '', escrituraFecha: '', notaria: '', capitalSocial: '', objetoSocial: '', registroMercantilNumero: '', registroMercantilFecha: '', actividad: '', socios: [] }, pdl: { proyecto: '', entidadEjecutora: '', acuerdoNumero: '', acuerdoFecha: '', aporteCam: '', fuentes: [], responsableNombre: '', responsableCi: '', responsableTelefono: '', territorio: '', lineaEstrategica: '', duracionMeses: '', fechaInicio: '', fechaFin: '' } };
}
/* El formulario completo del perfil para un actor. Las secciones
 * comunes van primero; la sección propia del actor, al final. */
export function perfilFormHTML(actor, p) {
    p = Object.assign(perfilVacio(actor), p || {});
    p.representante = Object.assign({ nombre: '', ci: '', cargo: '', telefono: '', correo: '' }, p.representante || {});
    p.tcp = Object.assign({ actividad: '', regimen: 'general', licencia: '', codigoContribuyente: '', trabajadores: '', recienGraduado: false, zonaRural: false }, p.tcp || {});
    p.mipyme = Object.assign({ forma: 'S.U.R.L.', escrituraNumero: '', escrituraFecha: '', notaria: '', capitalSocial: '', objetoSocial: '', registroMercantilNumero: '', registroMercantilFecha: '', actividad: '', socios: [] }, p.mipyme || {});
    p.pdl = Object.assign({ proyecto: '', entidadEjecutora: '', acuerdoNumero: '', acuerdoFecha: '', aporteCam: '', fuentes: [], responsableNombre: '', responsableCi: '', responsableTelefono: '', territorio: '', lineaEstrategica: '', duracionMeses: '', fechaInicio: '', fechaFin: '' }, p.pdl || {});
    let h = '<div class="perfil-seccion"><h4>El negocio</h4>' +
        perfilIn('Razón social / nombre *', 'razon', p.razon) +
        perfilIn('Nombre comercial (si es distinto)', 'nombreComercial', p.nombreComercial) +
        perfilIn('NIT *', 'nit', p.nit) +
        perfilIn('Teléfono *', 'telefono', p.telefono, 'tel') +
        perfilIn('Correo electrónico', 'correo', p.correo, 'email') +
        perfilSel('Provincia', 'provincia', p.provincia, [{ v: '', t: '— Elige —' }].concat(PERFIL_PROVINCIAS.map((x) => ({ v: x, t: x })))) +
        perfilIn('Municipio *', 'municipio', p.municipio) +
        perfilIn('Dirección (calle y número)', 'direccion', p.direccion) +
        perfilIn('Entre calles', 'entreCalles', p.entreCalles) +
        perfilIn('Código postal', 'cp', p.cp) +
        perfilIn('Fecha de inicio de la actividad', 'inicioActividad', p.inicioActividad, 'date') +
        '</div><div class="perfil-seccion"><h4>Titular / representante legal</h4>' +
        perfilIn('Nombre y apellidos *', 'representante.nombre', p.representante.nombre) +
        perfilIn('Carnet de identidad *', 'representante.ci', p.representante.ci) +
        perfilIn('Cargo', 'representante.cargo', p.representante.cargo || (actor === 'tcp' ? 'Titular' : 'Representante legal')) +
        perfilIn('Teléfono del representante', 'representante.telefono', p.representante.telefono, 'tel') +
        perfilIn('Correo del representante', 'representante.correo', p.representante.correo, 'email') +
        '</div><div class="perfil-seccion"><h4>Cuentas bancarias</h4>' +
        perfilIn('Banco (cuenta en CUP)', 'bancoCup', p.bancoCup) +
        perfilIn('Número de cuenta en CUP', 'cuentaCup', p.cuentaCup) +
        perfilIn('Banco (cuenta en USD)', 'bancoUsd', p.bancoUsd) +
        perfilIn('Número de cuenta en USD', 'cuentaUsd', p.cuentaUsd) +
        '</div><div class="perfil-seccion"><h4>El logo</h4>' +
        '<p class="tenue">El logo sale en el lanzador, en la ficha del negocio y en los documentos que imprimas. Se guarda dentro de la base: no sale de tu dispositivo.</p>' +
        '<div class="perfil-logo" style="margin:6px 0">' + (p.logo ? '<img src="' + perfilEsc(p.logo) + '" alt="Logo del negocio" style="max-width:128px;max-height:128px;border:1px solid #8FA8C8;border-radius:6px;background:#fff">' : '<span class="tenue">Sin logo todavía</span>') + '</div>' +
        '<label>Subir el logo (imagen)<input type="file" accept="image/*" class="perfil-logo-input"></label> ' +
        '<button type="button" class="secundario chico perfil-logo-quitar">Quitar el logo</button></div>' +
        '<div class="perfil-seccion"><h4>El código QR de pago</h4>' +
        '<p class="tenue">El código QR de Transfermóvil o EnZona ligado a tu Cuenta Bancaria Fiscal: el que te dio el banco. Sale en cada factura para que el cliente lo escanee y pague. Se guarda dentro de la base: no sale de tu dispositivo.</p>' +
        '<div class="perfil-qr" style="margin:6px 0">' + (p.qrPago ? '<img src="' + perfilEsc(p.qrPago) + '" alt="Código QR de pago" style="max-width:160px;max-height:160px;border:1px solid #8FA8C8;border-radius:6px;background:#fff">' : '<span class="tenue">Sin código QR todavía</span>') + '</div>' +
        '<label>Subir el QR (imagen)<input type="file" accept="image/*" class="perfil-qr-input"></label> ' +
        '<button type="button" class="secundario chico perfil-qr-quitar">Quitar el QR</button></div>';
    if (actor === 'tcp') {
        h += '<div class="perfil-seccion"><h4>Lo propio del TCP</h4>' +
            perfilIn('Actividad principal *', 'tcp.actividad', p.tcp.actividad) +
            perfilSel('Régimen', 'tcp.regimen', p.tcp.regimen, [{ v: 'general', t: 'General' }, { v: 'gratificaciones', t: 'Gratificaciones (propinas)' }]) +
            perfilIn('N.º de licencia o permiso', 'tcp.licencia', p.tcp.licencia) +
            perfilIn('Código de contribuyente en la ONAT', 'tcp.codigoContribuyente', p.tcp.codigoContribuyente) +
            perfilIn('Trabajadores contratados', 'tcp.trabajadores', p.tcp.trabajadores, 'number', ' min="0" step="1"') +
            perfilChk('Recién graduado', 'tcp.recienGraduado', p.tcp.recienGraduado, '— exención de la cuota fija el primer año (Res. 271/2024, art. 14)') +
            perfilChk('Zona rural o de montaña aprobada por el CAM', 'tcp.zonaRural', p.tcp.zonaRural, '— cuota fija en 0 el primer año (Res. 271/2024, art. 15)') +
            '</div>';
    } else if (actor === 'mipyme') {
        h += '<div class="perfil-seccion"><h4>Lo propio de la MIPYME</h4>' +
            perfilSel('Forma jurídica', 'mipyme.forma', p.mipyme.forma, [{ v: 'S.U.R.L.', t: 'S.U.R.L. — Sociedad Unipersonal de Responsabilidad Limitada' }, { v: 'S.A.', t: 'S.A. — Sociedad Anónima' }, { v: 'S.R.L.', t: 'S.R.L. — Sociedad de Responsabilidad Limitada' }]) +
            perfilIn('Actividad principal *', 'mipyme.actividad', p.mipyme.actividad) +
            perfilIn('N.º de escritura notarial', 'mipyme.escrituraNumero', p.mipyme.escrituraNumero) +
            perfilIn('Fecha de la escritura', 'mipyme.escrituraFecha', p.mipyme.escrituraFecha, 'date') +
            perfilIn('Notaría', 'mipyme.notaria', p.mipyme.notaria) +
            perfilIn('Capital social (CUP)', 'mipyme.capitalSocial', p.mipyme.capitalSocial, 'number', ' min="0" step="0.01"') +
            perfilArea('Objeto social', 'mipyme.objetoSocial', p.mipyme.objetoSocial) +
            perfilIn('N.º de inscripción en el Registro Mercantil', 'mipyme.registroMercantilNumero', p.mipyme.registroMercantilNumero) +
            perfilIn('Fecha de inscripción', 'mipyme.registroMercantilFecha', p.mipyme.registroMercantilFecha, 'date') +
            '<h4 style="margin-top:10px">Socios</h4><div class="perfil-socios">' +
            (p.mipyme.socios.length ? p.mipyme.socios.map(perfilSocioFilaHTML).join('') : perfilSocioFilaHTML({})) +
            '</div><button type="button" class="secundario chico perfilSocioAdd">Añadir socio</button></div>';
    } else if (actor === 'pdl') {
        h += '<div class="perfil-seccion"><h4>Lo propio del PDL</h4>' +
            perfilIn('Nombre del proyecto *', 'pdl.proyecto', p.pdl.proyecto) +
            perfilIn('Entidad ejecutora', 'pdl.entidadEjecutora', p.pdl.entidadEjecutora) +
            perfilIn('N.º del acuerdo de aprobación (CAM)', 'pdl.acuerdoNumero', p.pdl.acuerdoNumero) +
            perfilIn('Fecha del acuerdo', 'pdl.acuerdoFecha', p.pdl.acuerdoFecha, 'date') +
            perfilIn('% de aporte al CAM', 'pdl.aporteCam', p.pdl.aporteCam, 'number', ' min="0" max="100" step="0.1"') +
            perfilIn('Territorio (municipio del proyecto)', 'pdl.territorio', p.pdl.territorio) +
            perfilIn('Línea estratégica de la EDM a la que responde', 'pdl.lineaEstrategica', p.pdl.lineaEstrategica) +
            perfilIn('Duración (meses)', 'pdl.duracionMeses', p.pdl.duracionMeses, 'number', ' min="0" step="1"') +
            perfilIn('Fecha de inicio del proyecto', 'pdl.fechaInicio', p.pdl.fechaInicio, 'date') +
            perfilIn('Fecha de fin del proyecto', 'pdl.fechaFin', p.pdl.fechaFin, 'date') +
            '<h4 style="margin-top:10px">Fuentes de financiamiento (art. 43.1)</h4>' +
            PERFIL_FUENTES_PDL.map((f) => perfilChk(f, 'pdl.fuentes', (p.pdl.fuentes || []).includes(f))).join('') +
            perfilIn('Responsable del proyecto (nombre)', 'pdl.responsableNombre', p.pdl.responsableNombre) +
            perfilIn('Carnet de identidad del responsable', 'pdl.responsableCi', p.pdl.responsableCi) +
            perfilIn('Teléfono del responsable', 'pdl.responsableTelefono', p.pdl.responsableTelefono, 'tel') +
            '</div>';
    }
    return h;
}
/* Lee el formulario y devuelve el perfil. Los números quedan como
 * número cuando hay valor; las fuentes del PDL, como lista. */
export function perfilLeerForm(actor, raiz) {
    const p = perfilVacio(actor);
    const poner = (ruta, valor) => {
        const partes = ruta.split('.');
        let o = p;
        for (let i = 0; i < partes.length - 1; i++) { o = o[partes[i]] = o[partes[i]] || {}; }
        o[partes[partes.length - 1]] = valor;
    };
    const numericos = { 'tcp.trabajadores': 1, 'mipyme.capitalSocial': 1, 'pdl.aporteCam': 1, 'pdl.duracionMeses': 1 };
    raiz.querySelectorAll('[data-p]').forEach((el) => {
        const ruta = el.dataset.p;
        if (el.type === 'checkbox') {
            if (ruta === 'pdl.fuentes') return; /* se recogen abajo, por el texto de la etiqueta */
            poner(ruta, el.checked);
            return;
        }
        const v = String(el.value == null ? '' : el.value).trim();
        poner(ruta, numericos[ruta] && v !== '' ? Number(v) : v);
    });
    /* Los checkbox de fuentes no llevan data-p con valor propio en
     * el HTML generado: el texto de la etiqueta ES la fuente. */
    if (actor === 'pdl') {
        p.pdl.fuentes = [];
        raiz.querySelectorAll('.perfil-seccion input[type="checkbox"]').forEach((el) => {
            if (!el.checked) return;
            const etiqueta = el.closest('label');
            const texto = etiqueta ? etiqueta.textContent.trim() : '';
            if (PERFIL_FUENTES_PDL.includes(texto)) p.pdl.fuentes.push(texto);
        });
    }
    if (actor === 'mipyme') {
        p.mipyme.socios = [];
        raiz.querySelectorAll('.perfil-socio').forEach((fila) => {
            const nombre = fila.querySelector('[data-socio="nombre"]').value.trim();
            if (!nombre) return;
            p.mipyme.socios.push({ nombre, ci: fila.querySelector('[data-socio="ci"]').value.trim(), porciento: fila.querySelector('[data-socio="porciento"]').value.trim() === '' ? '' : Number(fila.querySelector('[data-socio="porciento"]').value) });
        });
    }
    if (raiz._perfilLogo !== undefined) p.logo = raiz._perfilLogo || '';
    else { const img = raiz.querySelector('.perfil-logo img'); if (img) p.logo = img.getAttribute('src') || ''; }
    if (raiz._perfilQr !== undefined) p.qrPago = raiz._perfilQr || '';
    else { const img = raiz.querySelector('.perfil-qr img'); if (img) p.qrPago = img.getAttribute('src') || ''; }
    return p;
}
/* Lo mínimo para identificar el negocio y poder contactarlo. Todo
 * lo demás es opcional y se puede completar después en Fiscal. */
export function perfilValidar(p) {
    const faltan = [];
    if (!String(p.razon || '').trim()) faltan.push('la razón social');
    if (!String(p.nit || '').trim()) faltan.push('el NIT');
    if (!String(p.telefono || '').trim()) faltan.push('el teléfono');
    if (!String(p.municipio || '').trim()) faltan.push('el municipio');
    if (!String((p.representante || {}).nombre || '').trim()) faltan.push('el nombre del representante');
    if (!String((p.representante || {}).ci || '').trim()) faltan.push('el carnet del representante');
    if (p.actor === 'tcp' && !String((p.tcp || {}).actividad || '').trim()) faltan.push('la actividad principal');
    if (p.actor === 'mipyme' && !String((p.mipyme || {}).actividad || '').trim()) faltan.push('la actividad principal');
    if (p.actor === 'pdl' && !String((p.pdl || {}).proyecto || '').trim()) faltan.push('el nombre del proyecto');
    return faltan;
}
/* La ficha del negocio como tarjeta de presentación: logo, datos
 * de contacto y lo propio del actor. Se usa en el paso 3 del
 * asistente y en la tarjeta de Fiscal. */
export function perfilResumenHTML(p) {
    if (!p) return '<p class="tenue">Este negocio todavía no tiene ficha: complétala en Fiscal, tarjeta «Datos del negocio».</p>';
    const linea = (et, v) => (v === '' || v == null ? '' : '<div><b>' + et + ':</b> ' + perfilEsc(v) + '</div>');
    let h = '<div class="perfil-ficha" style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">';
    if (p.logo) h += '<img src="' + perfilEsc(p.logo) + '" alt="Logo" style="width:96px;height:96px;object-fit:contain;border:1px solid #8FA8C8;border-radius:8px;background:#fff;padding:4px">';
    h += '<div style="flex:1;min-width:220px"><div style="font-size:16px;font-weight:700">' + perfilEsc(p.razon || 'Sin nombre') + '</div>';
    h += '<div class="tenue">' + perfilEsc(perfilActorNombre(p.actor)) + (p.nombreComercial ? ' · ' + perfilEsc(p.nombreComercial) : '') + '</div>';
    h += linea('NIT', p.nit) + linea('Teléfono', p.telefono) + linea('Correo', p.correo);
    const dir = [p.direccion, p.entreCalles ? 'e/ ' + p.entreCalles : '', p.municipio, p.provincia, p.cp].filter(Boolean).join(', ');
    h += linea('Dirección', dir);
    h += linea('Inicio de actividad', p.inicioActividad);
    const r = p.representante || {};
    h += linea('Representante', [r.nombre, r.cargo].filter(Boolean).join(' — ') + (r.ci ? ' · CI ' + r.ci : '') + (r.telefono ? ' · ' + r.telefono : ''));
    h += linea('Cuenta CUP', (p.bancoCup ? p.bancoCup + ' · ' : '') + (p.cuentaCup || ''));
    h += linea('Cuenta USD', (p.bancoUsd ? p.bancoUsd + ' · ' : '') + (p.cuentaUsd || ''));
    if (p.actor === 'tcp' && p.tcp) {
        h += linea('Actividad', p.tcp.actividad) + linea('Régimen', p.tcp.regimen === 'gratificaciones' ? 'Gratificaciones (propinas)' : 'General');
        h += linea('Trabajadores', p.tcp.trabajadores === '' || p.tcp.trabajadores == null ? '' : String(p.tcp.trabajadores));
        const ben = [];
        if (p.tcp.recienGraduado) ben.push('Recién graduado');
        if (p.tcp.zonaRural) ben.push('Zona rural o de montaña');
        if (ben.length) h += '<div><b>Beneficios:</b> ' + perfilEsc(ben.join(' · ')) + '</div>';
    }
    if (p.actor === 'mipyme' && p.mipyme) {
        h += linea('Forma jurídica', p.mipyme.forma) + linea('Actividad', p.mipyme.actividad) + linea('Capital social', p.mipyme.capitalSocial === '' || p.mipyme.capitalSocial == null ? '' : String(p.mipyme.capitalSocial) + ' CUP');
        h += linea('Escritura', (p.mipyme.escrituraNumero ? 'N.º ' + p.mipyme.escrituraNumero : '') + (p.mipyme.escrituraFecha ? ' · ' + p.mipyme.escrituraFecha : '') + (p.mipyme.notaria ? ' · ' + p.mipyme.notaria : ''));
        h += linea('Registro Mercantil', (p.mipyme.registroMercantilNumero ? 'N.º ' + p.mipyme.registroMercantilNumero : '') + (p.mipyme.registroMercantilFecha ? ' · ' + p.mipyme.registroMercantilFecha : ''));
        if ((p.mipyme.socios || []).length) h += '<div><b>Socios:</b> ' + p.mipyme.socios.map((s) => perfilEsc(s.nombre + (s.porciento !== '' && s.porciento != null ? ' (' + s.porciento + ' %)' : ''))).join(' · ') + '</div>';
    }
    if (p.actor === 'pdl' && p.pdl) {
        h += linea('Proyecto', p.pdl.proyecto) + linea('Entidad ejecutora', p.pdl.entidadEjecutora);
        h += linea('Acuerdo CAM', (p.pdl.acuerdoNumero ? 'N.º ' + p.pdl.acuerdoNumero : '') + (p.pdl.acuerdoFecha ? ' · ' + p.pdl.acuerdoFecha : ''));
        h += linea('Aporte al CAM', p.pdl.aporteCam === '' || p.pdl.aporteCam == null ? '' : String(p.pdl.aporteCam) + ' %');
        h += linea('Territorio', p.pdl.territorio) + linea('Línea estratégica', p.pdl.lineaEstrategica);
        if ((p.pdl.fuentes || []).length) h += '<div><b>Fuentes:</b> ' + p.pdl.fuentes.map(perfilEsc).join(' · ') + '</div>';
    }
    return h + '</div></div>';
}
/* Reduce el logo a 256 px como máximo y lo devuelve como data URL
 * PNG. Rechaza lo que no sea imagen. */
export function perfilLogoReducir(file) {
    return new Promise((resolve, reject) => {
        if (!file || !/^image\//.test(file.type || '')) { reject(new Error('El logo tiene que ser una imagen')); return; }
        const lector = new FileReader();
        lector.onerror = () => reject(new Error('No se pudo leer el logo'));
        lector.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('Esa imagen no se pudo abrir'));
            img.onload = () => {
                const max = 256;
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > max || h > max) { const k = Math.min(max / w, max / h); w = Math.round(w * k); h = Math.round(h * k); }
                const cv = document.createElement('canvas');
                cv.width = w; cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(cv.toDataURL('image/png'));
            };
            img.src = lector.result;
        };
        lector.readAsDataURL(file);
    });
}
/* Cablea el logo y los socios dentro de un formulario ya pintado. */
export function perfilCablearForm(raiz, alCambiarLogo) {
    const img0 = raiz.querySelector('.perfil-logo img');
    raiz._perfilLogo = img0 ? img0.getAttribute('src') || '' : '';
    const entrada = raiz.querySelector('.perfil-logo-input');
    if (entrada) entrada.addEventListener('change', async () => {
        const f = entrada.files && entrada.files[0];
        if (!f) return;
        try {
            const url = await perfilLogoReducir(f);
            raiz._perfilLogo = url;
            const caja = raiz.querySelector('.perfil-logo');
            if (caja) caja.innerHTML = '<img src="' + perfilEsc(url) + '" alt="Logo del negocio" style="max-width:128px;max-height:128px;border:1px solid #8FA8C8;border-radius:6px;background:#fff">';
            if (alCambiarLogo) alCambiarLogo(url);
        } catch (e) { alert(String((e && e.message) || e)); }
    });
    const quitar = raiz.querySelector('.perfil-logo-quitar');
    if (quitar) quitar.addEventListener('click', () => {
        raiz._perfilLogo = '';
        const caja = raiz.querySelector('.perfil-logo');
        if (caja) caja.innerHTML = '<span class="tenue">Sin logo todavía</span>';
        if (entrada) entrada.value = '';
        if (alCambiarLogo) alCambiarLogo('');
    });
    /* Fase 29, bloque 2: el código QR de pago (misma reducción que el logo). */
    const imgQr0 = raiz.querySelector('.perfil-qr img');
    raiz._perfilQr = imgQr0 ? imgQr0.getAttribute('src') || '' : '';
    const entradaQr = raiz.querySelector('.perfil-qr-input');
    if (entradaQr) entradaQr.addEventListener('change', async () => {
        const f = entradaQr.files && entradaQr.files[0];
        if (!f) return;
        try {
            const url = await perfilLogoReducir(f);
            raiz._perfilQr = url;
            const caja = raiz.querySelector('.perfil-qr');
            if (caja) caja.innerHTML = '<img src="' + perfilEsc(url) + '" alt="Código QR de pago" style="max-width:160px;max-height:160px;border:1px solid #8FA8C8;border-radius:6px;background:#fff">';
        } catch (e) { alert(String((e && e.message) || e)); }
    });
    const quitarQr = raiz.querySelector('.perfil-qr-quitar');
    if (quitarQr) quitarQr.addEventListener('click', () => {
        raiz._perfilQr = '';
        const caja = raiz.querySelector('.perfil-qr');
        if (caja) caja.innerHTML = '<span class="tenue">Sin código QR todavía</span>';
        if (entradaQr) entradaQr.value = '';
    });
    const add = raiz.querySelector('.perfilSocioAdd');
    if (add) add.addEventListener('click', () => {
        const caja = raiz.querySelector('.perfil-socios');
        if (caja) caja.insertAdjacentHTML('beforeend', perfilSocioFilaHTML({}));
    });
    raiz.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('perfilSocioDel')) {
            const fila = e.target.closest('.perfil-socio');
            if (fila) fila.remove();
        }
    });
}
/* Leer un documento adjunto para guardarlo en la base: las imágenes
 * se reducen a 1024 px (JPEG) y los PDF se aceptan solo hasta 200 KB.
 * Todo lo demás se rechaza: la base local tiene tope de 3 MB. */
export function adjuntoLeer(file) {
    return new Promise((resolve, reject) => {
        if (!file) { reject(new Error('No hay archivo')); return; }
        if (/^image\//.test(file.type || '')) {
            const lector = new FileReader();
            lector.onerror = () => reject(new Error('No se pudo leer la imagen'));
            lector.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error('Esa imagen no se pudo abrir'));
                img.onload = () => {
                    const max = 1024;
                    let w = img.naturalWidth, h = img.naturalHeight;
                    if (w > max || h > max) { const k = Math.min(max / w, max / h); w = Math.round(w * k); h = Math.round(h * k); }
                    const cv = document.createElement('canvas');
                    cv.width = w; cv.height = h;
                    cv.getContext('2d').drawImage(img, 0, 0, w, h);
                    const url = cv.toDataURL('image/jpeg', 0.85);
                    if (url.length > 250000) reject(new Error('La imagen sigue siendo muy grande para la base'));
                    else resolve({ nombre: file.name, mime: 'image/jpeg', datos: url });
                };
                img.src = lector.result;
            };
            lector.readAsDataURL(file);
            return;
        }
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
            if (file.size > 200000) { reject(new Error('El PDF pasa de 200 KB: no cabe en la base')); return; }
            const lector = new FileReader();
            lector.onerror = () => reject(new Error('No se pudo leer el PDF'));
            lector.onload = () => resolve({ nombre: file.name, mime: 'application/pdf', datos: lector.result });
            lector.readAsDataURL(file);
            return;
        }
        reject(new Error('Solo se adjuntan imágenes o PDF'));
    });
}
