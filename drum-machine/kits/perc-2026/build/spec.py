import os
S=os.environ.get('PERC_SRC','./src')  # folder holding vcsl/, world-percussion/ and fs/ (see manifest sources)
V=S+'/vcsl/Idiophones/Struck Idiophones/'; M=S+'/vcsl/Membranophones/Struck Membranophones/'; F=S+'/world-percussion/samples/'; FS=S+'/fs/'
VC='VCSL (Versilian Studios, CC0)'; FP='FreePats World Percussion (CC0)'
import numpy as np
INST={}
# ---------------- shakers ----------------
INST['shaker']=dict(name='Egg shaker',gm=[82],source=FP,main='fwd',
 note='continuous 8th/16th playing: alternate fwd and back, never repeat a file twice in a row; direction of each take was assigned by measured sharpness (snappier half = fwd), the library does not label it',
 arts=dict(
  fwd=dict(anchor='peak',layers=[[F+'EggShaker/soft_0[235]*',F+'EggShaker/soft_13*'],[F+'EggShaker/slow_0[2679]*']],role='forward (strong) stroke',max_len=0.3,tail_db=-45),
  back=dict(anchor='peak',layers=[[F+'EggShaker/soft_0[68]*',F+'EggShaker/soft_1[02]*'],[F+'EggShaker/slow_0[38]*',F+'EggShaker/slow_1[01]*']],role='back (weak) stroke',max_len=0.3,tail_db=-45),
  accent=dict(anchor='peak',files=[F+'EggShaker/fast_0[3-9]*',F+'EggShaker/fast_1*'],n_layers=2,rr=4,role='accented forward stroke',max_len=0.35,tail_db=-45)))
INST['shakersm']=dict(name='Small shaker (stereo)',gm=[82],source=VC,main='fwd',
 note='source labels: fwd = "Up" strokes (the snappy, louder direction on this shaker), back = "Down" strokes, accent = "Slap"',
 arts=dict(
  fwd=dict(anchor='peak',files=[V+'Shaker, Small/Mid_Shaker*Faster_Up_*'],rr=4,role='forward (strong) stroke',max_len=0.3,tail_db=-40),
  back=dict(anchor='peak',files=[V+'Shaker, Small/Mid_Shaker*Faster_Down_*'],rr=4,role='back (weak) stroke',max_len=0.3,tail_db=-40),
  accent=dict(anchor='peak',files=[V+'Shaker, Small/Mid_Shaker_Slap_*'],rr=2,role='accent (slap against the palm)',max_len=0.5,tail_db=-40)))
INST['shakerlg']=dict(name='Large shaker (ganzá-size, stereo)',gm=[82],source=VC,main='fwd',
 note='low, grainy tube shaker; use as the ganzá/caxixi voice in samba and baião',
 arts=dict(
  fwd=dict(anchor='peak',files=[V+'Shaker, Large/LShaker_Shake1D_*'],rr=2,role='forward (strong) stroke',max_len=0.55,tail_db=-36,max_lead=80),
  back=dict(anchor='peak',files=[V+'Shaker, Large/LShaker_Shake1U_*'],rr=2,role='back (weak) stroke',max_len=0.55,tail_db=-36,max_lead=110),
  accent=dict(anchor='peak',files=[V+'Shaker, Large/LShaker_Hit_*'],rr=2,role='accent (hit)',max_len=0.45,tail_db=-45)))
INST['maracas']=dict(name='Maracas',gm=[70],source=FP,main='fwd',
 arts=dict(
  fwd=dict(anchor='peak',files=[F+'Maracas/01_*'],n_layers=2,rr=4,role='forward stroke',max_len=0.4,tail_db=-45),
  back=dict(anchor='peak',files=[F+'Maracas/02_*'],n_layers=2,rr=4,role='back stroke',max_len=0.32,tail_db=-45,pick=lambda xs:[t for t in xs if '02_08' not in t[1] and '02_12' not in t[1]])))
