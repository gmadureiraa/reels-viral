/**
 * Twitter card usa a mesma imagem do OG. Re-export pra Next 16 emitir
 * meta `twitter:image` separado (alguns clients não fallback pro og:image).
 */
export { default, alt, size, contentType } from "./opengraph-image";
