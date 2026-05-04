/**
 * Smoke tests pra extractShortCode — guarda o regex contra regressão de
 * `/p/` (carrossel) e `/tv/` (igtv) que NÃO são reels e queimavam 1 hit
 * Apify (~$0.008) antes do guard `item.type !== "Video"` rejeitar.
 *
 * Rodar: `bun test lib/utils.test.ts` (Bun test runner)
 *        ou `node --test --import tsx lib/utils.test.ts`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractShortCode } from "./utils";

test("aceita /reel/", () => {
  assert.equal(
    extractShortCode("https://instagram.com/reel/ABC123/"),
    "ABC123",
  );
});

test("aceita /reels/", () => {
  assert.equal(
    extractShortCode("https://instagram.com/reels/ABC123/"),
    "ABC123",
  );
});

test("aceita /reel/ com username intermediário", () => {
  assert.equal(
    extractShortCode("https://instagram.com/ogmadureira/reel/ABC123/"),
    "ABC123",
  );
});

test("aceita /reel/ sem trailing slash", () => {
  assert.equal(
    extractShortCode("https://instagram.com/reel/ABC123"),
    "ABC123",
  );
});

test("rejeita /p/ (carrossel)", () => {
  assert.equal(extractShortCode("https://instagram.com/p/ABC123/"), null);
});

test("rejeita /tv/ (igtv)", () => {
  assert.equal(extractShortCode("https://instagram.com/tv/ABC123/"), null);
});

test("rejeita URL sem reel", () => {
  assert.equal(extractShortCode("https://instagram.com/ogmadureira/"), null);
});

test("rejeita URL não-instagram", () => {
  assert.equal(extractShortCode("https://tiktok.com/reel/ABC123/"), null);
});
