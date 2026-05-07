import logger from '../lib/logger';

let audioCtx: AudioContext | null = null;

export function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

// Resume AudioContext if suspended, then run callback
function withCtx(fn: (ctx: AudioContext) => void) {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => fn(ctx)).catch(() => {});
  } else {
    fn(ctx);
  }
}

export function playNotificationSound() {
  withCtx(ctx => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.setValueAtTime(800, now + 0.08);
      osc.frequency.setValueAtTime(600, now + 0.16);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.14);
      gain.gain.linearRampToValueAtTime(0, now + 0.25);
      osc.start(now); osc.stop(now + 0.25);
    } catch (e) { logger.log('Audio error:', e); }
  });
}

export function playChatSound() {
  withCtx(ctx => {
    try {
      const now = ctx.currentTime;
      // Doble tono suave ascendente — distinto a notificaciones de tickets
      [0, 0.12].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(i === 0 ? 880 : 1046, now + offset);
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.09, now + offset + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + offset + 0.11);
        osc.start(now + offset); osc.stop(now + offset + 0.13);
      });
    } catch (e) { logger.log('Audio error:', e); }
  });
}

export function playMentionSound() {
  withCtx(ctx => {
    try {
      const now = ctx.currentTime;
      // Triple ping ascendente — urgente, para menciones directas
      [0, 0.1, 0.2].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime([880, 1046, 1318][i], now + offset);
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + offset + 0.09);
        osc.start(now + offset); osc.stop(now + offset + 0.1);
      });
    } catch (e) { logger.log('Audio error:', e); }
  });
}

export function playResolvedSound() {
  withCtx(ctx => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.3);
      gain.gain.linearRampToValueAtTime(0, now + 0.4);
      osc.start(now); osc.stop(now + 0.4);
    } catch (e) { logger.log('Audio error:', e); }
  });
}