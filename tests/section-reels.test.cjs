const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function sectionMarkup(id) {
  const start = html.indexOf(`<section class="work-section`, html.indexOf(`id="${id}"`) - 200);
  const end = html.indexOf("</section>", start);
  assert.ok(start !== -1 && end > start, `section ${id} exists`);
  return html.slice(start, end);
}

const reels = [
  { section: "marriage-gifts", file: "reel-varmala-couple", slug: "varmala-keepsake-frame" },
  { section: "studio-art", file: "reel-custom-clock", slug: "teal-and-gold-roman-resin-clock" },
];

test("the page has exactly the two section videos", () => {
  assert.equal((html.match(/<video\b/g) || []).length, 2);
});

for (const reel of reels) {
  test(`${reel.section} shows its video between the heading and the cards`, () => {
    const markup = sectionMarkup(reel.section);
    const figure = markup.indexOf("data-section-reel");
    assert.ok(figure > markup.indexOf("</h2>"), "after the section heading");
    assert.ok(figure < markup.indexOf('class="catalogue-grid"'), "before the cards");
    assert.equal((markup.match(/<video\b/g) || []).length, 1);
  });

  test(`${reel.section} video loads nothing until tapped and never plays by itself`, () => {
    const video = sectionMarkup(reel.section).match(/<video\b[^>]*>/)[0];
    for (const attribute of ["controls", "muted", "playsinline", 'preload="none"', 'width="360"', 'height="640"']) {
      assert.ok(video.includes(attribute), `${attribute} is set`);
    }
    assert.ok(!/autoplay|loop/.test(video), "no autoplay or loop");
    assert.match(video, /aria-label="Video: [^"]{20,}"/);
    assert.ok(video.includes(`poster="assets/${reel.file}-poster.jpg"`));
    assert.ok(sectionMarkup(reel.section).includes(`<source src="assets/${reel.file}.mp4" type="video/mp4">`));
  });

  test(`${reel.section} video files are small enough for phones`, () => {
    const video = fs.statSync(path.join(root, "assets", `${reel.file}.mp4`)).size;
    const poster = fs.statSync(path.join(root, "assets", `${reel.file}-poster.jpg`)).size;
    assert.ok(video < 5 * 1024 * 1024, `video is ${video} bytes`);
    assert.ok(poster < 80 * 1024, `poster is ${poster} bytes`);
  });

  test(`${reel.section} video links to its product without an AI note`, () => {
    const markup = sectionMarkup(reel.section);
    const block = markup.slice(markup.indexOf("data-section-reel"), markup.indexOf('class="catalogue-grid"'));
    assert.doesNotMatch(block, /Illustrative video made with AI|Each piece is made by hand|section-reel-note/);
    assert.ok(block.includes(`href="?product=${reel.slug}#${reel.section}"`));
    assert.ok(html.includes(`data-product-slug="${reel.slug}"`), "the linked product exists");
  });
}

test("the video stays compact beside its text and can be hidden", () => {
  assert.match(css, /\.section-reel\s*\{[^}]*display:\s*flex/);
  assert.match(css, /^\[hidden\]\s*\{\s*display:\s*none\s*!important/m);
  assert.match(css, /\.section-reel video\s*\{[^}]*aspect-ratio:\s*9\s*\/\s*16/);
});
