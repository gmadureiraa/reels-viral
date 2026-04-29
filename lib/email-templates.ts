/**
 * Email templates da automação Reels Viral.
 *
 * Sequência (5 emails, time-based via Vercel Cron):
 *  - D+0 (immediate): welcome + entrega do roteiro + CTA gravar
 *  - D+2: check-in "postou? como foi?" + survey link
 *  - D+4: case study + soft offer trial
 *  - D+7: oferta assinatura R$ X (limited time)
 *  - D+14: re-engagement final / churn
 *
 * Visual: cream + REC coral (paleta Reels Viral). HTML inline-style
 * pra max compat com clients (Outlook, Gmail web, Apple Mail). Fallback
 * text pra spam filters.
 */

const REC_CORAL = "#FF3D2E";
const CREAM = "#F5F1E8";
const INK = "#1A1A1A";
const MUTED = "#7A7A7A";

// Domínio verificado no Resend (29/04). `news.kaleidos.com.br` está em
// sa-east-1 com SPF+DKIM ok. `kaleidos.com.br` raiz NÃO está verificado
// — não dá pra mandar de reels@kaleidos.com.br sem antes adicionar DNS
// records. Pra ficar 100% no free plan, mando do subdomínio verificado.
const FROM_DEFAULT = "Reels Viral <reels@news.kaleidos.com.br>";

interface BaseProps {
  firstName?: string | null;
  scriptUrl?: string | null;
  unsubscribeUrl?: string | null;
}

interface WelcomeProps extends BaseProps {
  hook?: string | null;
  titulo?: string | null;
}

interface CheckinProps extends BaseProps {
  postedYesUrl: string;
  postedNoUrl: string;
}

interface OfferProps extends BaseProps {
  offerUrl: string;
  /** Discount cents off ou %. */
  discountLabel?: string;
}

