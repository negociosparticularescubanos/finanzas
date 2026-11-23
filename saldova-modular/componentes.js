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
