var SCORES_API = "https://skeltonmod--33671d9ab63611f18d261607ee4eb77e.web.val.run";
var FAKE_SCORES = false;

var TOP_N = 8;
var NAME_MAX = 8;

var PANEL_TOP = 36,
  PANEL_BOTTOM = 140;
var PROMPT_TOP = 150,
  PROMPT_BOTTOM = 166;
var PAGE_HOLD = 300,
  SHUTTER = 10;

var CELL_W = 11,
  CELL_H = 13,
  CELL_PITCH = 12;
var ENTRY_LEFT = Math.floor((W - (NAME_MAX * CELL_PITCH - 1)) / 2);

var INK = 0xff2bff,
  INK_DIM = 0x8000a0,
  INK_LIT = 0xffffff;
var ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789.-!? ";

var leaderboard = null;
var runToken = null;
var submitState = "idle";
var submitRank = 0;

var nameEntry = false,
  entryChars = [],
  entryIndex = 0;
var repeatAxis = 0,
  repeatTimer = 0,
  confirmWasDown = false;
var touchWasActive = false,
  touchMoved = false;
var REPEAT_FIRST = 18,
  REPEAT_NEXT = 6;

var attractPage = 0,
  pageTimer = 0,
  wasAttract = false;

var FAKE = [
  { name: "deyji", score: 412 },
  { name: "kulkog", score: 388 },
  { name: "skelton", score: 301 },
  { name: "sajuuk", score: 277 },
];

function fetchLeaderboard() {
  if (FAKE_SCORES || !SCORES_API) {
    leaderboard = FAKE.slice(0, TOP_N);
    return;
  }
  fetch(SCORES_API + "/scores")
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      leaderboard = (d && d.top) || [];
    })
    .catch(function () {
      if (!leaderboard) leaderboard = [];
    });
}

function startRun() {
  runToken = null;
  if (FAKE_SCORES || !SCORES_API) return;
  fetch(SCORES_API + "/session", { method: "POST" })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (d && d.sid) runToken = d.sid;
    })
    .catch(function () {});
}

function scoreQualifies(s) {
  if (s < 1) return false;
  if (!leaderboard || leaderboard.length < TOP_N) return true;
  return s > leaderboard[leaderboard.length - 1].score;
}

function submitScore(name, s, w) {
  try {
    window.localStorage.setItem("lumcorr.name", name);
  } catch (e) {}
  submitState = "sending";

  if (FAKE_SCORES || !SCORES_API) {
    window.setTimeout(function () {
      var rank = 1,
        i;
      for (i = 0; i < FAKE.length; i++) if (FAKE[i].score > s) rank++;
      leaderboard = FAKE.concat([{ name: name, score: s }])
        .sort(function (a, b) {
          return b.score - a.score;
        })
        .slice(0, TOP_N);
      submitState = "done";
      submitRank = rank;
    }, 700);
    return;
  }

  if (!runToken) {
    submitState = "error";
    return;
  }
  fetch(SCORES_API + "/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sid: runToken, name: name, score: s, wave: w }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (d && d.ok) {
        submitState = "done";
        submitRank = d.rank || 0;
        if (d.top) leaderboard = d.top;
      } else {
        submitState = "error";
      }
    })
    .catch(function () {
      submitState = "error";
    })
    .then(function () {
      runToken = null;
    });
}

function beginNameEntry() {
  submitState = "idle";
  submitRank = 0;
  entryIndex = 0;
  repeatAxis = 0;
  repeatTimer = 0;
  confirmWasDown = true;
  touchWasActive = false;
  touchMoved = false;

  nameEntry = scoreQualifies(score);
  if (!nameEntry) return;

  var saved = "";
  try {
    saved = window.localStorage.getItem("lumcorr.name") || "";
  } catch (e) {}
  saved = saved
    .toLowerCase()
    .replace(/[^a-z0-9.!? -]/g, "")
    .slice(0, NAME_MAX);

  entryChars = [];
  for (var i = 0; i < NAME_MAX; i++) entryChars.push(saved.charAt(i) || " ");
  if (saved.length) entryIndex = Math.min(saved.length, NAME_MAX - 1);
}

function confirmNameEntry() {
  nameEntry = false;
  gameOverTimer = 0;
  var name = entryChars.join("").replace(/\s+/g, " ").trim() || "anon";
  submitScore(name, score, wave);
}

