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

import { MemoryKvStore } from "@fedify/fedify/federation";
import { importJwk } from "@fedify/fedify/sig";
import {
  Create,
  Follow,
  Note,
  Person,
  PUBLIC_COLLECTION,
} from "@fedify/fedify/vocab";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertFalse } from "@std/assert/false";
import {
  KvRepository,
  MemoryRepository,
  type Repository,
} from "./repository.ts";

function createKvRepository(): Repository {
  return new KvRepository(new MemoryKvStore());
}

function createMemoryRepository(): Repository {
  return new MemoryRepository();
}

const factories: Record<string, () => Repository> = {
  KvRepository: createKvRepository,
  MemoryRepository: createMemoryRepository,
};

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
  {
    privateKey: await importJwk({
      kty: "OKP",
      crv: "Ed25519",
      // cSpell: disable-next-line
      x: "CwcwyY7tu4wVzVW3KKX7AnBO8HakA2pg0rhAiMbGtfk",
      key_ops: ["sign"],
      ext: true,
      // cSpell: disable-next-line
      d: "K64nFsAPt892l7rr10uDsBXCW151CUM29SugU6l4ZzE",
    }, "private"),
    publicKey: await importJwk({
      kty: "OKP",
      crv: "Ed25519",
      // cSpell: disable-next-line
      x: "CwcwyY7tu4wVzVW3KKX7AnBO8HakA2pg0rhAiMbGtfk",
      key_ops: ["verify"],
      ext: true,
    }, "public"),
  },
];

