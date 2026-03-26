// Use a shared AudioContext so it can resume after first interaction
let sharedAudioCtx: AudioContext | null = null;
const getAudioContext = () => {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
};

export const playNotificationSound = () => {
  try {
    const audioCtx = getAudioContext();
    
    // Quick energetic, upbeat major arpeggio
    const notes = [
      { freq: 523.25, time: 0 },    // C5
      { freq: 659.25, time: 0.08 }, // E5
      { freq: 783.99, time: 0.16 }, // G5
      { freq: 1046.50, time: 0.24 } // C6
    ];

    notes.forEach(note => {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'triangle'; // triangle gives a bit more punch than sine
      oscillator.frequency.setValueAtTime(note.freq, audioCtx.currentTime + note.time);
      
      // Fast attack and decay for that upbeat pop
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime + note.time);
      gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + note.time + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + note.time + 0.2);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start(audioCtx.currentTime + note.time);
      oscillator.stop(audioCtx.currentTime + note.time + 0.2);
    });
  } catch (err) {
    console.error("Audio playback failed", err);
  }
};

export const playClickSound = () => {
  try {
    const audioCtx = getAudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch (err) {
    console.error("Audio playback failed", err);
  }
};

/** Short soft blip for incoming chat messages */
export const playChatMessageSound = () => {
  try {
    const audioCtx = getAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (err) {
    console.error("Audio playback failed", err);
  }
};

/** Repeating ring pattern for incoming video calls */
let _ringtoneInterval: ReturnType<typeof setInterval> | null = null;

const _playRingOnce = () => {
  try {
    const audioCtx = getAudioContext();
    [0, 0.18].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime + offset);
      gain.gain.setValueAtTime(0, audioCtx.currentTime + offset);
      gain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + offset + 0.02);
      gain.gain.setValueAtTime(0.18, audioCtx.currentTime + offset + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + offset + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + offset);
      osc.stop(audioCtx.currentTime + offset + 0.15);
    });
  } catch (err) {
    console.error("Ringtone playback failed", err);
  }
};

export const startRingtone = () => {
  stopRingtone();
  _playRingOnce();
  _ringtoneInterval = setInterval(_playRingOnce, 2000);
};

export const stopRingtone = () => {
  if (_ringtoneInterval !== null) {
    clearInterval(_ringtoneInterval);
    _ringtoneInterval = null;
  }
};

/** Outgoing call ring-back tone */
let _ringbackInterval: ReturnType<typeof setInterval> | null = null;

const _playRingbackOnce = () => {
  try {
    const audioCtx = getAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.02);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime + 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.0);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 1.0);
  } catch (err) {
    console.error("Ringback playback failed", err);
  }
};

export const startRingback = () => {
  stopRingback();
  _playRingbackOnce();
  _ringbackInterval = setInterval(_playRingbackOnce, 3000);
};

export const stopRingback = () => {
  if (_ringbackInterval !== null) {
    clearInterval(_ringbackInterval);
    _ringbackInterval = null;
  }
};
