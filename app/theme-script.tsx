/**
 * ThemeScript — script inline que roda ANTES do primeiro paint.
 *
 * Lê preferência salva (localStorage 'rv-theme') ou system preference
 * (prefers-color-scheme: dark) e seta data-theme="dark" no <html>
 * antes do React hidratar. Isso evita FOUC (flash of unstyled content)
 * onde o usuário veria o tema light por um instante antes do dark aplicar.
 *
 * Renderizado dentro do <head> em app/layout.tsx via dangerouslySetInnerHTML.
 *
 * Edge cases:
 * - try/catch envolve tudo: se localStorage for indisponível (private mode
 *   muito antigo, SSR, sandbox) o catch silencia e o tema default (light) fica.
 * - Não usa fetch / async — script roda síncrono no head, bloqueia paint
 *   por microssegundos só.
 * - Não causa SSR mismatch: o script roda no client e só MUTA o atributo
 *   data-theme do <html>. Como o React não controla esse atributo
 *   (não é uma prop), não há mismatch de hydration.
 */
const themeScriptSource = `(function(){try{var s=localStorage.getItem('rv-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var t=s||m;if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

export default function ThemeScript() {
  return (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: themeScriptSource }}
    />
  );
}
