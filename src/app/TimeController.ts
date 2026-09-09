/** The simulation clock: play/pause, speed, and jumping to an instant. */
import { dateToJD, jdToDate } from '../astro/time';
import { type Localised, t, tr } from '../i18n';

export interface SpeedPreset {
  label: Localised<string>;
  /** simulated seconds per real second */
  secondsPerSecond: number;
}

export const SPEED_PRESETS: SpeedPreset[] = [
  { label: { zh: '实时', en: 'Real time' }, secondsPerSecond: 1 },
  { label: { zh: '1 分钟/秒', en: '1 min/s' }, secondsPerSecond: 60 },
  { label: { zh: '10 分钟/秒', en: '10 min/s' }, secondsPerSecond: 600 },
  { label: { zh: '1 小时/秒', en: '1 hour/s' }, secondsPerSecond: 3600 },
  { label: { zh: '6 小时/秒', en: '6 hours/s' }, secondsPerSecond: 21600 },
  { label: { zh: '1 天/秒', en: '1 day/s' }, secondsPerSecond: 86400 },
  { label: { zh: '1 周/秒', en: '1 week/s' }, secondsPerSecond: 604800 },
  { label: { zh: '1 月/秒', en: '1 month/s' }, secondsPerSecond: 2592000 },
  { label: { zh: '1 年/秒', en: '1 year/s' }, secondsPerSecond: 31557600 },
  { label: { zh: '10 年/秒', en: '10 years/s' }, secondsPerSecond: 315576000 },
];

export class TimeController {
  /** current instant, Julian day in UT */
  jd: number;
  playing = true;
  /** index into SPEED_PRESETS */
  speedIndex = 5;
  /** -1 runs time backwards */
  direction: 1 | -1 = 1;

  constructor(date = new Date()) {
    this.jd = dateToJD(date);
  }

  get secondsPerSecond(): number {
    return SPEED_PRESETS[this.speedIndex].secondsPerSecond * this.direction;
  }

  get speedLabel(): string {
    const label = tr(SPEED_PRESETS[this.speedIndex].label);
    return this.direction < 0 ? t('time.reversed', { label }) : label;
  }

  get reversed(): boolean {
    return this.direction < 0;
  }

  /** Run time backwards, or forwards again. */
  toggleDirection(): void {
    this.direction = this.direction === 1 ? -1 : 1;
  }

  /** Advance by a real-time delta in seconds. */
  advance(realSeconds: number): void {
    if (!this.playing) return;
    this.jd += (realSeconds * this.secondsPerSecond) / 86400;
  }

  /** Step by a fixed number of days regardless of the play state. */
  step(days: number): void {
    this.jd += days;
  }

  setDate(date: Date): void {
    this.jd = dateToJD(date);
  }

  get date(): Date {
    return jdToDate(this.jd);
  }

  now(): void {
    this.jd = dateToJD(new Date());
  }

  faster(): void {
    this.speedIndex = Math.min(SPEED_PRESETS.length - 1, this.speedIndex + 1);
  }

  slower(): void {
    this.speedIndex = Math.max(0, this.speedIndex - 1);
  }

  toggle(): void {
    this.playing = !this.playing;
  }
}
