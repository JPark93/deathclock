/**
 * DeathClockAudio — Procedural ambient audio engine for the Death Clock web app.
 *
 * Uses the Web Audio API to synthesize:
 *   - Ambient drone (sawtooth + square + sub-bass) with LFO breathing
 *   - Brown noise floor (campfire rumble)
 *   - Campfire crackle bursts (random filtered noise)
 *   - Sparse ambient melody (A minor pentatonic, reverbed)
 *
 * All audio is generated procedurally — no external assets needed.
 * Complies with browser autoplay policies by deferring AudioContext creation
 * until the first user interaction (click or keydown).
 *
 * Loaded as a regular <script> tag. Exposes window.DeathClockAudio.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DeathClockAudio = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    // ---------------------------------------------------------------------------
    // Feature detection — if no Web Audio API, return a silent no-op facade.
    // ---------------------------------------------------------------------------
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
        return {
            init: function () {},
            start: function () {},
            stop: function () {},
            toggle: function () {},
            playImpact: function () {},
            isPlaying: false
        };
    }

    // ===========================================================================
    //  Constants & Configuration
    // ===========================================================================

    var MASTER_TARGET_GAIN = 0.4;          // Target volume for master gain
    var FADE_DURATION = 0.5;               // Seconds for smooth fade in/out
    var DRONE_LOWPASS_FREQ = 200;          // Hz — lowpass on the drone
    var LFO_RATE = 0.1;                    // Hz — breathing modulation rate
    var LFO_DEPTH = 120;                   // Hz — how far the filter sweeps
    var BROWN_NOISE_LOWPASS = 250;         // Hz — campfire rumble cutoff
    var CRACKLE_BANDPASS_MIN = 2500;       // Hz — crackle bandpass centre (min)
    var CRACKLE_BANDPASS_MAX = 4000;       // Hz — crackle bandpass centre (max)
    var CRACKLE_BURST_MIN_MS = 20;         // ms — shortest crackle burst
    var CRACKLE_BURST_MAX_MS = 50;         // ms — longest crackle burst
    var CRACKLE_GAIN_MIN = 0.05;           // min gain per crackle
    var CRACKLE_GAIN_MAX = 0.15;           // max gain per crackle
    var CRACKLE_AVERAGE_PER_SEC = 8;       // Poisson rate for crackle bursts
    var MELODY_GAIN_MIN = 0.03;            // min melody note gain
    var MELODY_GAIN_MAX = 0.06;            // max melody note gain
    var MELODY_INTERVAL_MIN = 3000;        // ms — min time between notes
    var MELODY_INTERVAL_MAX = 8000;        // ms — max time between notes
    var IMPULSE_RESPONSE_DURATION = 2.0;   // seconds — reverb tail length
    var IMPULSE_RESPONSE_DECAY = 2.5;      // exponential decay rate

    // A minor pentatonic scale, octaves 3-4 (MIDI note numbers)
    // A3=57, C4=60, D4=62, E4=64, G4=67, A4=69, C5=72, D5=74, E5=76, G5=79
    var MELODY_NOTES = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79];

    // ===========================================================================
    //  Utility helpers
    // ===========================================================================

    /** Random float in [min, max) */
    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    /** Random integer in [min, max] (both inclusive) */
    function randInt(min, max) {
        return Math.floor(rand(min, max + 1));
    }

    /** MIDI note number → frequency in Hz */
    function midiToFreq(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    /** Sample rate (needs live AudioContext; called after init) */
    function getSampleRate() {
        return engine._audioCtx.sampleRate;
    }

    // ===========================================================================
    //  Noise buffer generation
    // ===========================================================================

    /** Create an AudioBuffer filled with white noise (length in seconds) */
    function createNoiseBuffer(ctx, duration) {
        var length = Math.ceil(ctx.sampleRate * duration);
        var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;   // uniform in [-1, 1]
        }
        return buffer;
    }

    // ===========================================================================
    //  Impulse response generator (for ConvolverNode reverb)
    // ===========================================================================

    /**
     * Generate a simple exponential-decay impulse response for reverb.
     * Returns a stereo AudioBuffer.
     */
    function createImpulseResponse(ctx) {
        var length = Math.ceil(ctx.sampleRate * IMPULSE_RESPONSE_DURATION);
        var buffer = ctx.createBuffer(2, length, ctx.sampleRate);
        for (var ch = 0; ch < 2; ch++) {
            var data = buffer.getChannelData(ch);
            for (var i = 0; i < length; i++) {
                // Exponential decay with random noise
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate / IMPULSE_RESPONSE_DECAY));
            }
        }
        return buffer;
    }

    // ===========================================================================
    //  Engine — internal state and graph construction
    // ===========================================================================

    var engine = {
        _audioCtx: null,
        _masterGain: null,
        _isPlaying: false,
        _initialized: false,

        // Crackle scheduling
        _crackleTimeout: null,
        _crackleSource: null,
        _crackleGainNode: null,
        _crackleBandpass: null,
        _noiseBuffer: null,

        // Melody scheduling
        _melodyTimeout: null,
        _convolver: null,
        _melodyGainNode: null,

        // Drone oscillators
        _droneSawtooth: null,
        _droneSquare: null,
        _droneSub: null,
        _droneLFO: null,
        _droneLowpass: null,
        _droneGain: null,

        // Brown noise
        _brownSource: null,
        _brownLowpass: null,
        _brownGain: null,

        // Reference to init listeners so we can remove them
        _clickListener: null,
        _keydownListener: null,

        // -----------------------------------------------------------------------
        //  Public API
        // -----------------------------------------------------------------------

        /**
         * Initialise the audio engine. Should be called on first user interaction
         * (click or keydown). After init, start() can be called immediately.
         */
        init: function () {
            if (this._initialized) return;
            this._initialized = true;

            // Remove the one-shot init listeners
            document.removeEventListener('click', this._clickListener);
            document.removeEventListener('keydown', this._keydownListener);

            // Create AudioContext (must happen inside user gesture)
            this._audioCtx = new AudioCtx();

            // Build the entire audio graph
            this._buildGraph();

            // Attach start listeners — after init, start() can be called from code
            // but we also keep click/keydown as convenience triggers
            this._startOnInteraction();
        },

        /** Start playing audio (smooth fade-in) */
        start: function () {
            if (!this._initialized) this.init();
            if (!this._audioCtx) return;

            // Resume context if it was suspended (autoplay policy)
            if (this._audioCtx.state === 'suspended') {
                this._audioCtx.resume();
            }

            if (this._isPlaying) return;
            this._isPlaying = true;

            // Smoothly ramp master gain up
            var now = this._audioCtx.currentTime;
            this._masterGain.gain.cancelScheduledValues(now);
            this._masterGain.gain.setValueAtTime(0, now);
            this._masterGain.gain.linearRampToValueAtTime(MASTER_TARGET_GAIN, now + FADE_DURATION);

            // Start all sources
            this._startDrone();
            this._startBrownNoise();
            this._startCrackle();
            this._startMelody();
        },

        /** Stop playing audio (smooth fade-out) */
        stop: function () {
            if (!this._isPlaying) return;
            this._isPlaying = false;

            var now = this._audioCtx.currentTime;
            this._masterGain.gain.cancelScheduledValues(now);
            this._masterGain.gain.setValueAtTime(this._masterGain.gain.value, now);
            this._masterGain.gain.linearRampToValueAtTime(0, now + FADE_DURATION);

            // Stop all sources after fade completes
            this._stopDrone();
            this._stopBrownNoise();
            this._stopCrackle();
            this._stopMelody();
        },

        /** Toggle playing state */
        toggle: function () {
            if (this._isPlaying) {
                this.stop();
            } else {
                this.start();
            }
        },

        /** Play a short, low impact when a countdown card lands. */
        playImpact: function () {
            if (!this._isPlaying || !this._audioCtx) return;

            var ctx = this._audioCtx;
            var now = ctx.currentTime;
            var oscillator = ctx.createOscillator();
            var impactGain = ctx.createGain();
            var impactFilter = ctx.createBiquadFilter();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(92, now);
            oscillator.frequency.exponentialRampToValueAtTime(42, now + 0.16);

            impactFilter.type = 'lowpass';
            impactFilter.frequency.setValueAtTime(190, now);
            impactFilter.Q.setValueAtTime(1.2, now);

            impactGain.gain.setValueAtTime(0.16, now);
            impactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

            oscillator.connect(impactFilter);
            impactFilter.connect(impactGain);
            impactGain.connect(this._masterGain);
            oscillator.start(now);
            oscillator.stop(now + 0.21);
        },

        /** Whether audio is currently playing */
        get isPlaying() {
            return this._isPlaying;
        },

        // -----------------------------------------------------------------------
        //  Audio graph construction
        // -----------------------------------------------------------------------

        _buildGraph: function () {
            var ctx = this._audioCtx;
            var now = ctx.currentTime;

            // --- Master gain ---
            this._masterGain = ctx.createGain();
            this._masterGain.gain.setValueAtTime(0, now);
            this._masterGain.connect(ctx.destination);

            // --- Drone: lowpass filter (LFO-modulated) ---
            this._droneLowpass = ctx.createBiquadFilter();
            this._droneLowpass.type = 'lowpass';
            this._droneLowpass.frequency.setValueAtTime(DRONE_LOWPASS_FREQ, now);
            this._droneLowpass.Q.setValueAtTime(1, now);
            this._droneLowpass.connect(this._masterGain);

            // --- Drone: LFO (breathing effect on lowpass) ---
            this._droneLFO = ctx.createOscillator();
            this._droneLFO.type = 'sine';
            this._droneLFO.frequency.setValueAtTime(LFO_RATE, now);
            var lfoGain = ctx.createGain();
            lfoGain.gain.setValueAtTime(LFO_DEPTH, now);
            this._droneLFO.connect(lfoGain);
            lfoGain.connect(this._droneLowpass.frequency);

            // --- Drone gain (individual mix) ---
            this._droneGain = ctx.createGain();
            this._droneGain.gain.setValueAtTime(0.15, now);
            this._droneGain.connect(this._droneLowpass);

            // --- Drone oscillators ---
            // Sawtooth at A1 (~55 Hz)
            this._droneSawtooth = ctx.createOscillator();
            this._droneSawtooth.type = 'sawtooth';
            this._droneSawtooth.frequency.setValueAtTime(55, now);
            this._droneSawtooth.connect(this._droneGain);

            // Detuned square at A2 (~110 Hz, slightly sharp for richness)
            this._droneSquare = ctx.createOscillator();
            this._droneSquare.type = 'square';
            this._droneSquare.frequency.setValueAtTime(110.3, now);  // slight detune
            var squareGain = ctx.createGain();
            squareGain.gain.setValueAtTime(0.08, now);
            this._droneSquare.connect(squareGain);
            squareGain.connect(this._droneGain);

            // Sub-bass sine at A0 (~27.5 Hz)
            this._droneSub = ctx.createOscillator();
            this._droneSub.type = 'sine';
            this._droneSub.frequency.setValueAtTime(27.5, now);
            var subGain = ctx.createGain();
            subGain.gain.setValueAtTime(0.25, now);
            this._droneSub.connect(subGain);
            subGain.connect(this._droneGain);

            // --- Brown noise floor (campfire rumble) ---
            this._brownLowpass = ctx.createBiquadFilter();
            this._brownLowpass.type = 'lowpass';
            this._brownLowpass.frequency.setValueAtTime(BROWN_NOISE_LOWPASS, now);
            this._brownLowpass.Q.setValueAtTime(0.5, now);
            this._brownLowpass.connect(this._masterGain);

            this._brownGain = ctx.createGain();
            this._brownGain.gain.setValueAtTime(0.12, now);
            this._brownGain.connect(this._brownLowpass);

            // --- Campfire crackle ---
            this._crackleBandpass = ctx.createBiquadFilter();
            this._crackleBandpass.type = 'bandpass';
            this._crackleBandpass.frequency.setValueAtTime(3250, now);  // centre
            this._crackleBandpass.Q.setValueAtTime(1.5, now);
            this._crackleBandpass.connect(this._masterGain);

            this._crackleGainNode = ctx.createGain();
            this._crackleGainNode.gain.setValueAtTime(0, now);
            this._crackleGainNode.connect(this._crackleBandpass);

            // Shared noise buffer for crackle (looping white noise source)
            this._noiseBuffer = createNoiseBuffer(ctx, 2);

            // --- Melody: convolver (reverb) ---
            this._convolver = ctx.createConvolver();
            this._convolver.buffer = createImpulseResponse(ctx);
            this._convolver.connect(this._masterGain);

            this._melodyGainNode = ctx.createGain();
            this._melodyGainNode.gain.setValueAtTime(0, now);
            this._melodyGainNode.connect(this._convolver);
        },

        // -----------------------------------------------------------------------
        //  Drone control
        // -----------------------------------------------------------------------

        _startDrone: function () {
            var ctx = this._audioCtx;
            this._droneSawtooth.start(ctx.currentTime);
            this._droneSquare.start(ctx.currentTime);
            this._droneSub.start(ctx.currentTime);
            this._droneLFO.start(ctx.currentTime);
        },

        _stopDrone: function () {
            var stopTime = this._audioCtx.currentTime + FADE_DURATION + 0.05;
            try { this._droneSawtooth.stop(stopTime); } catch (e) {}
            try { this._droneSquare.stop(stopTime); } catch (e) {}
            try { this._droneSub.stop(stopTime); } catch (e) {}
            try { this._droneLFO.stop(stopTime); } catch (e) {}
        },

        // -----------------------------------------------------------------------
        //  Brown noise control (looping noise source through lowpass)
        // -----------------------------------------------------------------------

        _startBrownNoise: function () {
            var ctx = this._audioCtx;
            var source = ctx.createBufferSource();
            source.buffer = createNoiseBuffer(ctx, 4);   // 4-second buffer
            source.loop = true;
            source.connect(this._brownGain);
            source.start(ctx.currentTime);
            this._brownSource = source;
        },

        _stopBrownNoise: function () {
            var stopTime = this._audioCtx.currentTime + FADE_DURATION + 0.05;
            if (this._brownSource) {
                try { this._brownSource.stop(stopTime); } catch (e) {}
                this._brownSource = null;
            }
        },

        // -----------------------------------------------------------------------
        //  Crackle bursts
        // -----------------------------------------------------------------------

        /** Schedule the next crackle burst using Poisson-distributed intervals */
        _scheduleCrackle: function () {
            if (!this._isPlaying) return;

            var ctx = this._audioCtx;
            // Poisson interval: mean = 1/rate seconds → exponential distribution
            var meanMs = 1000 / CRACKLE_AVERAGE_PER_SEC;
            var delay = -Math.log(Math.random()) * meanMs;

            this._crackleTimeout = setTimeout(function () {
                if (!engine._isPlaying) return;
                engine._playCrackleBurst();
                engine._scheduleCrackle();
            }, delay);
        },

        /** Play a single crackle burst */
        _playCrackleBurst: function () {
            var ctx = this._audioCtx;
            var now = ctx.currentTime;
            var durationSec = rand(CRACKLE_BURST_MIN_MS, CRACKLE_BURST_MAX_MS) / 1000;
            var burstGain = rand(CRACKLE_GAIN_MIN, CRACKLE_GAIN_MAX);
            var centreFreq = rand(CRACKLE_BANDPASS_MIN, CRACKLE_BANDPASS_MAX);

            // Update bandpass centre frequency for variation
            this._crackleBandpass.frequency.setValueAtTime(centreFreq, now);

            // Create a short noise burst
            var source = ctx.createBufferSource();
            source.buffer = this._noiseBuffer;
            source.connect(this._crackleGainNode);

            // Envelope: sharp attack, quick decay
            this._crackleGainNode.gain.cancelScheduledValues(now);
            this._crackleGainNode.gain.setValueAtTime(0, now);
            this._crackleGainNode.gain.linearRampToValueAtTime(burstGain, now + 0.002);
            this._crackleGainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

            source.start(now);
            source.stop(now + durationSec + 0.01);
        },

        _startCrackle: function () {
            this._scheduleCrackle();
        },

        _stopCrackle: function () {
            if (this._crackleTimeout) {
                clearTimeout(this._crackleTimeout);
                this._crackleTimeout = null;
            }
        },

        // -----------------------------------------------------------------------
        //  Sparse ambient melody
        // -----------------------------------------------------------------------

        /** Schedule the next melody note */
        _scheduleMelody: function () {
            if (!this._isPlaying) return;

            var delay = rand(MELODY_INTERVAL_MIN, MELODY_INTERVAL_MAX);

            this._melodyTimeout = setTimeout(function () {
                if (!engine._isPlaying) return;
                engine._playMelodyNote();
                engine._scheduleMelody();
            }, delay);
        },

        /** Play a single melody note with ADSR envelope and reverb */
        _playMelodyNote: function () {
            var ctx = this._audioCtx;
            var now = ctx.currentTime;

            // Pick a random note from the A minor pentatonic scale
            var noteIndex = randInt(0, MELODY_NOTES.length - 1);
            var freq = midiToFreq(MELODY_NOTES[noteIndex]);
            var gain = rand(MELODY_GAIN_MIN, MELODY_GAIN_MAX);

            // Note duration (1-3 seconds, with reverb tail)
            var duration = rand(1.0, 3.0);

            // Create oscillator
            var osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            // ADSR envelope
            var env = ctx.createGain();
            var attack = 0.3;
            var decay = 0.5;
            var sustainLevel = gain * 0.6;
            var release = 0.8;

            env.gain.setValueAtTime(0, now);
            // Attack
            env.gain.linearRampToValueAtTime(gain, now + attack);
            // Decay to sustain
            env.gain.linearRampToValueAtTime(sustainLevel, now + attack + decay);
            // Release
            env.gain.linearRampToValueAtTime(0.0001, now + attack + decay + duration + release);

            osc.connect(env);
            env.connect(this._melodyGainNode);

            osc.start(now);
            osc.stop(now + attack + decay + duration + release + 0.1);
        },

        _startMelody: function () {
            this._scheduleMelody();
        },

        _stopMelody: function () {
            if (this._melodyTimeout) {
                clearTimeout(this._melodyTimeout);
                this._melodyTimeout = null;
            }
        },

        // -----------------------------------------------------------------------
        //  Interaction listeners
        // -----------------------------------------------------------------------

        /** One-shot listeners that trigger init() on first click or keydown */
        _startOnInteraction: function () {
            var self = this;
            this._clickListener = function () { self.init(); };
            this._keydownListener = function () { self.init(); };
            document.addEventListener('click', this._clickListener);
            document.addEventListener('keydown', this._keydownListener);
        }
    };

    // ===========================================================================
    //  Return public API
    // ===========================================================================
    return engine;
}));

// For convenience: expose on window as well (covered by UMD, but explicit)
if (typeof window !== 'undefined') {
    // Already set by the UMD wrapper; this is a safety net.
}
