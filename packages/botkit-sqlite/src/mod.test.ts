// BotKit by Fedify: A framework for creating ActivityPub bots
// Copyright (C) 2025–2026 Hong Minhee <https://hongminhee.org/>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
import {
  SqliteRepository,
  type SqliteRepositoryOptions,
} from "@fedify/botkit-sqlite";
import { importJwk } from "@fedify/fedify/sig";
import {
  Create,
  Follow,
  Note,
  Person,
  PUBLIC_COLLECTION,
  QuoteAuthorization,
} from "@fedify/vocab";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "node:test";

if (!("Temporal" in globalThis)) {
  globalThis.Temporal = (await import("@js-temporal" + "/polyfill")).Temporal;
}

function createSqliteRepository(
  options: SqliteRepositoryOptions = {},
): SqliteRepository {
  return new SqliteRepository(options);
}

const keyPairs: CryptoKeyPair[] = [
  {
    publicKey: await importJwk({
      kty: "RSA",
      alg: "RS256",
      // cSpell: disable
      n: "1NZblYSc2beQqDmDUF_VDMeS7bUXShvIMK6NHd9OB-7ivBwad8vUcmqKwWj_ivqZva6EgD-n0549t0Pzn5xTArqEJ-c1DTyhC7TNtof0KIbU75qziHwHOqcyYCHusQgDm_TT7frDuxLqHJQ1UrdADMyCVDPFfcstPHhHp3NYStGeNcBo5B05DB_wkgqX2QF2MamQwkdRRMdZkVees38AsC6GTGoOFRI2lvJuUODtndpyjGAKOkLfkr9XzAcggRYx9ddsHBd5wylffwKhtUtWHkdVBdVAiEX8sZ38LhqNYm161PE83nfEvut6_lCCQ7DlPJ8Tp6SY-f2JTXA-C9sN0uJF8_YGhaCPgolv5Pk2UerQmvhMhql9MLDen1AvZrw0u1CWic0GQeIDA6Op9Exd5azhhdm4iKeYzAekUHFDi6WZRRZRCYgHaEEzXyFt9W3N3paolMYVOh1008d-aIgbYnZMToiwH897uQsNGkd1FVIutycXdeuhAbqB7AtLrzuD78wkKLO8k3DFcix2qaHRqiBKC3lUlDCD_I5yzinY_SOcagdpRxczvi6JN1ahUg39ZKYRtJIxUOp1H3iRrebbaOoxM19-axKH1om0sYtyX4JqYfN9QrSf3cO1I6CGnJY8hIkQ6CDH5Tmk_4VRRKdzphq4jZiiOYfR94WODPKDjTM",
      e: "AQAB",
      // cSpell: enable
      key_ops: ["verify"],
      ext: true,
    }, "public"),
    privateKey: await importJwk({
      kty: "RSA",
      alg: "RS256",
      // cSpell: disable
      n: "1NZblYSc2beQqDmDUF_VDMeS7bUXShvIMK6NHd9OB-7ivBwad8vUcmqKwWj_ivqZva6EgD-n0549t0Pzn5xTArqEJ-c1DTyhC7TNtof0KIbU75qziHwHOqcyYCHusQgDm_TT7frDuxLqHJQ1UrdADMyCVDPFfcstPHhHp3NYStGeNcBo5B05DB_wkgqX2QF2MamQwkdRRMdZkVees38AsC6GTGoOFRI2lvJuUODtndpyjGAKOkLfkr9XzAcggRYx9ddsHBd5wylffwKhtUtWHkdVBdVAiEX8sZ38LhqNYm161PE83nfEvut6_lCCQ7DlPJ8Tp6SY-f2JTXA-C9sN0uJF8_YGhaCPgolv5Pk2UerQmvhMhql9MLDen1AvZrw0u1CWic0GQeIDA6Op9Exd5azhhdm4iKeYzAekUHFDi6WZRRZRCYgHaEEzXyFt9W3N3paolMYVOh1008d-aIgbYnZMToiwH897uQsNGkd1FVIutycXdeuhAbqB7AtLrzuD78wkKLO8k3DFcix2qaHRqiBKC3lUlDCD_I5yzinY_SOcagdpRxczvi6JN1ahUg39ZKYRtJIxUOp1H3iRrebbaOoxM19-axKH1om0sYtyX4JqYfN9QrSf3cO1I6CGnJY8hIkQ6CDH5Tmk_4VRRKdzphq4jZiiOYfR94WODPKDjTM",
      e: "AQAB",
      d: "Yl3DrCHDIDhfifAyyWXRIHvoYyZL4jte1WkG3WSEOtRkRA41CWLSCCNHh8YQPNo_TdQnduJ0nTBIU7f7E6x7DQrI42xPL5Py1mc0oATLiiNurGJyUUUJTklR1e440-bhTCXmANnhtkcyngy9bEI3PvMR1PqsbswFVyo76586kjG5DhykHbGH2Ru14rk0nt23E5LLzY6Kd-AufCbjuQ-ccNC_zvdBFOn7At5-r7CVAVyhjlEgyPZ5P-hhGnG8ywxIANgUJhOPeexYL2o29IQiBBJxsCV0EsdN14UttN0etPvmRh5MRIFUE-zfRkRNQB20hMT8n4FKFlfgKkMS2gXep91h9VVyfYPHAt9jGJgUbIcbx_igeLK3nQlaUXaePf2bAuVRM1kW3P2UR0FOoUKDI5FZmi9XBoEtt0taQYySdKbPSXKaJWO2vKQ4SPyVXzzz-obfVe2zIe1msQ3Tco5RFoHfnufbvvnLC_WUAC9LSfp4jrPvr5lY3uoCFmPma56R-E3mVd2q87Ybk6mqvSh4yWHjid7sfzQ8Ovh9OhZlq_7Mfa3q3M92vNL98iHs8xYkJbE0DJs691UdgX45iNi4DVD-hJ7EbKQQgePsYNovWA611kM-cartevQWk7TBBggy9VYqmdWN0QuVQX9bsHFeYjjKSXg24bV5vYQW3EPkqZk",
      p: "9DeEDfMVdV605MbHCtHnw5xEbzTHd7vK-qAQNIjz5i4EmFC0tK7dvUiSn0WeyMNYJkuxVxTMHoDbWXzXq45tzbTEYuzEo5wsxyoVvldfFnnJIwMu6Hb7PWjyWfpBcbwLISr8fAJaGPzgcFsJE__KxrvLA66m1q_4k1y1L9CvXWfHDvFqb7VLGzKWXXp2wlbsACZuqx2Ff3THcWoOWb-wSww6AGsYAc3zC_DiYvAaTn9MxszZ0UYuMeJIHjLA1dmjL-Nksvq5GukjFxSSTpUS87zJ08fHoB0FzTKIIjJGpMRf6ebReLqbYCdo2Kr7eC7lbcTfwQTPI6gnHSKgPIYF5Q",
      q: "3xtArH_4MQjwRpl7JVivzQUZgDTARkynMpX-4Gvyny6Gxx0QLhHH0lQMRhtFWlI6qLZxCCLC9zhXPmGlqW-QWya8-xE80mX45JTrQlwBHISpTWTV3sI2Lp5dg7CW8Sc40CE4kB4Q2rHhf7V-Aimgmqhnl1uguzH2DXfr3RaCor0ge44k6gi1LXEJN_aFQIIFYL8HQOM0ctdY147Kr2rVHLchRnh8Q4GzBAJvpOcfvEDk9HF09NVxeaivLMXChpuSUHqbEGg_lVkotLnCMb-fUWk8QmO8EFFVU0pyOFDqHKIgrHOLSHjgUvV8moBwnMGQxMgu7rpY3g-9cXfsCoKVNw",
      dp:
        "bL1vajqrelhSGW-83r95_-pLumx4yIJwrcmpjYrRdtNUrnF5FN6r0wVGa-629dOtI1gevZSAErDzelQRP80qbSapLxcXs3XtpjzB87-5kitl-NYJA-8-jSh2iMPacgb1ua4HQDxX27p1QPH4B9SkeHrTuW8B0KQH_a2Q65pzCxcTVj7-UoEZ0SFkPHkz-fJ0INj7--soLwlTaNd9Tk8A81mdVeRZiywlpVJ7quwX-o3KJNa_weQK26FS1Udp_45pkAAjLWJgG3BldHhvcNgF2UtdXpQc-dkSZTyzyu4x8FmUD3T8HlKQrm69y4POdsQC2i6IJsy6YrkTuXBagrh2VQ",
      dq:
        "j0CQZjJEyjdTEAG8cF5hguKjXQ6B5qGROYnV_YNSZaMaJv8iRHJmO0Z8GwenoDbsMyfxq6emR9aFLijEleZsahqVfR-0TePry9lStWkdzZHgozD7oexRnd1Rbh0UzgLBF-I8z0x-xe0xPS7rmbfgx20aFrVentOViVBWwb6SYqvND4hVa2_r5SGPKb_AD4tsqJH_tkosgxCCmuW0fq256JYtZ3I1V6MPrqNhzCAa4GVKnSm8Tvg9xD_rOnRAUu3RJJuUtRQ6v0pgOKqNZiQDx-IqLvaa6l9OygwjCsXpjDkNga0u4Xm7j4jQWOPfasdejPt8Jwy_wtWYbiLyDE2MQQ",
      qi:
        "Th3TS6fHquqNljwZU2Vg7ndI0SmJidIwSTS2LlhM-Y2bxaAUF-orpS504xDVk1xjRYBrdxiTOmohbtoKtiWhLveOUAWVoNilMqgEU7lwnhaE3yfiUoE1x8df_wLP_YiAccFKeMZwsQp29aKLxuYQtO2dRSSQkN0IuxMGchnJtGOGNTbyA44O25IwggV1nlJN7OTX-nsJCSCe1XMojnGezhnD4xXGeSuR3S07oDDiWpvAO7qtRphEavVTtXdJWIr27tBvnUytbpb4uq6A3J4-TZ6X9uzlOw6jBSQhbL7fc83Z9E_wjPTnxfHufiC_AtXow6sK7lCy10aJGHp3jnGVdQ",
      // cSpell: enable
      key_ops: ["sign"],
      ext: true,
    }, "private"),
  },
];

