import assert from "node:assert/strict";
import { test } from "node:test";

import { closedByLine } from "../apps/mobile/src/lib/access.ts";
import { isPlainRich, richToText, textToRich } from "../apps/mobile/src/lib/rich.ts";

test("rich text of paragraphs is typed as paragraphs, and goes back as them", () => {
  const html = "<p>Fresh mango, pressed &amp; chilled.</p><p>Line one<br>line two</p>";
  assert.equal(isPlainRich(html), true);
  assert.equal(richToText(html), "Fresh mango, pressed & chilled.\n\nLine one\nline two");
  assert.equal(textToRich(richToText(html)), html);
});

test("what is typed is escaped, and empty paragraphs are left out", () => {
  assert.equal(textToRich("a < b & c\n\n\n\n  \n\nnext"), "<p>a &lt; b &amp; c</p><p>next</p>");
  assert.equal(textToRich("   \n\n "), "");
  assert.equal(textToRich("one\r\ntwo"), "<p>one<br>two</p>");
});

test("formatting the phone can't edit is told apart, and dropped only when asked", () => {
  assert.equal(isPlainRich("<p>Plain</p>"), true);
  assert.equal(isPlainRich("Just text"), true);
  assert.equal(isPlainRich("<p><strong>Bold</strong></p>"), false);
  assert.equal(isPlainRich('<p class="x">Styled</p>'), false);
  assert.equal(isPlainRich('<p>See <a href="https://example.com">this</a></p>'), false);
  assert.equal(richToText("<h2>Title</h2><ul><li>One</li><li>Two</li></ul>"), "Title\n\nOne\n\nTwo");
});

test("who closed an account, in words", () => {
  assert.equal(closedByLine({ closedBy: "self", closedByName: null }), "by themselves");
  assert.equal(closedByLine({ closedBy: "admin", closedByName: "Amara" }), "by Amara");
  assert.equal(closedByLine({ closedBy: "admin", closedByName: null }), "by an administrator");
  assert.equal(closedByLine({ closedBy: null, closedByName: null }), "");
});
