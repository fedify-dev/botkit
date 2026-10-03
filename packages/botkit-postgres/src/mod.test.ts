// BotKit by Fedify: A framework for creating ActivityPub bots
// Copyright (C) 2026 Hong Minhee <https://hongminhee.org/>
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
  initializePostgresRepositorySchema,
  PostgresRepository,
} from "@fedify/botkit-postgres";
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
import { describe, test } from "node:test";
import postgres from "postgres";

if (!("Temporal" in globalThis)) {
  globalThis.Temporal = (await import("@js-temporal" + "/polyfill")).Temporal;
}

function getPostgresUrl(): string | undefined {
  if ("process" in globalThis) return globalThis.process.env.POSTGRES_URL;
  if ("Deno" in globalThis) return globalThis.Deno.env.get("POSTGRES_URL");
  return undefined;
}

function createSchemaName(): string {
  return `botkit_test_${crypto.randomUUID().replaceAll("-", "_")}`;
}

const postgresUrl = getPostgresUrl();

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

function createSql(url: string) {
  return postgres(url, { max: 1, onnotice: () => {} });
}

function waitForMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createHarness() {
  if (postgresUrl == null) throw new Error("POSTGRES_URL is not set.");
  const schema = createSchemaName();
  const adminSql = createSql(postgresUrl);
  const repository = new PostgresRepository({
    url: postgresUrl,
    schema,
    maxConnections: 1,
  });
  return {
    adminSql,
    repository,
    schema,
    async cleanup() {
      await repository.close();
      await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminSql.end();
    },
  };
}

