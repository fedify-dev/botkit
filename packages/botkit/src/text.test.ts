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
  type Context,
  createFederation,
  MemoryKvStore,
} from "@fedify/fedify/federation";
import { getDocumentLoader } from "@fedify/fedify/runtime";
import { importJwk } from "@fedify/fedify/sig";
import {
  Emoji,
  Hashtag,
  Image,
  Mention,
  Person,
  Service,
} from "@fedify/fedify/vocab";
import assert from "node:assert";
import { describe, test } from "node:test";
import { BotImpl } from "./bot-impl.ts";
import type { BotWithVoidContextData } from "./bot.ts";
import type { CustomEmoji, DeferredCustomEmoji } from "./emoji.ts";
import type { Session } from "./session.ts";
import {
  code,
  customEmoji,
  CustomEmojiText,
  em,
  hashtag,
  isText,
  link,
  markdown,
  mention,
  mentions,
  strong,
  type Text,
  text,
} from "./text.ts";

const defaultDocumentLoader = getDocumentLoader();

const federation = createFederation<void>({
  kv: new MemoryKvStore(),
  documentLoader(url: string) {
    const parsed = new URL(url);
    if (parsed.host !== "example.com") {
      return defaultDocumentLoader(url);
    }
    const document = {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Person",
      id: url,
      preferredUsername: url.split("/").at(-1),
      url,
    };
    return Promise.resolve({
      document,
      documentUrl: url,
      contextUrl: null,
    });
  },
  authenticatedDocumentLoaderFactory(_identity) {
    return this.documentLoader!;
  },
});

