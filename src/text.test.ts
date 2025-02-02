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
import { Hashtag, Mention, Person } from "@fedify/fedify/vocab";
import {
  assert,
  assertEquals,
  assertFalse,
  assertInstanceOf,
} from "@std/assert";
import type { BotWithVoidContextData } from "./bot.ts";
import type { Session } from "./session.ts";
import {
  code,
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
};

Deno.test("isText()", () => {
  const t = text`Hello, World`;
  assert(isText(t));
  const t2 = em("Hello, World");
  assert(isText(t2));
  assertFalse(isText("Hello, World"));
});

Deno.test("mentions()", async () => {
  const session = bot.getSession("https://example.com");
  const actor = new URL("https://hollo.social/@fedify");
  const actor2 = new URL("https://example.com/users/john");
  const actor3 = new Person({ id: actor });
  const t: Text<"block", void> = text`Hello, world!`;
  assertFalse(await mentions(session, t, actor));
  assertFalse(await mentions(session, t, actor2));
  assertFalse(await mentions(session, t, actor3));

  const m: Text<"inline", void> = mention(actor);
  assert(await mentions(session, m, actor));
  assertFalse(await mentions(session, m, actor2));
  assert(await mentions(session, m, actor3));
});

Deno.test({
  name: "text`...`",
  permissions: {},
  async fn() {
    const session = bot.getSession("https://example.com");
    const t: Text<"block", void> = text`Hello, <${123}>`;
    assertEquals(
      (await Array.fromAsync(t.getHtml(session))).join(""),
      "<p>Hello, &lt;123&gt;</p>",
    );
    assertEquals(await Array.fromAsync(t.getTags(session)), []);
    assertEquals(t.getCachedObjects(), []);

    const t2: Text<"block", void> = text`Hello, ${em("World")}`;
    assertEquals(
      (await Array.fromAsync(t2.getHtml(session))).join(""),
      "<p>Hello, <em>World</em></p>",
    );
    assertEquals(await Array.fromAsync(t2.getTags(session)), []);
    assertEquals(t2.getCachedObjects(), []);

    const actor = new Person({
      id: new URL("https://example.com/users/john"),
      preferredUsername: "john",
      url: new URL("https://example.com/@john"),
    });
    const t3: Text<"block", void> = text`Hello, ${mention(actor)}`;
    assertEquals(
      (await Array.fromAsync(t3.getHtml(session))).join(""),
      '<p>Hello, <a href="https://example.com/@john" translate="no" ' +
        'class="h-card u-url mention" target="_blank">@<span>john@example.com' +
        "</span></a></p>",
    );
    const tags3 = await Array.fromAsync(t3.getTags(session));
    assertEquals(tags3.length, 1);
    assertInstanceOf(tags3[0], Mention);
    assertEquals(tags3[0].name, "@john@example.com");
    assertEquals(tags3[0].href, new URL("https://example.com/users/john"));
    const cache3 = t3.getCachedObjects();
    assertEquals(cache3.length, 1);
    assertInstanceOf(cache3[0], Person);
    assertEquals(cache3[0].id, new URL("https://example.com/users/john"));

    const t4: Text<"block", void> = text`Hello\nworld!`;
    assertEquals(
      (await Array.fromAsync(t4.getHtml(session))).join(""),
      "<p>Hello<br>world!</p>",
    );
    assertEquals(await Array.fromAsync(t4.getTags(session)), []);
    assertEquals(t4.getCachedObjects(), []);

    const t5: Text<"block", void> =
      text`Hello\nworld!\n\nGoodbye!\n\t\n \nHello!`;
    assertEquals(
      (await Array.fromAsync(t5.getHtml(session))).join(""),
      "<p>Hello<br>world!</p><p>Goodbye!</p><p>Hello!</p>",
    );
    assertEquals(await Array.fromAsync(t5.getTags(session)), []);
    assertEquals(t5.getCachedObjects(), []);

    const t6: Text<"block", void> = text`\n\n\nHello\nworld\n\n\nGoodbye!\n`;
    assertEquals(
      (await Array.fromAsync(t6.getHtml(session))).join(""),
      "<p>Hello<br>world</p><p>Goodbye!</p>",
    );
    assertEquals(await Array.fromAsync(t6.getTags(session)), []);
    assertEquals(t6.getCachedObjects(), []);

    const t7: Text<"block", void> = text`Here's a link: ${new URL(
      "https://fedify.dev/",
    )}.`;
    assertEquals(
      (await Array.fromAsync(t7.getHtml(session))).join(""),
      '<p>Here&#39;s a link: <a href="https://fedify.dev/" target="_blank">' +
        "https://fedify.dev/</a>.</p>",
    );
    assertEquals(await Array.fromAsync(t7.getTags(session)), []);
    assertEquals(t7.getCachedObjects(), []);

    const t8: Text<"block", void> = text`Here's a multiline text:
    
${"First line.\nSecond line."}`;
    assertEquals(
      (await Array.fromAsync(t8.getHtml(session))).join(""),
      "<p>Here&#39;s a multiline text:</p><p>First line.<br>Second line.</p>",
    );
    assertEquals(await Array.fromAsync(t8.getTags(session)), []);
    assertEquals(t8.getCachedObjects(), []);

    const t9: Text<"block", void> =
      text`Interpolating blocks: ${text`Hello\nworld!`} ... and ... ${text`Goodbye!`}`;
    assertEquals(
      (await Array.fromAsync(t9.getHtml(session))).join(""),
      "<p>Interpolating blocks: </p><p>Hello<br>world!</p><p> ... and ... </p><p>Goodbye!</p>",
    );
    assertEquals(await Array.fromAsync(t9.getTags(session)), []);
    assertEquals(t9.getCachedObjects(), []);

    const t10: Text<"block", void> =
      text`Interpolating blocks:\n\n${text`Hello\nworld!`}\n\n... and ...\n\n${text`Goodbye!`}`;
    assertEquals(
      (await Array.fromAsync(t10.getHtml(session))).join(""),
      "<p>Interpolating blocks:</p><p>Hello<br>world!</p><p>... and ...</p><p>Goodbye!</p>",
    );
    assertEquals(await Array.fromAsync(t10.getTags(session)), []);
    assertEquals(t10.getCachedObjects(), []);
  },
});

