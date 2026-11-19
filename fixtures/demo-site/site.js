// Mobile menu: a real interaction the capture pipeline can trigger.
    const toggle = document.querySelector('.menu-toggle');
    const menu = document.getElementById('mobile-menu');
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.setAttribute('aria-hidden', String(!open));
    });
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggle.click()));
