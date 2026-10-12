/* Classic ES5 TV client — no modules, no fetch required (XHR). */
(function () {
  "use strict";

  var CODE_LEN = 4;
  var POLL_MS = 1500;
  var digits = "";
  var boardKey = null;
  var pollTimer = null;
  var title = "Игра";

  var gateEl = document.getElementById("gate");
  var boardEl = document.getElementById("board");
  var slotsEl = document.getElementById("slots");
  var padEl = document.getElementById("pad");
  var errorEl = document.getElementById("error");
  var playersEl = document.getElementById("players");
  var idleEl = document.getElementById("idle");
  var boardTitleEl = document.getElementById("boardTitle");
  var resetBtn = document.getElementById("resetBtn");

  function setError(msg) {
    errorEl.textContent = msg || "";
  }

  function normalizeCode(raw) {
    return String(raw || "")
      .replace(/\D/g, "")
      .slice(0, CODE_LEN);
  }

  function xhrGet(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.timeout = 15000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var text = xhr.responseText || "";
      var data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          cb(new Error("Некорректный ответ сервера"), null, xhr.status);
          return;
        }
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        var msg =
          data && data.error
            ? data.error
            : "Ошибка сервера (" + xhr.status + ")";
        cb(new Error(msg), data, xhr.status);
        return;
      }
      cb(null, data, xhr.status);
    };
    xhr.onerror = function () {
      cb(new Error("Нет связи с сервером"), null, 0);
    };
    xhr.ontimeout = function () {
      cb(new Error("Нет связи с сервером"), null, 0);
    };
    xhr.send(null);
  }

  function renderSlots() {
    var html = "";
    var i;
    for (i = 0; i < CODE_LEN; i++) {
      html +=
        '<div class="slot">' +
        (digits.charAt(i) ? digits.charAt(i) : "·") +
        "</div>";
    }
    slotsEl.innerHTML = html;
  }

  function renderPad() {
    var keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
    var html = "";
    var i;
    for (i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!k) {
        html += "<div></div>";
      } else {
        html +=
          '<button class="key" type="button" data-key="' +
          k +
          '">' +
          k +
          "</button>";
      }
    }
    padEl.innerHTML = html;
  }

  function showGate() {
    boardKey = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    gateEl.className = "";
    boardEl.className = "board hidden";
    digits = "";
    setError("");
    renderSlots();
    try {
      localStorage.removeItem("darts_tv_board");
    } catch (e) {}
  }

  function showBoard() {
    gateEl.className = "hidden";
    boardEl.className = "board";
    boardTitleEl.textContent = title || "Игра";
  }

  function renderLive(live) {
    if (!live || live.phase !== "playing" || !live.players || !live.players.length) {
      playersEl.innerHTML = "";
      idleEl.className = "idle";
      return;
    }
    idleEl.className = "idle hidden";
    var html = "";
    var i;
    for (i = 0; i < live.players.length; i++) {
      var p = live.players[i];
      var active = p.active ? " active" : "";
      var visit = typeof p.visitScore === "number" ? p.visitScore : 0;
      var throws = live.visitThrows && p.active ? live.visitThrows.length : 0;
      html +=
        '<div class="card' +
        active +
        '">' +
        '<div class="name">' +
        escapeHtml(p.name || String(p.userId || "")) +
        "</div>" +
        '<div class="score">' +
        String(p.remaining != null ? p.remaining : "—") +
        "</div>" +
        '<div class="meta">visit ' +
        visit +
        (p.active && throws ? " · " + throws + "/3" : "") +
        "</div>" +
        "</div>";
    }
    playersEl.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pollLive() {
    if (!boardKey) return;
    xhrGet(
      "/api/tv/boards/" + encodeURIComponent(boardKey),
      function (err, data) {
        if (err) return;
        renderLive(data && data.live ? data.live : null);
      }
    );
  }

  function startBoard(key, boardTitle) {
    boardKey = key;
    title = boardTitle || "Игра";
    try {
      localStorage.setItem(
        "darts_tv_board",
        JSON.stringify({ boardKey: key, title: title })
      );
    } catch (e) {}
    showBoard();
    renderLive(null);
    pollLive();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollLive, POLL_MS);
  }

  function submitCode(code) {
    var normalized = normalizeCode(code);
    if (normalized.length !== CODE_LEN) {
      setError("Введите 4 цифры");
      return;
    }
    setError("Проверяем…");
    xhrGet("/api/tv/" + encodeURIComponent(normalized), function (err, data) {
      if (err) {
        setError(err.message || "Код не найден");
        digits = "";
        renderSlots();
        return;
      }
      startBoard(data.boardKey, data.title || "Игра");
    });
  }

  function onKey(k) {
    if (k === "⌫") {
      digits = digits.slice(0, -1);
      setError("");
      renderSlots();
      return;
    }
    if (digits.length >= CODE_LEN) return;
    digits = normalizeCode(digits + k);
    setError("");
    renderSlots();
    if (digits.length === CODE_LEN) submitCode(digits);
  }

  padEl.onclick = function (ev) {
    var t = ev.target || ev.srcElement;
    if (!t || !t.getAttribute) return;
    var k = t.getAttribute("data-key");
    if (k) onKey(k);
  };

  resetBtn.onclick = function () {
    showGate();
  };

  // Drop any stale PWA control — classic page must not be SW-hijacked.
  if ("serviceWorker" in navigator) {
    try {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        var i;
        for (i = 0; i < regs.length; i++) regs[i].unregister();
      });
    } catch (e) {}
  }
  if ("caches" in window) {
    try {
      caches.keys().then(function (keys) {
        var i;
        for (i = 0; i < keys.length; i++) caches.delete(keys[i]);
      });
    } catch (e) {}
  }

  renderPad();
  renderSlots();

  try {
    var saved = localStorage.getItem("darts_tv_board");
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed && parsed.boardKey) {
        startBoard(parsed.boardKey, parsed.title || "Игра");
      }
    }
  } catch (e) {}
})();