Deno.test({
  name: "mention()",
  sanitizeResources: false,
  permissions: { net: ["hollo.social"] },
  async fn() {
    const session = bot.getSession("https://example.com");
    const m: Text<"inline", void> = mention(
      new Person({
        id: new URL("https://example.com/users/john"),
        preferredUsername: "john",
        url: new URL("https://example.com/@john"),
      }),
    );
    assertEquals(
      (await Array.fromAsync(m.getHtml(session))).join(""),
      '<a href="https://example.com/@john" translate="no" ' +
        'class="h-card u-url mention" target="_blank">@<span>john@example.com' +
        "</span></a>",
    );
    const tags = await Array.fromAsync(m.getTags(session));
    assertEquals(tags.length, 1);
    assertInstanceOf(tags[0], Mention);
    assertEquals(tags[0].name, "@john@example.com");
    assertEquals(tags[0].href, new URL("https://example.com/users/john"));
    const cache = m.getCachedObjects();
    assertEquals(cache.length, 1);
    assertInstanceOf(cache[0], Person);
    assertEquals(cache[0].id, new URL("https://example.com/users/john"));

    const m2: Text<"inline", void> = mention(
      "Jane Doe",
      new URL("https://example.com/@jane"),
    );
    assertEquals(
      (await Array.fromAsync(m2.getHtml(session))).join(""),
      '<a href="https://example.com/@jane" translate="no" ' +
        'class="h-card u-url mention" target="_blank">Jane Doe</a>',
    );
    const tags2 = await Array.fromAsync(m2.getTags(session));
    assertEquals(tags2.length, 1);
    assertInstanceOf(tags2[0], Mention);
    assertEquals(tags2[0].name, "Jane Doe");
    assertEquals(tags2[0].href, new URL("https://example.com/@jane"));
    const cache2 = m2.getCachedObjects();
    assertEquals(cache2.length, 1);
    assertInstanceOf(cache2[0], Person);
    assertEquals(cache2[0].id, new URL("https://example.com/@jane"));

    const m3: Text<"inline", void> = mention(
      "John Doe",
      new Person({
        id: new URL("https://example.com/users/john"),
        preferredUsername: "john",
        url: new URL("https://example.com/@john"),
      }),
    );
    assertEquals(
      (await Array.fromAsync(m3.getHtml(session))).join(""),
      '<a href="https://example.com/@john" translate="no" ' +
        'class="h-card u-url mention" target="_blank">John Doe</a>',
    );
    const tags3 = await Array.fromAsync(m3.getTags(session));
    assertEquals(tags3.length, 1);
    assertInstanceOf(tags3[0], Mention);
    assertEquals(tags3[0].name, "John Doe");
    assertEquals(tags3[0].href, new URL("https://example.com/users/john"));
    const cache3 = m3.getCachedObjects();
    assertEquals(cache3.length, 1);
    assertInstanceOf(cache3[0], Person);
    assertEquals(cache3[0].id, new URL("https://example.com/users/john"));

    const m4: Text<"inline", void> = mention("@fedify@hollo.social");
    assertEquals(
      (await Array.fromAsync(m4.getHtml(session))).join(""),
      '<a href="https://hollo.social/@fedify" translate="no" ' +
        'class="h-card u-url mention" target="_blank">@<span>' +
        "fedify@hollo.social</span></a>",
    );
    const tags4 = await Array.fromAsync(m4.getTags(session));
    assertEquals(tags4.length, 1);
    assertInstanceOf(tags4[0], Mention);
    assertEquals(tags4[0].name, "@fedify@hollo.social");
    assertEquals(tags4[0].href, new URL("https://hollo.social/@fedify"));
    const cache4 = m4.getCachedObjects();
    assertEquals(cache4.length, 1);
    assertInstanceOf(cache4[0], Person);
    assertEquals(cache4[0].id, new URL("https://hollo.social/@fedify"));

    const m5: Text<"inline", void> = mention(
      new URL("https://hollo.social/@fedify"),
    );
    assertEquals(
      (await Array.fromAsync(m5.getHtml(session))).join(""),
      '<a href="https://hollo.social/@fedify" translate="no" ' +
        'class="h-card u-url mention" target="_blank">@<span>' +
        "fedify@hollo.social</span></a>",
    );
    const tags5 = await Array.fromAsync(m5.getTags(session));
    assertEquals(tags5.length, 1);
    assertInstanceOf(tags5[0], Mention);
    assertEquals(tags5[0].name, "@fedify@hollo.social");
    assertEquals(tags5[0].href, new URL("https://hollo.social/@fedify"));
    const cache5 = m5.getCachedObjects();
    assertEquals(cache5.length, 1);
    assertInstanceOf(cache5[0], Person);
    assertEquals(cache5[0].id, new URL("https://hollo.social/@fedify"));

    const m6: Text<"inline", void> = mention("@bot@example.com");
    assertEquals(
      (await Array.fromAsync(m6.getHtml(session))).join(""),
      '<a href="https://example.com/ap/actor/bot" translate="no" ' +
        'class="h-card u-url mention" target="_blank">@<span>' +
        "bot@example.com</span></a>",
    );
    const tags6 = await Array.fromAsync(m6.getTags(session));
    assertEquals(tags6.length, 1);
    assertInstanceOf(tags6[0], Mention);
    assertEquals(tags6[0].name, "@bot@example.com");
    assertEquals(tags6[0].href, new URL("https://example.com/ap/actor/bot"));
    const cache6 = m6.getCachedObjects();
    assertEquals(cache6.length, 1);
    assertInstanceOf(cache6[0], Person);
    assertEquals(cache6[0].id, new URL("https://example.com/ap/actor/bot"));

    const m7: Text<"inline", void> = mention(
      "Example",
      new URL("https://example.com/ap/actor/bot"),
    );
    assertEquals(
      (await Array.fromAsync(m7.getHtml(session))).join(""),
      '<a href="https://example.com/ap/actor/bot" translate="no" ' +
        'class="h-card u-url mention" target="_blank">Example</a>',
    );
    const tags7 = await Array.fromAsync(m7.getTags(session));
    assertEquals(tags7.length, 1);
    assertInstanceOf(tags7[0], Mention);
    assertEquals(tags7[0].name, "Example");
    assertEquals(tags7[0].href, new URL("https://example.com/ap/actor/bot"));
    const cache7 = m7.getCachedObjects();
    assertEquals(cache7.length, 1);
    assertInstanceOf(cache7[0], Person);
    assertEquals(cache7[0].id, new URL("https://example.com/ap/actor/bot"));

    const m8: Text<"inline", void> = mention(
      new Person({
        id: new URL("https://example.com/ap/actor/bot"),
        preferredUsername: "bot",
      }),
    );
    assertEquals(
      (await Array.fromAsync(m8.getHtml(session))).join(""),
      '<a href="https://example.com/ap/actor/bot" translate="no" ' +
        'class="h-card u-url mention" target="_blank">@<span>' +
        "bot@example.com</span></a>",
    );
    const tags8 = await Array.fromAsync(m8.getTags(session));
    assertEquals(tags8.length, 1);
    assertInstanceOf(tags8[0], Mention);
    assertEquals(tags8[0].name, "@bot@example.com");
    assertEquals(tags8[0].href, new URL("https://example.com/ap/actor/bot"));
    const cache8 = m8.getCachedObjects();
    assertEquals(cache8.length, 1);
    assertInstanceOf(cache8[0], Person);
    assertEquals(cache8[0].id, new URL("https://example.com/ap/actor/bot"));

    const m9: Text<"inline", void> = mention(
      new URL("https://example.com/ap/actor/bot"),
    );
    assertEquals(
      (await Array.fromAsync(m9.getHtml(session))).join(""),
      '<a href="https://example.com/ap/actor/bot" translate="no" ' +
        'class="h-card u-url mention" target="_blank">@<span>' +
        "bot@example.com</span></a>",
    );
    const tags9 = await Array.fromAsync(m9.getTags(session));
    assertEquals(tags9.length, 1);
    assertInstanceOf(tags9[0], Mention);
    assertEquals(tags9[0].name, "@bot@example.com");
    assertEquals(tags9[0].href, new URL("https://example.com/ap/actor/bot"));
    const cache9 = m9.getCachedObjects();
    assertEquals(cache9.length, 1);
    assertInstanceOf(cache9[0], Person);
    assertEquals(cache9[0].id, new URL("https://example.com/ap/actor/bot"));
  },
});

