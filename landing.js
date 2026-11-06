/* Portada: capturas según el tema, aparición al bajar y movimiento suave de la foto. */
(() => {
  document.documentElement.classList.add('lp-js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const paintShots = () => {
    const suffix = document.documentElement.dataset.theme === 'dark' ? 'd' : '';
    document.querySelectorAll('[data-shot]').forEach((figure) => {
      const src = `assets/${figure.dataset.shot}${suffix}.jpg`;
      let img = figure.querySelector('img');
      if (!img) {
        img = new Image();
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = figure.dataset.alt;
        figure.append(img);
      }
      if (img.getAttribute('src') !== src) img.src = src;
    });
  };
  paintShots();
  document.addEventListener('toptravel:tema', paintShots);

  const items = document.querySelectorAll('.lp-reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-in'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    items.forEach((item) => observer.observe(item));
  }

  const photo = document.querySelector('[data-parallax]');
  if (photo && !reduced) {
    let queued = false;
    addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        photo.style.transform = `translateY(${Math.min(scrollY, innerHeight) * -0.1}px)`;
        queued = false;
      });
    }, { passive: true });
  }
})();
