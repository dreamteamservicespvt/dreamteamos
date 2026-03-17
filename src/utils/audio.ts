export const playNotificationSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
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
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
