# 30 Days of RPG Adventures: Spear of Destiny Jam 2026

This is my entry for the [30 Days of RPG Adventures: Spear of Destiny Jam](https://itch.io/jam/30-days-of-rpg-adventures-1).

Started: Sunday 28th June 2026
Finished: Sunday 12th July 2026

I built the game to learn how to put an [ECS engine](https://github.com/phughesmcr/Miski) I'd built through its paces, and the DX of building a game in the browser. The assets are mostly AI-generated, unless otherwise noted below.

The game uses Deno to run the game. You can make changes to maps in Tiled, then run `deno task maps:compile` to compile them into a format the game can use.
Run the game with `deno task build && deno task start` for production, or `deno task dev` for development.

## Gameplay and Controls

**Gameplay** 

Travel through "The Background World" using uplink terminals to travel to different locations in search of the Spear of Destiny. You'll need to find the uplink code on each level to progress, before reaching the Mainframe Core, the Spear's ultimate destination.

Turn-based combat with d20 rolls for damage. Grid-based movement - player takes a turn, then all enemies take a turn.

**ALL ACTIONS OTHER THAN TURNING (rotating the player) COST 1 TURN** - meaning enemies will act after you do them.

**Controls**

The game is intended for mobile devices, but it's playable on desktop browsers. The controls are simple:

| Action | Mobile | Desktop |
|--------|--------|---------|
| Move forward | Swipe up | W |
| Move backward | Swipe down | S |
| Strafe left | Swipe left | A |
| Strafe right | Swipe right | D |
| Turn left | Tap left | Q |
| Turn right | Tap right | E |
| Action Menu | Tap | Period |
| Quick Action | Double Tap | Comma |
| Wait (skip turn) | (from action menu) | Space |
| Map | (from action menu) | Tab |
| Weapon 1 | (from action menu) | 1 |
| Weapon 2 | (from action menu) | 2 |
| Weapon 3 | (from action menu) | 3 |
| Pause | (from action menu) | P |
| Menu | (from action menu) | Escape |

Quick Actions is usually attack, but will open doors, use items, etc. when facing them.

## What I Learned

- Start with the end in mind. Not "here's all the cool things we can do", but "here's the cool thing we're going to do".
- Don't spend 3.5 weeks of a 4 week jam building and rebuilding an engine without a game.
- Audio completely changes the feel of a game and immediately makes it feel more alive - start this earlier.
- Asset loading isn't an afterthought just because the browser can handle it - the whole thing needs ripping out.
- Make the first level last. John Romero's advice - take it.
- The asset packs you start with quickly sets the tone of the game - change it quickly if it's not working.
- Keep it simple. In a tile-based game, the world can be represented blocking (1) or non-blocking (0) tiles alone, everything else is decoration. Also - verb menus don't belong in shooters.

## Acknowledgements

**Gameplay Inspiration:**

- [Doom RPG](https://en.wikipedia.org/wiki/Doom_RPG)
- [Normality](https://en.wikipedia.org/wiki/Normality_(video_game))

N.B. I found out there is another game called "Ghost Process" too late in the jam - this game is completely unrelated, I'll probably change the name after submission to the jam.

**Code Inspiration:**

- [Meth-Meth-Method's Super Mario](https://github.com/meth-meth-method/super-mario/)
- [id Software's browser port of Wolfenstein 3D](https://github.com/id-Software/wolf3d-browser)
- [StackOverflow answer on how to implement a PRNG](https://stackoverflow.com/a/47593316)

**Art Assets:**

- [Aquilarius' Retro Textures (CC0)](https://aquilarius.itch.io/aquilariusrt)
- Sprites/HUD and titlescreens generated with GPT Image 2

**Sound Assets:**

- [RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack)
- [www.kenney.nl - 50 RPG Sound Effects](https://opengameart.org/content/50-rpg-sound-effects)
- [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) (rubberduck, CC0)
- [60 CC0 Sci-Fi SFX](https://opengameart.org/content/60-cc0-sci-fi-sfx) (rubberduck, CC0)
- [Sci-Fi Weapon Shots SFX](https://lentikula.itch.io/sci-fi-weapon-shots-sfx-freecc0) (Lentikula, CC0)
- Music generated with Suno 5 and 5.5

**Tools:**

- [Tiled](https://www.mapeditor.org/)
- [Pixelorama](https://pixelorama.org/)