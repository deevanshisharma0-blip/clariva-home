/* ── Nav scroll ──────────────────────────────── */
const nav = document.getElementById('nav');
const stickyBar = document.getElementById('sticky-bar');
const productSection = document.getElementById('product');

window.addEventListener('scroll', () => {
  nav.style.background = scrollY > 60 ? 'rgba(5,5,8,.97)' : 'rgba(5,5,8,.85)';
  const pb = productSection.getBoundingClientRect();
  stickyBar.classList.toggle('visible', pb.bottom < 0);
}, { passive: true });

/* ── Mobile menu ─────────────────────────────── */
const ham = document.getElementById('hamBtn');
const menu = document.getElementById('mobileMenu');
ham.addEventListener('click', () => menu.classList.toggle('open'));
function closeMobile() { menu.classList.remove('open'); }

/* ── Product gallery ─────────────────────────── */
function swap(el) {
  document.getElementById('pMainImg').src = el.dataset.src;
  document.querySelectorAll('.p-thumbs img').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

/* ── FAQ accordion ───────────────────────────── */
function toggleFaq(btn) {
  const item = btn.parentElement;
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
  if (!isOpen) item.classList.add('open');
}

/* ── Email form ──────────────────────────────── */
function submitEmail(e) {
  e.preventDefault();
  const btn = e.target.querySelector('.ec-submit');
  btn.textContent = 'Subscribed ✓';
  btn.style.background = '#48C88A';
  btn.style.border = '1px solid #48C88A';
}

/* ── Scroll fade-in ──────────────────────────── */
const obs = new IntersectionObserver((entries) => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.classList.add('in'), i * 65);
      obs.unobserve(e.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -36px 0px' });
document.querySelectorAll('.fade').forEach(el => obs.observe(el));