if (postgresUrl == null) {
  test("PostgresRepository integration tests", { skip: true }, () => {});
} else {
  describe("PostgresRepository", () => {
    test("successor is atomic, scoped and persistent", async (t) => {
      const harness = createHarness();
      const repo = harness.repository;
      const target = new URL("https://new.example/actor");
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
        assert.strictEqual(results.filter(Boolean).length, 1);
        const successor = await repo.getSuccessor("old", t.signal);
        assert.ok(successor);
        assert.ok(!await repo.setSuccessor("old", successor));
        assert.strictEqual(await repo.getSuccessor("sibling"), undefined);
        await assert.rejects(
          repo.setSuccessor("sibling", target, AbortSignal.abort()),
          { name: "AbortError" },
        );
        const second = new PostgresRepository({
          url: postgresUrl,
          schema: harness.schema,
        });
        try {
          assert.deepStrictEqual(await second.getSuccessor("old"), successor);
          assert.ok(!await second.setSuccessor("old", target));
        } finally {
          await second.close();
        }
      } finally {
        await harness.cleanup();
      }
    });

    test("initializes schema explicitly", async () => {
      const sql = createSql(postgresUrl);
      const schema = createSchemaName();
      try {
        await initializePostgresRepositorySchema(sql, schema);
        const tables = await sql.unsafe<{ table_name: string }[]>(
          `SELECT table_name
             FROM information_schema.tables
            WHERE table_schema = $1
         ORDER BY table_name`,
          [schema],
          { prepare: true },
        );
        assert.deepStrictEqual(
          tables.map((row) => row.table_name),
          [
            "bot_successors",
            "botkit_metadata",
            "follow_requests",
            "followees",
            "followers",
            "key_pairs",
            "messages",
            "poll_votes",
            "quote_authorization_refs",
            "quote_authorizations",
            "sent_follows",
          ],
        );
      } finally {
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await sql.end();
      }
    });

    test("honors prepare=false during schema initialization", async () => {
      const prepares: boolean[] = [];
      const sql = createSql(postgresUrl);
      const helperSchema = createSchemaName();
      const repositorySchema = createSchemaName();
      const wrappedSql = new Proxy(sql, {
        get(target, property, receiver) {
          if (property === "unsafe") {
            return (
              query: string,
              parameters?: postgres.ParameterOrJSON<never>[],
              options?: postgres.UnsafeQueryOptions,
            ) => {
              prepares.push(options?.prepare ?? true);
              return target.unsafe(query, parameters, options);
            };
          }
          return Reflect.get(target, property, receiver);
        },
      });
      try {
        await initializePostgresRepositorySchema(
          wrappedSql,
          helperSchema,
          false,
        );

        const repo = new PostgresRepository({
          sql: wrappedSql,
          schema: repositorySchema,
          prepare: false,
        });
        await repo.countMessages("bot");

        assert.ok(prepares.length > 0);
        assert.ok(prepares.every((prepare) => !prepare));
      } finally {
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${helperSchema}" CASCADE`);
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${repositorySchema}" CASCADE`);
        await sql.end();
      }
    });

    test("rejects invalid constructor option combinations", async () => {
      const sql = createSql(postgresUrl);
      try {
        await assert.doesNotReject(
          async () =>
            await Reflect.construct(PostgresRepository, [{
              sql,
              url: undefined,
              maxConnections: undefined,
            }]).countMessages("bot"),
        );
        await assert.rejects(
          async () =>
            await Reflect.construct(PostgresRepository, [{
              sql,
              url: postgresUrl,
              maxConnections: 1,
            }]).countMessages("bot"),
          new TypeError(
            "PostgresRepositoryOptions.sql cannot be combined with PostgresRepositoryOptions.url or PostgresRepositoryOptions.maxConnections.",
          ),
        );
      } finally {
        await sql.end();
      }
    });

    test("does not emit unhandled rejections for schema initialization", async () => {
      const error = new Error("Schema initialization failed.");
      const sql = {
        begin: async (
          callback: (
            transactionSql: { unsafe: () => Promise<never> },
          ) => Promise<void>,
        ) => {
          await callback(sql);
        },
        // deno-lint-ignore require-await
        unsafe: async () => {
          throw error;
        },
      };
      let unhandledReason: unknown;
      let detach: (() => void) | undefined;
      if ("process" in globalThis) {
        const handler = (reason: unknown) => {
          unhandledReason = reason;
        };
        globalThis.process.once("unhandledRejection", handler);
        detach = () => {
          globalThis.process.off("unhandledRejection", handler);
        };
      } else {
        const handler = (event: PromiseRejectionEvent) => {
          unhandledReason = event.reason;
          event.preventDefault();
        };
        addEventListener("unhandledrejection", handler);
        detach = () => {
          removeEventListener("unhandledrejection", handler);
        };
      }
      try {
        const repo = Reflect.construct(PostgresRepository, [{
          sql,
          schema: createSchemaName(),
        }]) as PostgresRepository;
        await waitForMacrotask();
        await assert.rejects(
          () => repo.countMessages("bot"),
          error,
        );
        await waitForMacrotask();
        assert.deepStrictEqual(unhandledReason, undefined);
      } finally {
        detach?.();
      }
    });

    test("does not leak stale followers during concurrent assignment", async () => {
      const schema = createSchemaName();
      const adminSql = createSql(postgresUrl);
      const sqlA = createSql(postgresUrl);
      const sqlB = createSql(postgresUrl);
      const followId = new URL(
        "https://example.com/ap/follow/eac8d54f-f843-49f4-94c1-485a22e07907",
      );
      const followerA = new Person({
        id: new URL("https://example.com/ap/actor/concurrent-alice"),
        preferredUsername: "concurrent-alice",
      });
      const followerB = new Person({
        id: new URL("https://example.com/ap/actor/concurrent-bob"),
        preferredUsername: "concurrent-bob",
      });
      let arrivals = 0;
      let releaseBarrier!: () => void;
      const barrier = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
      });
      const barrierTimeout = 50;
      const wrapSql = (sql: postgres.Sql): postgres.Sql =>
        new Proxy(sql, {
          get(target, property, receiver) {
            if (property === "begin") {
              return async (
                callback: (transactionSql: postgres.TransactionSql) => unknown,
              ) =>
                await target.begin(async (transactionSql) =>
                  await callback(
                    new Proxy(transactionSql, {
                      get(txTarget, txProperty, txReceiver) {
                        if (txProperty === "unsafe") {
                          return async <T extends object[]>(
                            query: string,
                            parameters?: postgres.ParameterOrJSON<never>[],
                            options?: postgres.UnsafeQueryOptions,
                          ): Promise<T> => {
                            const result = await txTarget.unsafe<T>(
                              query,
                              parameters,
                              options,
                            );
                            if (
                              arrivals < 2 &&
                              query.includes("SELECT follower_id") &&
                              query.includes("FOR UPDATE") &&
                              parameters?.[1] === followId.href
                            ) {
                              arrivals++;
                              if (arrivals === 2) releaseBarrier();
                              await Promise.race([
                                barrier,
                                new Promise<void>((resolve) =>
                                  setTimeout(resolve, barrierTimeout)
                                ),
                              ]);
                            }
                            return result;
                          };
                        }
                        return Reflect.get(txTarget, txProperty, txReceiver);
                      },
                    }),
                  )
                );
            }
            return Reflect.get(target, property, receiver);
          },
        });
      try {
        await initializePostgresRepositorySchema(adminSql, schema);
        const repoA = new PostgresRepository({ sql: wrapSql(sqlA), schema });
        const repoB = new PostgresRepository({ sql: wrapSql(sqlB), schema });

        await Promise.all([
          repoA.addFollower("bot", followId, followerA),
          repoB.addFollower("bot", followId, followerB),
        ]);

        const followers = await Array.fromAsync(repoA.getFollowers("bot"));
        assert.deepStrictEqual(await repoA.countFollowers("bot"), 1);
        assert.deepStrictEqual(followers.length, 1);
        const remainingFollowerId = followers[0]?.id?.href;
        assert.ok(
          remainingFollowerId === followerA.id!.href ||
            remainingFollowerId === followerB.id!.href,
        );
        assert.deepStrictEqual(
          await repoA.hasFollower("bot", followerA.id!),
          remainingFollowerId === followerA.id!.href,
        );
        assert.deepStrictEqual(
          await repoA.hasFollower("bot", followerB.id!),
          remainingFollowerId === followerB.id!.href,
        );
      } finally {
        await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await Promise.all([sqlA.end(), sqlB.end(), adminSql.end()]);
      }
    });

    test("serializes follower removal with concurrent adds", async () => {
      const schema = createSchemaName();
      const adminSql = createSql(postgresUrl);
      const sqlA = createSql(postgresUrl);
      const sqlB = createSql(postgresUrl);
      const followId = new URL(
        "https://example.com/ap/follow/55db42c7-8a99-4c40-98c1-4684d7d0c758",
      );
      const follower = new Person({
        id: new URL("https://example.com/ap/actor/concurrent-charlie"),
        preferredUsername: "concurrent-charlie",
      });
      let releaseBarrier!: () => void;
      let resolveLockAcquired!: () => void;
      const barrier = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
      });
      const lockAcquired = new Promise<void>((resolve) => {
        resolveLockAcquired = resolve;
      });
      const wrappedSql = new Proxy(sqlA, {
        get(target, property, receiver) {
          if (property === "begin") {
            return async (
              callback: (transactionSql: postgres.TransactionSql) => unknown,
            ) =>
              await target.begin(async (transactionSql) =>
                await callback(
                  new Proxy(transactionSql, {
                    get(txTarget, txProperty, txReceiver) {
                      if (txProperty === "unsafe") {
                        return async <T extends object[]>(
                          query: string,
                          parameters?: postgres.ParameterOrJSON<never>[],
                          options?: postgres.UnsafeQueryOptions,
                        ): Promise<T> => {
                          const result = await txTarget.unsafe<T>(
                            query,
                            parameters,
                            options,
                          );
                          if (
                            query.includes("pg_advisory_xact_lock") &&
                            parameters?.[1] === `${schema}:bot:${followId.href}`
                          ) {
                            resolveLockAcquired();
                            await barrier;
                          }
                          return result;
                        };
                      }
                      return Reflect.get(txTarget, txProperty, txReceiver);
                    },
                  }),
                )
              );
          }
          return Reflect.get(target, property, receiver);
        },
      });
      try {
        await initializePostgresRepositorySchema(adminSql, schema);
        const repoA = new PostgresRepository({ sql: wrappedSql, schema });
        const repoB = new PostgresRepository({ sql: sqlB, schema });

        const addPromise = repoA.addFollower("bot", followId, follower);
        await lockAcquired;
        const removePromise = repoB.removeFollower(
          "bot",
          followId,
          follower.id!,
        );
        await waitForMacrotask();
        releaseBarrier();

        const [, removedFollower] = await Promise.all([
          addPromise,
          removePromise,
        ]);
        assert.deepStrictEqual(
          await removedFollower?.toJsonLd(),
          await follower.toJsonLd(),
        );
        assert.deepStrictEqual(await repoA.countFollowers("bot"), 0);
        assert.deepStrictEqual(
          await repoA.hasFollower("bot", follower.id!),
          false,
        );
      } finally {
        await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await Promise.all([sqlA.end(), sqlB.end(), adminSql.end()]);
      }
    });

    test("does not leak stale followers during concurrent reassignment cleanup", async () => {
      const schema = createSchemaName();
      const adminSql = createSql(postgresUrl);
      const sqlA = createSql(postgresUrl);
      const sqlB = createSql(postgresUrl);
      const oldFollower = new Person({
        id: new URL("https://example.com/ap/actor/concurrent-dana"),
        preferredUsername: "concurrent-dana",
      });
      const newFollowerA = new Person({
        id: new URL("https://example.com/ap/actor/concurrent-emma"),
        preferredUsername: "concurrent-emma",
      });
      const newFollowerB = new Person({
        id: new URL("https://example.com/ap/actor/concurrent-frank"),
        preferredUsername: "concurrent-frank",
      });
      const followA = new URL(
        "https://example.com/ap/follow/ee4ca254-e614-4433-941b-bbe95b4b92a3",
      );
      const followB = new URL(
        "https://example.com/ap/follow/c7bacad2-3078-4cd1-9a26-4b13e58b8d67",
      );
      let arrivals = 0;
      let releaseBarrier!: () => void;
      const barrier = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
      });
      const barrierTimeout = 50;
      const wrapSql = (sql: postgres.Sql): postgres.Sql =>
        new Proxy(sql, {
          get(target, property, receiver) {
            if (property === "begin") {
              return async (
                callback: (transactionSql: postgres.TransactionSql) => unknown,
              ) =>
                await target.begin(async (transactionSql) =>
                  await callback(
                    new Proxy(transactionSql, {
                      get(txTarget, txProperty, txReceiver) {
                        if (txProperty === "unsafe") {
                          return async <T extends object[]>(
                            query: string,
                            parameters?: postgres.ParameterOrJSON<never>[],
                            options?: postgres.UnsafeQueryOptions,
                          ): Promise<T> => {
                            if (
                              arrivals < 2 &&
                              query.includes(
                                `DELETE FROM "${schema}"."followers"`,
                              ) &&
                              parameters?.[1] === oldFollower.id!.href
                            ) {
                              arrivals++;
                              if (arrivals === 2) releaseBarrier();
                              await Promise.race([
                                barrier,
                                new Promise<void>((resolve) =>
                                  setTimeout(resolve, barrierTimeout)
                                ),
                              ]);
                            }
                            return await txTarget.unsafe<T>(
                              query,
                              parameters,
                              options,
                            );
                          };
                        }
                        return Reflect.get(txTarget, txProperty, txReceiver);
                      },
                    }),
                  )
                );
            }
            return Reflect.get(target, property, receiver);
          },
        });
      try {
        await initializePostgresRepositorySchema(adminSql, schema);
        const setupRepo = new PostgresRepository({ sql: adminSql, schema });
        await setupRepo.addFollower("bot", followA, oldFollower);
        await setupRepo.addFollower("bot", followB, oldFollower);

        const repoA = new PostgresRepository({ sql: wrapSql(sqlA), schema });
        const repoB = new PostgresRepository({ sql: wrapSql(sqlB), schema });
        await Promise.all([
          repoA.addFollower("bot", followA, newFollowerA),
          repoB.addFollower("bot", followB, newFollowerB),
        ]);

        const followers = await Promise.all(
          (await Array.fromAsync(repoA.getFollowers("bot"))).map((follower) =>
            follower.toJsonLd()
          ),
        );
        assert.deepStrictEqual(await repoA.countFollowers("bot"), 2);
        assert.deepStrictEqual(
          await repoA.hasFollower("bot", oldFollower.id!),
          false,
        );
        assert.deepStrictEqual(followers, [
          await newFollowerA.toJsonLd(),
          await newFollowerB.toJsonLd(),
        ]);
      } finally {
        await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await Promise.all([sqlA.end(), sqlB.end(), adminSql.end()]);
      }
    });

    test("does not drop valid followers during concurrent cleanup and add", async () => {
      const schema = createSchemaName();
      const adminSql = createSql(postgresUrl);
      const sqlA = createSql(postgresUrl);
      const sqlB = createSql(postgresUrl);
      const oldFollower = new Person({
        id: new URL("https://example.com/ap/actor/concurrent-grace"),
        preferredUsername: "concurrent-grace",
      });
      const reassignedFollower = new Person({
        id: new URL("https://example.com/ap/actor/concurrent-harper"),
        preferredUsername: "concurrent-harper",
      });
      const followA = new URL(
        "https://example.com/ap/follow/ea47ae4b-8e5d-4f5f-b1c8-9d66d5d11d83",
      );
      const followB = new URL(
        "https://example.com/ap/follow/8f65dab0-2a7e-4c6a-b53e-99f3e2521c0e",
      );
      let resolveCleanupReady!: () => void;
      let resolveInsertedNewRequest!: () => void;
      const cleanupReady = new Promise<void>((resolve) => {
        resolveCleanupReady = resolve;
      });
      const insertedNewRequest = new Promise<void>((resolve) => {
        resolveInsertedNewRequest = resolve;
      });
      const barrierTimeout = 50;
      const wrapCleanupSql = (sql: postgres.Sql): postgres.Sql =>
        new Proxy(sql, {
          get(target, property, receiver) {
            if (property === "begin") {
              return async (
                callback: (transactionSql: postgres.TransactionSql) => unknown,
              ) =>
                await target.begin(async (transactionSql) =>
                  await callback(
                    new Proxy(transactionSql, {
                      get(txTarget, txProperty, txReceiver) {
                        if (txProperty === "unsafe") {
                          return async <T extends object[]>(
                            query: string,
                            parameters?: postgres.ParameterOrJSON<never>[],
                            options?: postgres.UnsafeQueryOptions,
                          ): Promise<T> => {
                            if (
                              query.includes(
                                `DELETE FROM "${schema}"."followers"`,
                              ) &&
                              parameters?.[1] === oldFollower.id!.href
                            ) {
                              resolveCleanupReady();
                              await Promise.race([
                                insertedNewRequest,
                                new Promise<void>((resolve) =>
                                  setTimeout(resolve, barrierTimeout)
                                ),
                              ]);
                            }
                            return await txTarget.unsafe<T>(
                              query,
                              parameters,
                              options,
                            );
                          };
                        }
                        return Reflect.get(txTarget, txProperty, txReceiver);
                      },
                    }),
                  )
                );
            }
            return Reflect.get(target, property, receiver);
          },
        });
      const wrapAddSql = (sql: postgres.Sql): postgres.Sql =>
        new Proxy(sql, {
          get(target, property, receiver) {
            if (property === "begin") {
              return async (
                callback: (transactionSql: postgres.TransactionSql) => unknown,
              ) =>
                await target.begin(async (transactionSql) =>
                  await callback(
                    new Proxy(transactionSql, {
                      get(txTarget, txProperty, txReceiver) {
                        if (txProperty === "unsafe") {
                          return async <T extends object[]>(
                            query: string,
                            parameters?: postgres.ParameterOrJSON<never>[],
                            options?: postgres.UnsafeQueryOptions,
                          ): Promise<T> => {
                            const result = await txTarget.unsafe<T>(
                              query,
                              parameters,
                              options,
                            );
                            if (
                              query.includes(
                                `INSERT INTO "${schema}"."follow_requests"`,
                              ) &&
                              parameters?.[1] === followB.href &&
                              parameters?.[2] === oldFollower.id!.href
                            ) {
                              resolveInsertedNewRequest();
                              await new Promise<void>((resolve) =>
                                setTimeout(resolve, barrierTimeout)
                              );
                            }
                            return result;
                          };
                        }
                        return Reflect.get(txTarget, txProperty, txReceiver);
                      },
                    }),
                  )
                );
            }
            return Reflect.get(target, property, receiver);
          },
        });
      try {
        await initializePostgresRepositorySchema(adminSql, schema);
        const setupRepo = new PostgresRepository({ sql: adminSql, schema });
        await setupRepo.addFollower("bot", followA, oldFollower);

        const repoA = new PostgresRepository({
          sql: wrapCleanupSql(sqlA),
          schema,
        });
        const repoB = new PostgresRepository({ sql: wrapAddSql(sqlB), schema });

        const reassignPromise = repoA.addFollower(
          "bot",
          followA,
          reassignedFollower,
        );
        await cleanupReady;
        const addPromise = repoB.addFollower("bot", followB, oldFollower);
        await Promise.all([reassignPromise, addPromise]);

        const followers = await Promise.all(
          (await Array.fromAsync(repoA.getFollowers("bot"))).map((follower) =>
            follower.toJsonLd()
          ),
        );
        assert.deepStrictEqual(await repoA.countFollowers("bot"), 2);
        assert.ok(await repoA.hasFollower("bot", oldFollower.id!));
        assert.ok(await repoA.hasFollower("bot", reassignedFollower.id!));
        assert.deepStrictEqual(followers, [
          await oldFollower.toJsonLd(),
          await reassignedFollower.toJsonLd(),
        ]);
        assert.deepStrictEqual(
          await (await repoA.removeFollower("bot", followB, oldFollower.id!))
            ?.toJsonLd(),
          await oldFollower.toJsonLd(),
        );
        assert.deepStrictEqual(await repoA.countFollowers("bot"), 1);
        assert.deepStrictEqual(
          await repoA.hasFollower("bot", oldFollower.id!),
          false,
        );
      } finally {
        await adminSql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await Promise.all([sqlA.end(), sqlB.end(), adminSql.end()]);
      }
    });

    test("repository operations and persistence", async () => {
      const harness = createHarness();
      try {
        const repo = harness.repository;

        assert.deepStrictEqual(await repo.getKeyPairs("bot"), undefined);
        await repo.setKeyPairs("bot", keyPairs);
        assert.deepStrictEqual(await repo.getKeyPairs("bot"), keyPairs);

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
            content: "Second message",
            published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
          }),
          published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
        });
        const messageB2 = new Create({
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
            content: "Updated message",
            published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
            updated: Temporal.Instant.from("2025-01-02T12:00:00Z"),
          }),
          published: Temporal.Instant.from("2025-01-02T00:00:00Z"),
          updated: Temporal.Instant.from("2025-01-02T12:00:00Z"),
        });

        assert.deepStrictEqual(await repo.countMessages("bot"), 0);
        await repo.addMessage(
          "bot",
          "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
          messageA,
        );
        await repo.addMessage(
          "bot",
          "0194244f-d800-7873-8993-ef71ccd47306",
          messageB,
        );
        assert.deepStrictEqual(await repo.countMessages("bot"), 2);
        assert.deepStrictEqual(
          await Promise.all(
            (await Array.fromAsync(
              repo.getMessages("bot", { order: "oldest" }),
            )).map((
              message,
            ) => message.toJsonLd()),
          ),
          [await messageA.toJsonLd(), await messageB.toJsonLd()],
        );
        assert.deepStrictEqual(
          await Promise.all(
            (await Array.fromAsync(
              repo.getMessages("bot", {
                since: Temporal.Instant.from("2025-01-02T00:00:00Z"),
              }),
            )).map((message) => message.toJsonLd()),
          ),
          [await messageB.toJsonLd()],
        );
        assert.ok(
          await repo.updateMessage(
            "bot",
            "0194244f-d800-7873-8993-ef71ccd47306",
            async (message) =>
              message.clone({
                object: await messageB2.getObject(),
                updated: messageB2.updated,
              }),
          ),
        );
        assert.deepStrictEqual(
          await (await repo.getMessage(
            "bot",
            "0194244f-d800-7873-8993-ef71ccd47306",
          ))
            ?.toJsonLd(),
          await messageB2.toJsonLd(),
        );
        assert.deepStrictEqual(
          await (await repo.removeMessage(
            "bot",
            "01941f29-7c00-7fe8-ab0a-7b593990a3c0",
          ))
            ?.toJsonLd(),
          await messageA.toJsonLd(),
        );
        assert.deepStrictEqual(await repo.countMessages("bot"), 1);

        const followerA = new Person({
          id: new URL("https://example.com/ap/actor/alice"),
          preferredUsername: "alice",
        });
        const followerB = new Person({
          id: new URL("https://example.com/ap/actor/bob"),
          preferredUsername: "bob",
        });
        const followA = new URL(
          "https://example.com/ap/follow/f2fb7255-d3ad-4fef-8f9a-1d0f2c2ec0b4",
        );
        const followB = new URL(
          "https://example.com/ap/follow/a3d4cc4f-af93-4a9f-a7b3-0b7c0fe4901d",
        );

        await repo.addFollower("bot", followA, followerA);
        await repo.addFollower("bot", followB, followerB);
        assert.ok(await repo.hasFollower("bot", followerA.id!));
        assert.deepStrictEqual(await repo.countFollowers("bot"), 2);
        assert.deepStrictEqual(
          await Promise.all(
            (await Array.fromAsync(repo.getFollowers("bot", { offset: 1 })))
              .map((
                follower,
              ) => follower.toJsonLd()),
          ),
          [await followerB.toJsonLd()],
        );
        assert.deepStrictEqual(
          await repo.removeFollower("bot", followA, followerB.id!),
          undefined,
        );
        assert.deepStrictEqual(
          await (await repo.removeFollower("bot", followA, followerA.id!))
            ?.toJsonLd(),
          await followerA.toJsonLd(),
        );
        assert.deepStrictEqual(await repo.countFollowers("bot"), 1);

        const followA2 = new URL(
          "https://example.com/ap/follow/6eedf12f-32aa-4f1d-b6ca-d5bf34c4d149",
        );
        await repo.addFollower("bot", followA, followerA);
        await repo.addFollower("bot", followA2, followerA);
        assert.deepStrictEqual(await repo.countFollowers("bot"), 2);
        assert.ok(await repo.hasFollower("bot", followerA.id!));
        assert.deepStrictEqual(
          await repo.removeFollower("bot", followA, followerA.id!),
          undefined,
        );
        assert.ok(await repo.hasFollower("bot", followerA.id!));
        assert.deepStrictEqual(await repo.countFollowers("bot"), 2);
        assert.deepStrictEqual(
          await (await repo.removeFollower("bot", followA2, followerA.id!))
            ?.toJsonLd(),
          await followerA.toJsonLd(),
        );
        assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
        assert.deepStrictEqual(
          await repo.hasFollower("bot", followerA.id!),
          false,
        );

        await repo.addFollower("bot", followA, followerA);
        assert.deepStrictEqual(await repo.countFollowers("bot"), 2);
        await repo.addFollower("bot", followA, followerB);
        assert.deepStrictEqual(await repo.countFollowers("bot"), 1);
        assert.deepStrictEqual(
          await repo.hasFollower("bot", followerA.id!),
          false,
        );
        assert.ok(await repo.hasFollower("bot", followerB.id!));
        assert.deepStrictEqual(
          await Promise.all(
            (await Array.fromAsync(repo.getFollowers("bot"))).map((follower) =>
              follower.toJsonLd()
            ),
          ),
          [await followerB.toJsonLd()],
        );

        const sentFollow = new Follow({
          id: new URL(
            "https://example.com/ap/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
          ),
          actor: new URL("https://example.com/ap/actor/bot"),
          object: new URL("https://example.com/ap/actor/john"),
        });
        await repo.addSentFollow(
          "bot",
          "03a395a2-353a-4894-afdb-2cab31a7b004",
          sentFollow,
        );
        assert.deepStrictEqual(
          await (await repo.getSentFollow(
            "bot",
            "03a395a2-353a-4894-afdb-2cab31a7b004",
          ))
            ?.toJsonLd(),
          await sentFollow.toJsonLd(),
        );
        await repo.removeSentFollow(
          "bot",
          "03a395a2-353a-4894-afdb-2cab31a7b004",
        );
        assert.deepStrictEqual(
          await repo.getSentFollow(
            "bot",
            "03a395a2-353a-4894-afdb-2cab31a7b004",
          ),
          undefined,
        );

        const followeeId = new URL("https://example.com/ap/actor/john");
        await repo.addFollowee("bot", followeeId, sentFollow);
        assert.deepStrictEqual(
          await (await repo.getFollowee("bot", followeeId))?.toJsonLd(),
          await sentFollow.toJsonLd(),
        );
        await repo.removeFollowee("bot", followeeId);
        assert.deepStrictEqual(
          await repo.getFollowee("bot", followeeId),
          undefined,
        );

        const messageId = "01945678-1234-7890-abcd-ef0123456789";
        const voter1 = new URL("https://example.com/ap/actor/alice");
        const voter2 = new URL("https://example.com/ap/actor/bob");
        await repo.vote("bot", messageId, voter1, "option1");
        await repo.vote("bot", messageId, voter1, "option1");
        await repo.vote("bot", messageId, voter1, "option2");
        await repo.vote("bot", messageId, voter2, "option1");
        assert.deepStrictEqual(await repo.countVoters("bot", messageId), 2);
        assert.deepStrictEqual(await repo.countVotes("bot", messageId), {
          "option1": 2,
          "option2": 1,
        });

        await repo.close();
        const repo2 = new PostgresRepository({
          url: postgresUrl,
          schema: harness.schema,
          maxConnections: 1,
        });
        assert.deepStrictEqual(await repo2.getKeyPairs("bot"), keyPairs);
        assert.deepStrictEqual(await repo2.countMessages("bot"), 1);
        await repo2.close();
      } finally {
        await harness.cleanup();
      }
    });

    test("does not close injected clients", async () => {
      const schema = createSchemaName();
      const sql = createSql(postgresUrl);
      try {
        const repo = new PostgresRepository({ sql, schema });
        await repo.countMessages("bot");
        await repo.close();

        const result = await sql`SELECT 1 AS value`;
        assert.deepStrictEqual(result[0]?.value, 1);
      } finally {
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await sql.end();
      }
    });

    test("keeps the first quote authorization for a quote", async () => {
      const harness = createHarness();
      try {
        const repo = harness.repository;
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
        await harness.cleanup();
      }
    });

    test("stores quote authorization references", async () => {
      const harness = createHarness();
      try {
        const repo = harness.repository;
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
        await harness.cleanup();
      }
    });
  });
}