INST['cabasa']=dict(name='Cabasa (afuche)',gm=[69],source=VC,main='rub',
 arts=dict(
  rub=dict(anchor='peak',layers=[V+'Cabasa/Cabasa1_Rub_v1_*',V+'Cabasa/Cabasa1_Rub_v2_*'],role='twist of the beads against the palm',max_len=0.5,tail_db=-40),
  hit=dict(anchor='onset',files=[V+'Cabasa/Cabasa1_Hit_*'],rr=2,role='tap of the beads (accent/staccato)',max_len=0.35,tail_db=-50)))
# ---------------- tambourines ----------------
INST['tamb']=dict(name='Tambourine (pop/rock, headless feel)',gm=[54],source=VC+' Tambourine 3 and 5 (Legacy)',main='hit',
 note='shake = the continuous 8th/16th motion (fwd strong, back weak); hit = backbeat strike against the hand',
 arts=dict(
  hit=dict(anchor='onset',files=[V+'Tambourine 5 - Legacy/tamb3_rr*'],n_layers=2,rr=4,max_len=0.36,tail_db=-50),
  shakefwd=dict(anchor='peak',files=[V+'Tambourine 3 - Legacy/tambourine_down_*'],rr=2,role='forward (strong) shake stroke',max_len=0.5,tail_db=-45),
  shakeback=dict(anchor='peak',files=[V+'Tambourine 3 - Legacy/tambourine_up_*'],rr=2,role='back (weak) shake stroke',max_len=0.33,tail_db=-45),
  roll=dict(anchor='onset',files=[V+'Tambourine 5 - Legacy/tamb3_roll.wav'],max_len=1.6,tail_db=-60,role='shake roll; stop it with a 40 ms fade when the next hit lands')))
INST['tamb1']=dict(name='Tambourine 1 (orchestral, with head)',gm=[54],source=VC+' Tambourine 1',main='hit',
 arts=dict(
  hit=dict(anchor='onset',layers=[V+'Tambourine 1/Tamb1_Hit_v1_*',V+'Tambourine 1/Tamb1_Hit_v2_*'],max_len=0.9,tail_db=-50),
  shake=dict(anchor='peak',files=[V+'Tambourine 1/Tamb1_Shake_*'],rr=2,max_len=0.6,tail_db=-40,max_lead=90),
  roll=dict(anchor='onset',layers=[V+'Tambourine 1/Tamb1_Roll_v2_*',V+'Tambourine 1/Tamb1_Roll_v3_*'],max_len=1.6,tail_db=-70,role='thumb/shake roll, 2 dynamics')))
INST['tamb2']=dict(name='Tambourine 2 (bright, with head)',gm=[54],source=VC+' Tambourine 2',main='hit',
 arts=dict(
  hit=dict(anchor='onset',layers=[V+'Tambourine 2/Tamb2_Hit_v1_*',V+'Tambourine 2/Tamb2_Hit_v2_*'],max_len=0.7,tail_db=-50),
  shake=dict(anchor='peak',files=[V+'Tambourine 2/Tamb2_Shake_*'],rr=2,max_len=0.6,tail_db=-40,max_lead=90),
  roll=dict(anchor='onset',layers=[V+'Tambourine 2/Tamb2_Roll_v2_*',V+'Tambourine 2/Tamb2_Roll_v3_*'],max_len=1.6,tail_db=-70)))
INST['tambfp']=dict(name='Tambourine (hand-held, dry)',gm=[54],source=FP,main='hit',
 arts=dict(
  hit=dict(anchor='onset',files=[F+'Tambourine/0*',F+'Tambourine/10*'],n_layers=2,rr=4,max_len=0.6,tail_db=-45),
  jingle=dict(anchor='onset',files=[F+'Tambourine/fast_*'],n_layers=2,rr=4,max_len=0.12,tail_db=-45,role='jingle-only tick (finger tap / fast 16ths)')))
