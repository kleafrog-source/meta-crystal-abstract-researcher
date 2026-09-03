// "Intro by XX" @by MariaAreadne

setcpm(26)

$: cat(
  note("a3@2 a3@2 c4@2 c4@2 d4@2 d4@2 c4@2 c4@2"), note("~@2 a3@2 c4@2 c4@2 d4@2 d4@2 c4@2 a3@2"),
  note("a3@2 a3@2 c4@2 c4@2 e4@2 e4@2 c4@2 c4@2"), note("d4@2 d4@2 c4@2 c4@2 e4@2 e4@2 c4@2 g3@2")
)
.s("gm_electric_guitar_clean")
.lpf(4000).room(0.7).delay(0.5).delaytime(0.3).clip(0.86)
.delayfeedback(0.35).gain(1)._pianoroll()


$: cat(
  note("[f3,a3,c4]@16"),note("[f3,a3,c4]@12 [g3,b3,d4]@4"), note("[a3,c4,e4]@16"),note("[e3,g3,c4]@8 [a3,c4,e4]@4 [e3,g3,c4]@4"),
  note("[f3,a3,c4]@16"),note("[f3,a3,c4]@12 [g3,b3,d4]@4"), note("[a3,c4,e4]@16"),note("[e3,g3,c4]@8 [a3,c4,e4]@4 [g3,b3,d4]@4")
)
.s("supersaw").lpf(slider(2256,0,3000))
.room(0.8).gain(0.55)._pianoroll()



$: cat(
  note("f2@16"),note("f2@12 g2@4"),note("a2@16"),note("e2@8 a2@4 e2@4"),
  note("f2@16"),note("f2@12 g2@4"),note("a2@16"),note("e2@8 a2@4 g2@4")
)
.s("gm_synth_bass_1")
.lpf(900).gain(0.9).room(0.2)._pianoroll()




$drums:
stack(
  s("bd - - [- bd] bd  bd - < - - - [- bd]>  bd - - [- bd] <bd bd bd [bd bd]>  bd -  < - - - [- bd]>").s("dr550_bd")
  .slow(2).gain(0.7).lpf(4000).delay(0.36),
  s("- - [sd -] - - - [ sd] - - - [sd -] - - - sd -").s(" circuitstom_cp").slow(2).gain(0.7).room(0.5).lpf(5000).delay(0.2),
  s("hh*8").s("rm50_hh").gain(0.45).late(0.01).lpf(2800)
    .degradeBy(0.05)
)._pianoroll()
