"use client";

/**
 * /app/ajustes — perfil do criador.
 *
 * @ Instagram + nicho + persona + objetivo padrão + CTA padrão. Esses
 * dados alimentam o prompt do Gemini quando o user clica "Pegar pro
 * meu perfil" num reel da biblioteca, evitando ter que preencher form
 * a cada vez.
 */

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Save, Instagram, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getJwtToken } from "@/lib/auth-client";
import type { Objetivo } from "@/lib/types";

interface Profile {
  igHandle: string | null;
  nicho: string | null;
  persona: string | null;
  objetivoPadrao: Objetivo | null;
  ctaPadrao: string | null;
  bioCurta: string | null;
}

const OBJETIVOS: Array<{ id: Objetivo; label: string; hint: string }> = [
  { id: "leads", label: "Leads", hint: "Capturar contatos / lista" },
  { id: "produto", label: "Produto", hint: "Vender / converter" },
  { id: "seguidores", label: "Seguidores", hint: "Crescer audiência" },
  { id: "engajamento", label: "Engajamento", hint: "Comentários / saves" },
];

export default function AjustesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    igHandle: "",
    nicho: "",
    persona: "",
    objetivoPadrao: "seguidores",
    ctaPadrao: "",
    bioCurta: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const jwt = await getJwtToken();
        const res = await fetch("/api/me/profile", {
          headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
        });
        if (!res.ok) {
          toast.error(`Erro ${res.status}`);
          return;
        }
        const data = (await res.json()) as Profile;
        if (cancelled) return;
        setProfile({
          igHandle: data.igHandle ?? "",
          nicho: data.nicho ?? "",
          persona: data.persona ?? "",
          objetivoPadrao: data.objetivoPadrao ?? "seguidores",
          ctaPadrao: data.ctaPadrao ?? "",
          bioCurta: data.bioCurta ?? "",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const jwt = await getJwtToken();
      const res = await fetch("/api/me/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify(profile),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }
      toast.success("Perfil salvo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const profileComplete = Boolean(
    profile.igHandle && profile.nicho && profile.persona,
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--color-rv-paper)",
        color: "var(--color-rv-ink)",
      }}
    >
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div style={{ marginBottom: 28 }}>
          <div className="rv-eyebrow" style={{ marginBottom: 8 }}>
            <span className="rv-rec-dot" /> AJUSTES · PERFIL DE CRIADOR
          </div>
          <h1
            className="rv-display"
            style={{ fontSize: 36, lineHeight: 1.05, marginBottom: 8 }}
          >
            Configura teu <em>perfil</em>.
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-rv-muted)", maxWidth: 580, lineHeight: 1.55 }}>
            Quando preenchido, a IA usa esse contexto pra adaptar reels da
            biblioteca direto pro teu nicho e voz, sem precisar repetir
            informação a cada adaptação.
          </p>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <Loader2 size={24} className="rv-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 18 }}>
            {/* Status */}
            {profileComplete && (
              <div
                style={{
                  background: "rgba(34, 197, 94, 0.06)",
                  border: "1.5px solid rgba(34, 197, 94, 0.4)",
                  borderLeft: "4px solid #22C55E",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 12,
                }}
              >
                <CheckCircle2 size={14} color="#22C55E" />
                <span style={{ color: "var(--color-rv-ink)" }}>
                  Perfil completo. A IA já tem contexto pra adaptar reels com tua voz.
                </span>
              </div>
            )}

            {/* @ Instagram */}
            <Field
              label="@ Instagram"
              hint="Pode colar o @ ou a URL do perfil — a gente normaliza."
              required
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0,
                  border: "1.5px solid var(--color-rv-ink)",
                  background: "var(--color-rv-cream)",
                }}
              >
                <Instagram
                  size={14}
                  style={{ marginLeft: 12, color: "var(--color-rv-muted)" }}
                />
                <span
                  className="rv-mono"
                  style={{
                    fontSize: 12,
                    color: "var(--color-rv-muted)",
                    paddingLeft: 6,
                  }}
                >
                  @
                </span>
                <input
                  type="text"
                  value={profile.igHandle ?? ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      igHandle: e.target.value.replace(/^@+/, ""),
                    })
                  }
                  placeholder="seu_usuario"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    padding: "11px 12px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    color: "var(--color-rv-ink)",
                  }}
                />
              </div>
            </Field>

            {/* Nicho */}
            <Field
              label="Nicho"
              hint="Frase curta. Ex: 'consultoria fitness pra mães', 'newsletter de cripto', 'design de marca pra SaaS'."
              required
            >
              <input
                type="text"
                value={profile.nicho ?? ""}
                onChange={(e) => setProfile({ ...profile, nicho: e.target.value })}
                placeholder="ex: marketing pra agências boutique"
                style={inputStyle}
                maxLength={120}
              />
            </Field>

            {/* Persona */}
            <Field
              label="Persona / público"
              hint="Quem é o público alvo? Ajuda a IA escolher referência cultural certa."
              required
            >
              <textarea
                value={profile.persona ?? ""}
                onChange={(e) => setProfile({ ...profile, persona: e.target.value })}
                placeholder="ex: dono de agência boutique faturando R$ 30-100k/mês, cansado de cliente caro"
                style={{ ...inputStyle, minHeight: 84, resize: "vertical" as const, lineHeight: 1.5 }}
                maxLength={280}
              />
            </Field>

            {/* Objetivo padrão */}
            <Field
              label="Objetivo padrão"
              hint="Qual o objetivo mais comum dos teus reels? Pode mudar caso a caso."
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                {OBJETIVOS.map((o) => {
                  const active = profile.objetivoPadrao === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setProfile({ ...profile, objetivoPadrao: o.id })}
                      style={{
                        padding: "12px 10px",
                        border: "1.5px solid var(--color-rv-ink)",
                        background: active ? "var(--color-rv-ink)" : "var(--color-rv-cream)",
                        color: active ? "var(--color-rv-paper)" : "var(--color-rv-ink)",
                        cursor: "pointer",
                        textAlign: "left",
                        boxShadow: active ? "3px 3px 0 0 var(--color-rv-rec)" : "none",
                        transition: "all 0.12s",
                      }}
                    >
                      <div
                        className="rv-mono"
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          marginBottom: 3,
                        }}
                      >
                        {o.label}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.75 }}>{o.hint}</div>
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* CTA padrão */}
            <Field
              label="CTA padrão"
              hint="Como você costuma fechar os reels? Pode editar caso a caso."
            >
              <input
                type="text"
                value={profile.ctaPadrao ?? ""}
                onChange={(e) => setProfile({ ...profile, ctaPadrao: e.target.value })}
                placeholder="ex: comenta REELS pra receber o template"
                style={inputStyle}
                maxLength={280}
              />
            </Field>

            {/* Bio curta */}
            <Field
              label="Bio curta (opcional)"
              hint="1-2 linhas sobre você. Funciona como contexto extra pra IA escolher tom."
            >
              <textarea
                value={profile.bioCurta ?? ""}
                onChange={(e) => setProfile({ ...profile, bioCurta: e.target.value })}
                placeholder="ex: founder da Kaleidos, agência boutique de marketing pra cripto/web3"
                style={{ ...inputStyle, minHeight: 64, resize: "vertical" as const, lineHeight: 1.5 }}
                maxLength={500}
              />
            </Field>

            {/* Botão salvar */}
            <button
              type="submit"
              disabled={saving}
              className="rv-btn rv-btn-rec"
              style={{
                marginTop: 6,
                padding: "13px 18px",
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? (
                <>
                  <Loader2 size={13} className="rv-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Save size={13} /> Salvar perfil
                </>
              )}
            </button>

            <div
              style={{
                marginTop: 18,
                padding: "14px 16px",
                background: "var(--color-rv-soft)",
                border: "1px dashed var(--color-rv-line)",
                fontSize: 12,
                lineHeight: 1.55,
                color: "var(--color-rv-muted)",
                display: "flex",
                gap: 10,
              }}
            >
              <Sparkles size={14} style={{ flexShrink: 0, marginTop: 2, color: "var(--color-rv-rec)" }} />
              <span>
                Quanto mais específico o nicho e a persona, melhor o roteiro.
                A IA usa esse contexto pra escolher metáforas, exemplos e
                gírias do teu universo, em vez de algo genérico.
              </span>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  border: "1.5px solid var(--color-rv-ink)",
  background: "var(--color-rv-cream)",
  fontFamily: "var(--font-jakarta), sans-serif",
  fontSize: 13,
  color: "var(--color-rv-ink)",
  outline: "none",
};

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span
          className="rv-mono"
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--color-rv-ink)",
          }}
        >
          {label}
          {required && <span style={{ color: "var(--color-rv-rec)", marginLeft: 4 }}>*</span>}
        </span>
      </div>
      {children}
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: "var(--color-rv-muted)",
            marginTop: 5,
            lineHeight: 1.45,
          }}
        >
          {hint}
        </div>
      )}
    </label>
  );
}