# ---------------- bells ----------------
INST['cowbell']=dict(name='Cowbell (large)',gm=[56],source=VC+' Cowbell 1',main='open',choke_group='cowbell',
 arts=dict(
  open=dict(layers=[V+'Cowbells/Cowbell1_Normal_v2_*',V+'Cowbells/Cowbell1_Normal_v3_*'],max_len=0.6,tonal=True,role='open ring'),
  hit=dict(layers=[V+'Cowbells/Cowbell1_Hit_v2_*',V+'Cowbells/Cowbell1_Hit_v3_*',V+'Cowbells/Cowbell1_Hit_v4_*'],max_len=0.6,tonal=True,role='second striking spot of the same bell, 3 dynamics (source label "Hit")'),
  muted=dict(layers=[V+'Cowbells/Cowbell1_Muted_v2_*',V+'Cowbells/Cowbell1_Muted_v3_*'],max_len=0.45,tonal=True,role='hand-muted')))
INST['cowbell2']=dict(name='Cowbell (small / cha-cha size)',gm=[56],source=VC+' Cowbell 2',main='open',choke_group='cowbell2',
 arts=dict(
  open=dict(layers=[V+'Cowbells/Cowbell2_Normal_v2_*',V+'Cowbells/Cowbell2_Normal_v3_*'],max_len=0.6,tonal=True),
  muted=dict(layers=[V+'Cowbells/Cowbell2_Muted_v2_*',V+'Cowbells/Cowbell2_Muted_v3_*'],max_len=0.45,tonal=True)))
INST['agogo']=dict(name='Agogô bells',gm=[67,68],source=VC,main='hi',
 arts=dict(
  hi=dict(layers=[V+'Agogo Bells/Agogo_High_v1_*',V+'Agogo Bells/Agogo_High_v2_*',V+'Agogo Bells/Agogo_High_v3_*'],max_len=0.6,tonal=True),
  lo=dict(layers=[V+'Agogo Bells/Agogo_Low_v1_*',V+'Agogo Bells/Agogo_Low_v2_*'],max_len=0.9,tonal=True)))
INST['triangle']=dict(name='Triangle',gm=[81,80],source=VC+' Triangle 6',main='open',choke_group='triangle',
 note='baião/forró: muted and open alternate; a muted stroke chokes the ringing open one',
 arts=dict(
  open=dict(layers=[V+'Triangles/Triangle6_Hit_v1_*',V+'Triangles/Triangle6_Hit_v2_*'],max_len=1.3,tail_db=-62),
  muted=dict(layers=[V+'Triangles/Triangle6_HitM_v1_*',V+'Triangles/Triangle6_HitM_v2_*'],max_len=0.45,tail_db=-45,role='hand closed on the triangle'),
  fmuted=dict(layers=[V+'Triangles/Triangle6_HitFM_v1_*',V+'Triangles/Triangle6_HitFM_v2_*'],max_len=0.35,tail_db=-45,role='fully muted (finger-muted) tick')))
# ---------------- wood ----------------
INST['claves']=dict(name='Claves',gm=[75],source=VC+' Claves (Legacy)',main='hit',
 arts=dict(hit=dict(layers=[V+'Claves/Legacy/claves_pp1*',V+'Claves/Legacy/claves_mp*',V+'Claves/Legacy/claves_mf*',V+'Claves/Legacy/claves_ff*'],max_len=0.3,tonal=True)))
INST['claves2']=dict(name='Claves (rosewood pair, roomier)',gm=[75],source=VC+' Claves 1 and 2',main='hit',
 arts=dict(hit=dict(layers=[V+'Claves/Claves1_Hit_v1_*',V+'Claves/Claves1_Hit_v2_*',V+'Claves/Claves1_Hit_v3_*'],max_len=0.45,tonal=True),
           hi=dict(layers=[V+'Claves/Claves2_Hit_v1_*',V+'Claves/Claves2_Hit_v2_*',V+'Claves/Claves2_Hit_v3_*'],max_len=0.45,tonal=True)))
INST['woodblock']=dict(name='Woodblock',gm=[76,77],source=VC,main='hit',
 arts=dict(hit=dict(layers=[V+'Woodblock/wood_click_pp_*',V+'Woodblock/wood_click_mp*',V+'Woodblock/wood_click_f_*',V+'Woodblock/wood_click_ff*'],max_len=0.35,tonal=True),
           lo=dict(layers=[V+'Woodblock/wood_click3_vl1*',V+'Woodblock/wood_click3_vl2*'],max_len=0.35,tonal=True)))
