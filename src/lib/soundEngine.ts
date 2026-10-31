class SoundEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private isMuted = false
  private isInitialized = false
  private isReading = false

  // 1. Continuous Low-Frequency Engine Foundation (Idle & Bass Bed)
  private engineOsc: OscillatorNode | null = null
  private engineSubOsc: OscillatorNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  private engineGain: GainNode | null = null

  // 2. Continuous Electric Motor Whine (Pure Sine Harmonics)
  private motorWhineOsc1: OscillatorNode | null = null
  private motorWhineOsc2: OscillatorNode | null = null
  private motorWhineFilter: BiquadFilterNode | null = null
  private motorWhineGain: GainNode | null = null

  // 3. Continuous Aerodynamic Wind / Air Rush
  private noiseBuffer: AudioBuffer | null = null
  private windNoiseSource: AudioBufferSourceNode | null = null
  private windFilter: BiquadFilterNode | null = null
  private windGain: GainNode | null = null

  // 4. Continuous Boost Thruster (Deep Ion Jet Whoosh + Sub Core)
  private boostNoiseSource: AudioBufferSourceNode | null = null
  private boostFilter: BiquadFilterNode | null = null
  private boostSubOsc: OscillatorNode | null = null
  private boostTurbineOsc: OscillatorNode | null = null
  private boostGain: GainNode | null = null

  // 5. Continuous Drift Tyre Screech
  private driftNoiseSource: AudioBufferSourceNode | null = null
  private driftFilter: BiquadFilterNode | null = null
  private driftGain: GainNode | null = null

  // 6. Grid Battle foe bike — engine/whine/boost/drift layers, each with its
  // own gain, into a distance-panned PannerNode (spatial cue for the opponent)
  private foeEngineOsc: OscillatorNode | null = null
  private foeWhineOsc: OscillatorNode | null = null
  private foeNoiseSource: AudioBufferSourceNode | null = null
  private foeBoostFilter: BiquadFilterNode | null = null
  private foeDriftFilter: BiquadFilterNode | null = null
  private foeEngineGain: GainNode | null = null
  private foeWhineGain: GainNode | null = null
  private foeBoostGain: GainNode | null = null
  private foeDriftGain: GainNode | null = null
  private foePanner: PannerNode | null = null
  // positionX/forwardX AudioParam API vs deprecated setPosition/setOrientation
  private spatialParamAPI = false

  // Rate limit for wall impact zaps so wall-grinding can't machine-gun the ears
  private lastWallHitAt = 0

  constructor() {
    // Check saved mute state from localStorage
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('grid-sound-muted')
        if (saved !== null) {
          this.isMuted = saved === 'true'
        }
      } catch {
        // ignore storage error
      }
    }
  }

  // Unlock and resume on first user interaction
  public init(): void {
    if (typeof window === 'undefined') return
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      this.ctx = new AudioCtx()

      // Master Gain
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime)
      this.masterGain.connect(this.ctx.destination)

      // Create shared 2-second white-noise buffer
      const bufferSize = this.ctx.sampleRate * 2
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
      const data = this.noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }

      this.setupEngineSynth()
      this.setupMotorWhineSynth()
      this.setupWindSynth()
      this.setupBoostSynth()
      this.setupDriftSynth()
      this.setupFoeSynth()
      this.isInitialized = true
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // ignore resume error
      })
    }
  }

  // 1. Deep, Warm Sub-Bass Foundation (Preserves the soothing idle hum)
  private setupEngineSynth(): void {
    if (!this.ctx || !this.masterGain) return

    this.engineOsc = this.ctx.createOscillator()
    this.engineSubOsc = this.ctx.createOscillator()
    this.engineFilter = this.ctx.createBiquadFilter()
    this.engineGain = this.ctx.createGain()

    // Warm sine + sub-triangle foundation
    this.engineOsc.type = 'sine'
    this.engineOsc.frequency.setValueAtTime(55, this.ctx.currentTime)

    this.engineSubOsc.type = 'triangle'
    this.engineSubOsc.frequency.setValueAtTime(27.5, this.ctx.currentTime)

    // Gentle lowpass with zero harsh resonance
    this.engineFilter.type = 'lowpass'
    this.engineFilter.frequency.setValueAtTime(140, this.ctx.currentTime)
    this.engineFilter.Q.setValueAtTime(0.7, this.ctx.currentTime)

    this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime)

    this.engineOsc.connect(this.engineFilter)
    this.engineSubOsc.connect(this.engineFilter)
    this.engineFilter.connect(this.engineGain)
    this.engineGain.connect(this.masterGain)

    this.engineOsc.start()
    this.engineSubOsc.start()
  }

  // 2. Smooth Electric Motor Whine (Pure Musical Harmonics, replaces buzzy saw)
  private setupMotorWhineSynth(): void {
    if (!this.ctx || !this.masterGain) return

    this.motorWhineOsc1 = this.ctx.createOscillator()
    this.motorWhineOsc2 = this.ctx.createOscillator()
    this.motorWhineFilter = this.ctx.createBiquadFilter()
    this.motorWhineGain = this.ctx.createGain()

    // Dual pure sine waves in octave intervals
    this.motorWhineOsc1.type = 'sine'
    this.motorWhineOsc1.frequency.setValueAtTime(90, this.ctx.currentTime)

    this.motorWhineOsc2.type = 'sine'
    this.motorWhineOsc2.frequency.setValueAtTime(180, this.ctx.currentTime)

    // Butterworth lowpass filter with low Q to eliminate harsh ringing
    this.motorWhineFilter.type = 'lowpass'
    this.motorWhineFilter.frequency.setValueAtTime(600, this.ctx.currentTime)
    this.motorWhineFilter.Q.setValueAtTime(0.5, this.ctx.currentTime)

    this.motorWhineGain.gain.setValueAtTime(0.0, this.ctx.currentTime)

    this.motorWhineOsc1.connect(this.motorWhineFilter)
    this.motorWhineOsc2.connect(this.motorWhineFilter)
    this.motorWhineFilter.connect(this.motorWhineGain)
    this.motorWhineGain.connect(this.masterGain)

    this.motorWhineOsc1.start()
    this.motorWhineOsc2.start()
  }

  // 3. Aerodynamic Air / Wind Rush (Natural, immersive speed sensation)
  private setupWindSynth(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return

    this.windNoiseSource = this.ctx.createBufferSource()
    this.windNoiseSource.buffer = this.noiseBuffer
    this.windNoiseSource.loop = true

    this.windFilter = this.ctx.createBiquadFilter()
    this.windFilter.type = 'lowpass'
    this.windFilter.frequency.setValueAtTime(160, this.ctx.currentTime)
    this.windFilter.Q.setValueAtTime(0.6, this.ctx.currentTime)

    this.windGain = this.ctx.createGain()
    this.windGain.gain.setValueAtTime(0.0, this.ctx.currentTime)

    this.windNoiseSource.connect(this.windFilter)
    this.windFilter.connect(this.windGain)
    this.windGain.connect(this.masterGain)

    this.windNoiseSource.start()
  }

  // 4. Boost Thruster (Deep Ion Jet Stream + Sub-Bass Core, replaces 1.8kHz screech)
  private setupBoostSynth(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return

    this.boostNoiseSource = this.ctx.createBufferSource()
    this.boostNoiseSource.buffer = this.noiseBuffer
    this.boostNoiseSource.loop = true

    // Broad, smooth bandpass for deep rushing ion exhaust
    this.boostFilter = this.ctx.createBiquadFilter()
    this.boostFilter.type = 'bandpass'
    this.boostFilter.frequency.setValueAtTime(650, this.ctx.currentTime)
    this.boostFilter.Q.setValueAtTime(1.2, this.ctx.currentTime)

    // Sub-bass sine core for physical thrust weight
    this.boostSubOsc = this.ctx.createOscillator()
    this.boostSubOsc.type = 'sine'
    this.boostSubOsc.frequency.setValueAtTime(45, this.ctx.currentTime)

    // Ascending pure turbine pitch
    this.boostTurbineOsc = this.ctx.createOscillator()
    this.boostTurbineOsc.type = 'sine'
    this.boostTurbineOsc.frequency.setValueAtTime(220, this.ctx.currentTime)

    this.boostGain = this.ctx.createGain()
    this.boostGain.gain.setValueAtTime(0.0, this.ctx.currentTime)

    this.boostNoiseSource.connect(this.boostFilter)
    this.boostFilter.connect(this.boostGain)

    this.boostSubOsc.connect(this.boostGain)
    this.boostTurbineOsc.connect(this.boostGain)

    this.boostGain.connect(this.masterGain)

    this.boostNoiseSource.start()
    this.boostSubOsc.start()
    this.boostTurbineOsc.start()
  }

  // 5. Procedural Drift Tyre Sizzle
  private setupDriftSynth(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return

    this.driftNoiseSource = this.ctx.createBufferSource()
    this.driftNoiseSource.buffer = this.noiseBuffer
    this.driftNoiseSource.loop = true

    this.driftFilter = this.ctx.createBiquadFilter()
    this.driftFilter.type = 'bandpass'
    this.driftFilter.frequency.setValueAtTime(1800, this.ctx.currentTime)
    this.driftFilter.Q.setValueAtTime(2.8, this.ctx.currentTime)

    this.driftGain = this.ctx.createGain()
    this.driftGain.gain.setValueAtTime(0.0, this.ctx.currentTime)

    this.driftNoiseSource.connect(this.driftFilter)
    this.driftFilter.connect(this.driftGain)
    this.driftGain.connect(this.masterGain)

    this.driftNoiseSource.start()
  }

  // 6. Foe bike spatial voice (Grid Battle). Same layer family as the local
  // bike (engine sub + whine + boost jet + drift squeal) but routed through a
  // PannerNode: distance attenuation + stereo pan relative to the camera.
  // Linear rolloff (Unity's default) reaches EXACT silence at maxDistance —
  // the physics-correct 'inverse' model asymptotes and never fully fades.
  private setupFoeSynth(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return

    this.foePanner = this.ctx.createPanner()
    this.foePanner.panningModel = 'equalpower' // cheap; HRTF needs a convolver
    this.foePanner.distanceModel = 'linear'
    this.foePanner.refDistance = 12 // full volume inside 12u
    this.foePanner.maxDistance = 110 // exact zero beyond — arena is 240x240
    this.foePanner.rolloffFactor = 1
    this.foePanner.connect(this.masterGain)

    const layer = (): GainNode => {
      const g = this.ctx!.createGain()
      g.gain.setValueAtTime(0.0, this.ctx!.currentTime)
      g.connect(this.foePanner!)
      return g
    }
    this.foeEngineGain = layer()
    this.foeWhineGain = layer()
    this.foeBoostGain = layer()
    this.foeDriftGain = layer()

    this.foeEngineOsc = this.ctx.createOscillator()
    this.foeEngineOsc.type = 'sine'
    this.foeEngineOsc.frequency.setValueAtTime(55, this.ctx.currentTime)
    this.foeEngineOsc.connect(this.foeEngineGain)

    this.foeWhineOsc = this.ctx.createOscillator()
    this.foeWhineOsc.type = 'sine'
    this.foeWhineOsc.frequency.setValueAtTime(90, this.ctx.currentTime)
    this.foeWhineOsc.connect(this.foeWhineGain)

    // One noise source fans out to both the boost jet and the drift squeal
    this.foeNoiseSource = this.ctx.createBufferSource()
    this.foeNoiseSource.buffer = this.noiseBuffer
    this.foeNoiseSource.loop = true

    this.foeBoostFilter = this.ctx.createBiquadFilter()
    this.foeBoostFilter.type = 'bandpass'
    this.foeBoostFilter.frequency.setValueAtTime(650, this.ctx.currentTime)
    this.foeBoostFilter.Q.setValueAtTime(1.2, this.ctx.currentTime)
    this.foeNoiseSource.connect(this.foeBoostFilter)
    this.foeBoostFilter.connect(this.foeBoostGain)

    this.foeDriftFilter = this.ctx.createBiquadFilter()
    this.foeDriftFilter.type = 'bandpass'
    this.foeDriftFilter.frequency.setValueAtTime(1800, this.ctx.currentTime)
    this.foeDriftFilter.Q.setValueAtTime(2.8, this.ctx.currentTime)
    this.foeNoiseSource.connect(this.foeDriftFilter)
    this.foeDriftFilter.connect(this.foeDriftGain)

    this.foeNoiseSource.start()
    this.foeEngineOsc.start()
    this.foeWhineOsc.start()

    this.spatialParamAPI = !!this.ctx.listener.positionX
  }

  // Silence all continuous vehicle sounds when user is reading a terminal popup
  public setReading(reading: boolean): void {
    this.isReading = reading
    if (!this.ctx) return
    const now = this.ctx.currentTime

    if (reading) {
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0.0, now, 0.04)
      if (this.motorWhineGain) this.motorWhineGain.gain.setTargetAtTime(0.0, now, 0.04)
      if (this.windGain) this.windGain.gain.setTargetAtTime(0.0, now, 0.04)
      if (this.boostGain) this.boostGain.gain.setTargetAtTime(0.0, now, 0.04)
      if (this.driftGain) this.driftGain.gain.setTargetAtTime(0.0, now, 0.04)
      this.silenceFoe(now)
    }
  }

  // Called every frame from 3D frame loop. revSpeed feeds the engine/whine
  // layers separately from road speed so a burnout can rev in place.
  public update(
    speed: number,
    isAccelerating: boolean,
    isBoosting: boolean,
    isDrifting: boolean,
    revSpeed = speed,
  ): void {
    if (!this.isInitialized || !this.ctx || this.isMuted) return
    const now = this.ctx.currentTime

    // Silence all vehicle audio if reading a modal popup
    if (this.isReading) {
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0.0, now, 0.04)
      if (this.motorWhineGain) this.motorWhineGain.gain.setTargetAtTime(0.0, now, 0.04)
      if (this.windGain) this.windGain.gain.setTargetAtTime(0.0, now, 0.04)
      if (this.boostGain) this.boostGain.gain.setTargetAtTime(0.0, now, 0.04)
      if (this.driftGain) this.driftGain.gain.setTargetAtTime(0.0, now, 0.04)
      return
    }

    const absSpeed = Math.abs(speed)
    const speedFrac = Math.min(1.0, absSpeed / 26.0)
    const revFrac = Math.min(1.0, Math.abs(revSpeed) / 26.0)
    // Engine revving while standing still = burnout; >30 revs = the boost variant
    const burnoutBoost = absSpeed < 1 && Math.abs(revSpeed) > 30
    // Real motors keep climbing past the normal top speed — pitch tracks boost too
    const overBoost = Math.max(0, (absSpeed - 26.0) / 14.0)

    // 1. Deep Sub-Bass Foundation (Preserves the gentle idle hum)
    if (this.engineOsc && this.engineSubOsc && this.engineFilter && this.engineGain) {
      const baseFreq = (55 + revFrac * 40) * (1 + 0.3 * overBoost) * (burnoutBoost ? 1.25 : 1)
      this.engineOsc.frequency.setTargetAtTime(baseFreq, now, 0.08)
      this.engineSubOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.08)

      const cutoff =
        (130 + revFrac * 110 + (isAccelerating ? 40 : 0)) * (1 + 0.3 * overBoost) +
        (burnoutBoost ? 60 : 0)
      this.engineFilter.frequency.setTargetAtTime(cutoff, now, 0.08)

      // Steady soothing idle bed (0.09) that stays gentle during driving (0.13);
      // a boost burnout screams a touch louder than the throttle one
      const targetVol = 0.09 + revFrac * 0.04 + (burnoutBoost ? 0.03 : 0)
      this.engineGain.gain.setTargetAtTime(targetVol, now, 0.1)
    }

    // 2. Smooth Electric Motor Whine (Replaces buzzy saw with pure sine electric whir)
    if (
      this.motorWhineOsc1 &&
      this.motorWhineOsc2 &&
      this.motorWhineFilter &&
      this.motorWhineGain
    ) {
      const whineFreq = (90 + revFrac * 150 + (isBoosting ? 40 : 0)) * (1 + 0.25 * overBoost)
      this.motorWhineOsc1.frequency.setTargetAtTime(whineFreq, now, 0.08)
      this.motorWhineOsc2.frequency.setTargetAtTime(whineFreq * 2.0, now, 0.08)

      const filterCutoff = 450 + revFrac * 350
      this.motorWhineFilter.frequency.setTargetAtTime(filterCutoff, now, 0.08)

      // Only audible when moving (0.0 at idle, rises smoothly to gentle 0.065);
      // a burnout revs the whine in place via revFrac
      const targetWhineVol = revFrac * (isAccelerating ? 0.065 : 0.04)
      this.motorWhineGain.gain.setTargetAtTime(targetWhineVol, now, 0.1)
    }

    // 3. Aerodynamic Wind Rush (Comforting broadband velocity sensation)
    if (this.windFilter && this.windGain) {
      const windCutoff = 180 + speedFrac * 850 + (isBoosting ? 300 : 0)
      this.windFilter.frequency.setTargetAtTime(windCutoff, now, 0.1)

      const targetWindVol = Math.pow(speedFrac, 1.2) * (isBoosting ? 0.14 : 0.09)
      this.windGain.gain.setTargetAtTime(targetWindVol, now, 0.1)
    }

    // 4. Boost Thruster (Deep Ion Jet Whoosh, replaces 1.8kHz screech).
    // Also fires for a stationary boost burnout so it sounds distinct from the
    // throttle burnout (which stays thruster-free). The turbine spools with speed.
    if (this.boostGain && this.boostFilter && this.boostTurbineOsc) {
      if ((isBoosting && absSpeed > 1.0) || burnoutBoost) {
        this.boostFilter.frequency.setTargetAtTime(900, now, 0.1)
        const turbineFreq = burnoutBoost ? 360 : 170 + 210 * Math.min(1, absSpeed / 40.0)
        this.boostTurbineOsc.frequency.setTargetAtTime(turbineFreq, now, 0.12)
        this.boostGain.gain.setTargetAtTime(0.18, now, 0.1)
      } else {
        this.boostGain.gain.setTargetAtTime(0.0, now, 0.15)
      }
    }

    // 5. Drift Tyre Screech (also screams during a stationary burnout).
    // Pitch scales with speed with a slight wobble — real squeals are never a fixed tone
    if (this.driftGain && this.driftFilter) {
      const squealFreq = 1600 + 450 * speedFrac + (Math.random() - 0.5) * 140
      this.driftFilter.frequency.setTargetAtTime(squealFreq, now, 0.05)
      if (isDrifting && (absSpeed > 1.0 || revFrac > 0.1)) {
        this.driftGain.gain.setTargetAtTime(0.15, now, 0.05)
      } else {
        this.driftGain.gain.setTargetAtTime(0.0, now, 0.08)
      }
    }
  }

  // Called every frame from the battle frame loop with the network-synced foe
  // bike. Positions the panner at the foe and the listener at the camera, then
  // maps foe speed/boost/drift onto the foe voice exactly like the local bike.
  public updateFoe(
    foe: { x: number; z: number; speed: number; isDrifting?: boolean },
    inputs: { boost: boolean },
    ear: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
    active: boolean,
  ): void {
    if (!this.isInitialized || !this.ctx || this.isMuted || !this.foePanner) return
    const now = this.ctx.currentTime

    // Source at the foe's bike (y = saddle height); listener at the camera
    // facing where it looks — orbiting toward the foe pans them to center
    const p = this.foePanner
    const L = this.ctx.listener
    if (this.spatialParamAPI && p.positionX) {
      p.positionX.value = foe.x
      p.positionY.value = 0.6
      p.positionZ.value = foe.z
      L.positionX.value = ear.x
      L.positionY.value = ear.y
      L.positionZ.value = ear.z
      L.forwardX.value = forward.x
      L.forwardY.value = forward.y
      L.forwardZ.value = forward.z
      L.upX.value = 0
      L.upY.value = 1
      L.upZ.value = 0
    } else {
      p.setPosition(foe.x, 0.6, foe.z)
      L.setPosition(ear.x, ear.y, ear.z)
      L.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0)
    }

    const on = active && !this.isReading
    const absSpeed = Math.abs(foe.speed)
    const frac = Math.min(1.0, absSpeed / 26.0)
    const boosting = inputs.boost && absSpeed > 1.0
    const drifting = !!foe.isDrifting && absSpeed > 1.0

    if (this.foeEngineOsc) {
      this.foeEngineOsc.frequency.setTargetAtTime(55 + frac * 40, now, 0.08)
    }
    if (this.foeWhineOsc) {
      this.foeWhineOsc.frequency.setTargetAtTime(90 + frac * 150, now, 0.08)
    }
    if (this.foeDriftFilter) {
      // Same speed-scaled wobble as the local squeal
      this.foeDriftFilter.frequency.setTargetAtTime(
        1600 + 450 * frac + (Math.random() - 0.5) * 140,
        now,
        0.05,
      )
    }

    // Layer levels mirror the local bike slightly quieter; the panner handles
    // distance attenuation on top (a parked/out-of-range foe decays to silence)
    this.foeEngineGain?.gain.setTargetAtTime(on ? 0.08 + frac * 0.04 : 0, now, 0.1)
    this.foeWhineGain?.gain.setTargetAtTime(on ? frac * 0.055 : 0, now, 0.1)
    this.foeBoostGain?.gain.setTargetAtTime(on && boosting ? 0.15 : 0, now, boosting ? 0.1 : 0.15)
    this.foeDriftGain?.gain.setTargetAtTime(on && drifting ? 0.13 : 0, now, drifting ? 0.05 : 0.08)
  }

  // One-shot: Holographic terminal opens
  public playTerminalOpen(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime

    // 3-note ascending crystalline arpeggio: F#5 (740Hz), A#5 (932Hz), C#6 (1108Hz)
    const notes = [740, 932, 1108]
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.06)

      gain.gain.setValueAtTime(0.0, now + idx * 0.06)
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.06 + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35)

      osc.connect(gain)
      gain.connect(this.masterGain)

      osc.start(now + idx * 0.06)
      osc.stop(now + idx * 0.06 + 0.36)
    })
  }

  // One-shot: Holographic terminal closes
  public playTerminalClose(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.22)

    gain.gain.setValueAtTime(0.0, now)
    gain.gain.linearRampToValueAtTime(0.16, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

    osc.connect(gain)
    gain.connect(this.masterGain)

    osc.start(now)
    osc.stop(now + 0.23)
  }

  // One-shot: Autopilot engaged
  public playAutopilotEngage(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(587, now)
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.2)

    gain.gain.setValueAtTime(0.0, now)
    gain.gain.linearRampToValueAtTime(0.18, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

    osc.connect(gain)
    gain.connect(this.masterGain)

    osc.start(now)
    osc.stop(now + 0.23)
  }

  // One-shot: Autopilot arrived and docked
  public playAutopilotDock(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime

    const freqs = [880, 1320]
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.08)

      gain.gain.setValueAtTime(0.0, now + idx * 0.08)
      gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.08 + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25)

      osc.connect(gain)
      gain.connect(this.masterGain)

      osc.start(now + idx * 0.08)
      osc.stop(now + idx * 0.08 + 0.26)
    })
  }

  // One-shot: Grid Battle arena transform — the duel grid materializes and both
  // riders freeze at their spawn corners (start of the countdown). Three
  // layers, matching the house aesthetic (smooth sine/noise, no click attacks):
  // a deep 42Hz sub swell (the arena powering up), a rising bandpass noise
  // sweep (the energy gate drawing in), and a low A2+E3 fifth chord (weight).
  public playBattleTransform(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime

    // 1. Deep sub swell
    const sub = this.ctx.createOscillator()
    const subGain = this.ctx.createGain()
    sub.type = 'sine'
    sub.frequency.setValueAtTime(42, now)
    subGain.gain.setValueAtTime(0.0, now)
    subGain.gain.linearRampToValueAtTime(0.25, now + 0.15)
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1)
    sub.connect(subGain)
    subGain.connect(this.masterGain)
    sub.start(now)
    sub.stop(now + 1.12)

    // 2. Rising energy-gate noise sweep
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      const band = this.ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.setValueAtTime(250, now)
      band.frequency.exponentialRampToValueAtTime(1400, now + 0.9)
      band.Q.setValueAtTime(1.4, now)
      const nGain = this.ctx.createGain()
      nGain.gain.setValueAtTime(0.0, now)
      nGain.gain.linearRampToValueAtTime(0.1, now + 0.2)
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95)
      src.connect(band)
      band.connect(nGain)
      nGain.connect(this.masterGain)
      src.start(now)
      src.stop(now + 1.0)
    }

    // 3. Low fifth chord (A2 + E3) — martial weight without buzz
    for (const freq of [110, 165]) {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now)
      gain.gain.setValueAtTime(0.0, now)
      gain.gain.linearRampToValueAtTime(0.16, now + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0)
      osc.connect(gain)
      gain.connect(this.masterGain)
      osc.start(now)
      osc.stop(now + 1.02)
    }
  }

  // One-shot: Battle link created — the invite link materializes in the
  // launcher after hostBattle() resolves. Quick two-note rising confirm
  // (A4 → E5) with a soft shimmer tail; same voice family as the terminal
  // arpeggio but shorter and brighter so it reads as "ready".
  public playBattleLink(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime

    const notes = [440, 660]
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.09)
      gain.gain.setValueAtTime(0.0, now + idx * 0.09)
      gain.gain.linearRampToValueAtTime(0.16, now + idx * 0.09 + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.4)
      osc.connect(gain)
      gain.connect(this.masterGain)
      osc.start(now + idx * 0.09)
      osc.stop(now + idx * 0.09 + 0.42)
    })
  }

  // One-shot: Electric shield spark on wall collision (rate-limited so a
  // wall grind cannot machine-gun the ears)
  public playWallImpact(speed: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime
    if (now - this.lastWallHitAt < 0.09) return
    this.lastWallHitAt = now

    const intensity = Math.min(1.0, Math.max(0.2, speed / 20.0))

    // Short resonant zap
    const osc = this.ctx.createOscillator()
    const filter = this.ctx.createBiquadFilter()
    const gain = this.ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(280, now)
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.15)

    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(800, now)
    filter.Q.setValueAtTime(2.2, now)

    gain.gain.setValueAtTime(0.2 * intensity, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.masterGain)

    osc.start(now)
    osc.stop(now + 0.17)

    // Physical body thump under the electric zap (a real impact has mass)
    if (this.noiseBuffer) {
      const thumpSrc = this.ctx.createBufferSource()
      thumpSrc.buffer = this.noiseBuffer
      const thumpFilter = this.ctx.createBiquadFilter()
      thumpFilter.type = 'lowpass'
      thumpFilter.frequency.setValueAtTime(220, now)
      const thumpGain = this.ctx.createGain()
      thumpGain.gain.setValueAtTime(0.3 * intensity, now)
      thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

      thumpSrc.connect(thumpFilter)
      thumpFilter.connect(thumpGain)
      thumpGain.connect(this.masterGain)

      thumpSrc.start(now)
      thumpSrc.stop(now + 0.13)
    }
  }

  // One-shot: Subtle sonar/radar ping on approaching station
  public playProximityPing(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(1046, now) // C6

    gain.gain.setValueAtTime(0.0, now)
    gain.gain.linearRampToValueAtTime(0.08, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

    osc.connect(gain)
    gain.connect(this.masterGain)

    osc.start(now)
    osc.stop(now + 0.23)
  }

  // One-shot: Grid Battle — booster pickup, rising energy blip
  public playBoosterPickup(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime

    const freqs = [880, 1318]
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.07)

      gain.gain.setValueAtTime(0.0, now + idx * 0.07)
      gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.07 + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.28)

      osc.connect(gain)
      gain.connect(this.masterGain)

      osc.start(now + idx * 0.07)
      osc.stop(now + idx * 0.07 + 0.29)
    })
  }

  // One-shot: Grid Battle countdown tick (final tick is higher and longer)
  public playCountdownBeep(final: boolean): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(final ? 1174 : 740, now)

    gain.gain.setValueAtTime(0.0, now)
    gain.gain.linearRampToValueAtTime(final ? 0.22 : 0.14, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + (final ? 0.5 : 0.16))

    osc.connect(gain)
    gain.connect(this.masterGain)

    osc.start(now)
    osc.stop(now + (final ? 0.51 : 0.17))
  }

  // One-shot: Grid Battle — light cycle derezzes into a trail wall
  public playCrash(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime

    // Heavy body thump
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      const filter = this.ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(300, now)
      filter.frequency.exponentialRampToValueAtTime(60, now + 0.5)
      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0.42, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
      src.connect(filter)
      filter.connect(gain)
      gain.connect(this.masterGain)
      src.start(now)
      src.stop(now + 0.56)
    }

    // Derez zap — descending electric tail
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(420, now)
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.45)
    gain.gain.setValueAtTime(0.16, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48)
    osc.connect(gain)
    gain.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.49)
  }

  // One-shot: Grid Battle victory — ascending crystalline fanfare
  public playVictory(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime
    const notes = [587, 740, 880, 1174, 1480]
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.09)
      gain.gain.setValueAtTime(0.0, now + idx * 0.09)
      gain.gain.linearRampToValueAtTime(
        idx === notes.length - 1 ? 0.22 : 0.14,
        now + idx * 0.09 + 0.014,
      )
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        now + idx * 0.09 + (idx === notes.length - 1 ? 0.7 : 0.3),
      )
      osc.connect(gain)
      gain.connect(this.masterGain)
      osc.start(now + idx * 0.09)
      osc.stop(now + idx * 0.09 + 0.72)
    })
  }

  // One-shot: Grid Battle defeat — short descending slide
  public playDefeat(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime
    const notes = [554, 415, 311]
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + idx * 0.16)
      gain.gain.setValueAtTime(0.0, now + idx * 0.16)
      gain.gain.linearRampToValueAtTime(0.16, now + idx * 0.16 + 0.014)
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.45)
      osc.connect(gain)
      gain.connect(this.masterGain)
      osc.start(now + idx * 0.16)
      osc.stop(now + idx * 0.16 + 0.46)
    })
  }

  // One-shot: Neon tube ignition when the cast portrait lights up —
  // irregular ignition blips, buzzing mains hum with 30Hz tremolo,
  // settling into a bright "tube lit" tone
  public playNeonFlicker(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return
    const now = this.ctx.currentTime

    // 1) Irregular ignition blips — the tube striking, brighter & musical
    const flicks = [
      { at: 0.0, freq: 1244.5, gain: 0.15 },
      { at: 0.05, freq: 1568.0, gain: 0.2 },
      { at: 0.085, freq: 2093.0, gain: 0.16 },
    ]
    for (const f of flicks) {
      const t = now + f.at
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f.freq, t)
      osc.frequency.exponentialRampToValueAtTime(f.freq * 0.72, t + 0.04)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(f.gain, t + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.045)
      osc.connect(gain)
      gain.connect(this.masterGain)
      osc.start(t)
      osc.stop(t + 0.05)
    }

    // 2) Buzzing tube: mains hum (110 + 220 Hz) with 30 Hz amplitude tremolo
    const buzzGain = this.ctx.createGain()
    buzzGain.gain.setValueAtTime(0, now)
    buzzGain.gain.linearRampToValueAtTime(0.12, now + 0.02)
    buzzGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)
    buzzGain.connect(this.masterGain)
    for (const [freq, g] of [
      [110, 0.7],
      [220, 0.4],
    ] as const) {
      const osc = this.ctx.createOscillator()
      const oscGain = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      oscGain.gain.value = g
      osc.connect(oscGain)
      oscGain.connect(buzzGain)
      osc.start(now)
      osc.stop(now + 0.3)
    }
    const lfo = this.ctx.createOscillator()
    const lfoDepth = this.ctx.createGain()
    lfo.frequency.value = 30
    lfoDepth.gain.value = 0.05
    lfo.connect(lfoDepth)
    lfoDepth.connect(buzzGain.gain)
    lfo.start(now)
    lfo.stop(now + 0.3)

    // 3) Settle: the tube holds — a bright tone fading (~0.9s)
    const lit = this.ctx.createOscillator()
    const litGain = this.ctx.createGain()
    lit.type = 'sine'
    lit.frequency.value = 1046 // C6 — matches the site's proximity ping
    litGain.gain.setValueAtTime(0, now + 0.1)
    litGain.gain.linearRampToValueAtTime(0.14, now + 0.13)
    litGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0)
    lit.connect(litGain)
    litGain.connect(this.masterGain)
    lit.start(now + 0.1)
    lit.stop(now + 1.0)
  }

  // Stop continuous sounds (when unmounting, blurred, or mode switched)
  public stopContinuous(): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, now, 0.04)
    if (this.motorWhineGain) this.motorWhineGain.gain.setTargetAtTime(0, now, 0.04)
    if (this.windGain) this.windGain.gain.setTargetAtTime(0, now, 0.04)
    if (this.boostGain) this.boostGain.gain.setTargetAtTime(0, now, 0.04)
    if (this.driftGain) this.driftGain.gain.setTargetAtTime(0, now, 0.04)
    this.silenceFoe(now)
  }

  private silenceFoe(now: number): void {
    this.foeEngineGain?.gain.setTargetAtTime(0, now, 0.04)
    this.foeWhineGain?.gain.setTargetAtTime(0, now, 0.04)
    this.foeBoostGain?.gain.setTargetAtTime(0, now, 0.04)
    this.foeDriftGain?.gain.setTargetAtTime(0, now, 0.04)
  }

  // Mute toggle
  public setMuted(muted: boolean): void {
    this.isMuted = muted
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0.0 : 0.85, this.ctx.currentTime)
    }
    try {
      localStorage.setItem('grid-sound-muted', String(muted))
    } catch {
      // ignore
    }
  }

  public getMuted(): boolean {
    return this.isMuted
  }
}

export const soundEngine = new SoundEngine()