Deno.test("hashtag()", async () => {
  const session = bot.getSession("https://example.com");
  const t: Text<"inline", void> = hashtag("Fediverse");
  assertEquals(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    '<a href="https://example.com/tags/fediverse" class="mention hashtag" ' +
      'rel="tag" target="_blank">#<span>Fediverse</span></a>',
  );
  const tags = await Array.fromAsync(t.getTags(session));
  assertEquals(tags.length, 1);
  assertInstanceOf(tags[0], Hashtag);
  assertEquals(tags[0].name, "#fediverse");
  assertEquals(tags[0].href, new URL("https://example.com/tags/fediverse"));
  assertEquals(t.getCachedObjects(), []);
});

Deno.test("em()", async () => {
  const session = bot.getSession("https://example.com");
  const t: Text<"inline", void> = em("Hello, World");
  assertEquals(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    "<em>Hello, World</em>",
  );
  assertEquals(await Array.fromAsync(t.getTags(session)), []);
  assertEquals(t.getCachedObjects(), []);
});

Deno.test("strong()", async () => {
  const session = bot.getSession("https://example.com");
  const t: Text<"inline", void> = strong("Hello, World");
  assertEquals(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    "<strong>Hello, World</strong>",
  );
  assertEquals(await Array.fromAsync(t.getTags(session)), []);
  assertEquals(t.getCachedObjects(), []);
});