describe("SqliteRepository", () => {
  test("key pairs", async () => {
    const repo = createSqliteRepository();
    try {
      assert.deepStrictEqual(await repo.getKeyPairs("bot"), undefined);
      await repo.setKeyPairs("bot", keyPairs);
      assert.deepStrictEqual(await repo.getKeyPairs("bot"), keyPairs);
    } finally {
      repo.close();
    }
  });

  test("messages basic operations", async () => {
    const repo = createSqliteRepository();
    try {
      assert.deepStrictEqual(await repo.countMessages("bot"), 0);
      assert.deepStrictEqual(
        await repo.getMessage("bot", "01941f29-7c00-7fe8-ab0a-7b593990a3c0"),
        undefined,
      );

      const message = new Create({
        id: new URL(
          "https://example.com/ap/create/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        cc: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(
            "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          cc: PUBLIC_COLLECTION,
          content: "Hello, world!",
          published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
      });

      await repo.addMessage(
        "bot",
        "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        message,
      );
      assert.deepStrictEqual(await repo.countMessages("bot"), 1);

      const retrieved = await repo.getMessage(
        "bot",
        "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
      );
      assert.deepStrictEqual(
        await retrieved?.toJsonLd(),
        await message.toJsonLd(),
      );

      const removed = await repo.removeMessage(
        "bot",
        "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
      );
      assert.deepStrictEqual(
        await removed?.toJsonLd(),
        await message.toJsonLd(),
      );
      assert.deepStrictEqual(await repo.countMessages("bot"), 0);
    } finally {
      repo.close();
    }
  });

  test("followers operations", async () => {
    const repo = createSqliteRepository();
    try {
      const follower = new Person({
        id: new URL("https://example.com/ap/actor/john"),
        preferredUsername: "john",
      });
      const followRequestId = new URL(
        "https://example.com/ap/follow/be2da56a-0ea3-4a6a-9dff-2a1837be67e0",
      );

      assert.deepStrictEqual(await repo.countFollowers("bot"), 0);
      assert.deepStrictEqual(
        await repo.hasFollower("bot", follower.id!),
        false,
      );

      await repo.addFollower("bot", followRequestId, follower);
      assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
      assert.ok(await repo.hasFollower("bot", follower.id!));

      const followers = await Array.fromAsync(repo.getFollowers("bot"));
      assert.deepStrictEqual(followers.length, 1);
      assert.deepStrictEqual(
        await followers[0].toJsonLd(),
        await follower.toJsonLd(),
      );

      await repo.removeFollower("bot", followRequestId, follower.id!);
      assert.deepStrictEqual(await repo.countFollowers("bot"), 0);
      assert.deepStrictEqual(
        await repo.hasFollower("bot", follower.id!),
        false,
      );
    } finally {
      repo.close();
    }
  });

  test("followers with multiple follow requests", async () => {
    const repo = createSqliteRepository();
    try {
      const follower = new Person({
        id: new URL("https://example.com/ap/actor/alice"),
        preferredUsername: "alice",
      });
      const followA = new URL(
        "https://example.com/ap/follow/f2fb7255-d3ad-4fef-8f9a-1d0f2c2ec0b4",
      );
      const followB = new URL(
        "https://example.com/ap/follow/a3d4cc4f-af93-4a9f-a7b3-0b7c0fe4901d",
      );

      await repo.addFollower("bot", followA, follower);
      await repo.addFollower("bot", followB, follower);
      assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
      assert.ok(await repo.hasFollower("bot", follower.id!));

      assert.deepStrictEqual(
        await repo.removeFollower("bot", followA, follower.id!),
        undefined,
      );
      assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
      assert.ok(await repo.hasFollower("bot", follower.id!));

      assert.deepStrictEqual(
        await (await repo.removeFollower("bot", followB, follower.id!))
          ?.toJsonLd(),
        await follower.toJsonLd(),
      );
      assert.deepStrictEqual(await repo.countFollowers("bot"), 0);
      assert.deepStrictEqual(
        await repo.hasFollower("bot", follower.id!),
        false,
      );
    } finally {
      repo.close();
    }
  });

  test("followers with reassigned follow requests", async () => {
    const repo = createSqliteRepository();
    try {
      const oldFollower = new Person({
        id: new URL("https://example.com/ap/actor/alice"),
        preferredUsername: "alice",
      });
      const newFollower = new Person({
        id: new URL("https://example.com/ap/actor/bob"),
        preferredUsername: "bob",
      });
      const followA = new URL(
        "https://example.com/ap/follow/f2fb7255-d3ad-4fef-8f9a-1d0f2c2ec0b4",
      );
      const followB = new URL(
        "https://example.com/ap/follow/a3d4cc4f-af93-4a9f-a7b3-0b7c0fe4901d",
      );

      await repo.addFollower("bot", followA, oldFollower);
      await repo.addFollower("bot", followB, oldFollower);
      await repo.addFollower("bot", followA, newFollower);

      assert.deepStrictEqual(await repo.countFollowers("bot"), 2);
      assert.ok(await repo.hasFollower("bot", oldFollower.id!));
      assert.ok(await repo.hasFollower("bot", newFollower.id!));

      assert.deepStrictEqual(
        await (await repo.removeFollower("bot", followB, oldFollower.id!))
          ?.toJsonLd(),
        await oldFollower.toJsonLd(),
      );
      assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
      assert.deepStrictEqual(
        await repo.hasFollower("bot", oldFollower.id!),
        false,
      );
      assert.ok(await repo.hasFollower("bot", newFollower.id!));

      await repo.addFollower("bot", followA, oldFollower);
      assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
      assert.ok(await repo.hasFollower("bot", oldFollower.id!));
      assert.deepStrictEqual(
        await repo.hasFollower("bot", newFollower.id!),
        false,
      );
      assert.deepStrictEqual(
        await Promise.all(
          (await Array.fromAsync(repo.getFollowers("bot"))).map((follower) =>
            follower.toJsonLd()
          ),
        ),
        [await oldFollower.toJsonLd()],
      );
    } finally {
      repo.close();
    }
  });

  test("poll voting", async () => {
    const repo = createSqliteRepository();
    try {
      const messageId = "01945678-1234-7890-abcd-ef0123456789";
      const voter1 = new URL("https://example.com/ap/actor/alice");
      const voter2 = new URL("https://example.com/ap/actor/bob");

      // Initially, no votes exist
      assert.deepStrictEqual(await repo.countVoters("bot", messageId), 0);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId), {});

      // Single voter, single option
      await repo.vote("bot", messageId, voter1, "option1");
      assert.deepStrictEqual(await repo.countVoters("bot", messageId), 1);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId), {
        "option1": 1,
      });

      // Same voter votes for same option again (should be ignored)
      await repo.vote("bot", messageId, voter1, "option1");
      assert.deepStrictEqual(await repo.countVoters("bot", messageId), 1);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId), {
        "option1": 1,
      });

      // Different voter votes for same option
      await repo.vote("bot", messageId, voter2, "option1");
      assert.deepStrictEqual(await repo.countVoters("bot", messageId), 2);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId), {
        "option1": 2,
      });

      // Same voter votes for different option (multiple choice)
      await repo.vote("bot", messageId, voter1, "option2");
      assert.deepStrictEqual(await repo.countVoters("bot", messageId), 2);
      assert.deepStrictEqual(await repo.countVotes("bot", messageId), {
        "option1": 2,
        "option2": 1,
      });
    } finally {
      repo.close();
    }
  });

  test("keeps the first quote authorization for a quote", async () => {
    const repo = createSqliteRepository();
    try {
      const firstId = "01942976-3400-7f34-872e-2cbf0f9eeac4";
      const secondId = "01942976-3400-7f34-872e-2cbf0f9eeac5";
      const quote = new URL("https://remote.example/notes/quote");
      const target = new URL("https://example.com/ap/note/1");
      const first = new QuoteAuthorization({
        id: new URL(
          `https://example.com/ap/actor/bot/quote-authorization/${firstId}`,
        ),
        attribution: new URL("https://example.com/ap/actor/bot"),
        interactingObject: quote,
        interactionTarget: target,
      });
      const second = new QuoteAuthorization({
        id: new URL(
          `https://example.com/ap/actor/bot/quote-authorization/${secondId}`,
        ),
        attribution: new URL("https://example.com/ap/actor/bot"),
        interactingObject: quote,
        interactionTarget: target,
      });

      await repo.addQuoteAuthorization("bot", firstId, first);
      await repo.addQuoteAuthorization("bot", secondId, second);

      assert.deepStrictEqual(
        (await repo.findQuoteAuthorization("bot", quote))?.id?.href,
        first.id?.href,
      );
      assert.deepStrictEqual(
        await repo.getQuoteAuthorization("bot", secondId),
        undefined,
      );
    } finally {
      repo.close();
    }
  });

  test("stores quote authorization references", async () => {
    const repo = createSqliteRepository();
    try {
      const authorization = new URL("https://remote.example/stamps/1");
      const firstMessageId = "01942976-3400-7f34-872e-2cbf0f9eeac4";
      const secondMessageId = "01942976-3400-7f34-872e-2cbf0f9eeac5";

      await repo.addQuoteAuthorizationReference(
        "bot",
        authorization,
        firstMessageId,
      );

      assert.deepStrictEqual(
        await repo.findQuoteAuthorizationReference("other", authorization),
        undefined,
      );
      assert.deepStrictEqual(
        await Array.fromAsync(
          repo.findQuoteAuthorizationReferenceIdentifiers(authorization),
        ),
        ["bot"],
      );
      assert.deepStrictEqual(
        await repo.findQuoteAuthorizationReference("bot", authorization),
        firstMessageId,
      );
      await repo.addQuoteAuthorizationReference(
        "other",
        authorization,
        firstMessageId,
      );
      assert.deepStrictEqual(
        await Array.fromAsync(
          repo.findQuoteAuthorizationReferenceIdentifiers(authorization),
        ),
        ["bot", "other"],
      );

      await repo.addQuoteAuthorizationReference(
        "bot",
        authorization,
        secondMessageId,
      );

      assert.deepStrictEqual(
        await repo.findQuoteAuthorizationReference("bot", authorization),
        secondMessageId,
      );

      await repo.removeQuoteAuthorizationReference("bot", authorization);

      assert.deepStrictEqual(
        await repo.findQuoteAuthorizationReference("bot", authorization),
        undefined,
      );
      assert.deepStrictEqual(
        await Array.fromAsync(
          repo.findQuoteAuthorizationReferenceIdentifiers(authorization),
        ),
        ["other"],
      );
    } finally {
      repo.close();
    }
  });

  test("removes quote authorization rows before parsing", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "botkit_sqlite_test_"));
    const dbPath = `${tempDir}/test.db`;
    const repo = createSqliteRepository({ path: dbPath });
    repo.close();
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`
        INSERT INTO quote_authorizations
          (bot_id, id, interacting_object, authorization_json)
        VALUES (?, ?, ?, ?)
      `).run(
        "bot",
        "01942976-3400-7f34-872e-2cbf0f9eeac4",
        "https://remote.example/notes/quote",
        "{",
      );
    } finally {
      db.close();
    }

    const reopened = createSqliteRepository({ path: dbPath });
    try {
      assert.deepStrictEqual(
        await reopened.removeQuoteAuthorization(
          "bot",
          "01942976-3400-7f34-872e-2cbf0f9eeac4",
        ),
        undefined,
      );
      assert.deepStrictEqual(
        await reopened.findQuoteAuthorization(
          "bot",
          new URL("https://remote.example/notes/quote"),
        ),
        undefined,
      );
    } finally {
      reopened.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("file-based database persistence", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "botkit_sqlite_test_"));
    const dbPath = `${tempDir}/test.db`;

    try {
      // Create and populate first repository
      const repo1 = createSqliteRepository({ path: dbPath });
      await repo1.setKeyPairs("bot", keyPairs);

      const message = new Create({
        id: new URL(
          "https://example.com/ap/create/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        cc: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(
            "https://example.com/ap/note/01941f29-7c00-7fe8-ab0a-7b593990a3c0",
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          cc: PUBLIC_COLLECTION,
          content: "Persistent test message",
          published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
      });

      await repo1.addMessage(
        "bot",
        "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
        message,
      );
      repo1.close();

      // Open the same database file with a new repository instance
      const repo2 = createSqliteRepository({ path: dbPath });
      try {
        // Verify data persists
        assert.deepStrictEqual(await repo2.getKeyPairs("bot"), keyPairs);
        assert.deepStrictEqual(await repo2.countMessages("bot"), 1);
        assert.deepStrictEqual(
          await (await repo2.getMessage(
            "bot",
            "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
          ))
            ?.toJsonLd(),
          await message.toJsonLd(),
        );
      } finally {
        repo2.close();
      }
    } finally {
      // Clean up temp directory
      await rm(tempDir, { recursive: true });
    }
  });
});