function entryAxis() {
  var ax = 0,
    ay = 0;
  if (keys.left.isDown || keys.left2.isDown) ax -= 1;
  if (keys.right.isDown || keys.right2.isDown) ax += 1;
  if (keys.up.isDown || keys.up2.isDown) ay -= 1;
  if (keys.down.isDown || keys.down2.isDown) ay += 1;
  if (!ax && !ay && touch.active) {
    if (touch.x < -0.5) ax = -1;
    else if (touch.x > 0.5) ax = 1;
    if (touch.y < -0.5) ay = -1;
    else if (touch.y > 0.5) ay = 1;
  }
  if (ay) ax = 0;
  return ax * 3 + ay;
}

function entryStep(code) {
  var ax = code === 3 ? 1 : code === -3 ? -1 : 0;
  var ay = code === 1 ? 1 : code === -1 ? -1 : 0;
  if (ax) {
    entryIndex = (entryIndex + ax + NAME_MAX) % NAME_MAX;
    return;
  }
  var i = ALPHABET.indexOf(entryChars[entryIndex]);
  if (i < 0) i = ALPHABET.length - 1;
  entryChars[entryIndex] = ALPHABET.charAt(
    (i - ay + ALPHABET.length) % ALPHABET.length,
  );
}

function updateNameEntry() {
  if (!nameEntry) return false;

  var code = entryAxis();
  if (code === 0) {
    repeatAxis = 0;
    repeatTimer = 0;
  } else if (code !== repeatAxis) {
    repeatAxis = code;
    repeatTimer = REPEAT_FIRST;
    entryStep(code);
  } else if (--repeatTimer <= 0) {
    repeatTimer = REPEAT_NEXT;
    entryStep(code);
  }

  var confirmDown = keys.start.isDown || keys.start2.isDown;
  var confirmPressed = confirmDown && !confirmWasDown;
  confirmWasDown = confirmDown;

  if (touch.active) {
    touchWasActive = true;
    if (Math.abs(touch.x) > 0.35 || Math.abs(touch.y) > 0.35) touchMoved = true;
  } else if (touchWasActive) {
    touchWasActive = false;
    if (!touchMoved) confirmPressed = true;
    touchMoved = false;
  }

  if (confirmPressed && gameOverTimer > 20) confirmNameEntry();
  return true;
}

window.addEventListener("keydown", function (e) {
  if (!nameEntry || !e.key) return;
  if (e.key === "Backspace") {
    e.preventDefault();
    if (entryChars[entryIndex] !== " ") entryChars[entryIndex] = " ";
    else if (entryIndex > 0) {
      entryIndex--;
      entryChars[entryIndex] = " ";
    }
    return;
  }
  if (e.key.length !== 1) return;
  var c = e.key.toLowerCase();
  if (!/[a-z0-9.!?-]/.test(c)) return;
  entryChars[entryIndex] = c;
  if (entryIndex < NAME_MAX - 1) entryIndex++;
});

function drawWindow(top, btm) {
  drawFilledRect(0, top, W - 1, btm, 0, 0, 0);
  drawFilledRect(0, top, W - 1, top, 255, 0, 255);
  drawFilledRect(0, btm, W - 1, btm, 255, 0, 255);
}

function drawStringRight(str, rightX, y, tint) {
  drawString(str, rightX - (str.length - 1) * FONT_ADVANCE, y, tint);
}

function drawBoardPage() {
  drawStringCentered("- best psi guys -", W / 2, 48, INK_DIM);
  if (!leaderboard) {
    drawStringCentered("loading", W / 2, 88, INK_DIM);
    return;
  }
  if (!leaderboard.length) {
    drawStringCentered("no scores yet", W / 2, 88, INK_DIM);
    return;
  }
  for (var i = 0; i < Math.min(leaderboard.length, TOP_N); i++) {
    var y = 62 + i * 9;
    var tint = i === 0 ? INK_LIT : i < 3 ? INK : INK_DIM;
    drawString(String(i + 1), 24, y, tint);
    drawString(String(leaderboard[i].name).slice(0, NAME_MAX), 38, y, tint);
    drawStringRight(String(leaderboard[i].score), 168, y, tint);
  }
}

function drawTitlePage() {
  drawStringCentered("the luminous corridor", W / 2, 72);
  drawStringCentered(
    isTouch ? "drag to move and shoot" : "wasd to move and shoot",
    W / 2,
    88,
    INK_LIT,
  );
  if (highScore > 0)
    drawStringCentered("best " + highScore, W / 2, 104, INK_DIM);
}

