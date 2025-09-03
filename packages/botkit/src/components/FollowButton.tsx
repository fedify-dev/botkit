/** @jsxImportSource hono/jsx */
import type { BotImpl } from "../bot-impl.ts";

export interface FollowButtonProps {
  readonly bot: BotImpl<unknown>;
}

export function FollowButton({ bot }: FollowButtonProps) {
  return (
    <>
      <button
        id="follow-btn"
        type="button"
        style="padding: 0.5rem 1rem; background: var(--pico-primary); color: var(--pico-primary-inverse); border: none; border-radius: 0.25rem; cursor: pointer;"
        onclick="showFollowModal()"
      >
        Follow
      </button>
      <dialog id="follow-modal">
        <article style="width: 400px;">
          <header style="display: flex; align-items: center; justify-content:space-between">
            <h3>Follow {bot.name ?? bot.username}</h3>
            <button
              aria-label="Close"
              rel="prev"
              type="button"
              onclick="closeFollowModal()"
            />
          </header>
          <main>
            <p>Enter your fediverse handle to follow this account:</p>
            <form action="/follow" method="post">
              <input
                type="text"
                id="fediverse-handle"
                name="handle"
                placeholder="@username@instance.com"
                required
                style="width: 100%; margin-bottom: 1rem;"
              />
              <button type="submit" style="width: 100%;">
                Follow
              </button>
            </form>
          </main>
        </article>
      </dialog>
      <script
        dangerouslySetInnerHTML={{
          __html: `
          function showFollowModal() {
            document.getElementById('follow-modal').showModal();
          }
          
          function closeFollowModal() {
            document.getElementById('follow-modal').close();
          }
        `,
        }}
      />
    </>
  );
}
