// Utilidades compartidas — ver AGENTS.md sección 4 (Seguridad).

const MAPA_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// esc() en todo texto dinámico antes de insertarlo vía innerHTML — primera defensa anti-XSS.
export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => MAPA_ESCAPE[c]);
}

const ESQUEMAS_PERMITIDOS = ['http:', 'https:', 'mailto:', 'tel:'];

// urlSegura(): esc() no basta para un href — no escapa "javascript:". Lista blanca de esquemas.
export function urlSegura(url) {
  try {
    const analizada = new URL(String(url), window.location.href);
    return ESQUEMAS_PERMITIDOS.includes(analizada.protocol) ? analizada.href : null;
  } catch {
    return null;
  }
}
