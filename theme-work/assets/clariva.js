/* ── Clariva Home — Storefront JS ──────────────────────── */

// Header scroll shadow
(function() {
  const header = document.getElementById('ch-header');
  if (!header) return;
  window.addEventListener('scroll', function() {
    header.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
})();

// Mobile nav toggle
(function() {
  const btn = document.getElementById('ch-menu-toggle');
  const drawer = document.getElementById('ch-nav-drawer');
  if (!btn || !drawer) return;
  btn.addEventListener('click', function() {
    const open = drawer.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    drawer.setAttribute('aria-hidden', !open);
  });
})();

// FAQ accordion
(function() {
  document.querySelectorAll('.ch-faq-q').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const item = btn.closest('.ch-faq-item');
      const answer = item.querySelector('.ch-faq-a');
      const open = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
      if (open) {
        answer.style.maxHeight = answer.scrollHeight + 'px';
      } else {
        answer.style.maxHeight = '0';
      }
    });
  });
})();

// Add-to-cart feedback
(function() {
  document.querySelectorAll('form[action="/cart/add"]').forEach(function(form) {
    form.addEventListener('submit', function(e) {
      const btn = form.querySelector('[type="submit"]');
      if (!btn) return;
      const orig = btn.textContent;
      btn.textContent = 'Added!';
      btn.disabled = true;
      setTimeout(function() {
        btn.textContent = orig;
        btn.disabled = false;
      }, 2000);
    });
  });
})();

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(function(a) {
  a.addEventListener('click', function(e) {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