describe("SqliteRepository multitenancy", () => {
  test("isolates data by bot identifier", async () => {
    const repo = createSqliteRepository();
    try {
      const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0" as const;
      const message = new Create({
        id: new URL(
          `https://example.com/ap/actor/botA/create/${messageId}`,
        ),
        actor: new URL("https://example.com/ap/actor/botA"),
        object: new Note({
          id: new URL(`https://example.com/ap/actor/botA/note/${messageId}`),
          content: "Hello, world!",
        }),
      });
      await repo.addMessage("botA", messageId, message);
      assert.deepStrictEqual(
        await repo.getMessage("botB", messageId),
        undefined,
      );
      assert.deepStrictEqual(await repo.countMessages("botB"), 0);
      assert.deepStrictEqual(await repo.countMessages("botA"), 1);
      assert.deepStrictEqual(
        await repo.removeMessage("botB", messageId),
        undefined,
      );
      assert.deepStrictEqual(await repo.countMessages("botA"), 1);

      const follower = new Person({
        id: new URL("https://example.com/ap/actor/john"),
        preferredUsername: "john",
      });
      const followId = new URL(
        "https://example.com/ap/follow/be2da56a-0ea3-4a6a-9dff-2a1837be67e0",
      );
      await repo.addFollower("botA", followId, follower);
      assert.deepStrictEqual(
        await repo.hasFollower("botB", follower.id!),
        false,
      );
      assert.ok(await repo.hasFollower("botA", follower.id!));
      assert.deepStrictEqual(
        await repo.removeFollower("botB", followId, follower.id!),
        undefined,
      );
      assert.ok(await repo.hasFollower("botA", follower.id!));

      await repo.setKeyPairs("botA", keyPairs);
      assert.deepStrictEqual(await repo.getKeyPairs("botB"), undefined);
      assert.deepStrictEqual(await repo.getKeyPairs("botA"), keyPairs);

      await repo.vote("botA", messageId, follower.id!, "option1");
      assert.deepStrictEqual(await repo.countVoters("botB", messageId), 0);
      assert.deepStrictEqual(await repo.countVoters("botA", messageId), 1);
    } finally {
      repo.close();
    }
  });

  test("findFollowedBots()", async () => {
    const repo = createSqliteRepository();
    try {
      const followeeId = new URL("https://example.com/ap/actor/john");
      const followA = new Follow({
        id: new URL(
          "https://example.com/ap/actor/botA/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
        ),
        actor: new URL("https://example.com/ap/actor/botA"),
        object: followeeId,
      });
      const followB = new Follow({
        id: new URL(
          "https://example.com/ap/actor/botB/follow/e35ff5d8-ede9-4f5e-9b83-4bfcd4c9a69c",
        ),
        actor: new URL("https://example.com/ap/actor/botB"),
        object: followeeId,
      });
      assert.deepStrictEqual(
        await Array.fromAsync(repo.findFollowedBots(followeeId)),
        [],
      );
      await repo.addFollowee("botA", followeeId, followA);
      await repo.addFollowee("botB", followeeId, followB);
      assert.deepStrictEqual(
        await Array.fromAsync(repo.findFollowedBots(followeeId)),
        ["botA", "botB"],
      );
      await repo.removeFollowee("botA", followeeId);
      assert.deepStrictEqual(
        await Array.fromAsync(repo.findFollowedBots(followeeId)),
        ["botB"],
      );
    } finally {
      repo.close();
    }
  });
});