function drawAttractPanels() {
  if (!wasAttract) {
    wasAttract = true;
    attractPage = 0;
    pageTimer = 0;
  }

  pageTimer++;
  if (pageTimer === PAGE_HOLD + SHUTTER) attractPage ^= 1;
  if (pageTimer >= PAGE_HOLD + SHUTTER * 2) pageTimer = 0;

  var open = 1;
  if (pageTimer >= PAGE_HOLD + SHUTTER)
    open = (pageTimer - PAGE_HOLD - SHUTTER) / SHUTTER;
  else if (pageTimer >= PAGE_HOLD) open = 1 - (pageTimer - PAGE_HOLD) / SHUTTER;

  var cy = (PANEL_TOP + PANEL_BOTTOM) / 2;
  var half = Math.floor(((PANEL_BOTTOM - PANEL_TOP) / 2) * open);
  drawWindow(cy - half, cy + half);
  if (open >= 1) {
    if (attractPage === 0) drawBoardPage();
    else drawTitlePage();
  }

  drawWindow(PROMPT_TOP, PROMPT_BOTTOM);
  if (Math.floor(clock / 24) % 2 === 0) {
    drawStringCentered(
      isTouch ? "tap to start" : "press space to start",
      W / 2,
      (PROMPT_TOP + PROMPT_BOTTOM) / 2,
      INK_LIT,
    );
  }
}

function drawPickerArrows(cx, cellTop) {
  for (var i = 0; i < 3; i++) {
    drawFilledRect(
      cx - i,
      cellTop - 5 + i,
      cx + i,
      cellTop - 5 + i,
      255,
      0,
      255,
    );
    drawFilledRect(
      cx - i,
      cellTop + CELL_H + 4 - i,
      cx + i,
      cellTop + CELL_H + 4 - i,
      255,
      0,
      255,
    );
  }
}

function drawNameCells(cellTop) {
  for (var i = 0; i < NAME_MAX; i++) {
    var l = ENTRY_LEFT + i * CELL_PITCH,
      r = l + CELL_W - 1;
    var b = cellTop + CELL_H - 1,
      on = i === entryIndex;
    if (on) {
      drawFilledRect(l + 1, cellTop + 1, r - 1, b - 1, 40, 0, 48);
      drawRectangleOutline(l, cellTop, r, b, 255, 0, 255);
    } else {
      drawRectangleOutline(l, cellTop, r, b, 96, 20, 96);
    }
    var ch = entryChars[i];
    if (ch && ch !== " ")
      glyph(ch.charCodeAt(0), l + 5, cellTop + 6, on ? INK_LIT : INK);
  }
  if (entryChars[entryIndex] === " " && Math.floor(clock / 16) % 2 === 0) {
    var cl = ENTRY_LEFT + entryIndex * CELL_PITCH;
    drawFilledRect(cl + 3, cellTop + 9, cl + 7, cellTop + 9, 255, 0, 255);
  }
  drawPickerArrows(ENTRY_LEFT + entryIndex * CELL_PITCH + 5, cellTop);
}

function drawGameOverPanel() {
  wasAttract = false;

  if (nameEntry) {
    drawWindow(48, 146);
    drawStringCentered("GAME OVER", W / 2, 60, INK_LIT);
    drawStringCentered("score " + score, W / 2, 74);
    drawStringCentered("enter your name", W / 2, 88, INK_DIM);
    drawNameCells(101);
    drawStringCentered(
      isTouch ? "tap to confirm" : "enter to confirm",
      W / 2,
      132,
      INK_DIM,
    );
    return;
  }

  var showTip = submitState === "idle";
  var rows = showTip ? wrapLines(TIPS[selectedTip], 24).length : 1;
  drawWindow(48, 104 + rows * FONT_LINE);
  drawStringCentered("GAME OVER", W / 2, 60, INK_LIT);
  drawStringCentered("score " + score, W / 2, 74);
  drawStringCentered("best " + highScore, W / 2, 84, INK_DIM);

  if (showTip)
    drawStringWrappedCentered(TIPS[selectedTip], W / 2, 100, 24, INK_LIT);
  else if (submitState === "sending")
    drawStringCentered("sending...", W / 2, 100, INK_DIM);
  else if (submitState === "done")
    drawStringCentered(
      submitRank ? "rank " + submitRank : "saved",
      W / 2,
      100,
      INK_LIT,
    );
  else drawStringCentered("offline - not saved", W / 2, 100, INK_DIM);
}
