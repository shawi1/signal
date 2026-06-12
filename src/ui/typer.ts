// typer.ts — terminal typewriter effect with a blinking cursor.

export class Typer {
  private el: HTMLElement;
  private full = "";
  private shown = 0;
  private timer = 0;
  private speed: number;
  private cursor: HTMLElement;
  private done = true;

  constructor(el: HTMLElement, speed = 22) {
    this.el = el;
    this.speed = speed;
    this.cursor = document.createElement("span");
    this.cursor.className = "cursor";
    this.cursor.textContent = " ";
  }

  /** Begin typing `text`. Resets any in-progress typing. */
  type(text: string): void {
    this.full = text;
    this.shown = 0;
    this.done = false;
    this.render();
    if (this.timer) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.step(), this.speed);
  }

  /** Instantly finish the current line. */
  skip(): void {
    this.shown = this.full.length;
    this.done = true;
    if (this.timer) { window.clearInterval(this.timer); this.timer = 0; }
    this.render();
  }

  isDone(): boolean { return this.done; }

  private step(): void {
    this.shown++;
    if (this.shown >= this.full.length) {
      this.shown = this.full.length;
      this.done = true;
      window.clearInterval(this.timer);
      this.timer = 0;
    }
    this.render();
  }

  private render(): void {
    this.el.textContent = this.full.slice(0, this.shown);
    this.el.appendChild(this.cursor);
  }
}
