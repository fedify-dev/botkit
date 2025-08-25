BotKit changelog
================

Version 0.1.4
-------------

To be released.

 -  Upgraded Fedifyh to 1.4.15 which fixes a bug where HTTP Signature
    verification failed for requests having `created` or `expires` fields
    in their `Signature` header, causing `500 Internal Server Error` responses
    in inbox handlers.


Version 0.1.3
-------------

Released on August 25, 2025.

 -  Upgraded Fedify to 1.4.14, which fixes a bug where ActivityPub Discovery
    failed to recognize XHTML self-closing `<link>` tags.  The HTML/XHTML parser
    now correctly handles whitespace before the self-closing slash (`/>`),
    improving compatibility with XHTML documents that follow the self-closing
    tag format.


Version 0.1.2
-------------

Released on August 8, 2025.

 -  Upgraded Fedify to 1.4.13, which includes a critical security
    fix [CVE-2025-54888] that addresses an authentication bypass
    vulnerability allowing actor impersonation.  [[CVE-2025-54888]]

[CVE-2025-54888]: https://github.com/fedify-dev/fedify/security/advisories/GHSA-6jcc-xgcr-q3h4


Version 0.1.1
-------------

Released on February 10, 2025.

 -  Fixed a bug where direct and followers-only messages that reply to a bot
    had been forwarded to the bot's followers.


Version 0.1.0
-------------

Initial release.  Released on February 7, 2025.
