/* Modo claro u oscuro. Se carga antes que la página para que no parpadee al abrirla. */
(() => {
  // Número de versión de la web: se cambia aquí y en CHANGELOG.md al publicar.
  const VERSION = '1.11.0';
  const KEY = 'toptravel-tema';
  const root = document.documentElement;
  const read = () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  };
  const paintMeta = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = root.dataset.theme === 'dark' ? '#1c120a' : '#f0b000';
  };
  const paintButtons = () => {
    const dark = root.dataset.theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      button.title = dark ? 'Modo claro' : 'Modo oscuro';
    });
  };

  // Un solo ajuste para toda la web: oscuro de inicio, y solo cambia con el botón.
  root.dataset.theme = read() === 'light' ? 'light' : 'dark';

  // Si se cambia en otra pestaña, esta también se actualiza.
  addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    root.dataset.theme = event.newValue === 'light' ? 'light' : 'dark';
    paintMeta();
    paintButtons();
    document.dispatchEvent(new CustomEvent('toptravel:tema'));
  });

  document.addEventListener('DOMContentLoaded', () => {
    paintMeta();
    paintButtons();
    document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = `Versión ${VERSION}`; });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('[data-theme-toggle]')) return;
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, root.dataset.theme); } catch { /* sin almacenamiento: dura hasta cerrar */ }
      paintMeta();
      paintButtons();
      document.dispatchEvent(new CustomEvent('toptravel:tema'));
    });
  });
})();
