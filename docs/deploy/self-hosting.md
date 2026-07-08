---
description: >-
  Learn how to deploy your BotKit bot on your own Linux server with Deno or
  Node.js, systemd, and a Caddy reverse proxy.
---

Self-hosted deployment
======================

For complete control over your bot's environment, you can self-host it on your
own server.  This guide deploys a BotKit bot on a Linux server with SSH access,
puts Caddy in front of it for HTTPS, and keeps it running under systemd.  It
covers both the Deno and Node.js runtimes; follow the one your bot uses.


Prerequisites
-------------

1.  A Linux server with SSH access
2.  A domain name whose DNS points to your server
3.  Either [Deno] or [Node.js] installed on your server, matching your bot

[Deno]: https://deno.land/
[Node.js]: https://nodejs.org/


Installation steps
------------------

1.  Install the runtime your bot uses:

    ::: code-group

    ~~~~ bash [Deno]
    curl -fsSL https://deno.land/install.sh | sh
    ~~~~


    ~~~~ bash [Node.js]
    # Install the current LTS from nodejs.org, your distribution, or a version
    # manager such as fnm.  For example, with fnm:
    curl -fsSL https://fnm.vercel.app/install | bash
    fnm install --lts
    ~~~~

    :::

2.  Clone your bot repository:

    ~~~~ bash
    git clone https://github.com/yourusername/your-bot.git
    cd your-bot
    ~~~~

3.  Set up environment variables:

    ~~~~ bash
    echo 'export SERVER_NAME="your-domain.com"' >> ~/.bashrc
    source ~/.bashrc
    ~~~~


Setting up HTTPS with [Caddy]
-----------------------------