INST['guiro']=dict(name='Güiro',gm=[74,73],source=VC,main='long',choke_group='guiro',
 note='cha-cha-chá: long (down) on the beat, two shorts (down-up) after it; a new stroke stops the previous scrape',
 arts=dict(
  long=dict(anchor='onset',files=[V+'Guiro/Legacy/guiro_long.wav',V+'Guiro/Legacy/guiro_long2.wav',V+'Guiro/Legacy/gurio_long4.wav'],rr=3,max_len=0.7,tail_db=-40,role='long down scrape'),
  short=dict(anchor='onset',files=[V+'Guiro/Legacy/guiro_short*'],n_layers=2,rr=3,max_len=0.4,tail_db=-40,role='short scrape'),
  slow=dict(anchor='onset',files=[V+'Guiro/Guiro_Med_*',V+'Guiro/Guiro_Fast_*'],rr=2,max_len=1.1,tail_db=-40,role='long scrape for slow tempos (stereo)'),
  tap=dict(anchor='onset',files=[V+'Guiro/Guiro_Hit_*'],rr=2,max_len=0.4,tail_db=-45,role='stick tap on the body')))
# ---------------- skins ----------------
def conga(nm,pre,label,nl,ml):
    return dict(name=label,source=VC,main='open',arts=dict(
      open=dict(layers=[M+f'Conga/{pre}_HitN_v{i}_*' for i in nl],max_len=0.85,tonal=True,role='open tone'),
      muted=dict(layers=[M+f'Conga/{pre}_HitFM*_v{i}_*' for i in ml],max_len=0.6,tonal=True,role='muted tone (fingers stay on the head)')))
INST['quinto']=conga('quinto','Quinto','Quinto (high conga)',[1,2,3],[1,2]); INST['quinto']['gm']=[63,62]
INST['conga']=conga('conga','Conga','Conga (middle drum)',[1,2,3],[1,2]); INST['conga']['gm']=[63,62]
INST['tumba']=conga('tumba','Tumba','Tumba (low conga)',[2,3,4],[2,3,4]); INST['tumba']['gm']=[64]
INST['bongohi']=dict(name='Bongo macho (high)',gm=[60],source=VC,main='open',arts=dict(
  open=dict(layers=[M+f'Bongos/BongoH_Hit1_v{i}_*' for i in (1,2,3)],max_len=0.6,tonal=True),
  muted=dict(layers=[M+f'Bongos/BongoH_HitMuted1_v{i}_*' for i in (1,2,3)],max_len=0.5,tonal=True,role='muted/pressed stroke (martillo fingertip and thumb strokes)')))
INST['bongolo']=dict(name='Bongo hembra (low)',gm=[61],source=VC,main='open',arts=dict(
  open=dict(layers=[M+f'Bongos/BongoL_Hit1_v{i}_*' for i in (1,2,3)],max_len=0.65,tonal=True),
  muted=dict(layers=[M+f'Bongos/BongoL_HitMuted2_v{i}_*' for i in (1,2,3)],max_len=0.5,tonal=True)))
# ---------------- hands ----------------
INST['clap']=dict(name='Hand clap (one person)',gm=[39],source=FP,main='hit',arts=dict(
  hit=dict(files=[F+'HandClap/*'],n_layers=2,rr=4,max_len=0.3,tail_db=-58,pick=lambda xs:[t for t in xs if '01_06' not in t[1]])))
INST['clapsolo']=dict(name='Hand clap (one person, 4 dynamics, stereo)',gm=[39],source=VC,main='hit',arts=dict(
  hit=dict(layers=[V+f'Claps/SoloClap_vl{i}*' for i in (1,2,3,4)],max_len=0.3,tail_db=-58)))
INST['clapgroup']=dict(name='Hand claps (group, stereo)',gm=[39],source=VC,main='hit',arts=dict(
  hit=dict(files=[V+'Claps/Clap_rr*'],rr=6,max_len=0.45,tail_db=-58,role='several people; alternate the 6 takes')))

