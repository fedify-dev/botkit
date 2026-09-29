 -  Upgraded Fedify to 2.1.25, which fixes a security vulnerability that let a
    remote host exhaust server resources by serving an unbounded chain of
    JSON-LD alternate-document links, and that caused the caller's abort signal
    to be ignored once such a link was followed.
    [[GHSA-97w4-f4rq-mgqm]]

[GHSA-97w4-f4rq-mgqm]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-97w4-f4rq-mgqm
