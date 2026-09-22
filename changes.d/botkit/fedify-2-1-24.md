 -  Upgraded Fedify to 2.1.24, which fixes three security vulnerabilities:
    forged activities could be accepted as coming from any actor, remote
    ActivityPub and JSON-LD documents were parsed without a size limit, and
    outbound activity delivery could be redirected to private network
    addresses.
    [[GHSA-q9f8-5hc7-898f], [GHSA-mc44-6cfg-2v6w], [GHSA-f59r-8gcj-68f2]]

[GHSA-q9f8-5hc7-898f]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-q9f8-5hc7-898f
[GHSA-mc44-6cfg-2v6w]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-mc44-6cfg-2v6w
[GHSA-f59r-8gcj-68f2]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-f59r-8gcj-68f2