if (postgresUrl != null) {
  describe("PostgresRepository multitenancy", () => {
    test("isolates data by bot identifier", async () => {
      const harness = createHarness();
      try {
        const repo = harness.repository;
        const messageId = "01941f29-7c00-7fe8-ab0a-7b593990a3c0" as const;
        const message = new Create({
          id: new URL(`https://example.com/ap/actor/botA/create/${messageId}`),
          actor: new URL("https://example.com/ap/actor/botA"),
          object: new Note({
            id: new URL(`https://example.com/ap/actor/botA/note/${messageId}`),
            content: "Hello, world!",
          }),
        });
        await repo.addMessage("botA", messageId, message);
        assert.equal(await repo.getMessage("botB", messageId), undefined);
        assert.equal(await repo.countMessages("botB"), 0);
        assert.equal(await repo.countMessages("botA"), 1);
        assert.equal(await repo.removeMessage("botB", messageId), undefined);
        assert.equal(await repo.countMessages("botA"), 1);

        await repo.setKeyPairs("botA", keyPairs);
        assert.equal(await repo.getKeyPairs("botB"), undefined);
        assert.deepStrictEqual(await repo.getKeyPairs("botA"), keyPairs);
      } finally {
        await harness.cleanup();
      }
    });

    test("findFollowedBots()", async () => {
      const harness = createHarness();
      try {
        const repo = harness.repository;
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
        await harness.cleanup();
      }
    });
  });

  describe("PostgresRepository legacy schema migration", () => {
    async function createLegacySchema(
      sql: postgres.Sql,
      schema: string,
    ): Promise<void> {
      // The schema used by @fedify/botkit-postgres 0.4:
      await sql.unsafe(`CREATE SCHEMA "${schema}"`);
      await sql.unsafe(`
        CREATE TABLE "${schema}"."key_pairs" (
          position INTEGER PRIMARY KEY,
          private_key_jwk JSONB NOT NULL,
          public_key_jwk JSONB NOT NULL
        )
      `);
      await sql.unsafe(`
        CREATE TABLE "${schema}"."messages" (
          id TEXT PRIMARY KEY,
          activity_json JSONB NOT NULL,
          published BIGINT
        )
      `);
      await sql.unsafe(`
        CREATE INDEX "idx_messages_published"
          ON "${schema}"."messages" (published, id)
      `);
      await sql.unsafe(`
        CREATE TABLE "${schema}"."followers" (
          follower_id TEXT PRIMARY KEY,
          actor_json JSONB NOT NULL
        )
      `);
      await sql.unsafe(`
        CREATE TABLE "${schema}"."follow_requests" (
          follow_request_id TEXT PRIMARY KEY,
          follower_id TEXT NOT NULL
            REFERENCES "${schema}"."followers" (follower_id)
            ON DELETE CASCADE
        )
      `);
      await sql.unsafe(`
        CREATE INDEX "idx_follow_requests_follower"
          ON "${schema}"."follow_requests" (follower_id)
      `);
      await sql.unsafe(`
        CREATE TABLE "${schema}"."sent_follows" (
          id TEXT PRIMARY KEY,
          follow_json JSONB NOT NULL
        )
      `);
      await sql.unsafe(`
        CREATE TABLE "${schema}"."followees" (
          followee_id TEXT PRIMARY KEY,
          follow_json JSONB NOT NULL
        )
      `);
      await sql.unsafe(`
        CREATE TABLE "${schema}"."poll_votes" (
          message_id TEXT NOT NULL,
          voter_id TEXT NOT NULL,
          option TEXT NOT NULL,
          PRIMARY KEY (message_id, voter_id, option)
        )
      `);
      await sql.unsafe(`
        CREATE INDEX "idx_poll_votes_message_option"
          ON "${schema}"."poll_votes" (message_id, option)
      `);
    }

    async function seedLegacySchema(
      sql: postgres.Sql,
      schema: string,
    ): Promise<{
      messageId: string;
      followerId: string;
      followRequestId: string;
      followeeId: string;
      sentFollowId: string;
    }> {
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
      await sql.unsafe(
        `INSERT INTO "${schema}"."messages" (id, activity_json, published)
         VALUES ($1, $2::jsonb, $3)`,
        [
          messageId,
          JSON.stringify(await message.toJsonLd({ format: "compact" })),
          Temporal.Instant.from("2025-01-01T00:00:00Z").epochMilliseconds,
        ],
      );

      const follower = new Person({
        id: new URL("https://example.com/ap/actor/john"),
        preferredUsername: "john",
      });
      const followRequestId =
        "https://example.com/ap/follow/be2da56a-0ea3-4a6a-9dff-2a1837be67e0";
      await sql.unsafe(
        `INSERT INTO "${schema}"."followers" (follower_id, actor_json)
         VALUES ($1, $2::jsonb)`,
        [
          follower.id!.href,
          JSON.stringify(await follower.toJsonLd({ format: "compact" })),
        ],
      );
      await sql.unsafe(
        `INSERT INTO "${schema}"."follow_requests"
           (follow_request_id, follower_id)
         VALUES ($1, $2)`,
        [followRequestId, follower.id!.href],
      );

      const followeeId = "https://example.com/ap/actor/jane";
      const followeeFollow = new Follow({
        id: new URL(
          "https://example.com/ap/follow/03a395a2-353a-4894-afdb-2cab31a7b004",
        ),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new URL(followeeId),
      });
      await sql.unsafe(
        `INSERT INTO "${schema}"."followees" (followee_id, follow_json)
         VALUES ($1, $2::jsonb)`,
        [
          followeeId,
          JSON.stringify(
            await followeeFollow.toJsonLd({ format: "compact" }),
          ),
        ],
      );

      const sentFollowId = "e35ff5d8-ede9-4f5e-9b83-4bfcd4c9a69c";
      const sentFollow = new Follow({
        id: new URL(`https://example.com/ap/follow/${sentFollowId}`),
        actor: new URL("https://example.com/ap/actor/bot"),
        object: new URL("https://example.com/ap/actor/joe"),
      });
      await sql.unsafe(
        `INSERT INTO "${schema}"."sent_follows" (id, follow_json)
         VALUES ($1, $2::jsonb)`,
        [
          sentFollowId,
          JSON.stringify(await sentFollow.toJsonLd({ format: "compact" })),
        ],
      );

      await sql.unsafe(
        `INSERT INTO "${schema}"."poll_votes" (message_id, voter_id, option)
         VALUES ($1, $2, $3)`,
        [messageId, "https://example.com/ap/actor/alice", "option1"],
      );

      return {
        messageId,
        followerId: follower.id!.href,
        followRequestId,
        followeeId,
        sentFollowId,
      };
    }

    test("upgrades a legacy schema and adopts its data", async () => {
      const sql = createSql(postgresUrl!);
      const schema = createSchemaName();
      try {
        await createLegacySchema(sql, schema);
        const seed = await seedLegacySchema(sql, schema);

        const repo = new PostgresRepository({
          url: postgresUrl!,
          schema,
          maxConnections: 1,
        });
        try {
          assert.equal(await repo.countMessages("bot"), 0);

          await repo.migrate("bot");
          assert.equal(await repo.countMessages("bot"), 1);
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
          assert.equal(
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

          // removeFollower() exercises the upgraded follow_requests rows:
          const removed = await repo.removeFollower(
            "bot",
            new URL(seed.followRequestId),
            new URL(seed.followerId),
          );
          assert.ok(removed != null);

          // migrate() is idempotent:
          await repo.migrate("bot");
          assert.equal(await repo.countMessages("bot"), 1);
        } finally {
          await repo.close();
        }

        // Reopening the upgraded schema works without another upgrade:
        const repo2 = new PostgresRepository({
          url: postgresUrl!,
          schema,
          maxConnections: 1,
        });
        try {
          assert.equal(await repo2.countMessages("bot"), 1);
        } finally {
          await repo2.close();
        }
      } finally {
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await sql.end();
      }
    });

    test("survives concurrent initialization", async () => {
      const sql = createSql(postgresUrl!);
      const schema = createSchemaName();
      try {
        await createLegacySchema(sql, schema);
        await seedLegacySchema(sql, schema);

        // Two replicas starting at once against the same legacy schema must
        // both come up; the upgrade is serialized by an advisory lock and
        // guarded per table:
        const sqlA = createSql(postgresUrl!);
        const sqlB = createSql(postgresUrl!);
        try {
          await Promise.all([
            initializePostgresRepositorySchema(sqlA, schema),
            initializePostgresRepositorySchema(sqlB, schema),
          ]);
        } finally {
          await sqlA.end();
          await sqlB.end();
        }

        const repo = new PostgresRepository({
          url: postgresUrl!,
          schema,
          maxConnections: 1,
        });
        try {
          await repo.migrate("bot");
          assert.equal(await repo.countMessages("bot"), 1);
        } finally {
          await repo.close();
        }
      } finally {
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await sql.end();
      }
    });

    test("does not reassign data stored under an empty identifier", async () => {
      const harness = createHarness();
      try {
        const repo = harness.repository;
        // A fresh schema has no legacy marker, so data stored under the
        // empty-string identifier must never be adopted by migrate():
        await repo.setKeyPairs("", keyPairs);
        await repo.migrate("bot");
        assert.deepStrictEqual(await repo.getKeyPairs(""), keyPairs);
        assert.equal(await repo.getKeyPairs("bot"), undefined);
      } finally {
        await harness.cleanup();
      }
    });
  });
}