Deno.test("link()", async () => {
  const session = bot.getSession("https://example.com");
  const t: Text<"inline", void> = link(em("label"), "https://example.com/");
  assertEquals(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    '<a href="https://example.com/" target="_blank"><em>label</em></a>',
  );
  assertEquals(await Array.fromAsync(t.getTags(session)), []);
  assertEquals(t.getCachedObjects(), []);

  const t2: Text<"inline", void> = link("label", "https://example.com/");
  assertEquals(
    (await Array.fromAsync(t2.getHtml(session))).join(""),
    '<a href="https://example.com/" target="_blank">label</a>',
  );
  assertEquals(await Array.fromAsync(t2.getTags(session)), []);
  assertEquals(t2.getCachedObjects(), []);

  const t3: Text<"inline", void> = link("https://example.com/");
  assertEquals(
    (await Array.fromAsync(t3.getHtml(session))).join(""),
    '<a href="https://example.com/" target="_blank">https://example.com/</a>',
  );
  assertEquals(await Array.fromAsync(t3.getTags(session)), []);
  assertEquals(t3.getCachedObjects(), []);

  const t4: Text<"inline", void> = link(em("label"), "https://example.com/");
  assertEquals(
    (await Array.fromAsync(t4.getHtml(session))).join(""),
    '<a href="https://example.com/" target="_blank"><em>label</em></a>',
  );
  assertEquals(await Array.fromAsync(t4.getTags(session)), []);
  assertEquals(t4.getCachedObjects(), []);
});

