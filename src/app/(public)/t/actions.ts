"use server";

import { revalidatePath } from "next/cache";
import { requireSession, SessionError } from "@/lib/auth";
import { describeDbErrorVerbatim } from "@/lib/db-errors";
import { rpc, type RpcArgs, type RpcName } from "@/lib/db-rows";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizeCode } from "@/lib/tournament-code";
import { readTournament } from "@/lib/tournament-server";
import {
  createdTeamId,
  parseTournamentSnapshot,
  type TournamentSnapshot,
} from "@/lib/tournament";
import { extractVideoId } from "@/lib/youtube";
import type { ActionResult } from "@/app/(focus)/game/actions";

/**
 * Every write team play makes.
 *
 * [concept: the code is the credential] These actions are reachable WITHOUT the
 * team PIN — /t/* is exempt from both gates in src/proxy.ts, because guests at
 * a team day cannot be handed the office passcode. What stands in for it is the
 * six-character join code, checked on every call by the database.
 *
 * So the split is: anything a guest does takes a code, anything that belongs to
 * the organiser (creating an event, crowning it, deleting it) takes a session
 * as well and is audited against a real player.
 */

const BAD_CODE = "That code does not look right. Check the link and try again.";

async function withSession<T = object>(
  run: (actorId: string) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    const { player } = await requireSession();
    return await run(player.id);
  } catch (e) {
    if (e instanceof SessionError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Normalises the code before it reaches the database, so a link typed in lower
 * case works and a string that could never be a code never costs a round trip.
 */
async function withCode<T = object>(
  code: string,
  run: (code: string) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const normalised = normalizeCode(code);
  if (!normalised) return { ok: false, error: BAD_CODE };
  return run(normalised);
}

export type TournamentResult = ActionResult<{ snapshot: TournamentSnapshot }>;

/**
 * Calls a team-play RPC. The database's own refusals are written for somebody
 * standing in a room with a phone — "add at least one player first" — so they
 * are shown as written rather than mapped to the daily game's board copy.
 */
async function callRpc<K extends RpcName>(
  fn: K,
  args: { [P in keyof RpcArgs<K>]: RpcArgs<K>[P] | null },
): Promise<ActionResult<{ data: unknown }>> {
  const { data, error } = await rpc(supabaseAdmin(), fn, args);
  if (error) return { ok: false, error: describeDbErrorVerbatim(error) };
  return { ok: true, data };
}

/** The common case: an RPC whose whole answer is the snapshot. */
async function rpcTournament<K extends RpcName>(
  fn: K,
  args: { [P in keyof RpcArgs<K>]: RpcArgs<K>[P] | null },
): Promise<TournamentResult> {
  const res = await callRpc(fn, args);
  if (!res.ok) return res;
  return { ok: true, snapshot: parseTournamentSnapshot(res.data) };
}

/**
 * A song is optional, but a link that is not YouTube would be accepted by the
 * database (which only checks the shape) and then silently fail to play at the
 * moment the team wins. Refuse it while somebody is still looking at the form.
 */
function songUrlOrError(
  songUrl: string | null | undefined,
): { song: string | null } | { error: string } {
  const trimmed = (songUrl ?? "").trim();
  if (!trimmed) return { song: null };
  if (!extractVideoId(trimmed)) {
    return {
      error:
        "That does not look like a YouTube link. Paste the address from the video's share button.",
    };
  }
  return { song: trimmed };
}

// ---------------------------------------------------------------------------
// The organiser
// ---------------------------------------------------------------------------

export async function createTournament(
  name: string,
): Promise<ActionResult<{ code: string }>> {
  return withSession<{ code: string }>(async (actorId) => {
    const res = await callRpc("create_tournament", { p_actor: actorId, p_name: name });
    if (!res.ok) return res;
    return { ok: true, code: parseTournamentSnapshot(res.data).tournament.code };
  });
}

export async function finishTournament(code: string): Promise<TournamentResult> {
  return withSession((actorId) =>
    withCode(code, async (c) => {
      const res = await rpcTournament("finish_tournament", {
        p_actor: actorId,
        p_code: c,
      });
      if (res.ok) revalidatePath(`/t/${c}`);
      return res;
    }),
  );
}

export async function deleteTournament(code: string): Promise<ActionResult> {
  return withSession((actorId) =>
    withCode(code, async (c) => {
      const res = await callRpc("delete_tournament", { p_actor: actorId, p_code: c });
      if (!res.ok) return res;
      revalidatePath(`/t/${c}`);
      return { ok: true };
    }),
  );
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function createTeam(
  code: string,
  team: { name: string; emoji: string; songUrl: string | null },
): Promise<ActionResult<{ snapshot: TournamentSnapshot; teamId: string | null }>> {
  const song = songUrlOrError(team.songUrl);
  if ("error" in song) return { ok: false, error: song.error };

  // The one RPC whose answer is more than the snapshot: the new team's id rides
  // along, so the phone that made it can go straight to its board.
  return withCode<{ snapshot: TournamentSnapshot; teamId: string | null }>(
    code,
    async (c) => {
      const res = await callRpc("tournament_create_team", {
        p_code: c,
        p_name: team.name,
        p_emoji: team.emoji,
        p_song_url: song.song,
      });
      if (!res.ok) return res;
      return {
        ok: true,
        snapshot: parseTournamentSnapshot(res.data),
        teamId: createdTeamId(res.data),
      };
    },
  );
}

export async function updateTeam(
  code: string,
  teamId: string,
  team: { name: string; emoji: string; songUrl: string | null },
): Promise<TournamentResult> {
  const song = songUrlOrError(team.songUrl);
  if ("error" in song) return { ok: false, error: song.error };

  return withCode(code, (c) =>
    rpcTournament("tournament_update_team", {
      p_code: c,
      p_team_id: teamId,
      p_name: team.name,
      p_emoji: team.emoji,
      p_song_url: song.song,
    }),
  );
}

export async function deleteTeam(code: string, teamId: string): Promise<TournamentResult> {
  return withCode(code, (c) =>
    rpcTournament("tournament_delete_team", { p_code: c, p_team_id: teamId }),
  );
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function addMember(
  code: string,
  teamId: string,
  name: string,
): Promise<TournamentResult> {
  return withCode(code, (c) =>
    rpcTournament("tournament_add_member", { p_code: c, p_team_id: teamId, p_name: name }),
  );
}

export async function removeMember(
  code: string,
  teamId: string,
  memberId: string,
): Promise<TournamentResult> {
  return withCode(code, (c) =>
    rpcTournament("tournament_remove_member", {
      p_code: c,
      p_team_id: teamId,
      p_member_id: memberId,
    }),
  );
}

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

export async function startTeam(code: string, teamId: string): Promise<TournamentResult> {
  return withCode(code, (c) =>
    rpcTournament("tournament_start_team", { p_code: c, p_team_id: teamId }),
  );
}

/**
 * The whole set of tiles currently down, not a single toggle — idempotent, so a
 * retry or two taps racing each other cannot leave a board nobody chose.
 */
export async function setTeamBoard(
  code: string,
  teamId: string,
  tilesDown: number[],
): Promise<TournamentResult> {
  return withCode(code, (c) =>
    rpcTournament("tournament_set_board", {
      p_code: c,
      p_team_id: teamId,
      p_tiles_down: tilesDown,
    }),
  );
}

/** Ends the member at the board. Omit the score to have it read off the board. */
export async function endTeamTurn(
  code: string,
  teamId: string,
  typedScore?: number | null,
): Promise<TournamentResult> {
  return withCode(code, (c) =>
    rpcTournament("tournament_end_turn", {
      p_code: c,
      p_team_id: teamId,
      p_typed_score: typedScore ?? null,
    }),
  );
}

export async function correctMember(
  code: string,
  teamId: string,
  memberId: string,
  score: number,
): Promise<TournamentResult> {
  return withCode(code, (c) =>
    rpcTournament("tournament_correct_member", {
      p_code: c,
      p_team_id: teamId,
      p_member_id: memberId,
      p_score: score,
    }),
  );
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Re-reads the event: closes the gap between the server render and the Realtime
 * subscription, and is the polling fallback when the channel cannot connect.
 *
 * Deliberately behind NO gate. The daily game's twin needs the PIN; this one
 * cannot, because the guests it serves have never entered one. `gone` tells the
 * caller the event was deleted, which is a different thing from being offline
 * and should not be reported as one.
 */
export async function fetchTournamentSnapshot(
  code: string,
): Promise<TournamentResult & { gone?: true }> {
  const normalised = normalizeCode(code);
  if (!normalised) return { ok: false, error: BAD_CODE, gone: true };

  const snapshot = await readTournament(normalised);
  if (!snapshot) return { ok: false, error: "This team play was deleted.", gone: true };
  return { ok: true, snapshot };
}