const keyPair: CryptoKeyPair = {
  privateKey: await importJwk({
    kty: "RSA",
    alg: "RS256",
    // cSpell: disable
    n: "15DAu9S9sROZ_NonfZm5S0PSeYuh2POeo0cpvvGnp_T9jQWjMuGdhwOPT7OOD9N-R1IY-2hXkk-RjfWNzbxMoNKvOpz_1MHRg18W5Lw60mIxZFztLKlNhOZS7rVrlJc--jj1wLETEfY5ocYCyRZm25UeT_Q1JSePdnhEGVXo4sSqoUcMV5Bgys5PlISfQj_bHDpcIi9snJ70hOzYTy7k7fNuCHHsK08DN4bZMG58qQNrPFtZW6fgpQiu0kgtUBFgQu-uUNn1h0io-7OhMU2dXeV8lwCILhIFRvrRV9vKQydBejbyYuzFY-Xq98biB9Aox8GD0jJE4tTVj6CpsmaN9yq6nI8ibWjnk87IKdU3jex5zB8chR0cm2tyIWr6dKhCTexmtYTF0pGW7PZ2Dnn31BU3cPkrkplu752D4eQ47BsAspMsHRxXE3NtqlmN02Y-6AIzt1tuPBPHldQHUpxtGrwFh9b9biC2mtb_w6F0oyxVyZsAZnuK2tN0-uX_iMPoC5VLnPrzgWjQiMArivg4u1cQ35hrvuFYFAdNf2WaBDyDNxaCoTD28z9bF1titlbQ48tDw0adZ1Zp8_x12JqA5HNpqDfmyT4KPU_6Ag7J7cGfGeO2vsjcc1oGhqZ-n6JlnSvVImHS5eKC6CDhW7ceuKC_oX-XPWWQQHhPniwM2RE",
    e: "AQAB",
    d: "eAD5ipdQUrfazcyUl3Nwl9nV3hxBqYlWEweW0dmtv-6_CDbPN5AqJfNxYKlQuLbAYevuRGc9-RGasjC1FIdzEUS4kCS-ty5--GeDUysGhABuBrVEw8wsf4PJP2J31WytfpcfGHp7Z1BvnQOioVd7Q1qsWU5WF60CTK1_G6ubzkI1yzrGQCj7-WsJGmEKV9M8o2ZJzC4ihL5o2WcQtGQixeTyqHjjROjjnZHQbwnTFDP3Cs6_3CqFANrol9_eeehyclED9bag3QMyL408ezn-FTugNF_zb9JQZcdTq1mMK_46kVLtdOzipk5klDN_uWHEkg_E1sttVemuShri3ZICDUSd70Y4VeQxNLUKJNBSYdSLmcVgfIHaXMmcrknmBuz23SrGR6JZR4DSJtr3sylR2tlOxpZhJAUZf17f8aZD7EnbR7qcNtjZmf8RyAKrEXLgL6f3jm6FfE_b027kcmLMXL7bJtlTBYnM9MrBnXSsJftHRrmB1Xe-0Hq24Q7ctrhRhFF3Ij8MjNRjdn6NWdIXzltreblLEO44iTJtlWeYtg-C9566F_yWZnjDZEQ8nvBhpCM3iXlRfzhlEebBoBbf-Mf-0hJRRUL3EtGuMueylzeyk4tTzvOfK2FUnVAi8bIhjz4m8RhN7kC4ubqUXZbKwzjeI1dhWyfDphrPiRtCetE",
    p: "_4BmuvmlMZmiD_uGE__iWIHizMe4Ay34WOSNAm0uhjfNgWpWHdxosQQeSehBE8x_CwJGKbCl69ewmEAOYnP3KYpytvcHVEMO7XQAE66p_19PzIy95WY6CR20CFXUykzQ_6gE_nFB39rxcxprxAqaNEGM2PtwpiTSwoyZFWkgSE6O6rwv03vNAMeib3CZU3kdg4mHiZAryk9U6uphZ_lJ2wOSMX_SHkcEAwePoae8E_jIJ0drfIkyR5pSkghThjHIv95hcHuuDodm2W9e7sppv3EpjE81ANKEfkrrauDfX9BrRDC-14hhCK7t7bYJ9bj49nmSSLmLHNw1W2eyvvAHEw",
    q: "1_xoQ6UBnAsql-87v7UddCiJEppk9LkfYb-DBEtBHbTFDvxbE0Px7ooNevgwlMDmi6t4hSkQZEwF5sLFHv1-fNFtpwVGzqu6ekXYfw0FxWRVjJTh5e91G3mOMVprGvgSMk3PRO33dBAhA6MMGIMi72XCGWNpy7ajfawYdpeMO6k6aC93jT9RmoaB_UmwyM2lmzaWP9RKInJ6t_i-eFm05_0qkPdPdg5b3HbNpKyAMLVxA8DAauHvcCx9CsAZ8ZbvL-mC5AX7v7B9iovXCStHpfA5f73M7AGFGRZpt51mvx8pxHVwF2tW6h03HEBz5BX-9YMTaepH369CRovGo4Jvyw",
    dp:
      "hlBlsN0T7mMpQuWisljOEGEXbTeAkItWBsT_K8thrcUgD2xrIP-BOa1Eju29aD8UeiET6U6nqreUajUiWrdDs17It05dV_p4mnNkpvQnAcyFEq7aFQIMeEZZIhic6ExBgmQ9W9UGIDvkufGlvUUlk1ryRA7KRU0OTp_CyfKdueUyVEvhiHeIaWSJC7RRpgQBc-iUi8hyfMP_jA7ybcoq_St_au4a8ze58C3FX-HhiU47SgrNgoZNHD8QMRyXa_A37EVnS854zcJ4Ws2lRjq6JJ3EjbIF1wzUAeA4qdLVGnViLlLBwGQ9PmdXRKNx0O8QUeHO-NQxQVax5f85hA6CaQ",
    dq:
      "MVKMpNXrlizeny-cn1zGyx3un3bukwwrZHENhE-DITuEvLVYPwAHIYgZJ_nBblbWzxJrRU1pVt4dguL7jOYqmmpg9gE4eD2zKfUFSY45wSf2eVIOfCnAvnN1y0Nwrgn0bdRi_sSw-6orP99eBcL8mVrNhmqzYDfnAe3o8DwPZBhzJBOi43iQNA9_Y84ONuzvYpCGozDhdRhbeeOt62Hg9BFWRSCU3srMo33l3DMgWv80Pb0os7_ApAckzu2rfwYOvQxAPb44DUBKivcANjHR_Mzs9ITtZP-720zI-4tQSVjeeuSuokp64J-nVCZL0MxNGtfB-S_tFeG56s5EoFZLHQ",
    qi:
      "1J7CfWYlg4Igsu2N7bhgLzbc1l6A3odyyOlM70uH8P41kCYgpRDdH8Ms8yOJE-F13ha5drICZqsD7IjgG0cZONJ_0xTeka0AYMvCwjuJZ_4CzVFYNICxSHFUI-sCu1p-zb70eXU6fiwOFgzoPbnrwywpbxcTV_8H0XszwPcI3fjrGk6N-hi23Ur1gIjhnri_-x8mzwmtPA1ID1G17U4X93mP7dlYCzGigq8ORbSdZthOKdjtHXITBOgpcTiuyTTwAEqh3xyXscfsgzi0X6olBevJCGeTzOrqQX026JmNVykaS1-o_ea_Y0cD0q6Nxd5TwLZMCLZi1M5PLHhGlJg9MQ",
    // cSpell: enable
    key_ops: ["sign"],
    ext: true,
  }, "private"),
  publicKey: await importJwk({
    kty: "RSA",
    alg: "RS256",
    // cSpell: disable
    n: "15DAu9S9sROZ_NonfZm5S0PSeYuh2POeo0cpvvGnp_T9jQWjMuGdhwOPT7OOD9N-R1IY-2hXkk-RjfWNzbxMoNKvOpz_1MHRg18W5Lw60mIxZFztLKlNhOZS7rVrlJc--jj1wLETEfY5ocYCyRZm25UeT_Q1JSePdnhEGVXo4sSqoUcMV5Bgys5PlISfQj_bHDpcIi9snJ70hOzYTy7k7fNuCHHsK08DN4bZMG58qQNrPFtZW6fgpQiu0kgtUBFgQu-uUNn1h0io-7OhMU2dXeV8lwCILhIFRvrRV9vKQydBejbyYuzFY-Xq98biB9Aox8GD0jJE4tTVj6CpsmaN9yq6nI8ibWjnk87IKdU3jex5zB8chR0cm2tyIWr6dKhCTexmtYTF0pGW7PZ2Dnn31BU3cPkrkplu752D4eQ47BsAspMsHRxXE3NtqlmN02Y-6AIzt1tuPBPHldQHUpxtGrwFh9b9biC2mtb_w6F0oyxVyZsAZnuK2tN0-uX_iMPoC5VLnPrzgWjQiMArivg4u1cQ35hrvuFYFAdNf2WaBDyDNxaCoTD28z9bF1titlbQ48tDw0adZ1Zp8_x12JqA5HNpqDfmyT4KPU_6Ag7J7cGfGeO2vsjcc1oGhqZ-n6JlnSvVImHS5eKC6CDhW7ceuKC_oX-XPWWQQHhPniwM2RE",
    e: "AQAB",
    // cSpell: enable
    key_ops: ["verify"],
    ext: true,
  }, "public"),
};