for (const name in factories) {
  const factory = factories[name];

  Deno.test(name, async (t) => {
    const repo = factory();

    await t.step("key pairs", async () => {
      assertEquals(await repo.getKeyPairs(), undefined);
      await repo.setKeyPairs(keyPairs);
      assertEquals(await repo.getKeyPairs(), keyPairs);
    });

    await t.step("messages", async () => {
      assertEquals(await repo.countMessages(), 0);
      assertEquals(
        await repo.getMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0"),
        undefined,
      );
      assertEquals(
        await repo.getMessage("0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assertEquals(
        await repo.getMessage("01942976-3400-7f34-872e-2cbf0f9eeac4"),
        undefined,
      );
      assertEquals(
        await repo.getMessage("01942e9c-9000-7480-a553-7a6ce737ce14"),
        undefined,
      );
      assertEquals(await Array.fromAsync(repo.getMessages()), []);

      const messageA = new Create({
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
      const messageB = new Create({
        id: new URL(
          "https://example.com/ap/create/0194244f-d800-7873-8993-ef71ccd47306",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        cc: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(
            "https://example.com/ap/note/0194244f-d800-7873-8993-ef71ccd47306",
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          cc: PUBLIC_COLLECTION,
          content: "Hello, world!",
          published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
      });
      const messageC = new Create({
        id: new URL(
          "https://example.com/ap/create/01942976-3400-7f34-872e-2cbf0f9eeac4",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        cc: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(
            "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          cc: PUBLIC_COLLECTION,
          content: "Hello, world!",
          published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
      });
      const messageD = new Create({
        id: new URL(
          "https://example.com/ap/create/01942e9c-9000-7480-a553-7a6ce737ce14",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        cc: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(
            "https://example.com/ap/note/01942e9c-9000-7480-a553-7a6ce737ce14",
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          cc: PUBLIC_COLLECTION,
          content: "Hello, world!",
          published: Temporal.Instant.from("2025-01-04T00:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-04T00:00:00Z"),
      });
      const messageC2 = new Create({
        id: new URL(
          "https://example.com/ap/create/01942976-3400-7f34-872e-2cbf0f9eeac4",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        to: new URL("https://example.com/ap/actor/bot/followers"),
        cc: PUBLIC_COLLECTION,
        object: new Note({
          id: new URL(
            "https://example.com/ap/note/01942976-3400-7f34-872e-2cbf0f9eeac4",
          ),
          attribution: new URL("https://example.com/ap/actor/bot"),
          to: new URL("https://example.com/ap/actor/bot/followers"),
          cc: PUBLIC_COLLECTION,
          content: "Hi, world!",
          published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
          updated: Temporal.Instant.from("2025-01-03T12:00:00Z"),
        }),
        published: Temporal.Instant.from("2025-01-03T00:00:00Z"),
        updated: Temporal.Instant.from("2025-01-03T12:00:00Z"),
      });

      await repo.addMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0", messageA);
      assertEquals(await repo.countMessages(), 1);
      assertEquals(
        await (await repo.getMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0"))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assertEquals(
        await repo.getMessage("0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assertEquals(
        await repo.getMessage("01942976-3400-7f34-872e-2cbf0f9eeac4"),
        undefined,
      );
      assertEquals(
        await repo.getMessage("01942e9c-9000-7480-a553-7a6ce737ce14"),
        undefined,
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages())).map((m) => m.toJsonLd()),
        ),
        [await messageA.toJsonLd()],
      );

      await repo.addMessage("0194244f-d800-7873-8993-ef71ccd47306", messageB);
      assertEquals(await repo.countMessages(), 2);
      assertEquals(
        await (await repo.getMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0"))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assertEquals(
        await (await repo.getMessage("0194244f-d800-7873-8993-ef71ccd47306"))
          ?.toJsonLd(),
        await messageB.toJsonLd(),
      );
      assertEquals(
        await repo.getMessage("01942976-3400-7f34-872e-2cbf0f9eeac4"),
        undefined,
      );
      assertEquals(
        await repo.getMessage("01942e9c-9000-7480-a553-7a6ce737ce14"),
        undefined,
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages())).map((m) => m.toJsonLd()),
        ),
        [await messageB.toJsonLd(), await messageA.toJsonLd()],
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages({ order: "oldest" }))).map((
            m,
          ) => m.toJsonLd()),
        ),
        [await messageA.toJsonLd(), await messageB.toJsonLd()],
      );

      await repo.addMessage("01942976-3400-7f34-872e-2cbf0f9eeac4", messageC);
      assertEquals(await repo.countMessages(), 3);
      assertEquals(
        await (await repo.getMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0"))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assertEquals(
        await (await repo.getMessage("0194244f-d800-7873-8993-ef71ccd47306"))
          ?.toJsonLd(),
        await messageB.toJsonLd(),
      );
      assertEquals(
        await (await repo.getMessage("01942976-3400-7f34-872e-2cbf0f9eeac4"))
          ?.toJsonLd(),
        await messageC.toJsonLd(),
      );
      assertEquals(
        await repo.getMessage("01942e9c-9000-7480-a553-7a6ce737ce14"),
        undefined,
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages({ order: "newest" }))).map((
            m,
          ) => m.toJsonLd()),
        ),
        [
          await messageC.toJsonLd(),
          await messageB.toJsonLd(),
          await messageA.toJsonLd(),
        ],
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages({ order: "oldest" }))).map((
            m,
          ) => m.toJsonLd()),
        ),
        [
          await messageA.toJsonLd(),
          await messageB.toJsonLd(),
          await messageC.toJsonLd(),
        ],
      );

      await repo.addMessage("01942e9c-9000-7480-a553-7a6ce737ce14", messageD);
      assertEquals(await repo.countMessages(), 4);
      assertEquals(
        await (await repo.getMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0"))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assertEquals(
        await (await repo.getMessage("0194244f-d800-7873-8993-ef71ccd47306"))
          ?.toJsonLd(),
        await messageB.toJsonLd(),
      );
      assertEquals(
        await (await repo.getMessage("01942976-3400-7f34-872e-2cbf0f9eeac4"))
          ?.toJsonLd(),
        await messageC.toJsonLd(),
      );
      assertEquals(
        await (await repo.getMessage("01942e9c-9000-7480-a553-7a6ce737ce14"))
          ?.toJsonLd(),
        await messageD.toJsonLd(),
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages())).map((
            m,
          ) => m.toJsonLd()),
        ),
        [
          await messageD.toJsonLd(),
          await messageC.toJsonLd(),
          await messageB.toJsonLd(),
          await messageA.toJsonLd(),
        ],
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(
            repo.getMessages({
              order: "oldest",
              until: Temporal.Instant.from("2025-01-03T00:00:00Z"),
            }),
          )).map((m) => m.toJsonLd()),
        ),
        [
          await messageA.toJsonLd(),
          await messageB.toJsonLd(),
          await messageC.toJsonLd(),
        ],
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(
            repo.getMessages({
              since: Temporal.Instant.from("2025-01-02T00:00:00Z"),
            }),
          )).map((m) => m.toJsonLd()),
        ),
        [
          await messageD.toJsonLd(),
          await messageC.toJsonLd(),
          await messageB.toJsonLd(),
        ],
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(
            repo.getMessages({
              until: Temporal.Instant.from("2025-01-03T00:00:00Z"),
              since: Temporal.Instant.from("2025-01-02T00:00:00Z"),
            }),
          )).map((m) => m.toJsonLd()),
        ),
        [
          await messageC.toJsonLd(),
          await messageB.toJsonLd(),
        ],
      );

      const removed = await repo.removeMessage(
        "0194244f-d800-7873-8993-ef71ccd47306",
      );
      assertEquals(await removed?.toJsonLd(), await messageB.toJsonLd());
      assertEquals(await repo.countMessages(), 3);
      assertEquals(
        await (await repo.getMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0"))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assertEquals(
        await repo.getMessage("0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assertEquals(
        await (await repo.getMessage("01942976-3400-7f34-872e-2cbf0f9eeac4"))
          ?.toJsonLd(),
        await messageC.toJsonLd(),
      );
      assertEquals(
        await (await repo.getMessage("01942e9c-9000-7480-a553-7a6ce737ce14"))
          ?.toJsonLd(),
        await messageD.toJsonLd(),
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages({ order: "newest" }))).map((
            m,
          ) => m.toJsonLd()),
        ),
        [
          await messageD.toJsonLd(),
          await messageC.toJsonLd(),
          await messageA.toJsonLd(),
        ],
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getMessages({ order: "oldest" }))).map((
            m,
          ) => m.toJsonLd()),
        ),
        [
          await messageA.toJsonLd(),
          await messageC.toJsonLd(),
          await messageD.toJsonLd(),
        ],
      );

      await repo.updateMessage(
        "01942976-3400-7f34-872e-2cbf0f9eeac4",
        async (messageC) =>
          messageC.clone({
            object: await messageC2.getObject(),
            updated: messageC2.updated,
          }),
      );
      assertEquals(await repo.countMessages(), 3);
      assertEquals(
        await (await repo.getMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0"))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assertEquals(
        await repo.getMessage("0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assertEquals(
        await (await repo.getMessage("01942976-3400-7f34-872e-2cbf0f9eeac4"))
          ?.toJsonLd(),
        await messageC2.toJsonLd(),
      );
      assertEquals(
        await (await repo.getMessage("01942e9c-9000-7480-a553-7a6ce737ce14"))
          ?.toJsonLd(),
        await messageD.toJsonLd(),
      );

      let updaterCalled = false;
      const updated = await repo.updateMessage(
        "00000000-0000-0000-0000-000000000000",
        (message) => {
          updaterCalled = true;
          return message;
        },
      );
      assertFalse(updated);
      assertFalse(updaterCalled);
      assertEquals(await repo.countMessages(), 3);
      assertEquals(
        await (await repo.getMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0"))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assertEquals(
        await repo.getMessage("0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assertEquals(
        await (await repo.getMessage("01942976-3400-7f34-872e-2cbf0f9eeac4"))
          ?.toJsonLd(),
        await messageC2.toJsonLd(),
      );
      assertEquals(
        await (await repo.getMessage("01942e9c-9000-7480-a553-7a6ce737ce14"))
          ?.toJsonLd(),
        await messageD.toJsonLd(),
      );

      const updated2 = await repo.updateMessage(
        "01942e9c-9000-7480-a553-7a6ce737ce14",
        (_) => undefined,
      );
      assertFalse(updated2);
      assertEquals(await repo.countMessages(), 3);
      assertEquals(
        await (await repo.getMessage("01941f29-7c00-7fe8-ab0a-7b593990a3c0"))
          ?.toJsonLd(),
        await messageA.toJsonLd(),
      );
      assertEquals(
        await repo.getMessage("0194244f-d800-7873-8993-ef71ccd47306"),
        undefined,
      );
      assertEquals(
        await (await repo.getMessage("01942976-3400-7f34-872e-2cbf0f9eeac4"))
          ?.toJsonLd(),
        await messageC2.toJsonLd(),
      );
      assertEquals(
        await (await repo.getMessage("01942e9c-9000-7480-a553-7a6ce737ce14"))
          ?.toJsonLd(),
        await messageD.toJsonLd(),
      );
    });

    await t.step("followers", async () => {
      const followerA = new Person({
        id: new URL("https://example.com/ap/actor/john"),
        preferredUsername: "john",
      });
      const followFromA = new URL(
        "https://example.com/ap/follow/be2da56a-0ea3-4a6a-9dff-2a1837be67e0",
      );
      const followerB = new Person({
        id: new URL("https://example.com/ap/actor/jane"),
        preferredUsername: "jane",
      });
      const followFromB = new URL(
        "https://example.com/ap/follow/8b76286d-5eef-4f02-8a16-080ff2b0e2ca",
      );

      assertEquals(await repo.countFollowers(), 0);
      assertFalse(await repo.hasFollower(followerA.id!));
      assertFalse(await repo.hasFollower(followerB.id!));
      assertEquals(await Array.fromAsync(repo.getFollowers()), []);

      await repo.addFollower(followFromA, followerA);
      assertEquals(await repo.countFollowers(), 1);
      assert(await repo.hasFollower(followerA.id!));
      assertFalse(await repo.hasFollower(followerB.id!));
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getFollowers())).map((f) => f.toJsonLd()),
        ),
        [await followerA.toJsonLd()],
      );

      await repo.addFollower(followFromB, followerB);
      assertEquals(await repo.countFollowers(), 2);
      assert(await repo.hasFollower(followerA.id!));
      assert(await repo.hasFollower(followerB.id!));
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getFollowers())).map((f) => f.toJsonLd()),
        ),
        [await followerA.toJsonLd(), await followerB.toJsonLd()],
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getFollowers({ offset: 1 }))).map((f) =>
            f.toJsonLd()
          ),
        ),
        [await followerB.toJsonLd()],
      );
      assertEquals(
        await Promise.all(
          (await Array.fromAsync(repo.getFollowers({ limit: 1 }))).map((f) =>
            f.toJsonLd()
          ),
        ),
        [await followerA.toJsonLd()],
      );

      assertEquals(
        await repo.removeFollower(followFromA, followerB.id!),
        undefined,
      );
      assertEquals(
        await repo.removeFollower(followFromB, followerA.id!),
        undefined,
      );
      assertEquals(await repo.countFollowers(), 2);
      assert(await repo.hasFollower(followerA.id!));
      assert(await repo.hasFollower(followerB.id!));

      await repo.removeFollower(followFromA, followerA.id!);
      assertEquals(await repo.countFollowers(), 1);
      assertFalse(await repo.hasFollower(followerA.id!));
      assert(await repo.hasFollower(followerB.id!));

      await repo.removeFollower(followFromB, followerB.id!);
      assertEquals(await repo.countFollowers(), 0);
      assertFalse(await repo.hasFollower(followerA.id!));
      assertFalse(await repo.hasFollower(followerB.id!));
    });

    await t.step("sent follows", async () => {
      const follow = new Follow({
        id: new URL(
          "https://example.com/ap/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new URL("https://example.com/ap/actor/john"),
      });

      assertEquals(
        await repo.getSentFollow("03a395a2-353a-4894-afdb-2cab31a7b004"),
        undefined,
      );

      await repo.addSentFollow("03a395a2-353a-4894-afdb-2cab31a7b004", follow);
      assertEquals(
        await (await repo.getSentFollow("03a395a2-353a-4894-afdb-2cab31a7b004"))
          ?.toJsonLd(),
        await follow.toJsonLd(),
      );

      await repo.removeSentFollow("03a395a2-353a-4894-afdb-2cab31a7b004");
      assertEquals(
        await repo.getSentFollow("03a395a2-353a-4894-afdb-2cab31a7b004"),
        undefined,
      );
    });

    await t.step("followees", async () => {
      const followeeId = new URL("https://example.com/ap/actor/john");
      const follow = new Follow({
        id: new URL(
          "https://example.com/ap/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: followeeId,
      });

      assertEquals(await repo.getFollowee(followeeId), undefined);

      await repo.addFollowee(followeeId, follow);
      assertEquals(
        await (await repo.getFollowee(followeeId))?.toJsonLd(),
        await follow.toJsonLd(),
      );

      await repo.removeFollowee(followeeId);
      assertEquals(await repo.getFollowee(followeeId), undefined);
    });
  });
}