const SHELL_OPEN = (preheader: string) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reels Viral</title>
<style>
  @media (prefers-color-scheme: dark) { body { background: #0a0a0a !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${INK};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${CREAM};opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};padding:32px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border:1.5px solid ${INK};border-radius:0;box-shadow:6px 6px 0 0 ${INK}">
<tr><td style="padding:32px 32px 0">
  <div style="display:inline-flex;align-items:center;gap:8px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:#fff;background:${REC_CORAL};padding:6px 12px;border:1.5px solid ${INK}">
    <span style="display:inline-block;width:8px;height:8px;background:#fff;border-radius:50%"></span>
    REC
  </div>
</td></tr>`;

const SHELL_CLOSE = (unsubscribeUrl: string) => `
<tr><td style="padding:24px 32px 32px;border-top:1px solid #eee;color:${MUTED};font-size:11px;line-height:1.5">
  Você está recebendo isso porque criou um roteiro no <strong>Reels Viral</strong>.<br>
  <a href="${unsubscribeUrl}" style="color:${MUTED};text-decoration:underline">Descadastrar</a> ·
  <a href="https://reels.kaleidos.com.br" style="color:${MUTED};text-decoration:underline">reels.kaleidos.com.br</a>
</td></tr>
</table>
<div style="font-family:-apple-system,sans-serif;color:${MUTED};font-size:11px;margin-top:16px">
  Kaleidos Digital · Brasil
</div>
</td></tr>
</table>
</body>
</html>`;

export function welcomeEmail(p: WelcomeProps) {
  const name = (p.firstName ?? "criador").split(" ")[0];
  const hookLine = p.hook
    ? `<div style="font-family:'Instrument Serif',serif;font-style:italic;font-size:24px;line-height:1.3;margin:24px 0;padding:20px;background:${CREAM};border-left:4px solid ${REC_CORAL};color:${INK}">"${p.hook}"</div>`
    : "";
  const subject = "🎬 Seu roteiro está pronto — agora é só gravar";
  const preheader = "A gente fez engenharia reversa. Sua vez de transformar em vídeo.";
  const html = `${SHELL_OPEN(preheader)}
<tr><td style="padding:24px 32px">
  <h1 style="font-family:-apple-system,sans-serif;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;margin:0 0 8px;color:${INK}">
    ${name}, seu roteiro tá pronto.
  </h1>
  <p style="font-size:15px;line-height:1.55;color:${MUTED};margin:0 0 16px">
    Engenharia reversa concluída. Estrutura cena por cena, hook calibrado, CTA no lugar certo.
  </p>
  ${hookLine}
  <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 8px">
    <strong>Próximo passo</strong>: grava nas próximas 24-48h. Reels que ficam mais de 3 dias na pasta perdem 70% do impacto, segundo dados da Meta.
  </p>
  ${
    p.scriptUrl
      ? `<div style="margin:24px 0">
    <a href="${p.scriptUrl}" style="display:inline-block;background:${INK};color:#fff;font-weight:700;padding:14px 24px;text-decoration:none;border:1.5px solid ${INK};box-shadow:4px 4px 0 0 ${REC_CORAL};font-size:13px;letter-spacing:0.04em;text-transform:uppercase">
      Abrir roteiro completo →
    </a>
  </div>`
      : ""
  }
  <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:24px 0 0">
    Em 2 dias eu te pergunto como foi a abertura. Postou cedo? Ficou no rascunho? Vou tentar te ajudar a tirar do papel.
  </p>
  <p style="font-size:14px;line-height:1.6;color:${INK};margin:24px 0 0">
    No flow,<br>
    <strong>Madureira</strong> · Reels Viral
  </p>
</td></tr>
${SHELL_CLOSE(p.unsubscribeUrl ?? "https://reels.kaleidos.com.br")}`;
  const text = `${name}, seu roteiro está pronto.

Engenharia reversa concluída. Estrutura cena por cena, hook calibrado, CTA no lugar certo.

${p.hook ? `Hook: "${p.hook}"\n\n` : ""}Próximo passo: grava nas próximas 24-48h. Reels que ficam mais de 3 dias na pasta perdem 70% do impacto.

${p.scriptUrl ? `Abrir roteiro: ${p.scriptUrl}\n\n` : ""}Em 2 dias eu te pergunto como foi a abertura.

No flow,
Madureira · Reels Viral
${p.unsubscribeUrl ? `\n\nDescadastrar: ${p.unsubscribeUrl}` : ""}`;
  return { subject, html, text };
}

export function checkinEmail(p: CheckinProps) {
  const name = (p.firstName ?? "criador").split(" ")[0];
  const subject = "Postou ontem? Quero saber como foi";
  const preheader = "1 clique me diz: postou, virou views, ou ficou no rascunho.";
  const html = `${SHELL_OPEN(preheader)}
<tr><td style="padding:24px 32px">
  <h1 style="font-family:-apple-system,sans-serif;font-size:24px;line-height:1.2;font-weight:800;margin:0 0 12px;color:${INK}">
    ${name}, postou aquele reel?
  </h1>
  <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 16px">
    Faz 2 dias que mandei o roteiro. Vou ser direto: queria saber se você gravou e postou. 1 clique nas opções abaixo me ajuda muito a calibrar a próxima geração.
  </p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0">
    <tr>
      <td>
        <a href="${p.postedYesUrl}" style="display:inline-block;background:${REC_CORAL};color:#fff;font-weight:700;padding:14px 22px;text-decoration:none;border:1.5px solid ${INK};box-shadow:4px 4px 0 0 ${INK};font-size:13px;letter-spacing:0.04em;text-transform:uppercase;margin-right:12px">
          ✓ Postei
        </a>
      </td>
      <td>
        <a href="${p.postedNoUrl}" style="display:inline-block;background:#fff;color:${INK};font-weight:700;padding:14px 22px;text-decoration:none;border:1.5px solid ${INK};font-size:13px;letter-spacing:0.04em;text-transform:uppercase">
          ✗ Não postei ainda
        </a>
      </td>
    </tr>
  </table>
  <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:24px 0 0">
    Se postou e bombou: parabéns. Se postou e foi morno: respondo te dizendo o que pode ter sido. Se não postou: te mando ideia pra destravar.
  </p>
  <p style="font-size:14px;line-height:1.6;color:${INK};margin:20px 0 0">
    Madureira
  </p>
</td></tr>
${SHELL_CLOSE(p.unsubscribeUrl ?? "https://reels.kaleidos.com.br")}`;
  const text = `${name}, postou aquele reel?

Faz 2 dias que mandei o roteiro. Queria saber se você gravou e postou.

✓ Postei: ${p.postedYesUrl}
✗ Não postei ainda: ${p.postedNoUrl}

Se postou e bombou, parabéns. Se foi morno, respondo te dizendo o que pode ter sido. Se não postou, mando ideia pra destravar.

Madureira`;
  return { subject, html, text };
}

export function caseStudyEmail(p: BaseProps) {
  const name = (p.firstName ?? "criador").split(" ")[0];
  const subject = "Caso real: 280k views com o mesmo método";
  const preheader = "Eduardo Mulkson rodou o método. Resultado em números reais.";
  const html = `${SHELL_OPEN(preheader)}
<tr><td style="padding:24px 32px">
  <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${REC_CORAL};font-weight:700;margin-bottom:8px">CASO REAL · 14 DIAS</div>
  <h1 style="font-family:-apple-system,sans-serif;font-size:26px;line-height:1.2;font-weight:800;margin:0 0 16px;color:${INK}">
    ${name}, olha o que aconteceu com o Eduardo.
  </h1>
  <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 16px">
    Ele rodou o mesmo fluxo que você usou: pegou um reel viral, deixou o Reels Viral fazer engenharia reversa, gravou na voz dele.
  </p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0">
    <tr>
      <td style="background:${CREAM};padding:20px;border:1.5px solid ${INK};text-align:center">
        <div style="font-size:36px;font-weight:800;color:${REC_CORAL};line-height:1">280k</div>
        <div style="font-size:11px;color:${MUTED};margin-top:4px;letter-spacing:0.04em;text-transform:uppercase">views em 14 dias</div>
      </td>
      <td style="width:12px"></td>
      <td style="background:${CREAM};padding:20px;border:1.5px solid ${INK};text-align:center">
        <div style="font-size:36px;font-weight:800;color:${REC_CORAL};line-height:1">+1.2k</div>
        <div style="font-size:11px;color:${MUTED};margin-top:4px;letter-spacing:0.04em;text-transform:uppercase">novos seguidores</div>
      </td>
    </tr>
  </table>
  <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 16px">
    Não foi sorte. Foi <strong>1 reel calibrado por semana</strong> durante 4 semanas. Ele me disse que sem o Reels Viral teria desistido por preguiça de roteiro.
  </p>
  <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:0 0 24px">
    Você já ganhou 1 análise grátis. Se quer rodar isso como rotina semanal, em 3 dias eu te mando o jeito certo de fazer.
  </p>
  <p style="font-size:14px;line-height:1.6;color:${INK};margin:0">
    Madureira
  </p>
</td></tr>
${SHELL_CLOSE(p.unsubscribeUrl ?? "https://reels.kaleidos.com.br")}`;
  const text = `${name}, olha o que aconteceu com o Eduardo.

Ele rodou o mesmo fluxo que você. Pegou um reel viral, deixou o Reels Viral fazer engenharia reversa, gravou na voz dele.

→ 280k views em 14 dias
→ +1.2k novos seguidores

Não foi sorte. Foi 1 reel calibrado por semana durante 4 semanas. Ele disse que sem o Reels Viral teria desistido por preguiça de roteiro.

Você já ganhou 1 análise grátis. Em 3 dias eu te mando o jeito certo de rodar isso como rotina semanal.

Madureira`;
  return { subject, html, text };
}

export function offerEmail(p: OfferProps) {
  const name = (p.firstName ?? "criador").split(" ")[0];
  const subject = `${name}, 7 dias grátis pra rodar isso toda semana`;
  const preheader = "Reels Viral Pro: análises ilimitadas + biblioteca + 30% off no 1º mês.";
  const discount = p.discountLabel ?? "30% off no 1º mês";
  const html = `${SHELL_OPEN(preheader)}
<tr><td style="padding:24px 32px">
  <h1 style="font-family:-apple-system,sans-serif;font-size:26px;line-height:1.2;font-weight:800;margin:0 0 16px;color:${INK}">
    1 reel por semana, todo mês.
  </h1>
  <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 16px">
    ${name}, criadores que postam 1 reel/semana crescem em média 4× mais rápido que quem posta esporádico. O problema é roteiro — sentar pra escrever todo domingo cansa.
  </p>
  <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 24px">
    No <strong>Reels Viral Pro</strong> você cola qualquer reel viral, recebe roteiro novo na sua voz em 30s. <strong>Ilimitado.</strong> + biblioteca dos seus + tracking de performance.
  </p>
  <div style="background:${CREAM};padding:24px;border:1.5px solid ${INK};margin:24px 0">
    <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${REC_CORAL};font-weight:700;margin-bottom:8px">Oferta limitada</div>
    <div style="font-size:32px;font-weight:800;color:${INK};line-height:1.1;margin-bottom:4px">${discount}</div>
    <div style="font-size:13px;color:${MUTED};line-height:1.5">+ 7 dias de trial grátis. Cancela quando quiser.</div>
  </div>
  <div style="margin:24px 0">
    <a href="${p.offerUrl}" style="display:inline-block;background:${REC_CORAL};color:#fff;font-weight:700;padding:16px 28px;text-decoration:none;border:1.5px solid ${INK};box-shadow:4px 4px 0 0 ${INK};font-size:13px;letter-spacing:0.04em;text-transform:uppercase">
      Ativar Pro com desconto →
    </a>
  </div>
  <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:24px 0 0">
    Se ficar em dúvida, responde esse email. Eu pessoalmente respondo (não é robô).
  </p>
  <p style="font-size:14px;line-height:1.6;color:${INK};margin:20px 0 0">
    Madureira
  </p>
</td></tr>
${SHELL_CLOSE(p.unsubscribeUrl ?? "https://reels.kaleidos.com.br")}`;
  const text = `${name}, 1 reel por semana, todo mês.

Criadores que postam 1 reel/semana crescem em média 4× mais rápido que quem posta esporádico. O problema é roteiro.

No Reels Viral Pro você cola qualquer reel viral, recebe roteiro novo em 30s. Ilimitado.

Oferta: ${discount} + 7 dias de trial grátis.

→ ${p.offerUrl}

Se ficar em dúvida, responde esse email. Eu respondo.

Madureira`;
  return { subject, html, text };
}

export function reEngagementEmail(p: BaseProps) {
  const name = (p.firstName ?? "criador").split(" ")[0];
  const subject = "Última: ainda quer essa ferramenta na rotina?";
  const preheader = "Se for não, sumo da sua caixa. Se for sim, tem oferta especial.";
  const html = `${SHELL_OPEN(preheader)}
<tr><td style="padding:24px 32px">
  <h1 style="font-family:-apple-system,sans-serif;font-size:24px;line-height:1.2;font-weight:800;margin:0 0 16px;color:${INK}">
    ${name}, decisão simples.
  </h1>
  <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 16px">
    Faz 14 dias que você gerou um roteiro com a gente. Não vou continuar enchendo sua caixa se você não viu valor.
  </p>
  <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 16px">
    Se quer rodar Reels Viral Pro com 50% off no 1º mês (oferta única, 48h), tá aqui:
  </p>
  <div style="margin:24px 0">
    <a href="https://reels.kaleidos.com.br/upgrade?promo=last50" style="display:inline-block;background:${INK};color:#fff;font-weight:700;padding:14px 24px;text-decoration:none;border:1.5px solid ${INK};box-shadow:4px 4px 0 0 ${REC_CORAL};font-size:13px;letter-spacing:0.04em;text-transform:uppercase">
      Ativar com 50% off →
    </a>
  </div>
  <p style="font-size:14px;line-height:1.6;color:${MUTED};margin:24px 0 0">
    Se não, beleza. Vou parar de mandar email. Quando quiser voltar, é só gerar outro roteiro lá em <a href="https://reels.kaleidos.com.br" style="color:${REC_CORAL}">reels.kaleidos.com.br</a>.
  </p>
  <p style="font-size:14px;line-height:1.6;color:${INK};margin:20px 0 0">
    Valeu,<br>Madureira
  </p>
</td></tr>
${SHELL_CLOSE(p.unsubscribeUrl ?? "https://reels.kaleidos.com.br")}`;
  const text = `${name}, decisão simples.

Faz 14 dias que você gerou um roteiro. Não vou enchendo sua caixa se não viu valor.

Se quer Reels Viral Pro com 50% off no 1º mês (oferta única, 48h):
https://reels.kaleidos.com.br/upgrade?promo=last50

Se não, sumo. Quando quiser voltar é só gerar outro roteiro.

Valeu,
Madureira`;
  return { subject, html, text };
}

export const FROM_ADDRESS = FROM_DEFAULT;