federation.setActorDispatcher("/ap/actor/{identifier}", (ctx, identifier) => {
  return new Person({
    id: ctx.getActorUri(identifier),
    preferredUsername: identifier,
  });
}).setKeyPairsDispatcher((_ctx, _identifier) => {
  return [keyPair];
});

const bot: BotWithVoidContextData = {
  federation,
  identifier: "bot",
  getSession(origin: string | URL | Context<void>, _contextData?: void) {
    const ctx = typeof origin === "string" || origin instanceof URL
      ? federation.createContext(new URL(origin))
      : origin;
    return {
      bot,
      botInfo: {
        identifier: "bot",
        username: "bot",
        name: undefined,
        class: Service,
      },
      context: ctx,
      actorId: ctx.getActorUri(bot.identifier),
      actorHandle: `@bot@${ctx.host}` as const,
      getActor() {
        const actor = new Person({
          id: ctx.getActorUri(bot.identifier),
          preferredUsername: "bot",
        });
        return Promise.resolve(actor);
      },
      follow() {
        throw new Error("Not implemented");
      },
      unfollow() {
        throw new Error("Not implemented");
      },
      follows() {
        throw new Error("Not implemented");
      },
      publish() {
        throw new Error("Not implemented");
      },
      getOutbox() {
        throw new Error("Not implemented");
      },
    } satisfies Session<void>;
  },
  fetch(_req: Request) {
    return Promise.resolve(new Response());
  },
  addCustomEmojis<TEmojiName extends string>(
    _emojis: Record<TEmojiName, CustomEmoji>,
  ): Record<TEmojiName, DeferredCustomEmoji<void>> {
    return {} as Record<TEmojiName, DeferredCustomEmoji<void>>;
  },
};

test("isText()", () => {
  const t = text`Hello, World`;
  assert.ok(isText(t));
  const t2 = em("Hello, World");
  assert.ok(isText(t2));
  assert.deepStrictEqual(isText("Hello, World"), false);
});

test("mentions()", async () => {
  const session = bot.getSession("https://example.com");
  const actor = new URL("https://hollo.social/@fedify");
  const actor2 = new URL("https://example.com/users/john");
  const actor3 = new Person({ id: actor });
  const t: Text<"block", void> = text`Hello, world!`;
  assert.deepStrictEqual(await mentions(session, t, actor), false);
  assert.deepStrictEqual(await mentions(session, t, actor2), false);
  assert.deepStrictEqual(await mentions(session, t, actor3), false);

  const m: Text<"inline", void> = mention(actor);
  assert.ok(await mentions(session, m, actor));
  assert.deepStrictEqual(await mentions(session, m, actor2), false);
  assert.ok(await mentions(session, m, actor3));
});

