import nextConfig from "eslint-config-next";

/**
 * ESLint 9 flat config para Next 16. eslint-config-next@16.2+ já exporta
 * flat config nativo como default (array de blocks), então é só
 * spread direto. Antes (commit anterior) tentei via FlatCompat e dava
 * "circular structure" porque o config interno tem refs cruzadas que
 * o validator clássico não consegue stringify.
 *
 * Sem este arquivo, `bun run lint` quebrava com "couldn't find config"
 * (ESLint 9 não acha mais .eslintrc* por padrão).
 */
const config = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "*.config.mjs",
      "*.config.ts",
      "scripts/**",
    ],
  },
];

export default config;
