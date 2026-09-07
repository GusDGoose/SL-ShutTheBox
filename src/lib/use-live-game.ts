"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchLiveSnapshot } from "@/app/(focus)/game/actions";
import { parseSnapshot, type LiveSnapshot } from "@/lib/live";
import { supabaseBrowser } from "@/lib/supabase-browser";

export type Connection = "live" | "polling" | "offline";

const POLL_MS = 5000;

/**
 * Keeps a board in step with the database.
 *
 * The scorekeeper's own action replies and the broadcasts other devices receive
 * both flow through one resolver, so every phone at the table converges on the
 * same state without merging fragments — each message is a whole snapshot.
 *
 * Falls back to polling when the channel cannot connect, and when there is no
 * publishable key configured at all. Live updates are a nicety; the game still
 * works without them.
 *
 * Verified: broadcasts arrive within ~3s of a tap made directly in the database
 * (score and tiles matched exactly), a Node client with the same publishable key
 * subscribes to the private topic and receives one message per action, and the
 * finishing broadcast lands despite its version resetting to 0.
 *
 * NOT verified: the polling fallback. An earlier attempt to test it concluded it
 * was broken, but that conclusion came from reading the wrong page — the Browser
 * pane was silently failing to navigate, so the Today card was being measured
 * while the game page was assumed. Treat the fallback as untested rather than
 * broken, and test it by confirming location.pathname first.
 */
export function useLiveGame(gameId: string, initial: LiveSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [connection, setConnection] = useState<Connection>("polling");

  /**
   * Adopts a snapshot if it is newer than the one on screen.
   *
   * [concept: version, except when it resets] Every change to the live board
   * bumps a version, so a late or duplicated broadcast can be dropped. But
   * finishing a game DELETES the board, and a game with no board reports
   * version 0 — so the most important message of all arrives looking oldest. A
   * change of status is therefore always adopted.
   *
   * Written with the functional form of setState so it can compare against the
   * live value without a ref, which keeps the callback stable for the effect
   * below.
   */
  const resolve = useCallback(
    (now: LiveSnapshot, next: LiveSnapshot): LiveSnapshot => {
      const statusChanged = next.game.status !== now.game.status;
      if (!statusChanged && next.version < now.version) return now;
      return next;
    },
    [],
  );

  const apply = useCallback(
    (next: LiveSnapshot) => setSnapshot((now) => resolve(now, next)),
    [resolve],
  );

  // A fresh server render (after router.refresh()) arrives as a new `initial`.
  // Adjusting state during render is the supported way to react to a changed
  // prop — doing it in an effect renders once with the stale value first, and
  // is what the set-state-in-effect rule is warning about.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    // Still resolved rather than adopted outright: a broadcast may already
    // have shown us something newer than this render.
    setSnapshot((now) => resolve(now, initial));
  }

  const refetch = useCallback(async () => {
    const res = await fetchLiveSnapshot(gameId);
    if (res.ok) apply(res.snapshot);
    return res.ok;
  }, [gameId, apply]);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => {
        void refetch().then((ok) => {
          if (cancelled) return;
          // A poll that cannot reach the server means the board on screen is
          // stale, and "catching up" would be a lie.
          setConnection(ok ? "polling" : "offline");
        });
      }, POLL_MS);
    };
    const stopPolling = () => {
      if (!poll) return;
      clearInterval(poll);
      poll = null;
    };

    if (!supabase) {
      // No key configured: polling is the only option.
      startPolling();
      return () => stopPolling();
    }

    // [concept: authorize before joining] setAuth() MUST complete before the
    // channel joins. A private channel is authorized at join time by the RLS
    // policy on realtime.messages, so joining first and setting the token
    // afterwards loses the race — and supabase-js then retries quietly,
    // reporting no status at all, so nothing notices. That is exactly what made
    // this work intermittently: a bare `void setAuth()` sometimes resolved
    // before the join went out and sometimes did not. Isolated by pointing a
    // plain Node client with the same key at the same topic, which subscribed
    // first time because it awaited setAuth.
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channel = supabase
        .channel(`game:${gameId}`, { config: { private: true } })
        .on("broadcast", { event: "state" }, (message) => {
          if (cancelled) return;
          try {
            apply(parseSnapshot(message.payload));
          } catch {
            // A payload we cannot read is not worth tearing the board down
            // for; the next refetch will put us right.
          }
        })
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setConnection("live");
            stopPolling();
            // Close the gap between the server render and this subscription:
            // a tap in that window would otherwise be missed.
            void refetch();
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setConnection("polling");
            startPolling();
            return;
          }
          if (status === "CLOSED") {
            setConnection("offline");
            startPolling();
          }
        });
    })();

    // Phones suspend background tabs, so anything missed while away is picked
    // up on return rather than waiting for the next broadcast.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisible);
      // May still be null if the effect is torn down while setAuth is in
      // flight, which is common in development's double-invoked effects.
      if (channel) void supabase.removeChannel(channel);
    };
  }, [gameId, apply, refetch]);

  return { snapshot, connection, apply, refetch };
}