# ---------------- Freesound gap fillers (previews, see manifest source notes) ----------------
RJ='Freesound: ramjac, "Natal Quinto" pack (CC BY 4.0)'; R=FS+'ramjac/'
INST['congax']=dict(name='Conga, full hand-stroke set (Natal quinto, close mono mic)',gm=[63,62,64],source=RJ,main='open',choke_group='congax',pan=0.0,
 note='the tumbao drum: heel/tip/slap/open on one head. Run it monophonic (a new stroke fades the previous one in 15-25 ms) as the recordist advises. Stroke legend from the pack notes: O open, S slap, C closed (whole hand in the middle of the head), M mute, H heel, T tip, Tap = edge tap with the other hand resting on the head.',
 arts=dict(
  open=dict(files=[R+'*QuintoO[1-4]*',R+'*QuintoOL1*',R+'*QuintoO[LR]z[12]*'],n_layers=3,rr=3,max_len=0.6,tail_db=-58,tonal=True,role='open tone'),
  slap=dict(files=[R+'*QuintoS[1-8]*'],n_layers=3,rr=3,max_len=0.3,tail_db=-55,role='slap'),
  closed=dict(files=[R+'*QuintoC[1-3R]*'],n_layers=2,rr=2,max_len=0.35,tail_db=-55,role='closed note / bass (whole hand in the middle of the head)'),
  muted=dict(files=[R+'*QuintoM[12]*'],n_layers=2,rr=2,max_len=0.3,tail_db=-55,role='muted tone (hand not released)'),
  heel=dict(files=[R+'*QuintoHeel*',R+'*TumQuintoH*'],rr=4,max_len=0.3,tail_db=-50,role='heel of the palm (ghost level)'),
  tip=dict(files=[R+'*QuintoTip*',R+'*bTumQuintoTL*'],rr=4,max_len=0.2,tail_db=-50,role='fingertips (ghost level)'),
  tap=dict(files=[R+'*QuintoTap*'],rr=4,max_len=0.2,tail_db=-50,role='edge tap while the other hand mutes the head')))
SB='Freesound: Sassaby, "Percussion Samples" pack (CC0)'; B=FS+'sassaby/'
INST['timbalehi']=dict(name='Timbale macho (high)',gm=[65],source=SB,main='open',arts=dict(
  open=dict(files=[B+'533095*'],max_len=0.7,tonal=True,role='open tone, one take'),
  rim=dict(files=[B+'533089*'],max_len=0.9,tonal=True,role='rimshot, one take')))
INST['timbalelo']=dict(name='Timbale hembra (low)',gm=[66],source=SB,main='open',arts=dict(
  open=dict(files=[B+'533094*'],max_len=1.1,tonal=True,role='open tone, one take')))
INST['mambobell']=dict(name='Mambo / timbale bell (Toca)',gm=[56],source=SB,main='mouth',choke_group='mambobell',arts=dict(
  mouth=dict(files=[B+'533090*'],max_len=0.5,tonal=True,role='mouth (open, low) - the accent stroke'),
  body=dict(files=[B+'533091*'],max_len=0.3,tonal=True,role='body / neck (high, dry) - the in-between strokes')))
INST['chabell']=dict(name='Cha-cha bell',gm=[56],source=SB,main='open',arts=dict(
  open=dict(files=[B+'533092*'],max_len=0.4,tonal=True,role='one take')))
INST['shekere']=dict(name='Shekere',gm=[82],source=SB,main='hit',arts=dict(
  hit=dict(files=[B+'506383*'],max_len=0.6,tail_db=-45,role='one take')))
INST['snap']=dict(name='Finger snaps',gm=[99],source='Freesound: lafashion, "Real Snap" 1-28 (CC0)',main='hit',arts=dict(
  hit=dict(files=[FS+'lafashion/*.ogg'],n_layers=2,rr=5,max_len=0.3,tail_db=-58)))
