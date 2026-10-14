/**
 * The welcome email of the "deltagartillstånd" flow links a new colleague to
 * `/players?add&name=…&emoji=…`, so they only have to press "Add player".
 * Only a starting value for the form: createPlayer still validates whatever is
 * submitted, and React escapes it on the way into the input.
 */
type Param = string | string[] | undefined;

const MAX_NAME = 60;
const MAX_EMOJI = 16;

function first(value: Param, max: number): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, max);
}

export function readPlayerPrefill(params: Record<string, Param>) {
  return {
    name: first(params.name, MAX_NAME),
    emoji: first(params.emoji, MAX_EMOJI),
  };
}
