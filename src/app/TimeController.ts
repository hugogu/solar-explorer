/** The simulation clock: play/pause, speed, and jumping to an instant. */
import { dateToJD, jdToDate } from '../astro/time';

export interface SpeedPreset {
  label: string;
  /** simulated seconds per real second */
  secondsPerSecond: number;
}

export const SPEED_PRESETS: SpeedPreset[] = [
  { label: '实时', secondsPerSecond: 1 },
  { label: '1 分钟/秒', secondsPerSecond: 60 },
  { label: '10 分钟/秒', secondsPerSecond: 600 },
  { label: '1 小时/秒', secondsPerSecond: 3600 },
  { label: '6 小时/秒', secondsPerSecond: 21600 },
  { label: '1 天/秒', secondsPerSecond: 86400 },
  { label: '1 周/秒', secondsPerSecond: 604800 },
  { label: '1 月/秒', secondsPerSecond: 2592000 },
  { label: '1 年/秒', secondsPerSecond: 31557600 },
  { label: '10 年/秒', secondsPerSecond: 315576000 },
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
    const label = SPEED_PRESETS[this.speedIndex].label;
    return this.direction < 0 ? `倒放 ${label}` : label;
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