CW='Freesound: CWBudde, pandeiro one-shots (CC BY 4.0)'; W=FS+'cwbudde/'
INST['pandeiro']=dict(name='Pandeiro',gm=[54],source=CW,main='bass',pan=0.0,
 note='one take per stroke from three pandeiros by the same recordist; alternate the three tap files for the fingertip and heel strokes',
 arts=dict(
  bass=dict(files=[W+'31337*'],max_len=0.8,tonal=True,role='thumb, open bass (ring)'),
  bassmuted=dict(files=[W+'31334*',W+'31331*'],rr=2,max_len=0.3,role='thumb, short bass'),
  slap=dict(files=[W+'3133[258]*'],rr=3,max_len=0.25,role='slap in the centre'),
  tap=dict(files=[W+'3133[369]*'],rr=3,max_len=0.16,tail_db=-40,role='fingertips / heel (jingles)')))
INST['tamborim']=dict(name='Tamborim',gm=[],source='Freesound: MeanRaccoon, "tamborim A2 collection" (CC0)',main='hit',arts=dict(
  hit=dict(files=[FS+'tamborim_slices/tamborim_0[1267]*',FS+'tamborim_slices/tamborim_09*',FS+'tamborim_slices/tamborim_10*',FS+'tamborim_slices/tamborim_0[3458]*'],n_layers=3,rr=3,max_len=0.35,tail_db=-50,tonal=True,role='stick hits, sorted by level; has a little room')))

