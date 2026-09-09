import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Player } from "@/lib/types";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));
vi.mock("@/app/(shell)/players/actions", () => ({
  setSongClip: vi.fn(),
  uploadSongClip: vi.fn(),
  clearSongClip: vi.fn(),
}));

import {
  clearSongClip,
  setSongClip,
  uploadSongClip,
} from "@/app/(shell)/players/actions";
import { SongClipEditor } from "./song-clip-editor";

const ALICE: Player = {
  id: "66841dfa-eeab-4e8f-9ef0-8ffb4e14c84c",
  name: "Alice",
  emoji: "🦊",
  song_url: "https://youtu.be/dQw4w9WgXcQ",
  song_start_seconds: 90,
  song_end_seconds: 120,
  song_fade_ms: 1500,
  song_loop: false,
  song_clip_path: null,
  is_active: true,
  created_at: "2026-08-01T00:00:00Z",
};

beforeEach(() => {
  vi.mocked(setSongClip).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(uploadSongClip).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(clearSongClip).mockReset().mockResolvedValue({ ok: true });
  refreshMock.mockReset();
});

describe("SongClipEditor", () => {
  it("shows the clip as people think of it, in minutes and seconds", () => {
    render(<SongClipEditor player={ALICE} />);
    expect(screen.getByLabelText("Start")).toHaveValue("1:30");
    expect(screen.getByLabelText("End")).toHaveValue("2:00");
  });

  it("saves the clip in seconds, with fade and repeat", async () => {
    const user = userEvent.setup();
    render(<SongClipEditor player={ALICE} />);
    await user.clear(screen.getByLabelText("Start"));
    await user.type(screen.getByLabelText("Start"), "0:45");
    await user.clear(screen.getByLabelText("End"));
    await user.type(screen.getByLabelText("End"), "1:15");
    await user.click(screen.getByLabelText("Repeat"));
    await user.click(screen.getByRole("button", { name: /save clip/i }));

    await waitFor(() => expect(setSongClip).toHaveBeenCalledTimes(1));
    expect(setSongClip).toHaveBeenCalledWith(ALICE.id, {
      startSeconds: 45,
      endSeconds: 75,
      fadeMs: 1500,
      loop: true,
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("treats an empty end as 'to the end of the song'", async () => {
    const user = userEvent.setup();
    render(<SongClipEditor player={ALICE} />);
    await user.clear(screen.getByLabelText("End"));
    await user.click(screen.getByRole("button", { name: /save clip/i }));
    await waitFor(() => expect(setSongClip).toHaveBeenCalledTimes(1));
    expect(vi.mocked(setSongClip).mock.calls[0]![1].endSeconds).toBeNull();
  });

  it("refuses a time it cannot read instead of saving zero", async () => {
    const user = userEvent.setup();
    render(<SongClipEditor player={ALICE} />);
    await user.clear(screen.getByLabelText("Start"));
    await user.type(screen.getByLabelText("Start"), "1:75");
    await user.click(screen.getByRole("button", { name: /save clip/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/start/i);
    expect(setSongClip).not.toHaveBeenCalled();
  });

  it("refuses an end before the start", async () => {
    const user = userEvent.setup();
    render(<SongClipEditor player={ALICE} />);
    await user.clear(screen.getByLabelText("End"));
    await user.type(screen.getByLabelText("End"), "1:00");
    await user.click(screen.getByRole("button", { name: /save clip/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/after the start/i);
    expect(setSongClip).not.toHaveBeenCalled();
  });

  it("uploads a chosen file as the clip", async () => {
    const user = userEvent.setup();
    render(<SongClipEditor player={ALICE} />);
    const file = new File([new Uint8Array(10)], "anthem.mp3", { type: "audio/mpeg" });
    await user.upload(screen.getByLabelText(/upload an mp3/i), file);

    await waitFor(() => expect(uploadSongClip).toHaveBeenCalledTimes(1));
    const [id, fd] = vi.mocked(uploadSongClip).mock.calls[0]!;
    expect(id).toBe(ALICE.id);
    expect((fd as FormData).get("clip")).toBe(file);
  });

  it("says when a file is in use and can drop it back to the URL", async () => {
    const user = userEvent.setup();
    render(
      <SongClipEditor
        player={{ ...ALICE, song_clip_path: `${ALICE.id}.mp3` }}
      />,
    );
    expect(screen.getByText(/own clip/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /use the youtube link instead/i }));
    await waitFor(() => expect(clearSongClip).toHaveBeenCalledWith(ALICE.id));
  });

  it("shows the server's refusal", async () => {
    vi.mocked(setSongClip).mockResolvedValueOnce({ ok: false, error: "Not signed in" });
    const user = userEvent.setup();
    render(<SongClipEditor player={ALICE} />);
    await user.click(screen.getByRole("button", { name: /save clip/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not signed in");
  });
});
