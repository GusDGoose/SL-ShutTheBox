"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTournamentSnapshot } from "@/app/(public)/t/actions";
import {
  parseTournamentSnapshot,
  type TournamentSnapshot,
} from "@/lib/tournament";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Connection } from "@/lib/use-live-game";

const POLL_MS = 5000;

/**
 * Keeps a team-play event in step with the database.
 *
 * Deliberately a near-copy of useLiveGame rather than a shared abstraction: this
 * was written two days before the team day it exists for, and unifying the two
 * would have put the daily game — which the office plays every lunchtime — at
 * risk for the sake of tidiness. Unify them afterwards; the differences are
 * small and listed here:
 *
 *   * the topic is `tournament:<id>`, not `game:<id>`;
 *   * the version resolver needs no escape hatch. The daily board's version
 *     lives on a row that finishing DELETES, so its most important message
 *     arrives looking oldest; this counter lives on the event row, which
 *     survives to the end, so newer really does mean newer;
 *   * a deleted event is a real state. The poll can come back saying the event
 *     is gone, which is not the same as being offline and must not be shown as
 *     one — somebody cleaning up a rehearsal is a thing that happens.
 */
export function useLiveTournament(code: string, initial: TournamentSnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [connection, setConnection] = useState<Connection>("polling");
  const [gone, setGone] = useState(false);

  const resolve = useCallback(
    (now: TournamentSnapshot, next: TournamentSnapshot): TournamentSnapshot => {
      // A change of status is always adopted: crowning is the one message
      // nobody may miss, and it is what flips every screen to the result.
      const statusChanged = next.tournament.status !== now.tournament.status;
      if (!statusChanged && next.tournament.version < now.tournament.version) {
        return now;
      }
      return next;
    },
    [],
  );

  const apply = useCallback(
    (next: TournamentSnapshot) =>
      setSnapshot((now) => resolve(now, next)),
    [resolve],
  );

  // A fresh server render (after router.refresh()) arrives as a new `initial`.
  // Adjusting state during render is the supported way to react to a changed
  // prop; an effect would render once with the stale value first.
  //
  // Compared by VERSION rather than by object identity, unlike useLiveGame. An
  // identity check silently requires every caller to hold the prop stable, and
  // one that builds the snapshot inline gets "Too many re-renders" — a blank
  // screen, in front of a room, from a change that looked harmless. Two renders
  // of the same version have nothing to adopt anyway.
  const initialKey = `${initial.tournament.version}:${initial.tournament.status}`;
  const [seenKey, setSeenKey] = useState(initialKey);
  if (initialKey !== seenKey) {
    setSeenKey(initialKey);
    setSnapshot((now) => resolve(now, initial));
  }

  const refetch = useCallback(async () => {
    const res = await fetchTournamentSnapshot(code);
    if (res.ok) {
      apply(res.snapshot);
      return true;
    }
    if (res.gone) setGone(true);
    return false;
  }, [code, apply]);

  const tournamentId = snapshot.tournament.id;
  const finished = snapshot.tournament.status === "finished";

  useEffect(() => {
    // Nothing changes after the crown except deletion, which a reload will
    // notice. Fifty phones parked on the result page polling a static value
    // every five seconds is the one waste here worth three lines.
    if (finished) return;

    const supabase = supabaseBrowser();
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => {
        void refetch().then((ok) => {
          if (cancelled) return;
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
      startPolling();
      return () => stopPolling();
    }

    // [concept: authorize before joining] setAuth() MUST complete before the
    // channel joins — a private channel is authorized at join time by the RLS
    // policy on realtime.messages, and joining first loses that race silently.
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channel = supabase
        .channel(`tournament:${tournamentId}`, { config: { private: true } })
        .on("broadcast", { event: "state" }, (message) => {
          if (cancelled) return;
          try {
            apply(parseTournamentSnapshot(message.payload));
          } catch {
            // A payload we cannot read is not worth tearing the lobby down
            // for; the next refetch will put us right.
          }
        })
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setConnection("live");
            stopPolling();
            // Close the gap between the server render and this subscription.
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

    // Phones suspend background tabs, and a team's phone spends most of the
    // event in somebody's pocket.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tournamentId, finished, apply, refetch]);

  return { snapshot, connection, gone, apply, refetch };
}