[Caddy] is recommended for handling HTTPS and reverse proxy. It automatically
obtains and renews SSL/TLS certificates from [Let's Encrypt] without any manual
configuration:

1.  [Install Caddy]:

    ::: code-group

    ~~~~ bash [Debian/Ubuntu]
    # Install required packages
    sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https

    # Add Caddy repository
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
      sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
      sudo tee /etc/apt/sources.list.d/caddy-stable.list

    # Install Caddy
    sudo apt update
    sudo apt install caddy
    ~~~~


    ~~~~ bash [RHEL/Fedora]
    # Add Caddy repository
    dnf install 'dnf-command(copr)'
    dnf copr enable @caddy/caddy

    # Install Caddy
    dnf install caddy
    ~~~~


    ~~~~ bash [Arch Linux]
    # Install from official repositories
    sudo pacman -S caddy
    ~~~~

    :::

    > [!TIP]
    > For other installation methods or operating systems,
    > see the [official Caddy installation docs][Install Caddy].

2.  Create a Caddyfile at */etc/caddy/Caddyfile*:

    ~~~~ caddyfile [/etc/caddy/Caddyfile]
    your-domain.com {
        # Automatic HTTPS
        tls {
            # Email for Let's Encrypt notifications
            email your-email@example.com
        }
        
        # Proxy all requests to your bot
        reverse_proxy localhost:8000
        
        # Basic security headers
        header {
            # Enable HSTS
            Strict-Transport-Security "max-age=31536000;"
            # Prevent clickjacking
            X-Frame-Options "DENY"
            # XSS protection
            X-Content-Type-Options "nosniff"
            X-XSS-Protection "1; mode=block"
        }
    }
    ~~~~


    > [!NOTE]
    > Make sure your domain's DNS A record points to your server's IP address
    > before starting Caddy.  Caddy will automatically obtain and manage SSL
    > certificates from Let's Encrypt.

3.  Set proper ownership and permissions:

    ~~~~ bash
    sudo chown root:root /etc/caddy/Caddyfile
    sudo chmod 644 /etc/caddy/Caddyfile
    ~~~~

4.  Restart Caddy:

    ~~~~ bash
    sudo systemctl restart caddy
    ~~~~

5.  Check Caddy's status:

    ~~~~ bash
    sudo systemctl status caddy
    sudo journalctl -u caddy --follow
    ~~~~

> [!IMPORTANT]
> Caddy terminates TLS and forwards requests to the bot over plain HTTP, so the
> bot has to trust the `X-Forwarded-*` headers to reconstruct its public HTTPS
> origin.  Turn on
> [`behindProxy`](../concepts/bot.md#createbotoptions-behindproxy) in
> `createBot()`.  The systemd units in the next section export
> `BEHIND_PROXY=true` for the bot to read into that option, following the
> pattern in
> [*Exposing the bot to the public internet*](../concepts/bot.md#exposing-the-bot-to-the-public-internet).

[Caddy]: https://caddyserver.com/
[Let's Encrypt]: https://letsencrypt.org/
[Install Caddy]: https://caddyserver.com/docs/install


Creating a [systemd] service
----------------------------

The [systemd] is a system and service manager for Linux that starts and manages
services.  It is adopted by most modern Linux distributions including Debian,
Ubuntu, Fedora, and Arch Linux.

> [!NOTE]
> A self-hosted bot runs as one long-lived process, so BotKit starts its
> message queue automatically once the first task is enqueued.  You don't need
> to start the queue worker yourself.

To run your bot as a systemd service:

1.  Create a dedicated user for your bot (recommended for security):

    ~~~~ bash
    sudo useradd -r -s /bin/false botkit
    ~~~~

2.  Set up the bot's directory:

    ~~~~ bash
    sudo mkdir -p /opt/botkit
    sudo chown botkit:botkit /opt/botkit
    ~~~~

3.  Create a service file at */etc/systemd/system/botkit-bot.service*.  The unit
    is the same for both runtimes apart from `ExecStart`, which starts the bot
    the way its runtime expects (see
    [*Running the bot*](../start.md#running-the-bot)):

    ::: code-group

    ~~~~ ini [Deno]
    [Unit]
    Description=BotKit Bot
    After=network.target
    Wants=caddy.service

    [Service]
    Type=simple
    User=botkit
    Group=botkit
    Environment=SERVER_NAME=your-domain.com
    # Add any other environment variables your bot needs
    Environment=NODE_ENV=production
    Environment=BEHIND_PROXY=true

    WorkingDirectory=/opt/botkit
    # A bot uses `export default bot`, so start it with `deno serve`, not
    # `deno run`.
    ExecStart=/usr/local/bin/deno serve -A --port 8000 bot.ts

    # Restart policy
    Restart=always
    RestartSec=10

    # Security settings
    NoNewPrivileges=true
    ProtectSystem=strict
    ProtectHome=true
    PrivateTmp=true
    PrivateDevices=true

    # Resource limits
    CPUQuota=80%
    MemoryMax=1G

    [Install]
    WantedBy=multi-user.target
    ~~~~


    ~~~~ ini [Node.js]
    [Unit]
    Description=BotKit Bot
    After=network.target
    Wants=caddy.service

    [Service]
    Type=simple
    User=botkit
    Group=botkit
    Environment=SERVER_NAME=your-domain.com
    # Add any other environment variables your bot needs
    Environment=NODE_ENV=production
    Environment=BEHIND_PROXY=true

    WorkingDirectory=/opt/botkit
    # Serve the `export default bot` entry through the srvx CLI, whose binary
    # ships with the bot's dependencies under node_modules.
    ExecStart=/opt/botkit/node_modules/.bin/srvx serve --prod --port 8000 --entry bot.ts

    # Restart policy
    Restart=always
    RestartSec=10

    # Security settings
    NoNewPrivileges=true
    ProtectSystem=strict
    ProtectHome=true
    PrivateTmp=true
    PrivateDevices=true

    # Resource limits
    CPUQuota=80%
    MemoryMax=1G

    [Install]
    WantedBy=multi-user.target
    ~~~~

    :::

    The unit hardens the service with `ProtectHome=true`, so it cannot read
    anything under */home*.  Install the runtime (the `deno` or `node` binary)
    somewhere system-wide, such as */usr/local/bin*, so that `ExecStart` and,
    on Node.js, srvx's `#!/usr/bin/env node` launcher can find it.

    > [!NOTE]
    > On Node.js, add the [srvx] package to the project's dependencies and
    > install them in */opt/botkit* (for example, with `npm ci`), so that
    > */opt/botkit/node\_modules/.bin/srvx* exists before the service starts.
    > The *bot.ts* file should end with `export default bot`, exactly as on
    > Deno.

4.  Set proper permissions:

    ~~~~ bash
    sudo chown root:root /etc/systemd/system/botkit-bot.service
    sudo chmod 644 /etc/systemd/system/botkit-bot.service
    ~~~~

5.  Reload systemd, enable and start the service:

    ~~~~ bash
    # Reload systemd to recognize the new service
    sudo systemctl daemon-reload

    # Enable service to start on boot
    sudo systemctl enable botkit-bot

    # Start the service
    sudo systemctl start botkit-bot
    ~~~~

6.  Verify the service is running:

    ~~~~ bash
    # Check service status
    sudo systemctl status botkit-bot

    # View logs
    sudo journalctl -u botkit-bot -f
    ~~~~

> [!TIP]
> To update your bot:
>
> 1.  Copy new files to */opt/botkit*
> 2.  Set proper ownership: `sudo chown -R botkit:botkit /opt/botkit`
> 3.  Restart the service: `sudo systemctl restart botkit-bot`

[systemd]: https://systemd.io/
[srvx]: https://srvx.h3.dev/


Monitoring logs
---------------

Monitor your bot's logs using systemd:

~~~~ bash
sudo journalctl -u botkit-bot -f
~~~~

<!-- cSpell: ignore dearmor keyrings copr pacman Caddyfile clickjacking -->
<!-- cSpell: ignore nosniff journalctl fnm srvx vercel -->
