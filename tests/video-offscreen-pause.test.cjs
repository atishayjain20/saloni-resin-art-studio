const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

function video(paused) {
  return { paused, pauses: 0, plays: 0, pause() { this.paused = true; this.pauses += 1; }, play() { this.plays += 1; } };
}

function run(videos, withObserver) {
  const observers = [];
  class IntersectionObserverMock {
    constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
    observe(element) { this.targets.push(element); }
    unobserve() {}
    disconnect() {}
  }
  let ready;
  const documentObject = {
    documentElement: { classList: { add() {} } },
    body: {},
    addEventListener(type, listener) { if (type === "DOMContentLoaded") ready = listener; },
    querySelectorAll(selector) { return selector === ".section-reel video" ? videos : []; },
    querySelector() { return null; },
    getElementById() { return null; },
  };
  const windowObject = { matchMedia: () => ({ matches: false }), addEventListener() {}, location: null };
  if (withObserver) windowObject.IntersectionObserver = IntersectionObserverMock;
  const context = { console, document: documentObject, window: windowObject, IntersectionObserver: IntersectionObserverMock, Date, Math };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "script.js" });
  ready();
  return observers.find((observer) => videos.length && observer.targets.includes(videos[0]));
}

test("a playing section video pauses once it scrolls off screen, up or down", () => {
  const playing = video(false);
  const idle = video(true);
  const observer = run([playing, idle], true);
  assert.ok(observer, "every section video is watched");
  assert.deepEqual(observer.targets, [playing, idle]);
  observer.callback([{ target: playing, isIntersecting: false }, { target: idle, isIntersecting: false }]);
  assert.equal(playing.paused, true);
  assert.equal(playing.pauses, 1);
  assert.equal(idle.pauses, 0, "an already paused video is left alone");
});

test("a section video does not start again by itself when it scrolls back", () => {
  const clip = video(true);
  const observer = run([clip], true);
  observer.callback([{ target: clip, isIntersecting: true }]);
  assert.equal(clip.plays, 0);
  assert.equal(clip.pauses, 0);
});

test("older browsers without IntersectionObserver still load the page", () => {
  const clip = video(false);
  assert.equal(run([clip], false), undefined);
  assert.equal(clip.pauses, 0);
});
