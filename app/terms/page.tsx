import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos de uso — Reels Viral",
  description:
    "Termos de uso do Reels Viral: jurisdição, propriedade intelectual dos roteiros gerados, cancelamento e responsabilidade.",
  alternates: { canonical: "https://reels.kaleidos.com.br/terms" },
};

export default function TermsPage() {
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
          Termos de uso
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

        <Section title="1. Sobre o serviço">
          <p>
            Reels Viral (&quot;Serviço&quot;) é um produto da Kaleidos Digital
            (&quot;Kaleidos&quot;, &quot;nós&quot;) que oferece engenharia
            reversa de Reels do Instagram via web app em{" "}
            <a className="rv-link" href="https://reels.kaleidos.com.br">
              reels.kaleidos.com.br
            </a>
            . Ao criar conta ou utilizar qualquer funcionalidade, você
            (&quot;Usuário&quot;) concorda com estes Termos.
          </p>
        </Section>

        <Section title="2. Jurisdição e lei aplicável">
          <p>
            O contrato é regido pelas leis da República Federativa do Brasil.
            Qualquer controvérsia será resolvida no foro da comarca de São José
            dos Campos/SP, salvo regra legal que atribua competência a outro
            juízo.
          </p>
        </Section>

        <Section title="3. Propriedade intelectual do conteúdo gerado">
          <p>
            Todo roteiro, storyboard e adaptação textual exportada pelo
            Usuário através do Serviço é <strong>de propriedade do Usuário</strong>.
            Pode ser usado sem restrição para fins pessoais, clientes de
            agência, revenda ou qualquer outro uso lícito.
          </p>
          <p style={{ marginTop: 12 }}>
            A Kaleidos mantém a propriedade da ferramenta em si (software,
            marca, identidade visual &quot;Reels Viral&quot; e
            &quot;Kaleidos&quot;). É vedado republicar o produto como se fosse
            seu ou utilizar nossas marcas sem autorização por escrito.
          </p>
        </Section>

        <Section title="4. Vídeos analisados e direitos de terceiros">
          <p>
            O Serviço analisa Reels do Instagram submetidos pelo Usuário para
            extrair estrutura (hook, ritmo, transições, gatilhos). O vídeo
            original <strong>não é redistribuído</strong> — apenas dissecado em
            metadados textuais para guiar a geração do seu roteiro adaptado.
          </p>
          <p style={{ marginTop: 12 }}>
            <strong>O Usuário é responsável</strong> pelos links que submete e
            pela conformidade com leis de direitos autorais, direitos conexos
            e regras do Instagram. É vedado utilizar o Serviço para clonagem
            literal de vídeos de terceiros — o produto existe para entregar
            inspiração estrutural, não cópia.
          </p>
        </Section>

        <Section title="5. Planos, cobrança e cancelamento">
          <ul>
            <li>
              Os planos vigentes e respectivos preços estão na{" "}
              <Link href="/" className="rv-link">
                página principal
              </Link>
              . Reajustes são comunicados a assinantes ativos com 30 dias de
              antecedência.
            </li>
            <li>Sem fidelidade. O Usuário pode cancelar a qualquer momento.</li>
            <li>
              Cancelamento durante o ciclo: o mês em curso segue ativo até o
              próximo ciclo, depois não renova. Não fazemos reembolso retroativo
              do mês corrente, salvo em caso de problema técnico imputável a
              nós.
            </li>
            <li>
              Cupons e descontos promocionais aplicam-se apenas ao primeiro
              pagamento, salvo indicação em contrário.
            </li>
          </ul>
        </Section>

        <Section title="6. Responsabilidade">
          <p>
            O Serviço é fornecido &quot;no estado em que se encontra&quot;.
            Empregamos esforços razoáveis para uptime, qualidade de geração e
            precisão, mas <strong>não garantimos</strong>:
          </p>
          <ul>
            <li>
              Que o conteúdo gerado atingirá metas de viralização, alcance ou
              engajamento em qualquer rede social.
            </li>
            <li>Crescimento de seguidores ou resultados comerciais específicos.</li>
            <li>
              Disponibilidade ininterrupta de provedores externos (Google
              Gemini, Apify, Stripe, Neon, Vercel etc.) ou do próprio
              Instagram.
            </li>
          </ul>
          <p style={{ marginTop: 12 }}>
            O Usuário é responsável pelo conteúdo que publica em redes sociais
            e pela conformidade com leis de publicidade, direitos autorais,
            marcas e regras das plataformas de destino.
          </p>
        </Section>

        <Section title="7. Uso aceitável">
          <p>É vedado utilizar o Serviço para:</p>
          <ul>
            <li>
              Gerar conteúdo ilícito, discurso de ódio, apologia à violência ou
              desinformação.
            </li>
            <li>Violar direitos autorais ou marca registrada de terceiros.</li>
            <li>
              Realizar engenharia reversa do nosso produto, scraping abusivo ou
              revender acesso à API sem contrato.
            </li>
            <li>
              Submeter Reels obtidos por meios ilícitos (vídeos privados,
              vazados, etc.).
            </li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Podemos suspender ou encerrar contas em caso de abuso, fraude,
            chargeback indevido ou violação destes Termos, sem reembolso quando
            a violação for comprovada.
          </p>
        </Section>

        <Section title="8. Dados pessoais">
          <p>
            O tratamento de dados pessoais segue a{" "}
            <Link href="/privacy" className="rv-link">
              Política de Privacidade
            </Link>
            . Para excluir seus dados, envie pedido para{" "}
            <a className="rv-link" href="mailto:gf.madureiraa@gmail.com">
              gf.madureiraa@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section title="9. Alterações destes Termos">
          <p>
            Podemos atualizar estes Termos a qualquer momento. Alterações
            materiais serão comunicadas por e-mail ao Usuário logado. O uso
            continuado após a comunicação implica concordância com a nova
            versão.
          </p>
        </Section>

        <Section title="10. Contato">
          <p>
            Dúvidas sobre estes Termos:{" "}
            <a className="rv-link" href="mailto:gf.madureiraa@gmail.com">
              gf.madureiraa@gmail.com
            </a>
            .
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
