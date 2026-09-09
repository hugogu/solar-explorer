import { describe, expect, it } from 'vitest';
import { TimeController } from '../src/app/TimeController';
import { setLanguage } from '../src/i18n';
import { utcToJD } from '../src/astro/time';

describe('time control', () => {
  it('runs backwards when reversed', () => {
    const time = new TimeController(new Date(Date.UTC(2026, 8, 8)));
    const start = time.jd;
    time.playing = true;
    time.speedIndex = 5; // one day per second

    time.advance(1);
    expect(time.jd - start).toBeCloseTo(1, 6);

    time.toggleDirection();
    expect(time.reversed).toBe(true);
    time.advance(1);
    expect(time.jd - start).toBeCloseTo(0, 6);

    // Two more seconds carry it a day into the past.
    time.advance(1);
    expect(time.jd - start).toBeCloseTo(-1, 6);
  });

  it('keeps reversing symmetric, so time returns to where it started', () => {
    const time = new TimeController(new Date(Date.UTC(2030, 0, 1)));
    const start = time.jd;
    time.playing = true;
    for (let i = 0; i < 30; i++) time.advance(0.1);
    time.toggleDirection();
    for (let i = 0; i < 30; i++) time.advance(0.1);
    expect(time.jd).toBeCloseTo(start, 9);
    time.toggleDirection();
    expect(time.reversed).toBe(false);
  });

  it('labels the direction in either language', () => {
    for (const [lang, marker] of [['zh', '倒放'], ['en', 'reversed']] as const) {
      setLanguage(lang);
      const time = new TimeController();
      expect(time.speedLabel, lang).not.toContain(marker);
      time.toggleDirection();
      expect(time.speedLabel, lang).toContain(marker);
    }
  });

  it('leaves stepping and jumping unaffected by direction', () => {
    const time = new TimeController(new Date(Date.UTC(2026, 8, 8)));
    time.toggleDirection();
    const before = time.jd;
    time.step(2);
    expect(time.jd - before).toBeCloseTo(2, 9);
    time.setDate(new Date(Date.UTC(2027, 0, 1)));
    expect(time.jd).toBeCloseTo(utcToJD(2027, 1, 1), 9);
  });

  it('does not move while paused, in either direction', () => {
    const time = new TimeController();
    time.playing = false;
    const start = time.jd;
    time.advance(5);
    time.toggleDirection();
    time.advance(5);
    expect(time.jd).toBe(start);
  });
});
