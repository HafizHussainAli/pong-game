(() => {
  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#game-canvas");
  const context = canvas.getContext("2d");
  const overlay = $("#game-overlay");
  const overlayKicker = $("#overlay-kicker");
  const overlayTitle = $("#overlay-title");
  const overlayCopy = $("#overlay-copy");
  const startButton = $("#start-button");
  const buttonLabel = $("#button-label");
  const pauseIndicator = $("#pause-indicator");
  const playerScoreElement = $("#player-score");
  const cpuScoreElement = $("#cpu-score");
  const gameStatus = $("#game-status");
  const statusDot = $("#status-dot");
  const countdownElement = $("#countdown");
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const PADDLE_WIDTH = 12;
  const BASE_PADDLE_HEIGHT = 96;
  const BALL_RADIUS = 9;
  const PLAYER_X = 32;
  const CPU_X = WIDTH - 32 - PADDLE_WIDTH;
  const MODES = {
    classic: { label: "Classic", target: 7 },
    "two-player": { label: "Two-player", target: 7 },
    tournament: { label: "Tournament", target: 5 },
    "time-attack": { label: "Time attack", seconds: 120 },
    endless: { label: "Endless", target: Infinity },
    online: { label: "Online", target: 7 }
  };
  const DIFFICULTIES = {
    easy: { speed: 245, error: 88, reaction: 0.2 },
    normal: { speed: 345, error: 38, reaction: 0.12 },
    hard: { speed: 440, error: 8, reaction: 0.07 }
  };
  const keysDown = new Set();
  const pointer = { active: false, side: "left", y: HEIGHT / 2 };
  const trails = [];
  const sparks = [];
  const settings = { sound: true, music: false, effects: true, powerups: true };
  let playerY = HEIGHT / 2 - BASE_PADDLE_HEIGHT / 2;
  let cpuY = playerY;
  let remoteY = cpuY;
  let ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 };
  let playerScore = 0;
  let cpuScore = 0;
  let state = "ready";
  let pausedState = "playing";
  let mode = "classic";
  let lastFrameTime = 0;
  let cpuReaction = 0;
  let matchTime = 120;
  let serveTimer = 0;
  let serveSide = "left";
  let seriesPlayerWins = 0;
  let seriesCpuWins = 0;
  let tournamentRound = 1;
  let tournamentBetweenRounds = false;
  let rallyHits = 0;
  let bestRally = 0;
  let highScore = 0;
  let powerup = null;
  let powerupTimer = 0;
  let powerEffect = null;
  let powerEffectTimer = 0;
  let audioContext = null;
  let musicTimer = null;
  let musicNote = 0;
  let supabaseClient = null;
  let onlineChannel = null;
  let onlineRole = null;
  let onlineSendTimer = 0;
  let recentMatches = [];

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      updateStatus("LOCAL STORAGE UNAVAILABLE");
      console.error(`Unable to read ${key} from local storage.`, error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      updateStatus("COULD NOT SAVE LOCAL RECORD");
      console.error(`Unable to save ${key} to local storage.`, error);
    }
  }

  function updateStatus(text, live = false) {
    gameStatus.textContent = text;
    statusDot.classList.toggle("is-live", live);
  }

  function modeTarget() {
    return MODES[mode].target;
  }

  function currentPaddleHeight(side) {
    return powerEffect?.type === "wide" && powerEffect.side === side ? BASE_PADDLE_HEIGHT * 1.55 : BASE_PADDLE_HEIGHT;
  }

  function clampPaddle(y, side) {
    return Math.max(12, Math.min(HEIGHT - currentPaddleHeight(side) - 12, y));
  }

  function updateScore() {
    playerScoreElement.textContent = String(playerScore);
    cpuScoreElement.textContent = String(cpuScore);
  }

  function playerName() {
    return ($("#player-name").value.trim() || "PLAYER 1").slice(0, 16);
  }

  function refreshModeUI() {
    const config = MODES[mode];
    $("#difficulty-field").classList.toggle("is-hidden", mode === "two-player" || mode === "online");
    $("#online-panel").classList.toggle("is-hidden", mode !== "online");
    startButton.disabled = mode === "online";
    startButton.classList.toggle("is-hidden", mode === "online");
    $("#left-name").textContent = onlineRole === "guest" ? "HOST" : playerName().toUpperCase();
    $("#right-name").textContent = mode === "two-player" ? "PLAYER 2" : mode === "online" ? "GUEST" : "CPU";
    $("#score-caption").textContent = config.seconds ? "2 MINUTES" : config.target === Infinity ? "NO LIMIT" : `FIRST TO ${config.target}`;
    $("#series-score").classList.toggle("is-hidden", mode !== "tournament");
    if (mode === "tournament") {
      $("#series-score").textContent = `ROUND ${tournamentRound} · ${seriesPlayerWins}—${seriesCpuWins}`;
    }
    if (mode === "online" && !supabaseClient) {
      $("#online-status").textContent = "Add your Supabase project URL and publishable key to enable online rooms.";
    }
    if (mode === "online" && supabaseClient) {
      $("#online-status").textContent = "Create a room or enter a friend's room code.";
    }
  }

  function renderHistory() {
    const list = $("#match-history");
    list.replaceChildren();
    if (recentMatches.length === 0) {
      const item = document.createElement("li");
      item.className = "empty-history";
      item.textContent = "Play a match to start your history.";
      list.append(item);
      return;
    }
    for (const match of recentMatches.slice(0, 5)) {
      const item = document.createElement("li");
      const detail = document.createElement("span");
      detail.textContent = `${match.mode} · ${match.score} · ${match.date}`;
      const result = document.createElement("strong");
      result.className = match.won ? "result-win" : "result-loss";
      result.textContent = match.won ? "WIN" : "LOSS";
      item.append(detail, result);
      list.append(item);
    }
  }

  function loadRecords() {
    highScore = Number(readStorage("rally-high-score", 0)) || 0;
    bestRally = Number(readStorage("rally-best-rally", 0)) || 0;
    recentMatches = readStorage("rally-match-history", []);
    if (!Array.isArray(recentMatches)) recentMatches = [];
    $("#high-score").textContent = String(highScore);
    $("#best-rally").textContent = String(bestRally);
    renderHistory();
    const savedName = readStorage("rally-player-name", "");
    if (typeof savedName === "string" && savedName) $("#player-name").value = savedName;
    const savedSettings = readStorage("rally-settings", {});
    if (savedSettings && typeof savedSettings === "object") Object.assign(settings, savedSettings);
    $("#sound-toggle").checked = settings.sound;
    $("#music-toggle").checked = settings.music;
    $("#effects-toggle").checked = settings.effects;
    $("#powerups-toggle").checked = settings.powerups;
  }

  function showOverlay({ kicker, title, copy, button, serve = false }) {
    overlayKicker.textContent = kicker;
    overlayTitle.innerHTML = title;
    overlayCopy.textContent = copy;
    buttonLabel.textContent = button;
    $("#serve-picker").classList.toggle("is-hidden", !serve);
    overlay.classList.remove("is-hidden");
  }

  function hideOverlay() {
    overlay.classList.add("is-hidden");
  }

  function ensureAudio() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioContext = new AudioContextClass();
    }
    if (audioContext?.state === "suspended") audioContext.resume();
  }

  function playTone(frequency, duration = 0.08, type = "sine", volume = 0.045) {
    if (!settings.sound) return;
    ensureAudio();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  function setMusic(enabled) {
    settings.music = enabled;
    $("#music-toggle").checked = enabled;
    if (!enabled) {
      window.clearInterval(musicTimer);
      musicTimer = null;
      return;
    }
    ensureAudio();
    if (!audioContext) return;
    if (musicTimer) return;
    const notes = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
    musicTimer = window.setInterval(() => {
      if (!settings.music || !audioContext || audioContext.state !== "running") return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = notes[musicNote++ % notes.length];
      gain.gain.value = 0.012;
      gain.gain.setTargetAtTime(0, audioContext.currentTime + 0.16, 0.05);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.35);
    }, 420);
  }

  function burst(x, y, color) {
    if (!settings.effects) return;
    for (let index = 0; index < 9; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 150;
      sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.32 + Math.random() * 0.28, color });
    }
  }

  function drawCourt() {
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#090f1a";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    const glow = context.createRadialGradient(WIDTH / 2, HEIGHT / 2, 20, WIDTH / 2, HEIGHT / 2, WIDTH * 0.55);
    glow.addColorStop(0, "rgba(30, 48, 62, 0.26)");
    glow.addColorStop(1, "rgba(9, 15, 26, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.setLineDash([6, 12]);
    context.strokeStyle = "rgba(135, 153, 175, 0.2)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(WIDTH / 2, 18);
    context.lineTo(WIDTH / 2, HEIGHT - 18);
    context.stroke();
    context.setLineDash([]);

    if (settings.effects) {
      for (const trail of trails) {
        context.globalAlpha = trail.life / 0.25 * 0.42;
        context.fillStyle = "#f3f5f8";
        context.beginPath();
        context.arc(trail.x, trail.y, BALL_RADIUS * trail.life / 0.25, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    }

    const leftHeight = currentPaddleHeight(onlineRole === "guest" ? "right" : "left");
    const rightHeight = currentPaddleHeight("right");
    const drawnLeftY = onlineRole === "guest" ? remoteY : playerY;
    const drawnRightY = onlineRole === "guest" ? playerY : mode === "online" ? remoteY : cpuY;
    context.shadowBlur = settings.effects ? 18 : 0;
    context.fillStyle = "#d7ff63";
    context.shadowColor = "rgba(215, 255, 99, 0.55)";
    context.beginPath();
    context.roundRect(PLAYER_X, drawnLeftY, PADDLE_WIDTH, leftHeight, 6);
    context.fill();
    context.fillStyle = mode === "two-player" || onlineRole === "host" ? "#66e4e0" : "#66e4e0";
    context.shadowColor = "rgba(102, 228, 224, 0.5)";
    context.beginPath();
    context.roundRect(CPU_X, drawnRightY, PADDLE_WIDTH, rightHeight, 6);
    context.fill();

    if (powerup) {
      const pulse = 1 + Math.sin(performance.now() / 120) * 0.14;
      context.fillStyle = powerup.type === "wide" ? "#d7ff63" : "#bd8cff";
      context.shadowColor = context.fillStyle;
      context.shadowBlur = 18;
      context.beginPath();
      context.arc(powerup.x, powerup.y, 13 * pulse, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = "#09101a";
      context.font = "bold 12px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(powerup.type === "wide" ? "↕" : "»", powerup.x, powerup.y);
    }

    if (settings.effects) {
      for (const spark of sparks) {
        context.globalAlpha = Math.max(0, spark.life / 0.6);
        context.fillStyle = spark.color;
        context.fillRect(spark.x, spark.y, 3, 3);
      }
      context.globalAlpha = 1;
    }

    context.fillStyle = "#f3f5f8";
    context.shadowColor = "rgba(255, 255, 255, 0.75)";
    context.shadowBlur = settings.effects ? 12 : 0;
    context.beginPath();
    context.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
  }

  function resetBall() {
    ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 };
  }

  function serveBall(direction) {
    const angle = Math.random() * 0.7 - 0.35;
    const speed = 440;
    ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: Math.cos(angle) * speed * direction, vy: Math.sin(angle) * speed };
    rallyHits = 0;
    $("#rally-readout").textContent = "";
  }

  function beginCountdown(direction) {
    serveSide = direction === -1 ? "left" : "right";
    serveTimer = 3;
    state = "countdown";
    resetBall();
    countdownElement.textContent = "3";
    countdownElement.classList.add("is-visible");
    $("#between-point-controls").classList.remove("is-hidden");
    $("#next-serve-left").classList.toggle("is-selected", serveSide === "left");
    $("#next-serve-right").classList.toggle("is-selected", serveSide === "right");
    updateStatus("GET READY");
  }

  function startGame() {
    if (mode === "online" && onlineRole === "guest" && state !== "playing") return;
    ensureAudio();
    if (state === "paused") {
      state = pausedState;
      pauseIndicator.classList.remove("is-visible");
      hideOverlay();
      updateStatus(state === "countdown" ? "GET READY" : "MATCH IN PROGRESS", state === "playing");
      if (mode === "online" && onlineRole === "host") broadcast("start", { state, countdown: serveTimer });
      return;
    }
    if (state === "over" && mode === "tournament" && tournamentBetweenRounds) {
      tournamentBetweenRounds = false;
      tournamentRound += 1;
    } else if (state === "over") {
      playerScore = 0;
      cpuScore = 0;
      seriesPlayerWins = 0;
      seriesCpuWins = 0;
      tournamentRound = 1;
      tournamentBetweenRounds = false;
    }
    playerScore = 0;
    cpuScore = 0;
    updateScore();
    refreshModeUI();
    playerY = HEIGHT / 2 - BASE_PADDLE_HEIGHT / 2;
    cpuY = playerY;
    remoteY = cpuY;
    matchTime = 120;
    powerup = null;
    powerEffect = null;
    powerupTimer = 7 + Math.random() * 5;
    serveBall(serveSide === "left" ? 1 : -1);
    state = "playing";
    hideOverlay();
    pauseIndicator.classList.remove("is-visible");
    countdownElement.classList.remove("is-visible");
    $("#between-point-controls").classList.add("is-hidden");
    updateStatus("MATCH IN PROGRESS", true);
    if (mode === "online" && onlineRole === "host") broadcast("start", { started: true });
  }

  function pauseGame() {
    if (state !== "playing" && state !== "countdown") return;
    pausedState = state;
    state = "paused";
    pauseIndicator.classList.add("is-visible");
    showOverlay({
      kicker: "TAKE YOUR TIME",
      title: "Game on<br />your terms.",
      copy: "The match is paused. Ready when you are.",
      button: "RESUME GAME"
    });
    updateStatus("MATCH PAUSED");
    if (mode === "online" && onlineRole === "host") broadcast("paused", { paused: true, countdown: serveTimer, resumeState: pausedState });
  }

  function recordMatch(won) {
    if (mode === "endless" || mode === "two-player" || mode === "online") return;
    const match = {
      mode: MODES[mode].label,
      score: `${playerScore}—${cpuScore}`,
      won,
      date: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date())
    };
    recentMatches.unshift(match);
    recentMatches = recentMatches.slice(0, 5);
    writeStorage("rally-match-history", recentMatches);
    renderHistory();
    if (supabaseClient && mode !== "tournament") submitLeaderboard(won);
  }

  function finishGame(winner) {
    state = "over";
    const playerWon = winner === "player";
    recordMatch(playerWon);
    if (mode === "tournament" && !tournamentBetweenRounds) {
      if (playerWon) seriesPlayerWins += 1;
      else seriesCpuWins += 1;
      refreshModeUI();
      if (seriesPlayerWins < 2 && seriesCpuWins < 2) {
        tournamentBetweenRounds = true;
        showOverlay({
          kicker: `ROUND ${tournamentRound} COMPLETE`,
          title: playerWon ? "One up.<br />Keep going." : "A setback.<br />Not over.",
          copy: `Series score ${seriesPlayerWins}—${seriesCpuWins}. First to two round wins takes the tournament.`,
          button: "NEXT ROUND"
        });
        updateStatus("TOURNAMENT ROUND COMPLETE");
        return;
      }
    }
    const tournamentWon = mode !== "tournament" || seriesPlayerWins >= 2;
    showOverlay({
      kicker: playerWon && tournamentWon ? "THAT'S A WRAP" : "GOOD GAME",
      title: playerWon && tournamentWon ? "You got<br />the W." : "Run it<br />back?",
      copy: mode === "time-attack"
        ? `${playerWon ? "You" : "CPU"} won ${playerScore}—${cpuScore} with time to spare.`
        : mode === "tournament"
          ? `Tournament score ${seriesPlayerWins}—${seriesCpuWins}. ${playerWon && tournamentWon ? "Champion!" : "The CPU takes the trophy."}`
          : playerWon ? "Nice hands. Fancy a rematch?" : "The next one is yours. Run it back?",
      button: "PLAY AGAIN"
    });
    updateStatus(playerWon && tournamentWon ? "MATCH WON" : "MATCH COMPLETE");
    if (mode === "online" && onlineRole === "host") {
      broadcast("state", { y: playerY, ball, playerScore, cpuScore, state });
    }
  }

  function awardPoint(scoringSide) {
    if (scoringSide === "left") playerScore += 1;
    else cpuScore += 1;
    updateScore();
    highScore = Math.max(highScore, playerScore);
    $("#high-score").textContent = String(highScore);
    writeStorage("rally-high-score", highScore);
    playTone(scoringSide === "left" ? 520 : 370, 0.22, "triangle", 0.07);
    if (mode === "time-attack") {
      beginCountdown(scoringSide === "left" ? 1 : -1);
      return;
    }
    const target = modeTarget();
    if (playerScore >= target || cpuScore >= target) {
      finishGame(playerScore >= target ? "player" : "cpu");
      return;
    }
    beginCountdown(scoringSide === "left" ? 1 : -1);
  }

  function moveCpu(delta) {
    const difficulty = DIFFICULTIES[$("#difficulty-select").value] || DIFFICULTIES.normal;
    let targetY = ball.vx > 0 ? ball.y - BASE_PADDLE_HEIGHT / 2 : HEIGHT / 2 - BASE_PADDLE_HEIGHT / 2;
    if (ball.vx > 0) targetY += (Math.random() - 0.5) * difficulty.error;
    const difference = targetY - cpuY;
    cpuY = clampPaddle(cpuY + Math.sign(difference) * Math.min(Math.abs(difference), difficulty.speed * delta), "right");
  }

  function triggerPowerup() {
    if (!powerup || Math.hypot(powerup.x - ball.x, powerup.y - ball.y) > 24) return;
    const side = ball.vx < 0 ? "left" : "right";
    powerEffect = { side, type: powerup.type, expires: 8 };
    powerEffectTimer = 8;
    if (powerup.type === "slow") {
      ball.vx *= 0.76;
      ball.vy *= 0.76;
    }
    $("#powerup-message").textContent = `${side === "left" ? "YOUR" : "OPPONENT"} ${powerup.type === "wide" ? "PADDLE BOOST" : "SLOW BALL"} · 8S`;
    $("#powerup-message").classList.add("is-visible");
    window.setTimeout(() => $("#powerup-message").classList.remove("is-visible"), 1500);
    burst(powerup.x, powerup.y, powerup.type === "wide" ? "#d7ff63" : "#bd8cff");
    playTone(680, 0.28, "sine", 0.06);
    powerup = null;
  }

  function moveBall(delta) {
    if (settings.effects) {
      trails.push({ x: ball.x, y: ball.y, life: 0.25 });
      while (trails.length > 10) trails.shift();
    }
    ball.x += ball.vx * delta;
    ball.y += ball.vy * delta;
    if (ball.y - BALL_RADIUS <= 0 || ball.y + BALL_RADIUS >= HEIGHT) {
      ball.y = Math.max(BALL_RADIUS, Math.min(HEIGHT - BALL_RADIUS, ball.y));
      ball.vy *= -1;
      playTone(230, 0.045, "sine", 0.025);
      burst(ball.x, ball.y, "#a9b5c5");
    }
    triggerPowerup();

    const leftHeight = currentPaddleHeight("left");
    const rightHeight = currentPaddleHeight("right");
    const playerHit = ball.vx < 0 && ball.x - BALL_RADIUS <= PLAYER_X + PADDLE_WIDTH
      && ball.x + BALL_RADIUS >= PLAYER_X && ball.y >= playerY && ball.y <= playerY + leftHeight;
    const opponentY = mode === "online" ? remoteY : cpuY;
    const cpuHit = ball.vx > 0 && ball.x + BALL_RADIUS >= CPU_X
      && ball.x - BALL_RADIUS <= CPU_X + PADDLE_WIDTH && ball.y >= opponentY && ball.y <= opponentY + rightHeight;

    if (playerHit || cpuHit) {
      const side = playerHit ? "left" : "right";
      const paddleY = playerHit ? playerY : opponentY;
      const impact = (ball.y - (paddleY + currentPaddleHeight(side) / 2)) / (currentPaddleHeight(side) / 2);
      ball.x = playerHit ? PLAYER_X + PADDLE_WIDTH + BALL_RADIUS : CPU_X - BALL_RADIUS;
      const magnitude = Math.min(Math.hypot(ball.vx, ball.vy) * 1.045, 790);
      ball.vx = (playerHit ? 1 : -1) * magnitude * Math.cos(impact * 0.88);
      ball.vy = magnitude * Math.sin(impact * 0.88);
      rallyHits += 1;
      $("#rally-readout").textContent = rallyHits >= 3 ? `RALLY ×${rallyHits}` : "";
      if (rallyHits > bestRally) {
        bestRally = rallyHits;
        $("#best-rally").textContent = String(bestRally);
        writeStorage("rally-best-rally", bestRally);
      }
      playTone(playerHit ? 420 : 310, 0.06, "triangle", 0.045);
      burst(ball.x, ball.y, playerHit ? "#d7ff63" : "#66e4e0");
    }

    if (ball.x < -BALL_RADIUS) awardPoint("right");
    else if (ball.x > WIDTH + BALL_RADIUS) awardPoint("left");
  }

  function updateInput(delta) {
    if (pointer.active) {
      if (pointer.side === "left") playerY = clampPaddle(pointer.y - currentPaddleHeight("left") / 2, "left");
      else if (mode === "two-player") cpuY = clampPaddle(pointer.y - currentPaddleHeight("right") / 2, "right");
      else if (mode === "online" && onlineRole === "guest") playerY = clampPaddle(pointer.y - currentPaddleHeight("right") / 2, "right");
      return;
    }
    const playerUp = keysDown.has("w") || keysDown.has("W") || (mode !== "two-player" && mode !== "online" && keysDown.has("ArrowUp"));
    const playerDown = keysDown.has("s") || keysDown.has("S") || (mode !== "two-player" && mode !== "online" && keysDown.has("ArrowDown"));
    const direction = Number(playerDown) - Number(playerUp);
    if (mode === "online" && onlineRole === "guest") {
      playerY = clampPaddle(playerY + direction * 510 * delta, "right");
    } else {
      playerY = clampPaddle(playerY + direction * 510 * delta, "left");
    }
    if (mode === "two-player") {
      const opponentDirection = Number(keysDown.has("ArrowDown")) - Number(keysDown.has("ArrowUp"));
      cpuY = clampPaddle(cpuY + opponentDirection * 510 * delta, "right");
    }
  }

  function update(delta) {
    updateInput(delta);
    for (let index = trails.length - 1; index >= 0; index -= 1) {
      trails[index].life -= delta;
      if (trails[index].life <= 0) trails.splice(index, 1);
    }
    for (let index = sparks.length - 1; index >= 0; index -= 1) {
      const spark = sparks[index];
      spark.life -= delta;
      spark.x += spark.vx * delta;
      spark.y += spark.vy * delta;
      if (spark.life <= 0) sparks.splice(index, 1);
    }
    if (state === "countdown") {
      serveTimer -= delta;
      const count = Math.ceil(serveTimer);
      countdownElement.textContent = count > 0 ? String(count) : "GO!";
      if (serveTimer <= 0) {
        state = "playing";
        countdownElement.classList.remove("is-visible");
        $("#between-point-controls").classList.add("is-hidden");
        serveBall(serveSide === "left" ? 1 : -1);
        updateStatus("MATCH IN PROGRESS", true);
      }
    }
    if (state !== "playing") return;

    if (mode === "time-attack") {
      matchTime -= delta;
      $("#match-timer").textContent = `${Math.floor(matchTime / 60)}:${String(Math.max(0, Math.ceil(matchTime) % 60)).padStart(2, "0")}`;
      if (matchTime <= 0) {
        matchTime = 0;
        finishGame(playerScore > cpuScore ? "player" : "cpu");
        return;
      }
    }

    if (mode === "classic" || mode === "tournament" || mode === "time-attack" || mode === "endless") {
      cpuReaction += delta;
      const difficulty = DIFFICULTIES[$("#difficulty-select").value] || DIFFICULTIES.normal;
      if (cpuReaction >= difficulty.reaction) {
        moveCpu(cpuReaction);
        cpuReaction = 0;
      }
    }

    if (settings.powerups && mode !== "online") {
      powerupTimer -= delta;
      if (powerupTimer <= 0 && !powerup) {
        powerup = { x: WIDTH * (0.32 + Math.random() * 0.36), y: HEIGHT * (0.2 + Math.random() * 0.6), type: Math.random() < 0.5 ? "wide" : "slow" };
        powerupTimer = 12 + Math.random() * 5;
      }
      if (powerEffect) {
        powerEffectTimer -= delta;
        if (powerEffectTimer <= 0) powerEffect = null;
      }
    }

    if (mode !== "online" || onlineRole === "host") moveBall(delta);
    if (mode === "online") {
      onlineSendTimer += delta;
      if (onlineSendTimer >= 0.04) {
        onlineSendTimer = 0;
        if (onlineRole === "host") broadcast("state", { y: playerY, ball, playerScore, cpuScore, state, countdown: serveTimer });
        else broadcast("paddle", { y: playerY });
      }
    }

    if (mode === "endless") {
      highScore = Math.max(highScore, playerScore);
      $("#high-score").textContent = String(highScore);
      writeStorage("rally-high-score", highScore);
    }
  }

  function frame(timestamp) {
    const delta = Math.min((timestamp - (lastFrameTime || timestamp)) / 1000, 0.03);
    lastFrameTime = timestamp;
    update(delta);
    drawCourt();
    window.requestAnimationFrame(frame);
  }

  function pointerY(event) {
    const bounds = canvas.getBoundingClientRect();
    return (event.clientY - bounds.top) * HEIGHT / bounds.height;
  }

  function resetGame() {
    playerScore = 0;
    cpuScore = 0;
    playerY = HEIGHT / 2 - BASE_PADDLE_HEIGHT / 2;
    cpuY = playerY;
    remoteY = cpuY;
    matchTime = 120;
    resetBall();
    state = "ready";
    powerup = null;
    powerEffect = null;
    tournamentRound = 1;
    seriesPlayerWins = 0;
    seriesCpuWins = 0;
    tournamentBetweenRounds = false;
    updateScore();
    refreshModeUI();
    $("#match-timer").textContent = "";
    updateStatus("WAITING TO PLAY");
    pauseIndicator.classList.remove("is-visible");
    countdownElement.classList.remove("is-visible");
    $("#between-point-controls").classList.add("is-hidden");
    showOverlay({
      kicker: "READY WHEN YOU ARE",
      title: "Make some<br />noise.",
      copy: mode === "tournament" ? "Win two of three rounds to take the trophy." : "Pick a mode and first to 7 takes the match.",
      button: "START GAME",
      serve: mode !== "online"
    });
  }

  async function connectSupabase() {
    const config = window.RALLY_SUPABASE_CONFIG;
    if (!config?.url || !config?.anonKey) return;
    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      supabaseClient = createClient(config.url, config.anonKey);
      const { error } = await supabaseClient.auth.signInAnonymously();
      if (error) throw error;
      $("#host-button").disabled = false;
      $("#join-button").disabled = false;
      $("#online-status").textContent = "Connected. Create a room or join with a friend's code.";
      $("#leaderboard-note").textContent = "Playing online submits your best scores to the global leaderboard.";
      await loadLeaderboard();
      refreshModeUI();
    } catch (error) {
      $("#online-status").textContent = "Could not connect to Supabase. Check the project URL, key, and anonymous sign-in setting.";
      $("#leaderboard-note").textContent = "Global rankings could not load. Check the Supabase setup.";
      console.error("Supabase connection failed.", error);
    }
  }

  async function loadLeaderboard() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.from("leaderboard").select("nickname, score, mode, created_at").order("score", { ascending: false }).limit(10);
    if (error) {
      $("#leaderboard-note").textContent = "Leaderboard unavailable. Apply the Supabase schema and row-level security policies.";
      console.error("Unable to load leaderboard.", error);
      return;
    }
    const list = $("#leaderboard-list");
    list.replaceChildren();
    if (!data?.length) {
      const item = document.createElement("li");
      item.className = "empty-history";
      item.textContent = "No scores yet. Be the first to set one!";
      list.append(item);
      return;
    }
    data.forEach((entry, index) => {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      rank.textContent = String(index + 1).padStart(2, "0");
      const name = document.createElement("span");
      name.textContent = entry.nickname;
      const kind = document.createElement("span");
      kind.textContent = entry.mode;
      const score = document.createElement("strong");
      score.textContent = String(entry.score);
      item.append(rank, name, kind, score);
      list.append(item);
    });
  }

  async function submitLeaderboard(won) {
    if (!supabaseClient || mode === "two-player" || mode === "online") return;
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData.user) {
      console.error("Unable to identify player for leaderboard submission.", userError);
      return;
    }
    const score = mode === "time-attack" ? playerScore : won ? playerScore : 0;
    if (score <= 0) return;
    const { error } = await supabaseClient.from("leaderboard").insert({
      user_id: userData.user.id,
      nickname: playerName(),
      score,
      mode: MODES[mode].label
    });
    if (error) {
      $("#leaderboard-note").textContent = "Score could not be saved. Check your leaderboard table policies.";
      console.error("Unable to submit leaderboard score.", error);
      return;
    }
    await loadLeaderboard();
  }

  function broadcast(event, payload) {
    if (!onlineChannel) return;
    onlineChannel.send({ type: "broadcast", event, payload }).then(({ error }) => {
      if (error) console.error(`Could not send online ${event} event.`, error);
    });
  }

  async function openOnlineRoom(code, role) {
    if (!supabaseClient) {
      $("#online-status").textContent = "Configure Supabase first. See the online setup guide in README.";
      return;
    }
    if (onlineChannel) {
      try {
        await supabaseClient.removeChannel(onlineChannel);
      } catch (error) {
        $("#online-status").textContent = "Could not close the previous room connection.";
        console.error("Unable to close the previous online room.", error);
        return;
      }
    }
    mode = "online";
    onlineRole = role;
    refreshModeUI();
    const roomCode = code.toUpperCase();
    $("#room-code").value = roomCode;
    $("#online-status").textContent = `Connecting to room ${roomCode}…`;
    onlineChannel = supabaseClient.channel(`rally-room:${roomCode}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "join" }, () => {
        if (onlineRole !== "host") return;
        $("#online-status").textContent = "Opponent connected. Match started!";
        startGame();
      })
      .on("broadcast", { event: "pause-request" }, () => {
        if (onlineRole === "host") pauseGame();
      })
      .on("broadcast", { event: "start" }, ({ payload }) => {
        if (onlineRole === "guest") {
          state = payload.state || "playing";
          serveTimer = payload.countdown || 0;
          pauseIndicator.classList.remove("is-visible");
          countdownElement.classList.toggle("is-visible", state === "countdown");
          if (state === "countdown") countdownElement.textContent = String(Math.ceil(serveTimer));
          hideOverlay();
          updateStatus(state === "countdown" ? "GET READY" : "ONLINE MATCH", state === "playing");
        }
      })
      .on("broadcast", { event: "paused" }, ({ payload }) => {
        if (onlineRole === "guest") {
          pausedState = payload.resumeState || (payload.countdown > 0 ? "countdown" : "playing");
          serveTimer = payload.countdown || 0;
          state = "paused";
          pauseIndicator.classList.add("is-visible");
          updateStatus("MATCH PAUSED");
        }
      })
      .on("broadcast", { event: "paddle" }, ({ payload }) => {
        if (onlineRole === "host") remoteY = payload.y;
      })
      .on("broadcast", { event: "state" }, ({ payload }) => {
        if (onlineRole === "guest") {
          remoteY = payload.y;
          cpuY = payload.y;
          ball = payload.ball;
          playerScore = payload.playerScore;
          cpuScore = payload.cpuScore;
          state = payload.state;
          serveTimer = payload.countdown || 0;
          countdownElement.classList.toggle("is-visible", state === "countdown");
          if (state === "countdown") countdownElement.textContent = String(Math.ceil(serveTimer));
          updateScore();
          if (state === "over") {
            showOverlay({ kicker: "MATCH COMPLETE", title: "Good game.", copy: "Play another round with a new room.", button: "PLAY AGAIN" });
          }
        }
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") $("#online-status").textContent = `Room connection failed (${status}).`;
          return;
        }
        if (role === "host") {
          $("#online-status").textContent = `Room ${roomCode} is ready. Share the code with a friend.`;
        } else {
          $("#online-status").textContent = `Joined room ${roomCode}. Waiting for the host to start.`;
          broadcast("join", { joined: true });
        }
      });
    if (role === "host") {
      showOverlay({ kicker: "ROOM READY", title: "Waiting for<br />a challenger.", copy: `Share room code ${roomCode} with your friend.`, button: "CANCEL ROOM" });
    } else {
      showOverlay({ kicker: "JOINING ROOM", title: "Finding your<br />opponent.", copy: "Waiting for the room host.", button: "CANCEL" });
    }
    startButton.disabled = true;
  }

  $("#mode-select").addEventListener("change", (event) => {
    if (onlineChannel && supabaseClient) {
      supabaseClient.removeChannel(onlineChannel).catch((error) => {
        console.error("Unable to close the online room.", error);
      });
      onlineChannel = null;
    }
    if (state === "playing" || state === "countdown") resetGame();
    mode = event.target.value;
    onlineRole = null;
    refreshModeUI();
    resetGame();
  });
  $("#difficulty-select").addEventListener("change", () => writeStorage("rally-difficulty", $("#difficulty-select").value));
  const savedDifficulty = readStorage("rally-difficulty", "normal");
  if (DIFFICULTIES[savedDifficulty]) $("#difficulty-select").value = savedDifficulty;
  $("#player-name").addEventListener("change", () => {
    $("#player-name").value = playerName();
    writeStorage("rally-player-name", playerName());
    refreshModeUI();
  });
  $("#settings-button").addEventListener("click", () => $("#settings-dialog").showModal());
  $("#settings-dialog").addEventListener("change", (event) => {
    const map = { "sound-toggle": "sound", "music-toggle": "music", "effects-toggle": "effects", "powerups-toggle": "powerups" };
    const setting = map[event.target.id];
    if (!setting) return;
    settings[setting] = event.target.checked;
    if (setting === "music") setMusic(event.target.checked);
    if (setting === "powerups" && !event.target.checked) {
      powerup = null;
      powerEffect = null;
      $("#powerup-message").classList.remove("is-visible");
    }
    writeStorage("rally-settings", settings);
  });
  $("#serve-left").addEventListener("click", () => {
    serveSide = "left";
    $("#serve-left").classList.add("is-selected");
    $("#serve-right").classList.remove("is-selected");
  });
  $("#serve-right").addEventListener("click", () => {
    serveSide = "right";
    $("#serve-right").classList.add("is-selected");
    $("#serve-left").classList.remove("is-selected");
  });
  $("#next-serve-left").addEventListener("click", () => {
    serveSide = "left";
    $("#next-serve-left").classList.add("is-selected");
    $("#next-serve-right").classList.remove("is-selected");
  });
  $("#next-serve-right").addEventListener("click", () => {
    serveSide = "right";
    $("#next-serve-right").classList.add("is-selected");
    $("#next-serve-left").classList.remove("is-selected");
  });
  startButton.addEventListener("click", () => {
    if (state === "ready" || state === "over") serveSide = $("#serve-right").classList.contains("is-selected") ? "right" : "left";
    startGame();
  });
  $("#reset-button").addEventListener("click", resetGame);
  $("#clear-history").addEventListener("click", () => {
    recentMatches = [];
    writeStorage("rally-match-history", recentMatches);
    renderHistory();
  });
  $("#share-button").addEventListener("click", async () => {
    const result = `I’m playing Rally Pong! ${mode === "endless" ? `My high score is ${highScore}.` : `The score is ${playerScore}—${cpuScore}.`} Can you beat me?`;
    try {
      if (navigator.share) await navigator.share({ title: "Rally — Pong", text: result, url: location.href });
      else {
        await navigator.clipboard.writeText(`${result} ${location.href}`);
        updateStatus("MATCH LINK COPIED");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        updateStatus("SHARING UNAVAILABLE");
        console.error("Could not share match.", error);
      }
    }
  });
  $("#host-button").addEventListener("click", () => {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 5 }, () => characters[Math.floor(Math.random() * characters.length)]).join("");
    openOnlineRoom(code, "host");
  });
  $("#join-button").addEventListener("click", () => {
    const code = $("#room-code").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) {
      $("#online-status").textContent = "Enter the 5-character room code shared by your friend.";
      return;
    }
    openOnlineRoom(code, "guest");
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      pointer.active = true;
      pointer.side = (event.clientX - canvas.getBoundingClientRect().left) < canvas.getBoundingClientRect().width / 2 ? "left" : "right";
      pointer.y = pointerY(event);
      canvas.setPointerCapture(event.pointerId);
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointer.active) pointer.y = pointerY(event);
  });
  canvas.addEventListener("pointerup", () => { pointer.active = false; });
  canvas.addEventListener("pointercancel", () => { pointer.active = false; });
  document.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", " "].includes(event.key)) event.preventDefault();
    keysDown.add(event.key);
    if (event.key === " " && !event.repeat) {
      if ((state === "playing" || state === "countdown") && mode === "online" && onlineRole === "guest") broadcast("pause-request", { pause: true });
      else if (state === "playing" || state === "countdown") pauseGame();
      else if (state === "paused") startGame();
    }
  });
  document.addEventListener("keyup", (event) => keysDown.delete(event.key));
  window.addEventListener("blur", () => keysDown.clear());

  loadRecords();
  refreshModeUI();
  resetGame();
  connectSupabase();
  window.requestAnimationFrame(frame);
})();