describe("SqliteRepository legacy schema migration", () => {
  function createLegacyDatabase(path: string): void {
    // The schema used by @fedify/botkit-sqlite 0.4 and earlier:
    const db = new DatabaseSync(path);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(`
      CREATE TABLE key_pairs (
        id INTEGER PRIMARY KEY,
        private_key_jwk TEXT NOT NULL,
        public_key_jwk TEXT NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        activity_json TEXT NOT NULL,
        published INTEGER
      )
    `);
    db.exec(
      "CREATE INDEX idx_messages_published ON messages(published)",
    );
    db.exec(`
      CREATE TABLE followers (
        follower_id TEXT PRIMARY KEY,
        actor_json TEXT NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE follow_requests (
        follow_request_id TEXT PRIMARY KEY,
        follower_id TEXT NOT NULL,
        FOREIGN KEY (follower_id) REFERENCES followers(follower_id)
      )
    `);
    db.exec(`
      CREATE TABLE sent_follows (
        id TEXT PRIMARY KEY,
        follow_json TEXT NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE followees (
        followee_id TEXT PRIMARY KEY,
        follow_json TEXT NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE poll_votes (
        message_id TEXT NOT NULL,
        voter_id TEXT NOT NULL,
        option TEXT NOT NULL,
        PRIMARY KEY (message_id, voter_id, option)
      )
    `);
    db.close();
  }

  async function seedLegacyDatabase(path: string): Promise<{
    messageId: string;
    followerId: string;
    followRequestId: string;
    followeeId: string;
    sentFollowId: string;
  }> {
    const db = new DatabaseSync(path);
    const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0";
    const message = new Create({
      id: new URL(`https://example.com/ap/create/${messageId}`),
      actor: new URL("https://example.com/ap/actor/bot"),
      object: new Note({
        id: new URL(`https://example.com/ap/note/${messageId}`),
        content: "Hello, world!",
        published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
      }),
      published: Temporal.Instant.from("2025-01-01T00:00:00Z"),
    });
    db.prepare(
      "INSERT INTO messages (id, activity_json, published) VALUES (?, ?, ?)",
    ).run(
      messageId,
      JSON.stringify(await message.toJsonLd({ format: "compact" })),
      Temporal.Instant.from("2025-01-01T00:00:00Z").epochMilliseconds,
    );

    const follower = new Person({
      id: new URL("https://example.com/ap/actor/john"),
      preferredUsername: "john",
    });
    const followRequestId =
      "https://example.com/ap/follow/be2da56a-0ea3-4a6a-9dff-2a1837be67e0";
    db.prepare(
      "INSERT INTO followers (follower_id, actor_json) VALUES (?, ?)",
    ).run(
      follower.id!.href,
      JSON.stringify(await follower.toJsonLd({ format: "compact" })),
    );
    db.prepare(
      "INSERT INTO follow_requests (follow_request_id, follower_id) VALUES (?, ?)",
    ).run(followRequestId, follower.id!.href);

    const followeeId = "https://example.com/ap/actor/jane";
    const followeeFollow = new Follow({
      id: new URL(
        "https://example.com/ap/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
      ),
      actor: new URL("https://example.com/ap/actor/bot"),
      object: new URL(followeeId),
    });
    db.prepare(
      "INSERT INTO followees (followee_id, follow_json) VALUES (?, ?)",
    ).run(
      followeeId,
      JSON.stringify(await followeeFollow.toJsonLd({ format: "compact" })),
    );

    const sentFollowId = "e35ff5d8-ede9-4f5e-9b83-4bfcd4c9a69c";
    const sentFollow = new Follow({
      id: new URL(`https://example.com/ap/follow/${sentFollowId}`),
      actor: new URL("https://example.com/ap/actor/bot"),
      object: new URL("https://example.com/ap/actor/joe"),
    });
    db.prepare(
      "INSERT INTO sent_follows (id, follow_json) VALUES (?, ?)",
    ).run(
      sentFollowId,
      JSON.stringify(await sentFollow.toJsonLd({ format: "compact" })),
    );

    db.prepare(
      "INSERT INTO poll_votes (message_id, voter_id, option) VALUES (?, ?, ?)",
    ).run(messageId, "https://example.com/ap/actor/alice", "option1");

    db.close();
    return {
      messageId,
      followerId: follower.id!.href,
      followRequestId,
      followeeId,
      sentFollowId,
    };
  }

  test("rebuilds a legacy database and adopts its data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "botkit-sqlite-test-"));
    try {
      const path = join(dir, "legacy.db");
      createLegacyDatabase(path);
      const seed = await seedLegacyDatabase(path);

      // Opening a legacy database rebuilds the schema with bot_id columns;
      // existing rows get the empty-string bot ID:
      const repo = new SqliteRepository({ path });
      try {
        assert.deepStrictEqual(await repo.countMessages("bot"), 0);

        // migrate() assigns the legacy rows to the given identifier:
        await repo.migrate("bot");
        assert.deepStrictEqual(await repo.countMessages("bot"), 1);
        assert.ok(
          await repo.getMessage(
            "bot",
            seed
              .messageId as `${string}-${string}-${string}-${string}-${string}`,
          ) != null,
        );
        assert.ok(await repo.hasFollower("bot", new URL(seed.followerId)));
        assert.ok(
          await repo.getFollowee("bot", new URL(seed.followeeId)) != null,
        );
        assert.ok(
          await repo.getSentFollow(
            "bot",
            seed
              .sentFollowId as `${string}-${string}-${string}-${string}-${string}`,
          ) != null,
        );
        assert.deepStrictEqual(
          await repo.countVoters(
            "bot",
            seed
              .messageId as `${string}-${string}-${string}-${string}-${string}`,
          ),
          1,
        );
        assert.deepStrictEqual(
          await Array.fromAsync(
            repo.findFollowedBots(new URL(seed.followeeId)),
          ),
          ["bot"],
        );

        // removeFollower() exercises the migrated follow_requests rows:
        const removed = await repo.removeFollower(
          "bot",
          new URL(seed.followRequestId),
          new URL(seed.followerId),
        );
        assert.ok(removed != null);

        // migrate() is idempotent:
        await repo.migrate("bot");
        assert.deepStrictEqual(await repo.countMessages("bot"), 1);
      } finally {
        repo.close();
      }

      // Reopening the migrated database works without another rebuild:
      const repo2 = new SqliteRepository({ path });
      try {
        assert.deepStrictEqual(await repo2.countMessages("bot"), 1);
      } finally {
        repo2.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("does not touch fresh databases", async () => {
    const repo = createSqliteRepository();
    try {
      await repo.migrate("bot");
      assert.deepStrictEqual(await repo.countMessages("bot"), 0);
    } finally {
      repo.close();
    }
  });
});

describe("SqliteRepository.migrate() with empty-string identifiers", () => {
  test("does not reassign data stored under an empty identifier", async () => {
    const repo = createSqliteRepository();
    try {
      // A fresh 0.5 database has no legacy marker, so data stored under
      // the empty-string identifier must never be adopted by migrate():
      await repo.setKeyPairs("", keyPairs);
      await repo.migrate("bot");
      assert.deepStrictEqual(await repo.getKeyPairs(""), keyPairs);
      assert.deepStrictEqual(await repo.getKeyPairs("bot"), undefined);
    } finally {
      repo.close();
    }
  });

  test("adopts legacy rows only once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "botkit-sqlite-test-"));
    try {
      const path = join(dir, "legacy.db");
      const db = new DatabaseSync(path);
      db.exec(`
        CREATE TABLE key_pairs (
          id INTEGER PRIMARY KEY,
          private_key_jwk TEXT NOT NULL,
          public_key_jwk TEXT NOT NULL
        )
      `);
      db.close();

      const repo = new SqliteRepository({ path });
      try {
        await repo.migrate("bot");
        // After adoption, rows written under the empty-string identifier
        // stay put even if migrate() is called again:
        await repo.setKeyPairs("", keyPairs);
        await repo.migrate("bot2");
        assert.deepStrictEqual(await repo.getKeyPairs(""), keyPairs);
        assert.deepStrictEqual(await repo.getKeyPairs("bot2"), undefined);
      } finally {
        repo.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test("SQLite successor persists across reopen and cannot be overwritten", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "botkit-move-"));
  const path = join(directory, "data.sqlite");
  const target = new URL("https://new.example/actor");
  try {
    const repo = new SqliteRepository({ path });
    try {
      assert.strictEqual(await repo.getSuccessor("old", t.signal), undefined);
      const results = await Promise.all([
        repo.setSuccessor("old", target, t.signal),
        repo.setSuccessor(
          "old",
          new URL("https://other.example/actor"),
          t.signal,
        ),
      ]);
      assert.deepStrictEqual(results, [true, false]);
      assert.strictEqual(await repo.getSuccessor("sibling"), undefined);
      await assert.rejects(
        repo.setSuccessor("sibling", target, AbortSignal.abort()),
        { name: "AbortError" },
      );
    } finally {
      repo.close();
    }
    const reopened = new SqliteRepository({ path });
    try {
      assert.deepStrictEqual(await reopened.getSuccessor("old"), target);
      assert.ok(!await reopened.setSuccessor("old", target));
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