test("text`...`", async () => {
  const session = bot.getSession("https://example.com");
  const t: Text<"block", void> = text`Hello, <${123}>`;
  assert.deepStrictEqual(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    "<p>Hello, &lt;123&gt;</p>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t.getTags(session)), []);
  assert.deepStrictEqual(t.getCachedObjects(), []);

  const t2: Text<"block", void> = text`Hello, ${em("World")}`;
  assert.deepStrictEqual(
    (await Array.fromAsync(t2.getHtml(session))).join(""),
    "<p>Hello, <em>World</em></p>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t2.getTags(session)), []);
  assert.deepStrictEqual(t2.getCachedObjects(), []);

  const actor = new Person({
    id: new URL("https://example.com/users/john"),
    preferredUsername: "john",
    url: new URL("https://example.com/@john"),
  });
  const t3: Text<"block", void> = text`Hello, ${mention(actor)}`;
  assert.deepStrictEqual(
    (await Array.fromAsync(t3.getHtml(session))).join(""),
    '<p>Hello, <a href="https://example.com/@john" translate="no" ' +
      'class="h-card u-url mention" target="_blank">@<span>john@example.com' +
      "</span></a></p>",
  );
  const tags3 = await Array.fromAsync(t3.getTags(session));
  assert.deepStrictEqual(tags3.length, 1);
  assert.ok(tags3[0] instanceof Mention);
  assert.deepStrictEqual(tags3[0].name, "@john@example.com");
  assert.deepStrictEqual(
    tags3[0].href,
    new URL("https://example.com/users/john"),
  );
  const cache3 = t3.getCachedObjects();
  assert.deepStrictEqual(cache3.length, 1);
  assert.ok(cache3[0] instanceof Person);
  assert.deepStrictEqual(
    cache3[0].id,
    new URL("https://example.com/users/john"),
  );

  const t4: Text<"block", void> = text`Hello\nworld!`;
  assert.deepStrictEqual(
    (await Array.fromAsync(t4.getHtml(session))).join(""),
    "<p>Hello<br>world!</p>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t4.getTags(session)), []);
  assert.deepStrictEqual(t4.getCachedObjects(), []);

  const t5: Text<"block", void> =
    text`Hello\nworld!\n\nGoodbye!\n\t\n \nHello!`;
  assert.deepStrictEqual(
    (await Array.fromAsync(t5.getHtml(session))).join(""),
    "<p>Hello<br>world!</p><p>Goodbye!</p><p>Hello!</p>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t5.getTags(session)), []);
  assert.deepStrictEqual(t5.getCachedObjects(), []);

  const t6: Text<"block", void> = text`\n\n\nHello\nworld\n\n\nGoodbye!\n`;
  assert.deepStrictEqual(
    (await Array.fromAsync(t6.getHtml(session))).join(""),
    "<p>Hello<br>world</p><p>Goodbye!</p>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t6.getTags(session)), []);
  assert.deepStrictEqual(t6.getCachedObjects(), []);

  const t7: Text<"block", void> = text`Here's a link: ${new URL(
    "https://fedify.dev/",
  )}.`;
  assert.deepStrictEqual(
    (await Array.fromAsync(t7.getHtml(session))).join(""),
    '<p>Here&apos;s a link: <a href="https://fedify.dev/" target="_blank">' +
      "https://fedify.dev/</a>.</p>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t7.getTags(session)), []);
  assert.deepStrictEqual(t7.getCachedObjects(), []);

  const t8: Text<"block", void> = text`Here's a multiline text:
    
${"First line.\nSecond line."}`;
  assert.deepStrictEqual(
    (await Array.fromAsync(t8.getHtml(session))).join(""),
    "<p>Here&apos;s a multiline text:</p><p>First line.<br>Second line.</p>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t8.getTags(session)), []);
  assert.deepStrictEqual(t8.getCachedObjects(), []);

  const t9: Text<"block", void> =
    text`Interpolating blocks: ${text`Hello\nworld!`} ... and ... ${text`Goodbye!`}`;
  assert.deepStrictEqual(
    (await Array.fromAsync(t9.getHtml(session))).join(""),
    "<p>Interpolating blocks: </p><p>Hello<br>world!</p><p> ... and ... </p><p>Goodbye!</p>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t9.getTags(session)), []);
  assert.deepStrictEqual(t9.getCachedObjects(), []);

  const t10: Text<"block", void> =
    text`Interpolating blocks:\n\n${text`Hello\nworld!`}\n\n... and ...\n\n${text`Goodbye!`}`;
  assert.deepStrictEqual(
    (await Array.fromAsync(t10.getHtml(session))).join(""),
    "<p>Interpolating blocks:</p><p>Hello<br>world!</p><p>... and ...</p><p>Goodbye!</p>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t10.getTags(session)), []);
  assert.deepStrictEqual(t10.getCachedObjects(), []);
});

test("mention()", async () => {
  const session = bot.getSession("https://example.com");
  const m: Text<"inline", void> = mention(
    new Person({
      id: new URL("https://example.com/users/john"),
      preferredUsername: "john",
      url: new URL("https://example.com/@john"),
    }),
  );
  assert.deepStrictEqual(
    (await Array.fromAsync(m.getHtml(session))).join(""),
    '<a href="https://example.com/@john" translate="no" ' +
      'class="h-card u-url mention" target="_blank">@<span>john@example.com' +
      "</span></a>",
  );
  const tags = await Array.fromAsync(m.getTags(session));
  assert.deepStrictEqual(tags.length, 1);
  assert.ok(tags[0] instanceof Mention);
  assert.deepStrictEqual(tags[0].name, "@john@example.com");
  assert.deepStrictEqual(
    tags[0].href,
    new URL("https://example.com/users/john"),
  );
  const cache = m.getCachedObjects();
  assert.deepStrictEqual(cache.length, 1);
  assert.ok(cache[0] instanceof Person);
  assert.deepStrictEqual(
    cache[0].id,
    new URL("https://example.com/users/john"),
  );

  const m2: Text<"inline", void> = mention(
    "Jane Doe",
    new URL("https://example.com/@jane"),
  );
  assert.deepStrictEqual(
    (await Array.fromAsync(m2.getHtml(session))).join(""),
    '<a href="https://example.com/@jane" translate="no" ' +
      'class="h-card u-url mention" target="_blank">Jane Doe</a>',
  );
  const tags2 = await Array.fromAsync(m2.getTags(session));
  assert.deepStrictEqual(tags2.length, 1);
  assert.ok(tags2[0] instanceof Mention);
  assert.deepStrictEqual(tags2[0].name, "Jane Doe");
  assert.deepStrictEqual(tags2[0].href, new URL("https://example.com/@jane"));
  const cache2 = m2.getCachedObjects();
  assert.deepStrictEqual(cache2.length, 1);
  assert.ok(cache2[0] instanceof Person);
  assert.deepStrictEqual(cache2[0].id, new URL("https://example.com/@jane"));

  const m3: Text<"inline", void> = mention(
    "John Doe",
    new Person({
      id: new URL("https://example.com/users/john"),
      preferredUsername: "john",
      url: new URL("https://example.com/@john"),
    }),
  );
  assert.deepStrictEqual(
    (await Array.fromAsync(m3.getHtml(session))).join(""),
    '<a href="https://example.com/@john" translate="no" ' +
      'class="h-card u-url mention" target="_blank">John Doe</a>',
  );
  const tags3 = await Array.fromAsync(m3.getTags(session));
  assert.deepStrictEqual(tags3.length, 1);
  assert.ok(tags3[0] instanceof Mention);
  assert.deepStrictEqual(tags3[0].name, "John Doe");
  assert.deepStrictEqual(
    tags3[0].href,
    new URL("https://example.com/users/john"),
  );
  const cache3 = m3.getCachedObjects();
  assert.deepStrictEqual(cache3.length, 1);
  assert.ok(cache3[0] instanceof Person);
  assert.deepStrictEqual(
    cache3[0].id,
    new URL("https://example.com/users/john"),
  );

  const m4: Text<"inline", void> = mention("@fedify@hollo.social");
  assert.deepStrictEqual(
    (await Array.fromAsync(m4.getHtml(session))).join(""),
    '<a href="https://hollo.social/@fedify" translate="no" ' +
      'class="h-card u-url mention" target="_blank">@<span>' +
      "fedify@hollo.social</span></a>",
  );
  const tags4 = await Array.fromAsync(m4.getTags(session));
  assert.deepStrictEqual(tags4.length, 1);
  assert.ok(tags4[0] instanceof Mention);
  assert.deepStrictEqual(tags4[0].name, "@fedify@hollo.social");
  assert.deepStrictEqual(
    tags4[0].href,
    new URL("https://hollo.social/@fedify"),
  );
  const cache4 = m4.getCachedObjects();
  assert.deepStrictEqual(cache4.length, 1);
  assert.ok(cache4[0] instanceof Person);
  assert.deepStrictEqual(cache4[0].id, new URL("https://hollo.social/@fedify"));

  const m5: Text<"inline", void> = mention(
    new URL("https://hollo.social/@fedify"),
  );
  assert.deepStrictEqual(
    (await Array.fromAsync(m5.getHtml(session))).join(""),
    '<a href="https://hollo.social/@fedify" translate="no" ' +
      'class="h-card u-url mention" target="_blank">@<span>' +
      "fedify@hollo.social</span></a>",
  );
  const tags5 = await Array.fromAsync(m5.getTags(session));
  assert.deepStrictEqual(tags5.length, 1);
  assert.ok(tags5[0] instanceof Mention);
  assert.deepStrictEqual(tags5[0].name, "@fedify@hollo.social");
  assert.deepStrictEqual(
    tags5[0].href,
    new URL("https://hollo.social/@fedify"),
  );
  const cache5 = m5.getCachedObjects();
  assert.deepStrictEqual(cache5.length, 1);
  assert.ok(cache5[0] instanceof Person);
  assert.deepStrictEqual(cache5[0].id, new URL("https://hollo.social/@fedify"));

  const m6: Text<"inline", void> = mention("@bot@example.com");
  assert.deepStrictEqual(
    (await Array.fromAsync(m6.getHtml(session))).join(""),
    '<a href="https://example.com/ap/actor/bot" translate="no" ' +
      'class="h-card u-url mention" target="_blank">@<span>' +
      "bot@example.com</span></a>",
  );
  const tags6 = await Array.fromAsync(m6.getTags(session));
  assert.deepStrictEqual(tags6.length, 1);
  assert.ok(tags6[0] instanceof Mention);
  assert.deepStrictEqual(tags6[0].name, "@bot@example.com");
  assert.deepStrictEqual(
    tags6[0].href,
    new URL("https://example.com/ap/actor/bot"),
  );
  const cache6 = m6.getCachedObjects();
  assert.deepStrictEqual(cache6.length, 1);
  assert.ok(cache6[0] instanceof Person);
  assert.deepStrictEqual(
    cache6[0].id,
    new URL("https://example.com/ap/actor/bot"),
  );

  const m7: Text<"inline", void> = mention(
    "Example",
    new URL("https://example.com/ap/actor/bot"),
  );
  assert.deepStrictEqual(
    (await Array.fromAsync(m7.getHtml(session))).join(""),
    '<a href="https://example.com/ap/actor/bot" translate="no" ' +
      'class="h-card u-url mention" target="_blank">Example</a>',
  );
  const tags7 = await Array.fromAsync(m7.getTags(session));
  assert.deepStrictEqual(tags7.length, 1);
  assert.ok(tags7[0] instanceof Mention);
  assert.deepStrictEqual(tags7[0].name, "Example");
  assert.deepStrictEqual(
    tags7[0].href,
    new URL("https://example.com/ap/actor/bot"),
  );
  const cache7 = m7.getCachedObjects();
  assert.deepStrictEqual(cache7.length, 1);
  assert.ok(cache7[0] instanceof Person);
  assert.deepStrictEqual(
    cache7[0].id,
    new URL("https://example.com/ap/actor/bot"),
  );

  const m8: Text<"inline", void> = mention(
    new Person({
      id: new URL("https://example.com/ap/actor/bot"),
      preferredUsername: "bot",
    }),
  );
  assert.deepStrictEqual(
    (await Array.fromAsync(m8.getHtml(session))).join(""),
    '<a href="https://example.com/ap/actor/bot" translate="no" ' +
      'class="h-card u-url mention" target="_blank">@<span>' +
      "bot@example.com</span></a>",
  );
  const tags8 = await Array.fromAsync(m8.getTags(session));
  assert.deepStrictEqual(tags8.length, 1);
  assert.ok(tags8[0] instanceof Mention);
  assert.deepStrictEqual(tags8[0].name, "@bot@example.com");
  assert.deepStrictEqual(
    tags8[0].href,
    new URL("https://example.com/ap/actor/bot"),
  );
  const cache8 = m8.getCachedObjects();
  assert.deepStrictEqual(cache8.length, 1);
  assert.ok(cache8[0] instanceof Person);
  assert.deepStrictEqual(
    cache8[0].id,
    new URL("https://example.com/ap/actor/bot"),
  );

  const m9: Text<"inline", void> = mention(
    new URL("https://example.com/ap/actor/bot"),
  );
  assert.deepStrictEqual(
    (await Array.fromAsync(m9.getHtml(session))).join(""),
    '<a href="https://example.com/ap/actor/bot" translate="no" ' +
      'class="h-card u-url mention" target="_blank">@<span>' +
      "bot@example.com</span></a>",
  );
  const tags9 = await Array.fromAsync(m9.getTags(session));
  assert.deepStrictEqual(tags9.length, 1);
  assert.ok(tags9[0] instanceof Mention);
  assert.deepStrictEqual(tags9[0].name, "@bot@example.com");
  assert.deepStrictEqual(
    tags9[0].href,
    new URL("https://example.com/ap/actor/bot"),
  );
  const cache9 = m9.getCachedObjects();
  assert.deepStrictEqual(cache9.length, 1);
  assert.ok(cache9[0] instanceof Person);
  assert.deepStrictEqual(
    cache9[0].id,
    new URL("https://example.com/ap/actor/bot"),
  );
});

test("hashtag()", async () => {
  const session = bot.getSession("https://example.com");
  const t: Text<"inline", void> = hashtag("Fediverse");
  assert.deepStrictEqual(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    '<a href="https://example.com/tags/fediverse" class="mention hashtag" ' +
      'rel="tag" target="_blank">#<span>Fediverse</span></a>',
  );
  const tags = await Array.fromAsync(t.getTags(session));
  assert.deepStrictEqual(tags.length, 1);
  assert.ok(tags[0] instanceof Hashtag);
  assert.deepStrictEqual(tags[0].name, "#fediverse");
  assert.deepStrictEqual(
    tags[0].href,
    new URL("https://example.com/tags/fediverse"),
  );
  assert.deepStrictEqual(t.getCachedObjects(), []);
});

test("em()", async () => {
  const session = bot.getSession("https://example.com");
  const t: Text<"inline", void> = em("Hello, World");
  assert.deepStrictEqual(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    "<em>Hello, World</em>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t.getTags(session)), []);
  assert.deepStrictEqual(t.getCachedObjects(), []);
});

test("strong()", async () => {
  const session = bot.getSession("https://example.com");
  const t: Text<"inline", void> = strong("Hello, World");
  assert.deepStrictEqual(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    "<strong>Hello, World</strong>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t.getTags(session)), []);
  assert.deepStrictEqual(t.getCachedObjects(), []);
});

test("link()", async () => {
  const session = bot.getSession("https://example.com");
  const t: Text<"inline", void> = link(em("label"), "https://example.com/");
  assert.deepStrictEqual(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    '<a href="https://example.com/" target="_blank"><em>label</em></a>',
  );
  assert.deepStrictEqual(await Array.fromAsync(t.getTags(session)), []);
  assert.deepStrictEqual(t.getCachedObjects(), []);

  const t2: Text<"inline", void> = link("label", "https://example.com/");
  assert.deepStrictEqual(
    (await Array.fromAsync(t2.getHtml(session))).join(""),
    '<a href="https://example.com/" target="_blank">label</a>',
  );
  assert.deepStrictEqual(await Array.fromAsync(t2.getTags(session)), []);
  assert.deepStrictEqual(t2.getCachedObjects(), []);

  const t3: Text<"inline", void> = link("https://example.com/");
  assert.deepStrictEqual(
    (await Array.fromAsync(t3.getHtml(session))).join(""),
    '<a href="https://example.com/" target="_blank">https://example.com/</a>',
  );
  assert.deepStrictEqual(await Array.fromAsync(t3.getTags(session)), []);
  assert.deepStrictEqual(t3.getCachedObjects(), []);

  const t4: Text<"inline", void> = link(em("label"), "https://example.com/");
  assert.deepStrictEqual(
    (await Array.fromAsync(t4.getHtml(session))).join(""),
    '<a href="https://example.com/" target="_blank"><em>label</em></a>',
  );
  assert.deepStrictEqual(await Array.fromAsync(t4.getTags(session)), []);
  assert.deepStrictEqual(t4.getCachedObjects(), []);
});

test("code()", async () => {
  const session = bot.getSession("https://example.com");
  const t: Text<"inline", void> = code("a + b");
  assert.deepStrictEqual(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    "<code>a + b</code>",
  );
  assert.deepStrictEqual(await Array.fromAsync(t.getTags(session)), []);
  assert.deepStrictEqual(t.getCachedObjects(), []);
});

test("markdown()", async () => {
  const session = bot.getSession("https://example.com");
  const md = `Here's a Markdown text.

- I can have a list.
- I can have a **bold** text.
- I can have an _italic_ text.
- I can mention @fedify@hollo.social.
- I can tag #Hashtag.`;
  const t: Text<"block", void> = markdown(md);
  assert.deepStrictEqual(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    "<p>Here's a Markdown text.</p>\n<ul>\n" +
      "<li>I can have a list.</li>\n" +
      "<li>I can have a <strong>bold</strong> text.</li>\n" +
      "<li>I can have an <em>italic</em> text.</li>\n" +
      "<li>I can mention " +
      '<a  translate="no" class="h-card u-url mention" target="_blank" href="https://hollo.social/@fedify">' +
      '<span class="at">@</span><span class="user">fedify</span>' +
      '<span class="at">@</span><span class="domain">hollo.social</span></a>.</li>\n' +
      '<li>I can tag <a  class="mention hashtag" rel="tag" target="_blank" href="https://example.com/tags/hashtag">#<span>Hashtag</span></a>.</li>\n' +
      "</ul>\n",
  );
  const tags = await Array.fromAsync(t.getTags(session));
  assert.deepStrictEqual(tags.length, 2);
  assert.ok(tags[0] instanceof Mention);
  assert.deepStrictEqual(tags[0].name, "@fedify@hollo.social");
  assert.deepStrictEqual(tags[0].href, new URL("https://hollo.social/@fedify"));
  assert.ok(tags[1] instanceof Hashtag);
  assert.deepStrictEqual(tags[1].name, "#hashtag");
  assert.deepStrictEqual(
    tags[1].href,
    new URL("https://example.com/tags/hashtag"),
  );
  const cache = t.getCachedObjects();
  assert.deepStrictEqual(cache.length, 1);
  assert.ok(cache[0] instanceof Person);
  assert.deepStrictEqual(cache[0].id, new URL("https://hollo.social/@fedify"));

  const t2: Text<"block", void> = markdown("@fedify@hollo.social", {
    mentions: false,
  });
  assert.deepStrictEqual(
    (await Array.fromAsync(t2.getHtml(session))).join(""),
    "<p>@fedify@hollo.social</p>\n",
  );
  assert.deepStrictEqual(await Array.fromAsync(t2.getTags(session)), []);
  assert.deepStrictEqual(t2.getCachedObjects(), []);

  const t3: Text<"block", void> = markdown("@bot@example.com");
  assert.deepStrictEqual(
    (await Array.fromAsync(t3.getHtml(session))).join(""),
    '<p><a  translate="no" class="h-card u-url mention" target="_blank" href="https://example.com/ap/actor/bot">' +
      '<span class="at">@</span><span class="user">bot</span>' +
      '<span class="at">@</span><span class="domain">example.com</span></a></p>\n',
  );
  const tags3 = await Array.fromAsync(t3.getTags(session));
  assert.deepStrictEqual(tags3.length, 1);
  assert.ok(tags3[0] instanceof Mention);
  assert.deepStrictEqual(tags3[0].name, "@bot@example.com");
  assert.deepStrictEqual(
    tags3[0].href,
    new URL("https://example.com/ap/actor/bot"),
  );
  const cache3 = t3.getCachedObjects();
  assert.deepStrictEqual(cache3.length, 1);
  assert.ok(cache3[0] instanceof Person);
  assert.deepStrictEqual(
    cache3[0].id,
    new URL("https://example.com/ap/actor/bot"),
  );
});

describe("customEmoji(), CustomEmojiText", () => {
  const localBot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });
  const session = localBot.getSession("https://example.com");
  const emojiData: CustomEmoji = {
    type: "image/png",
    url: "https://example.com/emoji.png",
  };
  const deferredEmoji = localBot.addCustomEmoji("testEmoji", emojiData);
  const emojiObject = deferredEmoji(session); // Get the Emoji object

  test("customEmoji() function", () => {
    const emojiText = customEmoji<void>(deferredEmoji);
    assert.ok(emojiText instanceof CustomEmojiText);
    assert.deepStrictEqual(
      (emojiText as CustomEmojiText<void>).getEmoji(session),
      emojiObject,
    );

    const emojiTextDirect = customEmoji<void>(emojiObject);
    assert.ok(emojiTextDirect instanceof CustomEmojiText);
    assert.deepStrictEqual(
      (emojiTextDirect as CustomEmojiText<void>).getEmoji(session),
      emojiObject,
    );
  });

  test("CustomEmojiText.getHtml()", async () => {
    const emojiText = new CustomEmojiText(deferredEmoji);
    assert.deepStrictEqual(
      (await Array.fromAsync(emojiText.getHtml(session))).join(""),
      "\u200b:testEmoji:\u200b", // Zero-width spaces around name
    );

    // Test with Emoji object directly
    const emojiTextDirect = new CustomEmojiText<void>(emojiObject);
    assert.deepStrictEqual(
      (await Array.fromAsync(emojiTextDirect.getHtml(session))).join(""),
      "\u200b:testEmoji:\u200b",
    );

    // Test with emoji without name
    const emojiNoName = new Emoji({
      id: new URL("https://example.com/ap/emoji/noname"),
      icon: new Image({ url: new URL("https://example.com/noname.png") }),
    });
    const emojiTextNoName = new CustomEmojiText<void>(emojiNoName);
    assert.deepStrictEqual(
      (await Array.fromAsync(emojiTextNoName.getHtml(session))).join(""),
      "",
    );
  });

  test("CustomEmojiText.getTags()", async () => {
    const emojiText = new CustomEmojiText(deferredEmoji);
    const tags = await Array.fromAsync(emojiText.getTags(session));
    assert.deepStrictEqual(tags.length, 1);
    assert.ok(tags[0] instanceof Emoji);
    assert.deepStrictEqual(tags[0].id, emojiObject.id);
    assert.deepStrictEqual(tags[0].name, emojiObject.name);

    // Test with Emoji object directly
    const emojiTextDirect = new CustomEmojiText<void>(emojiObject);
    const tagsDirect = await Array.fromAsync(emojiTextDirect.getTags(session));
    assert.deepStrictEqual(tagsDirect.length, 1);
    assert.deepStrictEqual(tagsDirect[0], emojiObject);
  });

  test("CustomEmojiText.getCachedObjects()", () => {
    const emojiText = new CustomEmojiText(deferredEmoji);
    assert.deepStrictEqual(emojiText.getCachedObjects(), []); // CustomEmojiText doesn't cache objects itself

    const emojiTextDirect = new CustomEmojiText(emojiObject);
    assert.deepStrictEqual(emojiTextDirect.getCachedObjects(), []);
  });
});

test("customEmoji()", async () => {
  const localBot = new BotImpl<void>({
    kv: new MemoryKvStore(),
    username: "bot",
  });
  const session = localBot.getSession("https://example.com");
  const emojiData1: CustomEmoji = {
    type: "image/png",
    url: "https://example.com/emoji1.png",
  };
  const emojiData2: CustomEmoji = {
    type: "image/gif",
    file: "/path/to/emoji2.gif",
  };
  const deferredEmoji1 = localBot.addCustomEmoji("emoji1", emojiData1);
  const deferredEmoji2 = localBot.addCustomEmoji("emoji2", emojiData2);
  const emojiObject1 = deferredEmoji1(session);
  const emojiObject2 = deferredEmoji2(session);

  const t = text<void>`Hello ${customEmoji(deferredEmoji1)} world ${
    customEmoji(emojiObject2)
  }!`;

  // Test getHtml()
  assert.deepStrictEqual(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    "<p>Hello \u200b:emoji1:\u200b world \u200b:emoji2:\u200b!</p>",
  );

  // Test getTags()
  const tags = await Array.fromAsync(t.getTags(session));
  assert.deepStrictEqual(tags.length, 2);
  assert.ok(tags[0] instanceof Emoji);
  assert.deepStrictEqual(tags[0].id, emojiObject1.id);
  assert.ok(tags[1] instanceof Emoji);
  assert.deepStrictEqual(tags[1].id, emojiObject2.id);

  // Test getCachedObjects()
  assert.deepStrictEqual(t.getCachedObjects(), []); // TemplatedText itself doesn't cache, relies on children
});

// cSpell: ignore apos