Deno.test("code()", async () => {
  const session = bot.getSession("https://example.com");
  const t: Text<"inline", void> = code("a + b");
  assertEquals(
    (await Array.fromAsync(t.getHtml(session))).join(""),
    "<code>a + b</code>",
  );
  assertEquals(await Array.fromAsync(t.getTags(session)), []);
  assertEquals(t.getCachedObjects(), []);
});

Deno.test("markdown()", async () => {
  const session = bot.getSession("https://example.com");
  const md = `Here's a Markdown text.

- I can have a list.
- I can have a **bold** text.
- I can have an _italic_ text.
- I can mention @fedify@hollo.social.
- I can tag #Hashtag.`;
  const t: Text<"block", void> = markdown(md);
  assertEquals(
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
  assertEquals(tags.length, 2);
  assertInstanceOf(tags[0], Mention);
  assertEquals(tags[0].name, "@fedify@hollo.social");
  assertEquals(tags[0].href, new URL("https://hollo.social/@fedify"));
  assertInstanceOf(tags[1], Hashtag);
  assertEquals(tags[1].name, "#hashtag");
  assertEquals(tags[1].href, new URL("https://example.com/tags/hashtag"));
  const cache = t.getCachedObjects();
  assertEquals(cache.length, 1);
  assertInstanceOf(cache[0], Person);
  assertEquals(cache[0].id, new URL("https://hollo.social/@fedify"));

  const t2: Text<"block", void> = markdown("@fedify@hollo.social", {
    mentions: false,
  });
  assertEquals(
    (await Array.fromAsync(t2.getHtml(session))).join(""),
    "<p>@fedify@hollo.social</p>\n",
  );
  assertEquals(await Array.fromAsync(t2.getTags(session)), []);
  assertEquals(t2.getCachedObjects(), []);

  const t3: Text<"block", void> = markdown("@bot@example.com");
  assertEquals(
    (await Array.fromAsync(t3.getHtml(session))).join(""),
    '<p><a  translate="no" class="h-card u-url mention" target="_blank" href="https://example.com/ap/actor/bot">' +
      '<span class="at">@</span><span class="user">bot</span>' +
      '<span class="at">@</span><span class="domain">example.com</span></a></p>\n',
  );
  const tags3 = await Array.fromAsync(t3.getTags(session));
  assertEquals(tags3.length, 1);
  assertInstanceOf(tags3[0], Mention);
  assertEquals(tags3[0].name, "@bot@example.com");
  assertEquals(tags3[0].href, new URL("https://example.com/ap/actor/bot"));
  const cache3 = t3.getCachedObjects();
  assertEquals(cache3.length, 1);
  assertInstanceOf(cache3[0], Person);
  assertEquals(cache3[0].id, new URL("https://example.com/ap/actor/bot"));
});