CC0='CC0 1.0 Universal (public domain dedication)'; BY='Creative Commons Attribution 4.0 International (CC BY 4.0)'
META=dict(id='perc-2026',name='Hand Percussion 2026',
 character='hand percussion for the Modal Metronome: shakers with separate forward, back and accent strokes, tambourines (hit, shake, roll, jingle), cabasa, maracas, congas with the full tumbao stroke set, bongos, cowbells, mambo and cha-cha bells, agogo, triangle, claves, woodblock, guiro, claps, snaps, pandeiro, tamborim',
 version='1.0.0',date='2026-11-27',
 sources=[
  dict(library='Versilian Community Sample Library (VCSL)',author='Versilian Studios LLC (Sam Gossner) and contributors',license=CC0,
       license_quote='README.md: "This collection is under a Creative Commons 0 license. Essentially it\'s Public Domain- you can do whatever you want with these sounds (even make commercial software), no royalties, no credit, no special terms." LICENSE file: "Creative Commons Legal Code - CC0 1.0 Universal".',
       license_urls=['https://github.com/sgossner/VCSL/blob/master/LICENSE','https://creativecommons.org/publicdomain/zero/1.0/'],commit='c1ea7bc',attribution_required=False,share_alike=False,delivery='lossless WAV from the repository',
       credit_line='Percussion: Versilian Community Sample Library (CC0).'),
  dict(library='FreePats World Percussion 2020-09-05',author='FreePats project: Xavimart (Javier), Gonzalo and Roberto @ ZenVoid',license=CC0,
       license_quote='README.txt: "Published under the terms of Creative Commons CC0 public domain dedication: https://creativecommons.org/publicdomain/zero/1.0/". LICENSE.txt: "Creative Commons Legal Code - CC0 1.0 Universal". (Only the picture.jpg in that repository is CC BY 4.0; it is not used.)',
       license_urls=['https://github.com/freepats/world-percussion/blob/main/LICENSE.txt','https://creativecommons.org/publicdomain/zero/1.0/'],commit='e54eb29',attribution_required=False,share_alike=False,delivery='lossless FLAC/WAV from the repository',
       credit_line='Percussion: FreePats World Percussion (CC0).'),
  dict(library='Freesound: "Natal Quinto" pack by ramjac (sounds 21328-21389)',author='ramjac (Ramjac, 2006)',license=BY,
       license_quote='each sound page links https://creativecommons.org/licenses/by/4.0/ (checked on all 62 sound pages, 2026-11-27)',
       license_urls=['https://freesound.org/people/ramjac/packs/1302/','https://creativecommons.org/licenses/by/4.0/'],attribution_required=True,share_alike=False,
       delivery='Freesound HQ preview (lossy OGG); see missing[] - swap in the original 24-bit AIFFs when a Freesound login is available',
       modifications='selected takes trimmed, levelled, converted to 44.1 kHz stereo MP3',
       credit_line='Conga strokes: "Natal Quinto" by ramjac (freesound.org/people/ramjac), CC BY 4.0, trimmed and levelled.'),
  dict(library='Freesound: pandeiro one-shots by CWBudde (sounds 31331-31339)',author='CWBudde',license=BY,
       license_quote='each sound page links https://creativecommons.org/licenses/by/4.0/ (checked 2026-11-27)',
       license_urls=['https://freesound.org/people/CWBudde/sounds/31337/','https://creativecommons.org/licenses/by/4.0/'],attribution_required=True,share_alike=False,delivery='Freesound HQ preview (lossy OGG)',
       modifications='trimmed, levelled, converted to 44.1 kHz stereo MP3',
       credit_line='Pandeiro: one-shots by CWBudde (freesound.org/people/CWBudde), CC BY 4.0, trimmed and levelled.'),
  dict(library='Freesound: "Percussion Samples" pack by Sassaby (timbales 533089/533094/533095, bells 533090-533092, shekere 506383)',author='Sassaby',license=CC0,
       license_quote='each sound page links https://creativecommons.org/publicdomain/zero/1.0/ (checked 2026-11-27)',license_urls=['https://freesound.org/people/Sassaby/packs/28352/','https://creativecommons.org/publicdomain/zero/1.0/'],attribution_required=False,share_alike=False,delivery='Freesound HQ preview (lossy OGG)',
       credit_line='Timbales and bells: Sassaby on Freesound (CC0).'),
  dict(library='Freesound: "Real Snap" 1-28 by lafashion (sounds 361743-361770)',author='lafashion',license=CC0,
       license_quote='each sound page links https://creativecommons.org/publicdomain/zero/1.0/ (checked 2026-11-27)',license_urls=['https://freesound.org/people/lafashion/sounds/361743/','https://creativecommons.org/publicdomain/zero/1.0/'],attribution_required=False,share_alike=False,delivery='Freesound HQ preview (lossy OGG)',
       credit_line='Finger snaps: lafashion on Freesound (CC0).'),
  dict(library='Freesound: "tamborim A2 collection" by MeanRaccoon (sound 844753)',author='MeanRaccoon',license=CC0,
       license_quote='sound page links https://creativecommons.org/publicdomain/zero/1.0/ (checked 2026-11-27)',license_urls=['https://freesound.org/people/MeanRaccoon/sounds/844753/','https://creativecommons.org/publicdomain/zero/1.0/'],attribution_required=False,share_alike=False,delivery='Freesound HQ preview (lossy OGG), sliced into its 10 hits',
       credit_line='Tamborim: MeanRaccoon on Freesound (CC0).')],
 credit_line='Percussion: Versilian Community Sample Library (CC0), FreePats World Percussion (CC0), and Freesound users Sassaby, lafashion and MeanRaccoon (CC0). Conga strokes: "Natal Quinto" by ramjac, CC BY 4.0. Pandeiro: CWBudde, CC BY 4.0. Samples were trimmed and levelled. Licence: creativecommons.org/licenses/by/4.0/',
 format=dict(codec='mp3 (LAME VBR -q:a 4, joint stereo)',sample_rate=44100,channels=2,naming='<inst>_<art>_<layer>_<roundrobin>.mp3 ; layer 1 = softest; no underscores inside <inst> or <art>'),
 perspective='stereo where the source is stereo (VCSL); FreePats and the Freesound conga, pandeiro files are mono sources stored as centred dual mono - pan them in the engine',
 dynamics=dict(
  note='Same rules as the drum kits: every articulation is normalised so its loudest layer peaks at -1 dBFS; softer layers keep the level (and darker tone) of the softer playing. stored_rel_db is the level of a layer in the files relative to the loudest layer, natural_rel_db what the source has, gain_trim_db (zero or negative) restores the source level where the range was wider than 24 dB. Levels are measured as total energy of the processed file. Round robins of one layer keep their recorded level differences up to +/-1.5 dB. Pick the layer by velocity, then scale gain only inside the layer (about +/-2 dB).',
  art_rel_db='level of the loudest layer of an articulation relative to the main articulation of the same instrument, as recorded (files are normalised; apply it to restore e.g. ghost-level heel and tip strokes against an open tone, or a weak back stroke against the forward stroke). Not meaningful across sources that were peak-normalised by their authors (FreePats, Sassaby, lafashion): treat those as a starting balance.',
  velocity='vel_lo/vel_hi: softest layer centred near velocity 26, loudest at 127, split at the geometric mean of neighbouring layers; remap freely'),
 timing=dict(
  onset='anchor "onset": the file starts 1.5 ms before the first sample that reaches 10% of the peak (0.7 ms fade-in). Start it on the grid like the drum kits.',
  peak='anchor "peak": shaken and rubbed sounds (shakers, maracas, cabasa rub, tambourine shake) swell before they speak. The loudest point of the stroke (4 ms RMS envelope) sits exactly lead_ms after the file start, the same value for every file of that articulation. Start the file lead_ms BEFORE the grid time so the stroke lands on the beat.',
  mp3='files carry the LAME gapless header; ffmpeg-based decoders (Chrome, Firefox, Edge) and current Safari remove the encoder delay. QA measured 0 samples of lag after decode.'),
 processing=dict(steps=['converted to 44.1 kHz (polyphase resampling) and stereo (mono sources duplicated to both channels)','DC offset removed','start trimmed to the anchor (see timing), short sin^2 fade-in','tail cut where the envelope falls under tail_db relative to the loudest take of the articulation or at max_len_s, cos^2 fade-out','no EQ, no compression, no reverb, no pitch change','one gain per file (see dynamics), TPDF dither to 16 bit, LAME VBR -q:a 4']),
 choke_groups=dict(
  shaker=dict(members=['shaker','shakersm','shakerlg','maracas','cabasa'],note='per instrument, monophonic: a new stroke fades the previous one of the same instrument over 10-20 ms (the beads are in one place at a time)'),
  tamb=dict(members=['tamb','tamb1','tamb2','tambfp'],note='a hit or the next shake stroke fades a running roll/shake of the same tambourine over 30-40 ms'),
  triangle=dict(choked=['open'],choked_by=['muted','fmuted'],note='closing the hand stops the ring (fade 20-30 ms)'),
  cowbell=dict(choked=['open','hit','mouth'],choked_by=['muted'],note='a muted stroke stops the open ring of the same bell (fade 20-30 ms); applies to cowbell, cowbell2, mambobell'),
  guiro=dict(note='monophonic: a new scrape stops the previous one (fade 10 ms)'),
  congax=dict(note='monophonic per drum: any new stroke on the same head fades the previous one over 15-25 ms; a heel, tip, closed, muted or slap stroke always stops a ringing open tone. Same for quinto, conga, tumba, bongohi, bongolo, pandeiro.')),
 missing=[
  'surdo (open and muted): no clean CC0/CC BY one-shots found; the candidates were pattern recordings with overlapping hits or processed single takes. Not staged.',
  'timbales: only one take each of high open, high rimshot and low open (Sassaby, CC0); no cascara (shell) strokes, no dynamics. A multi-take CC0 "metal timbale" set on Freesound was rejected (home recording, one drum only).',
  'cha-cha bell and mambo bell: one take each, no dynamics (the two VCSL cowbells carry the dynamics: 2-3 layers, open and muted)',
  'pandeiro: one take per stroke (bass, short bass, slap, tap); no platinela-only shake, no multi-dynamics',
  'tamborim: 10 hits from one recording with some room sound; no finger-muted or rim strokes labelled',
  'ganza/caxixi: only loops were found; shakerlg (VCSL large shaker) stands in',
  'bongo slap/rim strokes (VCSL bongos have open and muted only); conga slap/heel/tip exist for one drum only (congax); the low drum (tumba) has open and muted only',
  'tambourine thumb roll as a short one-beat gesture: the rolls staged are sustained shake rolls cut to 1.6 s',
  'agogo and cowbell round robins (the modern VCSL sets have one take per dynamic)',
  'Freesound files were taken from the public HQ previews (lossy OGG, then MP3 again) because originals need a login: congax, pandeiro, timbales, mambobell, chabell, shekere, snap, tamborim. Replace with the original files when a Freesound account is available; names and trims can stay.',
  'VCSL and FreePats shaker takes do not label stroke direction on the egg shaker; fwd/back were assigned by measured stroke sharpness (see drums.shaker.note)'])
