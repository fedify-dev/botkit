// BotKit by Fedify: A framework for creating ActivityPub bots
// Copyright (C) 2025 Hong Minhee <https://hongminhee.org/>
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
import { Create, Note, Person, PUBLIC_COLLECTION } from "@fedify/fedify/vocab";
import assert from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      assert.deepStrictEqual(await repo.getKeyPairs(), undefined);
      await repo.setKeyPairs(keyPairs);
      assert.deepStrictEqual(await repo.getKeyPairs(), keyPairs);
    } finally {
      repo.close();
    }
  });

  test("messages basic operations", async () => {
    const repo = createSqliteRepository();
    try {
      assert.deepStrictEqual(await repo.countMessages(), 0);
      assert.deepStrictEqual(
        await repo.getMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0"),
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

      await repo.addMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0", message);
      assert.deepStrictEqual(await repo.countMessages(), 1);

      const retrieved = await repo.getMessage(
        "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
      );
      assert.deepStrictEqual(
        await retrieved?.toJsonLd(),
        await message.toJsonLd(),
      );

      const removed = await repo.removeMessage(
        "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
      );
      assert.deepStrictEqual(
        await removed?.toJsonLd(),
        await message.toJsonLd(),
      );
      assert.deepStrictEqual(await repo.countMessages(), 0);
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

      assert.deepStrictEqual(await repo.countFollowers(), 0);
      assert.deepStrictEqual(await repo.hasFollower(follower.id!), false);

      await repo.addFollower(followRequestId, follower);
      assert.deepStrictEqual(await repo.countFollowers(), 1);
      assert.ok(await repo.hasFollower(follower.id!));

      const followers = await Array.fromAsync(repo.getFollowers());
      assert.deepStrictEqual(followers.length, 1);
      assert.deepStrictEqual(
        await followers[0].toJsonLd(),
        await follower.toJsonLd(),
      );

      await repo.removeFollower(followRequestId, follower.id!);
      assert.deepStrictEqual(await repo.countFollowers(), 0);
      assert.deepStrictEqual(await repo.hasFollower(follower.id!), false);
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
      assert.deepStrictEqual(await repo.countVoters(messageId), 0);
      assert.deepStrictEqual(await repo.countVotes(messageId), {});

      // Single voter, single option
      await repo.vote(messageId, voter1, "option1");
      assert.deepStrictEqual(await repo.countVoters(messageId), 1);
      assert.deepStrictEqual(await repo.countVotes(messageId), {
        "option1": 1,
      });

      // Same voter votes for same option again (should be ignored)
      await repo.vote(messageId, voter1, "option1");
      assert.deepStrictEqual(await repo.countVoters(messageId), 1);
      assert.deepStrictEqual(await repo.countVotes(messageId), {
        "option1": 1,
      });

      // Different voter votes for same option
      await repo.vote(messageId, voter2, "option1");
      assert.deepStrictEqual(await repo.countVoters(messageId), 2);
      assert.deepStrictEqual(await repo.countVotes(messageId), {
        "option1": 2,
      });

      // Same voter votes for different option (multiple choice)
      await repo.vote(messageId, voter1, "option2");
      assert.deepStrictEqual(await repo.countVoters(messageId), 2);
      assert.deepStrictEqual(await repo.countVotes(messageId), {
        "option1": 2,
        "option2": 1,
      });
    } finally {
      repo.close();
    }
  });

  test("file-based database persistence", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "botkit_sqlite_test_"));
    const dbPath = `${tempDir}/test.db`;

    try {
      // Create and populate first repository
      const repo1 = createSqliteRepository({ path: dbPath });
      await repo1.setKeyPairs(keyPairs);

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

      await repo1.addMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0", message);
      repo1.close();

      // Open the same database file with a new repository instance
      const repo2 = createSqliteRepository({ path: dbPath });
      try {
        // Verify data persists
        assert.deepStrictEqual(await repo2.getKeyPairs(), keyPairs);
        assert.deepStrictEqual(await repo2.countMessages(), 1);
        assert.deepStrictEqual(
          await (await repo2.getMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0"))
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
