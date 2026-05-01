import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade — Reels Viral",
  description:
    "Como o Reels Viral coleta, usa e protege dados pessoais. Inclui dados públicos do Instagram, vídeos enviados para análise e serviços de terceiros.",
  alternates: { canonical: "https://reels.kaleidos.com.br/privacy" },
};

export default function PrivacyPage() {
  return (
    <main
      style={{
        background: "var(--color-rv-cream)",
        color: "var(--color-rv-ink)",
        minHeight: "100dvh",
        padding: "64px 20px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p
          className="rv-mono"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--color-rv-rec)",
          }}
        >
          Legal
        </p>
        <h1
          className="rv-display"
          style={{
            fontSize: 44,
            lineHeight: 1.05,
            marginTop: 8,
            fontStyle: "italic",
          }}
        >
          Política de Privacidade
        </h1>
        <p
          className="rv-mono"
          style={{
            fontSize: 12,
            color: "var(--color-rv-muted)",
            marginTop: 12,
          }}
        >
          Última atualização: 1 de maio de 2026
        </p>

        <Section title="1. Quem somos">
          <p>
            Reels Viral é um produto operado por Kaleidos Digital, com sede no
            Brasil. Controlador de dados: Gabriel Madureira. Contato:{" "}
            <a className="rv-link" href="mailto:gf.madureiraa@gmail.com">
              gf.madureiraa@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section title="2. Dados que coletamos">
          <ul>
            <li>
              <strong>Conta:</strong> nome, e-mail, autenticação via Neon Auth
              (cookie de sessão criptografado).
            </li>
            <li>
              <strong>Links submetidos:</strong> URLs de Reels do Instagram que
              você cola para análise. Capturamos metadados públicos do post
              (autor, caption, contagens) via Apify e o vídeo MP4 para
              processamento.
            </li>
            <li>
              <strong>Conteúdo gerado:</strong> análises, roteiros, storyboards
              cena-a-cena e adaptações que produzimos a partir do seu briefing.
              Salvos em sua conta para histórico.
            </li>
            <li>
              <strong>Briefing de adaptação:</strong> nicho, tom, objetivo, voz
              que você descreve para personalizar o roteiro.
            </li>
            <li>
              <strong>Lead capture:</strong> e-mail e telefone fornecidos no
              gate de desbloqueio (TTL 30 dias) para envio de sequência de
              boas-vindas.
            </li>
            <li>
              <strong>Uso e telemetria:</strong> logs técnicos, IP, user-agent
              e eventos de produto usados para detectar abuso e melhorar o
              serviço.
            </li>
          </ul>
        </Section>

        <Section title="3. Como usamos">
          <ul>
            <li>
              Entregar o serviço: analisar o Reel submetido, gerar roteiro novo
              e armazenar seu histórico.
            </li>
            <li>
              Enviar e-mails transacionais (boas-vindas, recibos, atualizações
              importantes do serviço).
            </li>
            <li>Processar pagamentos quando aplicável e prevenir abuso.</li>
            <li>
              Melhorar o produto através de métricas agregadas e anônimas.
            </li>
          </ul>
        </Section>

        <Section title="4. Vídeos e direitos autorais">
          <p>
            O Reels Viral baixa o vídeo MP4 do Instagram apenas para fins de{" "}
            <strong>análise interna automatizada</strong> (extração de hook,
            ritmo, transições, gatilhos). Nunca redistribuímos, republicamos ou
            permitimos download do vídeo original por parte do usuário. O
            arquivo é processado em memória e descartado após a análise; só
            permanecem em banco os metadados textuais e o roteiro adaptado.
          </p>
          <p style={{ marginTop: 12 }}>
            Você é responsável por respeitar os direitos autorais e termos do
            Instagram quanto ao conteúdo de terceiros que submete. Não use o
            Reels Viral para clonagem literal de vídeos de outros criadores —
            o produto entrega <em>estrutura</em>, não cópia.
          </p>
        </Section>

        <Section title="5. Fornecedores (subprocessadores)">
          <ul>
            <li>
              <strong>Neon</strong> — banco Postgres serverless (US/EU).
            </li>
            <li>
              <strong>Vercel</strong> — hospedagem e funções serverless.
            </li>
            <li>
              <strong>Google Gemini</strong> — análise de vídeo e geração de
              roteiro por IA.
            </li>
            <li>
              <strong>Apify</strong> — coleta de metadados públicos do
              Instagram.
            </li>
            <li>
              <strong>Resend</strong> — envio de e-mails transacionais e
              automação de leads.
            </li>
            <li>
              <strong>Stripe</strong> — processamento de pagamentos quando
              aplicável.
            </li>
          </ul>
        </Section>

        <Section title="6. Retenção e exclusão">
          <p>
            Mantemos seus dados enquanto sua conta estiver ativa. Vídeos MP4
            baixados temporariamente são descartados em até 24 horas após o
            processamento. Você pode solicitar exclusão completa da conta e
            histórico a qualquer momento escrevendo para{" "}
            <a className="rv-link" href="mailto:gf.madureiraa@gmail.com">
              gf.madureiraa@gmail.com
            </a>
            . Cumprimos a solicitação em até 30 dias corridos.
          </p>
        </Section>

        <Section title="7. Seus direitos (LGPD / GDPR)">
          <p>
            Você tem direito a acesso, correção, portabilidade, exclusão e
            oposição ao tratamento de seus dados pessoais. Para exercer, envie
            e-mail ao contato acima. Pode também reclamar à ANPD (Brasil) ou à
            autoridade de proteção de dados aplicável no seu país.
          </p>
        </Section>

        <Section title="8. Segurança">
          <p>
            Usamos TLS em todas as conexões, senhas com hashing, tokens
            escopados para APIs externas e controle de acesso por role.
            Notificaremos você e a ANPD em caso de incidente que exponha seus
            dados pessoais.
          </p>
        </Section>

        <Section title="9. Alterações">
          <p>
            Podemos atualizar esta política. Mudanças relevantes serão
            comunicadas por e-mail ou dentro do app antes de entrarem em vigor.
          </p>
        </Section>

        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: 48,
            fontWeight: 700,
            color: "var(--color-rv-rec)",
            textDecoration: "underline",
            textUnderlineOffset: 4,
          }}
        >
          ← Voltar ao site
        </Link>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 40 }}>
      <h2
        className="rv-display"
        style={{ fontSize: 22, fontStyle: "italic" }}
      >
        {title}
      </h2>
      <div
        style={{
          marginTop: 12,
          fontSize: 14,
          lineHeight: 1.65,
          color: "var(--color-rv-ink)",
        }}
      >
        {children}
      </div>
      <style>{`
        section ul {
          list-style: disc;
          padding-left: 22px;
        }
        section ul li {
          margin-top: 8px;
        }
        section .rv-link {
          font-weight: 700;
          color: var(--color-rv-rec);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
      `}</style>
    </section>
  );
}
