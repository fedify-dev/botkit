---
links:
  '#52': https://github.com/fedify-dev/botkit/issues/52
  '#53': https://github.com/fedify-dev/botkit/pull/53
---
 -  Changed [FEP-044f] quote authorization handling to use Fedify's
    *@fedify/interaction-controls* package.  Quote authorization stamps are
    now checked against their owner's [FEP-fe34] origin, so stamps whose IDs
    have no comparable origin, such as opaque URIs, are no longer accepted.
    [[#52], [#53]]

 -  Fixed a bug where a remote server could approve a quote with a quote
    authorization stamp other than the one named in its `Accept` activity,
    as long as the substituted stamp was on the same origin.  [[#52], [#53]]

[FEP-044f]: https://w3id.org/fep/044f
[FEP-fe34]: https://w3id.org/fep/fe34
