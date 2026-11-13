# Fab Fours Design System (reverse-engineered from the NYT Connections archive)

Source: the full public answer archive, puzzles #1 to #1,245 (2023-06-12 to 2026-11-12), 4,980 groups. 831 puzzles carry color tags; the color stats below use those. Group types were classified by regex on the group titles, so the shares are approximate (about ±5 points), but the ranking is solid.

## 1. The four tiers are four different KINDS of thinking, not four amounts of difficulty

| Tier | What it really tests | Archive share of that tier | NYT title shape |
|---|---|---|---|
| Yellow | Plain membership or synonyms. You see it in two seconds. | Synonym sets ~35%, plain category members ~55% | CURSES · METAL ELEMENTS · MUSIC GENRES |
| Green | A category one notch more specific or a looser synonym set | Members ~58%, synonyms ~28% | DANCE FADS · TONY WINNERS FOR BEST MUSICAL |
| Blue | Specialist knowledge: trivia, jargon, a named body of work | Members ~67%, "things with / parts of" ~9% | DRUM SET COMPONENTS · MARIAH CAREY NUMBER ONE HITS |
| Purple | The tile is NOT used as its meaning. Wordplay on the word itself. | Fill-in-the-blank ~37% · letter/sound tricks ~13% · starts/ends with ~8% · knowledge twist ~32% | ___STICKS · MUSIC GENRES PLUS A LETTER |

Purple breakdown (831 tagged purples):
- `___ X` compound (word comes before): ~21% (CHOP / DRUM / FIDDLE / FISH → ___STICKS)
- `X ___` compound (word comes after): ~15% (ROCK ___ → BOTTOM / LOBSTER / MUSIC / SALT)
- Starts or ends with a hidden word: ~8% (BELLHOP, CHIMERA, DRUMROLL, RATTLESNAKE → starting with percussion)
- Homophones: ~5% (ANIMAL HOMOPHONES, INSTRUMENT HOMOPHONES)
- Plus or minus a letter: ~5% (BLUEST, POPE, ROCKY, SKAT → music genres plus a letter)
- Anagrams, backwards, palindromes: ~1% (rare; NYT uses them sparingly because they feel like cheating)
- Knowledge with a twist: the rest (MEMBER OF A CLASSIC BACKING BAND → BANSHEE, HEARTBREAKER, PIP, WAILER)

## 2. The red-herring engine: polysemous short words

The most-reused tiles in 1,245 puzzles are BALL (30), RING (26), FLY (23), BAR (22), CHECK (22), LEAD (20), BLUE (19), JACK (19), KING (18), HOOK (18), TAP (16). Every one is a short word with 3+ meanings. That is the whole trick: one tile, several plausible homes, one true home. Only 5% of tiles are multi-word, because a phrase has one meaning and kills the misdirection.

Music is unusually rich in these words, which is why a music-only Fab Fours can be as good as NYT:

KEY · NOTE · BAR · REST · SCALE · PITCH · TIE · FLAT · SHARP · NATURAL · STAFF · MEASURE · BASS · TREBLE · ROCK · POP · METAL · SOUL · FUNK · HOOK · TRACK · RECORD · BAND · BRIDGE · CHORUS · BEAT · TAP · PICK · SLIDE · BOW · REED · HORN · DRUM · CYMBAL · HIT · SINGLE · COVER · RANGE · TONE · MODE · CHORD · RIFF · JAM · GIG · SET · STAGE · ACT · STRING · PEDAL · HAMMER · CAPO · STRUM · PLUCK · CLEF · REPEAT · CODA · FINE · TURN · TRILL · MORDENT

Design rule: every puzzle needs at least 3 tiles that honestly look like they fit 2 groups, and 1 "category of 5" (five tiles that all fit a yellow or green title, so the solver must find which one belongs elsewhere). NYT's editor puts it plainly: more overlap makes a harder puzzle (IEEE Spectrum).

## 3. NYT already runs music groups: proven templates to steal the SHAPE of (never the content)

From the archive, music groups NYT has actually shipped, by tier:

