/**
 * Synthesizes text to speech using the Web Speech API.
 */
export function speak(text: string, enabled: boolean = true) {
  if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;

  // Cancel any active speech synthesis to prevent queue stacking
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  // Try to find a high quality English female voice (Zira, Samantha, etc.)
  const voices = window.speechSynthesis.getVoices();
  const enVoices = voices.filter((v) => v.lang.startsWith("en"));
  const femaleVoiceKeywords = [
    "zira",
    "samantha",
    "susan",
    "hazel",
    "susana",
    "victoria",
    "moira",
    "karen",
    "google us english",
  ];

  let selectedVoice = enVoices.find((v) => {
    const nameLower = v.name.toLowerCase();
    return femaleVoiceKeywords.some((keyword) => nameLower.includes(keyword));
  });

  // Fallback to any English voice
  if (!selectedVoice && enVoices.length > 0) {
    selectedVoice = enVoices[0];
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.rate = 1.05; // Slightly faster for responsiveness
  utterance.pitch = 1.05;

  window.speechSynthesis.speak(utterance);
}

/**
 * Stops any ongoing text-to-speech synthesis immediately.
 */
export function stopSpeaking() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Plays a synthesized camera shutter sound using Web Audio API.
 */
export function playShutterSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();

    // Simulate mechanical camera shutter:
    // Part 1: Fast white noise burst (friction of blades)
    const bufferSize = audioCtx.sampleRate * 0.08; // 80ms
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(2500, audioCtx.currentTime);

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.07);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);

    // Part 2: Quick sine click tone (shutter mechanism release)
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05);

    oscGain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);

    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    // Start both
    noise.start();
    osc.start();

    // Stop oscillator
    osc.stop(audioCtx.currentTime + 0.06);
  } catch (e) {
    console.warn("Failed to play synthesized shutter sound:", e);
  }
}
