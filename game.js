(() => {
  const canvas = document.querySelector("#game-canvas");
  const context = canvas.getContext("2d");
  const overlay = document.querySelector("#game-overlay");
  const overlayKicker = document.querySelector("#overlay-kicker");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayCopy = document.querySelector("#overlay-copy");
  const startButton = document.querySelector("#start-button");
  const buttonLabel = document.querySelector("#button-label");
  const pauseIndicator = document.querySelector("#pause-indicator");
  const playerScoreElement = document.querySelector("#player-score");
  const cpuScoreElement = document.querySelector("#cpu-score");
  const gameStatus = document.querySelector("#game-status");
  const statusDot = document.querySelector("#status-dot");
  const resetButton = document.querySelector("#reset-button");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const WINNING_SCORE = 7;
  const PADDLE_WIDTH = 12;
  const PADDLE_HEIGHT = 96;
  const BALL_RADIUS = 9;
  const PLAYER_X = 32;
  const CPU_X = WIDTH - 32 - PADDLE_WIDTH;
  const keysDown = new Set();
  const pointer = { active: false, y: HEIGHT / 2 };

  let playerY = HEIGHT / 2 - PADDLE_HEIGHT / 2;
  let cpuY = playerY;
  let ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 };
  let playerScore = 0;
  let cpuScore = 0;
  let state = "ready";
  let lastFrameTime = 0;
  let cpuReaction = 0;

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

    context.fillStyle = "#d7ff63";
    context.shadowColor = "rgba(215, 255, 99, 0.55)";
    context.shadowBlur = 18;
    context.beginPath();
    context.roundRect(PLAYER_X, playerY, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
    context.fill();

    context.fillStyle = "#66e4e0";
    context.shadowColor = "rgba(102, 228, 224, 0.5)";
    context.beginPath();
    context.roundRect(CPU_X, cpuY, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
    context.fill();

    context.fillStyle = "#f3f5f8";
    context.shadowColor = "rgba(255, 255, 255, 0.75)";
    context.beginPath();
    context.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
  }

  function clampPaddle(y) {
    return Math.max(12, Math.min(HEIGHT - PADDLE_HEIGHT - 12, y));
  }

  function updateScore() {
    playerScoreElement.textContent = String(playerScore);
    cpuScoreElement.textContent = String(cpuScore);
  }

  function updateStatus(text, live = false) {
    gameStatus.textContent = text;
    statusDot.classList.toggle("is-live", live);
  }

  function showOverlay({ kicker, title, copy, button }) {
    overlayKicker.textContent = kicker;
    overlayTitle.innerHTML = title;
    overlayCopy.textContent = copy;
    buttonLabel.textContent = button;
    overlay.classList.remove("is-hidden");
  }

  function hideOverlay() {
    overlay.classList.add("is-hidden");
  }

  function serveBall(direction = Math.random() < 0.5 ? -1 : 1) {
    const angle = (Math.random() * 0.7 - 0.35);
    const speed = 440;
    ball = {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      vx: Math.cos(angle) * speed * direction,
      vy: Math.sin(angle) * speed
    };
  }

  function startGame() {
    if (state === "paused") {
      state = "playing";
      pauseIndicator.classList.remove("is-visible");
      hideOverlay();
      updateStatus("MATCH IN PROGRESS", true);
      return;
    }

    if (state === "over") {
      playerScore = 0;
      cpuScore = 0;
      updateScore();
    }

    state = "playing";
    playerY = HEIGHT / 2 - PADDLE_HEIGHT / 2;
    cpuY = playerY;
    serveBall();
    hideOverlay();
    pauseIndicator.classList.remove("is-visible");
    updateStatus("MATCH IN PROGRESS", true);
  }

  function pauseGame() {
    if (state !== "playing") return;
    state = "paused";
    pauseIndicator.classList.add("is-visible");
    showOverlay({
      kicker: "TAKE YOUR TIME",
      title: "Game on<br />your terms.",
      copy: "The match is paused. Ready when you are.",
      button: "RESUME GAME"
    });
    updateStatus("MATCH PAUSED");
  }

  function finishGame(winner) {
    state = "over";
    const playerWon = winner === "player";
    showOverlay({
      kicker: playerWon ? "THAT'S A WRAP" : "GOOD GAME",
      title: playerWon ? "You got<br />the W." : "CPU takes<br />the match.",
      copy: playerWon ? "Nice hands. Fancy a rematch?" : "The next one is yours. Run it back?",
      button: "PLAY AGAIN"
    });
    updateStatus(playerWon ? "MATCH WON" : "MATCH COMPLETE");
  }

  function awardPoint(scoringSide) {
    if (scoringSide === "player") {
      playerScore += 1;
    } else {
      cpuScore += 1;
    }
    updateScore();

    if (playerScore >= WINNING_SCORE || cpuScore >= WINNING_SCORE) {
      finishGame(playerScore >= WINNING_SCORE ? "player" : "cpu");
      return;
    }

    serveBall(scoringSide === "player" ? 1 : -1);
  }

  function moveCpu(delta) {
    const target = ball.vx > 0 ? ball.y - PADDLE_HEIGHT / 2 : HEIGHT / 2 - PADDLE_HEIGHT / 2;
    const difference = target - cpuY;
    const speed = 345;
    cpuY = clampPaddle(cpuY + Math.sign(difference) * Math.min(Math.abs(difference), speed * delta));
  }

  function moveBall(delta) {
    ball.x += ball.vx * delta;
    ball.y += ball.vy * delta;

    if (ball.y - BALL_RADIUS <= 0 || ball.y + BALL_RADIUS >= HEIGHT) {
      ball.y = Math.max(BALL_RADIUS, Math.min(HEIGHT - BALL_RADIUS, ball.y));
      ball.vy *= -1;
    }

    const playerHit = ball.vx < 0
      && ball.x - BALL_RADIUS <= PLAYER_X + PADDLE_WIDTH
      && ball.x + BALL_RADIUS >= PLAYER_X
      && ball.y >= playerY
      && ball.y <= playerY + PADDLE_HEIGHT;
    const cpuHit = ball.vx > 0
      && ball.x + BALL_RADIUS >= CPU_X
      && ball.x - BALL_RADIUS <= CPU_X + PADDLE_WIDTH
      && ball.y >= cpuY
      && ball.y <= cpuY + PADDLE_HEIGHT;

    if (playerHit) {
      const impact = (ball.y - (playerY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
      ball.x = PLAYER_X + PADDLE_WIDTH + BALL_RADIUS;
      ball.vx = Math.abs(ball.vx) * 1.045;
      ball.vy = impact * 440;
    } else if (cpuHit) {
      const impact = (ball.y - (cpuY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
      ball.x = CPU_X - BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx) * 1.045;
      ball.vy = impact * 440;
    }

    if (ball.x < -BALL_RADIUS) awardPoint("cpu");
    if (ball.x > WIDTH + BALL_RADIUS) awardPoint("player");
  }

  function update(delta) {
    if (pointer.active) {
      playerY = clampPaddle(pointer.y - PADDLE_HEIGHT / 2);
    } else {
      const movingUp = keysDown.has("ArrowUp") || keysDown.has("w") || keysDown.has("W");
      const movingDown = keysDown.has("ArrowDown") || keysDown.has("s") || keysDown.has("S");
      const direction = Number(movingDown) - Number(movingUp);
      playerY = clampPaddle(playerY + direction * 510 * delta);
    }

    if (state === "playing") {
      cpuReaction += delta;
      if (cpuReaction > 0.14) {
        moveCpu(cpuReaction);
        cpuReaction = 0;
      }
      moveBall(delta);
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

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || event.pointerType === "pen") {
      pointer.active = true;
      pointer.y = pointerY(event);
      canvas.setPointerCapture(event.pointerId);
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (pointer.active) pointer.y = pointerY(event);
  });

  function stopPointer() {
    pointer.active = false;
  }

  canvas.addEventListener("pointerup", stopPointer);
  canvas.addEventListener("pointercancel", stopPointer);

  document.addEventListener("keydown", (event) => {
    const key = event.key;
    if (["ArrowUp", "ArrowDown", " "].includes(key)) event.preventDefault();
    keysDown.add(key);

    if (key === " " && !event.repeat) {
      if (state === "playing") pauseGame();
      else if (state === "paused") startGame();
    }
  });

  document.addEventListener("keyup", (event) => keysDown.delete(event.key));
  window.addEventListener("blur", () => keysDown.clear());
  startButton.addEventListener("click", startGame);
  resetButton.addEventListener("click", () => {
    playerScore = 0;
    cpuScore = 0;
    playerY = HEIGHT / 2 - PADDLE_HEIGHT / 2;
    cpuY = playerY;
    ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 };
    state = "ready";
    updateScore();
    updateStatus("WAITING TO PLAY");
    pauseIndicator.classList.remove("is-visible");
    showOverlay({
      kicker: "READY WHEN YOU ARE",
      title: "Make some<br />noise.",
      copy: "First one to 7 takes the match.",
      button: "START GAME"
    });
  });

  drawCourt();
  window.requestAnimationFrame(frame);
})();
