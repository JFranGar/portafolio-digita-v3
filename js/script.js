/* ==========================================================================
   CV · Juan Francisco Chanatasig Garzón — Interactividad
   Módulos independientes (tema, navegación, diálogos, avisos…) que se
   inicializan una sola vez cuando el DOM está listo.
   ========================================================================== */
(() => {
    'use strict';

    /* ---------------------------------------------------------------------
       1. Configuración
       --------------------------------------------------------------------- */
    const CONFIG = {
        themeStorageKey: 'cv-theme',
        themeColors: { light: '#e9edf1', dark: '#13171c' },
        contactEmail: 'jfchanatasig1405@gmail.com',
        toastDuration: 3200,
        copyFeedbackDuration: 1600,
        backToTopOffset: 600,
        revealStagger: 80,
        activeSectionRatio: 0.3,
    };

    const root = document.documentElement;
    const dom = {};


    /* ---------------------------------------------------------------------
       2. Utilidades
       --------------------------------------------------------------------- */
    const $ = (selector, scope = document) => scope.querySelector(selector);
    const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

    const matches = (query) => window.matchMedia(query).matches;
    const scrollBehavior = () => (matches('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth');
    const isTypingTarget = (element) => element.closest('input, textarea, select, [contenteditable="true"]');

    /** localStorage puede no estar disponible (modo privado, archivos locales…). */
    const storage = {
        get(key) {
            try {
                return localStorage.getItem(key);
            } catch {
                return null;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, value);
            } catch {
                /* Sin almacenamiento: el tema funciona igual durante la visita. */
            }
        },
    };

    const setCurrent = (links, activeLink) => {
        links.forEach((link) => {
            if (link === activeLink) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        });
    };


    /* ---------------------------------------------------------------------
       3. Tema claro / oscuro
       --------------------------------------------------------------------- */
    const Theme = {
        get current() {
            return root.dataset.theme === 'dark' ? 'dark' : 'light';
        },

        preferred() {
            return storage.get(CONFIG.themeStorageKey)
                ?? (matches('(prefers-color-scheme: dark)') ? 'dark' : 'light');
        },

        apply(theme) {
            root.dataset.theme = theme;
            $('meta[name="theme-color"]')?.setAttribute('content', CONFIG.themeColors[theme]);
            $$('[data-theme-toggle]').forEach((toggle) => {
                toggle.setAttribute('aria-checked', String(theme === 'dark'));
            });
        },

        toggle() {
            const next = Theme.current === 'dark' ? 'light' : 'dark';
            Theme.apply(next);
            storage.set(CONFIG.themeStorageKey, next);
            Toast.show(next === 'dark' ? 'Modo oscuro activado' : 'Modo claro activado', {
                icon: next === 'dark' ? 'moon' : 'sun',
            });
        },

        init() {
            Theme.apply(Theme.current);
            $$('[data-theme-toggle]').forEach((toggle) => toggle.addEventListener('click', Theme.toggle));

            // Si el usuario nunca eligió un tema, se respeta el del sistema en vivo
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
                if (!storage.get(CONFIG.themeStorageKey)) Theme.apply(event.matches ? 'dark' : 'light');
            });

            // El CV siempre se imprime en modo claro
            let themeBeforePrint = null;
            window.addEventListener('beforeprint', () => {
                themeBeforePrint = Theme.current;
                root.dataset.theme = 'light';
            });
            window.addEventListener('afterprint', () => {
                if (themeBeforePrint) root.dataset.theme = themeBeforePrint;
            });
        },
    };


    /* ---------------------------------------------------------------------
       4. Avisos breves (toast) — retroalimentación del estado del sistema
       --------------------------------------------------------------------- */
    const Toast = {
        timer: null,

        show(message, { icon = 'check', type = 'success' } = {}) {
            if (!dom.toast) return;
            $('[data-toast-message]', dom.toast).textContent = message;
            $('[data-toast-icon]', dom.toast).setAttribute('href', `#i-${icon}`);
            dom.toast.classList.toggle('toast--error', type === 'error');
            dom.toast.classList.add('is-visible');

            clearTimeout(Toast.timer);
            Toast.timer = setTimeout(() => dom.toast.classList.remove('is-visible'), CONFIG.toastDuration);
        },
    };


    /* ---------------------------------------------------------------------
       5. Diálogos modales (ayuda y errores)
       --------------------------------------------------------------------- */
    const Dialogs = {
        lastTrigger: null,

        open(id) {
            const dialog = document.getElementById(id);
            if (!dialog || dialog.open) return;
            Dialogs.lastTrigger = document.activeElement;
            Menu.close();
            dialog.showModal();
        },

        closeAll() {
            $$('dialog[open]').forEach((dialog) => dialog.close());
        },

        init() {
            $$('[data-dialog-open]').forEach((trigger) => {
                trigger.addEventListener('click', () => Dialogs.open(trigger.dataset.dialogOpen));
            });

            // Se cierran con su botón, con Esc (nativo) o al hacer clic sobre el fondo
            $$('dialog').forEach((dialog) => {
                dialog.addEventListener('click', (event) => {
                    if (event.target === dialog || event.target.closest('[data-dialog-close]')) dialog.close();
                });

                // Si se abrió desde el menú móvil (ya cerrado), el foco vuelve al botón del menú
                dialog.addEventListener('close', () => {
                    if (dom.menu?.contains(Dialogs.lastTrigger)) dom.menuToggle?.focus();
                });
            });
        },
    };


    /* ---------------------------------------------------------------------
       6. "Game Over": errores amigables con una salida inmediata
       --------------------------------------------------------------------- */
    const GameOver = {
        retryAction: null,

        show(message, retryAction = null) {
            $('[data-gameover-message]').textContent = message;
            GameOver.retryAction = retryAction;
            $('[data-gameover-retry]').hidden = !retryAction;
            Dialogs.open('gameover-dialog');
        },

        /** Las salidas rápidas se generan a partir de las secciones reales del CV. */
        renderLinks() {
            const items = dom.sections.map((section) => {
                const item = document.createElement('li');
                const link = document.createElement('a');
                link.className = 'chip';
                link.href = `#${section.id}`;
                link.textContent = section.dataset.section;
                item.append(link);
                return item;
            });
            $('[data-gameover-links]').replaceChildren(...items);
        },

        init() {
            GameOver.renderLinks();
            $('[data-gameover-retry]').addEventListener('click', () => {
                const action = GameOver.retryAction;
                Dialogs.closeAll();
                action?.();
            });
        },
    };


    /* ---------------------------------------------------------------------
       7. Menú móvil
       --------------------------------------------------------------------- */
    const Menu = {
        isOpen() {
            return dom.menuToggle?.getAttribute('aria-expanded') === 'true';
        },

        set(open) {
            if (!dom.menu || !dom.menuToggle) return;
            dom.menuToggle.setAttribute('aria-expanded', String(open));
            dom.menuToggle.setAttribute('aria-label', open ? 'Cerrar menú de secciones' : 'Abrir menú de secciones');
            dom.menu.classList.toggle('is-open', open);
        },

        close() {
            if (Menu.isOpen()) Menu.set(false);
        },

        init() {
            dom.menuToggle?.addEventListener('click', () => {
                Menu.set(!Menu.isOpen());
                if (Menu.isOpen()) $('.menu__link', dom.menu)?.focus();
            });

            // Clic fuera del menú o tecla Esc: se cierra sin perder el lugar
            document.addEventListener('click', (event) => {
                if (Menu.isOpen() && !event.target.closest('[data-menu], [data-menu-toggle]')) Menu.close();
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && Menu.isOpen()) {
                    Menu.close();
                    dom.menuToggle.focus();
                }
            });

            window.matchMedia('(min-width: 1024px)').addEventListener('change', (event) => {
                if (event.matches) Menu.close();
            });
        },
    };


    /* ---------------------------------------------------------------------
       8. Navegación entre secciones (desplazamiento suave + enlaces rotos)
       --------------------------------------------------------------------- */
    const Navigation = {
        brokenLinkMessage(id) {
            return `El enlace «#${id}» no lleva a ninguna sección de este CV. Puede que esté mal escrito o que haya cambiado.`;
        },

        go(section) {
            Dialogs.closeAll();
            Menu.close();
            section.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
            history.pushState(null, '', `#${section.id}`);

            // El foco acompaña al usuario: el siguiente Tab continúa desde la sección elegida
            const heading = $('h1, h2', section);
            heading.setAttribute('tabindex', '-1');
            heading.focus({ preventScroll: true });
        },

        goToId(id) {
            const target = document.getElementById(id);
            if (target?.matches('[data-section]')) Navigation.go(target);
            else if (!target) GameOver.show(Navigation.brokenLinkMessage(id));
        },

        onLinkClick(event) {
            const link = event.target.closest('a[href^="#"]');
            if (!link || event.defaultPrevented || event.button !== 0
                || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const id = decodeURIComponent(link.hash.slice(1));
            const target = id && document.getElementById(id);
            if (target && !target.matches('[data-section]')) return; // p. ej. "Saltar al contenido"

            event.preventDefault();
            if (id) Navigation.goToId(id);
        },

        validateHash() {
            const id = decodeURIComponent(location.hash.slice(1));
            if (id && !document.getElementById(id)) GameOver.show(Navigation.brokenLinkMessage(id));
        },

        init() {
            document.addEventListener('click', Navigation.onLinkClick);
            window.addEventListener('hashchange', Navigation.validateHash);
            Navigation.validateHash();
        },
    };


    /* ---------------------------------------------------------------------
       9. Estado del scroll: progreso, sección actual y "volver arriba"
       --------------------------------------------------------------------- */
    const ScrollWatcher = {
        ticking: false,
        activeSection: null,

        updateActiveSection(atBottom) {
            const marker = dom.statusbar.offsetHeight + window.innerHeight * CONFIG.activeSectionRatio;
            const active = atBottom
                ? dom.sections.at(-1)
                : dom.sections.reduce((current, section) => (
                    section.getBoundingClientRect().top <= marker ? section : current
                ), dom.sections[0]);

            if (active === ScrollWatcher.activeSection) return;
            ScrollWatcher.activeSection = active;
            dom.currentLabel.textContent = active.dataset.section;
            setCurrent(dom.menuLinks, dom.menuLinks.find((link) => link.hash === `#${active.id}`));
        },

        update() {
            const { scrollY, innerHeight } = window;
            const maxScroll = root.scrollHeight - innerHeight;
            const progress = maxScroll > 0 ? Math.min(scrollY / maxScroll, 1) : 0;

            dom.progress?.style.setProperty('--progress', `${(progress * 100).toFixed(2)}%`);
            dom.backToTop?.classList.toggle('is-visible', scrollY > CONFIG.backToTopOffset);
            ScrollWatcher.updateActiveSection(maxScroll > 0 && progress >= 0.995);
        },

        /** Agrupa los eventos de scroll en un único cálculo por fotograma. */
        request() {
            if (ScrollWatcher.ticking) return;
            ScrollWatcher.ticking = true;
            requestAnimationFrame(() => {
                ScrollWatcher.update();
                ScrollWatcher.ticking = false;
            });
        },

        init() {
            window.addEventListener('scroll', ScrollWatcher.request, { passive: true });
            window.addEventListener('resize', ScrollWatcher.request, { passive: true });
            dom.backToTop?.addEventListener('click', () => Navigation.go(dom.sections[0]));
            ScrollWatcher.update();
        },
    };


    /* ---------------------------------------------------------------------
       10. Aparición progresiva de elementos al hacer scroll
       --------------------------------------------------------------------- */
    const Reveal = {
        init() {
            const elements = $$('.reveal');

            // Escalonado sutil entre hermanos de una misma cuadrícula
            elements.forEach((element) => {
                const siblings = Array.from(element.parentElement.children).filter((child) => child.classList.contains('reveal'));
                element.style.setProperty('--reveal-delay', `${siblings.indexOf(element) * CONFIG.revealStagger}ms`);
            });

            if (!('IntersectionObserver' in window)) {
                elements.forEach((element) => element.classList.add('is-visible'));
                return;
            }

            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                });
            }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });

            elements.forEach((element) => observer.observe(element));
        },
    };


    /* ---------------------------------------------------------------------
       11. Copiar correo / teléfono
       --------------------------------------------------------------------- */
    const Clipboard = {
        async write(text) {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return;
            }

            // Respaldo para navegadores o contextos sin la API moderna
            const field = document.createElement('textarea');
            field.value = text;
            field.setAttribute('readonly', '');
            field.className = 'sr-only';
            document.body.append(field);
            field.select();
            const copied = document.execCommand('copy');
            field.remove();
            if (!copied) throw new Error('No se pudo copiar');
        },

        markAsDone(button) {
            const icon = $('use', button);
            button.classList.add('is-done');
            icon.setAttribute('href', '#i-check');
            setTimeout(() => {
                button.classList.remove('is-done');
                icon.setAttribute('href', '#i-copy');
            }, CONFIG.copyFeedbackDuration);
        },

        async onClick(event) {
            const button = event.currentTarget;
            const name = button.dataset.copyName;
            try {
                await Clipboard.write(button.dataset.copy);
                Clipboard.markAsDone(button);
                Toast.show(`${name} copiado al portapapeles`);
            } catch {
                Toast.show(`No se pudo copiar. Selecciona el ${name.toLowerCase()} y cópialo manualmente.`, {
                    icon: 'warning',
                    type: 'error',
                });
            }
        },

        init() {
            $$('[data-copy]').forEach((button) => button.addEventListener('click', Clipboard.onClick));
        },
    };


    /* ---------------------------------------------------------------------
       12. Descarga del CV (con verificación cuando el sitio está publicado)
       --------------------------------------------------------------------- */
    const Download = {
        start(link) {
            const temporary = document.createElement('a');
            temporary.href = link.href;
            temporary.download = link.download;
            document.body.append(temporary);
            temporary.click();
            temporary.remove();
            Toast.show('Descarga del CV iniciada', { icon: 'download' });
        },

        async onClick(event) {
            const link = event.currentTarget;

            // Abierto como archivo local no se puede comprobar: se deja actuar al navegador
            if (!location.protocol.startsWith('http')) {
                Toast.show('Descarga del CV iniciada', { icon: 'download' });
                return;
            }

            event.preventDefault();
            try {
                const response = await fetch(link.href, { method: 'HEAD', cache: 'no-store' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                Download.start(link);
            } catch {
                GameOver.show(
                    `No pudimos descargar el CV en este momento. Inténtalo de nuevo o escríbeme a ${CONFIG.contactEmail} y te lo envío.`,
                    () => link.click(),
                );
            }
        },

        trigger() {
            dom.downloadLinks[0]?.click();
        },

        init() {
            dom.downloadLinks.forEach((link) => link.addEventListener('click', Download.onClick));
        },
    };


    /* ---------------------------------------------------------------------
       13. Enlaces externos sin conexión y foto de perfil de respaldo
       --------------------------------------------------------------------- */
    const ExternalLinks = {
        init() {
            $$('[data-external]').forEach((link) => {
                link.addEventListener('click', (event) => {
                    if (navigator.onLine) return;
                    event.preventDefault();
                    GameOver.show(
                        'Parece que no hay conexión a Internet, así que este enlace no se puede abrir. Revisa tu conexión e inténtalo de nuevo.',
                        () => link.click(),
                    );
                });
            });
        },
    };

    const Avatar = {
        init() {
            const avatar = $('[data-avatar]');
            const image = avatar && $('img', avatar);
            if (!image) return;

            // Si la foto no carga, se muestran las iniciales sin romper el diseño
            const useFallback = () => {
                avatar.classList.add('avatar--fallback');
                avatar.setAttribute('role', 'img');
                avatar.setAttribute('aria-label', image.alt);
            };

            if (image.complete && image.naturalWidth === 0) useFallback();
            else image.addEventListener('error', useFallback, { once: true });
        },
    };


    /* ---------------------------------------------------------------------
       14. Atajos de teclado (aceleradores para usuarios frecuentes)
       --------------------------------------------------------------------- */
    const Shortcuts = {
        actions: {
            t: () => Theme.toggle(),
            d: () => Download.trigger(),
            '?': () => Dialogs.open('help-dialog'),
        },

        onKeydown(event) {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
            if (isTypingTarget(event.target) || $('dialog[open]')) return;

            const key = event.key.toLowerCase();
            const section = /^[1-9]$/.test(key) ? dom.sections[Number(key) - 1] : null;
            const action = section ? () => Navigation.go(section) : Shortcuts.actions[key];
            if (!action) return;

            event.preventDefault();
            action();
        },

        init() {
            document.addEventListener('keydown', Shortcuts.onKeydown);
        },
    };


    /* ---------------------------------------------------------------------
       15. Arranque
       --------------------------------------------------------------------- */
    const cacheDom = () => {
        dom.statusbar = $('[data-statusbar]');
        dom.menu = $('[data-menu]');
        dom.menuToggle = $('[data-menu-toggle]');
        dom.menuLinks = $$('.menu__link');
        dom.currentLabel = $('[data-current-section]');
        dom.progress = $('[data-scroll-progress]');
        dom.backToTop = $('[data-back-to-top]');
        dom.toast = $('[data-toast]');
        dom.sections = $$('[data-section]');
        dom.downloadLinks = $$('[data-download-cv]');
    };

    const init = () => {
        cacheDom();
        [
            Theme,
            Dialogs,
            GameOver,
            Menu,
            Navigation,
            ScrollWatcher,
            Reveal,
            Clipboard,
            Download,
            ExternalLinks,
            Avatar,
            Shortcuts,
        ].forEach((module) => module.init());
    };

    // Se ejecuta de inmediato (en <head>) para pintar ya con el tema correcto
    root.classList.add('js');
    Theme.apply(Theme.preferred());

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