- Yellow/green: MUSIC THEORY CONCEPTS (KEY, PITCH, SCALE, TONE) · KINDS OF INSTRUMENTS · PARTS OF A PIANO (HAMMER, KEY, PEDAL, STRING) · GUITAR EFFECTS PEDALS · DANCE STYLES · MUSIC PLAYER BUTTONS · MUSICAL PERFORMANCE (CONCERT, GIG, SET, SHOW)
- Blue: PROG BANDS · '80S SYNTH-POP BANDS · RIHANNA #1 HITS · MUSIC PUBLICATIONS · SLANG FOR MUSICAL INSTRUMENTS (AXE, BONE, KEYS, SKINS) · THINGS A BEGINNER LEARNS ON PIANO (CHOPSTICKS, FÜR ELISE, HEART AND SOUL, THE ENTERTAINER) · FIRST NAMES OF COUNTRY LEGENDS (DOLLY, JOHNNY, PATSY, WILLIE)
- Purple: MUSIC GENRES PLUS A LETTER · MUSICAL INSTRUMENTS PLUS STARTING LETTER (GLUTE, MORGAN, SHARP, THORN) · ANAGRAMS OF MUSICAL INSTRUMENTS (ABUT, BULGE, GROAN, VOILA) · ENDING IN MUSIC GENRES (BABY BLUES, PET ROCK, SCRAP METAL, SODA POP) · MUSICAL ARTISTS MINUS STARTING NUMBERS (6 MAFIA, CHAINZ, DIRECTION, NON BLONDES) · ___ GUITAR (AIR, ELECTRIC, RHYTHM, SLIDE) · "___ MAN" SONGS FROM THE '70S (IRON, MACHO, PIANO, ROCKET) · MEMBER OF A CLASSIC BACKING BAND

## 4. The twelve Fab Fours angles (music-only, every tier covered)

| # | Angle | Tier | Example shape |
|---|---|---|---|
| 1 | Term-family | Yellow | Dynamics: PIANO, FORTE, MEZZO, SFORZANDO |
| 2 | Hardware | Yellow/Green | Parts of a guitar · Drum kit pieces · Parts of a piano |
| 3 | Genre/scene | Green | Motown acts · Grunge bands · Bebop players |
| 4 | Single-artist catalog | Blue | Beatles albums · Stevie Wonder #1s · Phish songs |
| 5 | Slang and jargon | Blue | Gig slang: AXE, CHART, CANS, WOODSHED |
| 6 | Theory spelled | Blue | Notes in Cmaj7: C, E, G, B · Bø7 chord tones: B, D, F, A · Modes of C major |
| 7 | History/numbers | Blue | Woodstock '69 acts · First Grammy winners · Baroque composers |
| 8 | `___ X` compound | Purple | ___ NOTE: GRACE, BLUE, LOVE, FOOT |
| 9 | `X ___` compound | Purple | ROCK ___: CANDY, GARDEN, SLIDE, STAR |
| 10 | Hidden music word | Purple | Starting with rhythm words: HALFWAY, WHOLESALE, QUARTERBACK, BEATNIK |
| 11 | Plus/minus a letter | Purple | Genres plus a letter: BLUEST, POPE, ROCKY, SKAT (NYT used this exact one: write our own) |
| 12 | Music homophone | Purple | Instrument homophones: SYMBOL (cymbal), BASE (bass), LIAR (lyre), LOOT (lute) |

## 5. Build checklist per puzzle (what NYT does, applied)

1. Pick the purple first. It is the hook; build the other three around tiles that steal from it.
2. Every tier is a different angle (never two "members of a list" groups at the same depth).
3. At least 3 tiles honestly fit 2 titles; at least 1 decoy set of 5.
4. Single words first. Phrases only when the phrase IS the trick (ENDING IN MUSIC GENRES).
5. Every tile verifiable. Theory follows the studio rules (parent-key numerals, ø7 vs °7, mode/parent pairs). Pop facts are web-checked.
6. Titles are short and literal, ALL CAPS, in NYT's terse voice: ___STICKS, not "Things that go before stick".
7. Family friendly, ages 7 to adult. Span the eras: at least one pre-1980 and one post-2010 reference per puzzle.
8. Never copy an NYT group. Steal the shape, write new content.

## Sources

- NYT Connections answer archive (community-maintained): https://github.com/Eyefyre/NYT-Connections-Answers
- IEEE Spectrum on Connections design ("more overlap makes a harder puzzle", decoys): https://spectrum.ieee.org/connections-puzzle
- Interview with Wyna Liu, the Connections editor: https://mleddy.blogspot.com/2024/11/an-interview-with-wyna-liu.html
- Hugging Face Connections dataset: https://huggingface.co/datasets/eric27n/NYT-Connections
