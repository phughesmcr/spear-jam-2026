import { MUSIC_TRACKS, musicTrackForMap, TrackId } from "@/src/game/content/audio/music.ts";
import { assertEquals } from "@std/assert";

Deno.test("music catalog assigns the supplied MP3 tracks to the title, intro, and campaign maps", () => {
  assertEquals(MUSIC_TRACKS[TrackId.Title].src.endsWith("/assets/game/music/titlescreen.mp3"), true);
  assertEquals(MUSIC_TRACKS[TrackId.Intro].src.endsWith("/assets/game/music/intro.mp3"), true);
  assertEquals(musicTrackForMap("Boot Sector"), TrackId.Map1);
  assertEquals(musicTrackForMap("Data Conduit"), TrackId.Map2);
  assertEquals(musicTrackForMap("Firewall"), TrackId.Map3);
  assertEquals(musicTrackForMap("The Nexus"), TrackId.Map4);
  assertEquals(musicTrackForMap("Mainframe Core"), TrackId.Map5);

  for (const track of Object.values(MUSIC_TRACKS)) {
    assertEquals(track.src.endsWith(".mp3"), true);
    assertEquals(track.loop, true);
  }
});
