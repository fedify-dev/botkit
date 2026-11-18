 -  Upgraded Fedify to 2.3.16, which includes six security fixes:

     -  WebFinger lookups now time out after 10 seconds.  Actor handle
        resolution shares one 10-second limit across alias checks.
        [[GHSA-9pmv-w936-hj3f]]

     -  Each outgoing activity delivery attempt now times out after 30
        seconds, including redirects and HTTP signature retries.  Timed-out
        attempts follow the configured retry schedule.
        [[GHSA-fq5h-gjhp-g75x]]

     -  NodeInfo lookups now time out after 10 seconds by default and stop
        following redirects when a URL repeats.  On Node.js, NodeInfo runs
        at most two operating system DNS lookups at once.
        [[GHSA-64hq-2hgr-q4pm]]

     -  Origin checks now also apply to embedded JSON-LD objects whose
        parent has no `id`.
        [[GHSA-r388-57j3-5fgp]]

     -  `@fedify/backfill` now fetches cross-origin embedded objects by
        their IDs instead of returning the embedded copies directly.
        [[GHSA-x58x-xx7h-7rh4]]

     -  `@fedify/backfill` now ignores document loader results whose ID
        origin differs from the requested origin, including results
        reached through cross-origin redirects.
        [[GHSA-h3jv-px69-2gpj]]

[GHSA-9pmv-w936-hj3f]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-9pmv-w936-hj3f
[GHSA-fq5h-gjhp-g75x]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-fq5h-gjhp-g75x
[GHSA-64hq-2hgr-q4pm]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-64hq-2hgr-q4pm
[GHSA-r388-57j3-5fgp]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-r388-57j3-5fgp
[GHSA-x58x-xx7h-7rh4]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-x58x-xx7h-7rh4
[GHSA-h3jv-px69-2gpj]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-h3jv-px69-2gpj
