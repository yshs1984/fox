(() => {
  'use strict';

  // =====================================================================
  //  狐の育成ゲーム（お世話中心・1ファイル完結・セーブなし）
  //
  //  読み方のおすすめ:
  //   1) 「調整できる設定(CONFIG)」…数字を変えると難易度や見た目が変わります
  //   2) 「ゲームの状態(state)」…今どうなっているかを全部ここに入れます
  //   3) 「入力」→「更新(update)」→「描画(draw)」→「ループ」
  //  という順で読むと流れがつかめます。
  // =====================================================================

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layoutButtons();
  }
  window.addEventListener('resize', resize);

  // ------------------------------------------------------------------
  //  調整できる設定（ここの数字を変えると難易度・見た目が変わります）
  // ------------------------------------------------------------------
  const CONFIG = {
    // --- ステータスの自然減少（1秒あたり） ---
    satietyDecayPerSec: 0.55,    // 満腹度：時間経過で減る量
    moodDecayPerSec: 0.4,        // 機嫌：時間経過で減る量
    cleanlinessDecayPerSec: 0.35,// 清潔度：時間経過で減る量
    energyDecayPerSecAwake: 0.3, // 体力：起きている間、時間経過で減る量
    energyRecoverPerSecSleep: 6, // 体力：寝ている間、1秒あたり回復する量

    // --- 低ステータス時の連鎖ペナルティ ---
    lowStatThreshold: 25,   // この値を下回ると「お世話不足」とみなす
    chainPenaltyMult: 1.8,  // お世話不足のステータスがあると、他の減少速度が何倍になるか

    // --- 操作で変化する量 ---
    feedAmount: 30,        // エサやり1回で増える満腹度
    playMoodAmount: 22,     // 遊ぶ1回で増える機嫌
    playEnergyCost: 14,     // 遊ぶ1回で減る体力
    playSatietyCost: 6,     // 遊ぶ1回で減る満腹度（お腹がすく）
    cleanAmount: 35,        // 掃除1回で増える清潔度

    // --- 操作のクールダウン（連打防止・秒） ---
    feedCooldown: 1.2,
    playCooldown: 1.6,
    cleanCooldown: 1.4,

    // --- 睡眠中に時間経過を早める倍率（他ステータスの減少にも掛かる） ---
    sleepTimeScale: 1.6,

    // --- たまご ---
    hatchPerTap: 14,     // 「あたためる」1回で増える孵化度
    hatchCooldown: 0.15, // 連打防止（秒）

    // --- 成長 ---
    // 平均ステータスがこの値以上を保てている時間だけ「良いお世話の時間」として積み上がる
    careGrowthMinAvg: 55,
    // 良いお世話の時間がこの秒数に達するたびステージが1つ進む（[子狐→若狐, 若狐→成獣狐]）
    growthStageSeconds: [45, 110],

    // --- 演出 ---
    bounceDuration: 0.4,     // お世話操作をしたときのジャンプ演出の長さ（秒）
    bannerDuration: 2.4,     // 成長バナーの表示時間（秒）
    tailWagSpeed: 3.2        // しっぽを振る速さ（機嫌が良いほど速く振れる）
  };

  // ステージ0はまだ狐になっていない「たまご」。あたため続けると孵化する
  const STAGE_NAMES = ['たまご', 'こぎつね', 'わかぎつね', 'せいじゅうのきつね'];
  const EGG_STAGE = 0;

  // ---------- ゲームの状態(state) ----------
  const stats = {
    satiety: 70,
    mood: 70,
    cleanliness: 70,
    energy: 70
  };

  const state = {
    stage: EGG_STAGE,      // 0:たまご 1:子狐 2:若狐 3:成獣狐
    hatchProgress: 0,      // たまごのあたため度（0〜100。100で孵化）
    sleeping: false,
    goodCareSeconds: 0,   // 「良いお世話」が続いた累計秒数（この値で成長判定する）
    elapsed: 0,           // プレイ開始からの経過秒数（表示用）
    bounce: 0,            // お世話演出のジャンプ量(0〜1、減衰していく)
    tailPhase: 0,
    bannerTimer: 0,
    bannerText: '',
    reachedAdult: false,
    cooldown: { feed: 0, play: 0, clean: 0, warm: 0 }
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---------- 入力（画面下部の操作ボタン） ----------
  const buttons = {
    feed: { x: 0, y: 0, w: 0, h: 0, label: 'エサ', key: 'feed' },
    play: { x: 0, y: 0, w: 0, h: 0, label: 'あそぶ', key: 'play' },
    clean: { x: 0, y: 0, w: 0, h: 0, label: 'そうじ', key: 'clean' },
    sleep: { x: 0, y: 0, w: 0, h: 0, label: 'ねる', key: 'sleep' },
    warm: { x: 0, y: 0, w: 0, h: 0, label: 'あたためる', key: 'warm' }
  };

  const KEY_ACTIONS = {
    Digit1: 'feed', KeyF: 'feed',
    Digit2: 'play', KeyP: 'play',
    Digit3: 'clean', KeyC: 'clean',
    Digit4: 'sleep', KeyS: 'sleep',
    Space: 'warm', KeyW: 'warm'
  };

  function layoutButtons() {
    const barH = Math.max(90, Math.min(130, Math.round(H * 0.16)));
    const gap = 12;
    const w = Math.min(140, (W - gap * 5) / 4);
    const h = Math.min(64, barH * 0.6);
    const totalW = w * 4 + gap * 3;
    let x = (W - totalW) / 2;
    const y = H - barH / 2 - h / 2;
    for (const key of ['feed', 'play', 'clean', 'sleep']) {
      buttons[key].x = x;
      buttons[key].y = y;
      buttons[key].w = w;
      buttons[key].h = h;
      x += w + gap;
    }

    // たまご専用の大きなボタン（お世話ボタンと同じ列の中央に配置）
    const warmW = Math.min(220, W - gap * 2);
    const warmH = h;
    buttons.warm.x = (W - warmW) / 2;
    buttons.warm.y = y;
    buttons.warm.w = warmW;
    buttons.warm.h = warmH;
  }

  function localPos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function inRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  function triggerBounce() {
    state.bounce = 1;
  }

  function doFeed() {
    if (state.sleeping || state.cooldown.feed > 0) return;
    stats.satiety = clamp(stats.satiety + CONFIG.feedAmount, 0, 100);
    state.cooldown.feed = CONFIG.feedCooldown;
    triggerBounce();
  }

  function doPlay() {
    if (state.sleeping || state.cooldown.play > 0) return;
    stats.mood = clamp(stats.mood + CONFIG.playMoodAmount, 0, 100);
    stats.energy = clamp(stats.energy - CONFIG.playEnergyCost, 0, 100);
    stats.satiety = clamp(stats.satiety - CONFIG.playSatietyCost, 0, 100);
    state.cooldown.play = CONFIG.playCooldown;
    triggerBounce();
  }

  function doClean() {
    if (state.sleeping || state.cooldown.clean > 0) return;
    stats.cleanliness = clamp(stats.cleanliness + CONFIG.cleanAmount, 0, 100);
    state.cooldown.clean = CONFIG.cleanCooldown;
    triggerBounce();
  }

  function toggleSleep() {
    state.sleeping = !state.sleeping;
    triggerBounce();
  }

  function doWarm() {
    if (state.stage !== EGG_STAGE || state.cooldown.warm > 0) return;
    state.hatchProgress = clamp(state.hatchProgress + CONFIG.hatchPerTap, 0, 100);
    state.cooldown.warm = CONFIG.hatchCooldown;
    triggerBounce();
    if (state.hatchProgress >= 100) {
      state.stage = 1;
      state.hatchProgress = 0;
      state.bannerTimer = CONFIG.bannerDuration;
      state.bannerText = 'たまごがかえりました！';
    }
  }

  const ACTIONS = { feed: doFeed, play: doPlay, clean: doClean, sleep: toggleSleep, warm: doWarm };

  function handlePointerDown(pos) {
    const keys = state.stage === EGG_STAGE ? ['warm'] : ['feed', 'play', 'clean', 'sleep'];
    for (const key of keys) {
      if (inRect(pos.x, pos.y, buttons[key])) {
        ACTIONS[key]();
        return;
      }
    }
  }

  function onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      handlePointerDown(localPos(t.clientX, t.clientY));
    }
  }
  function onMouseDown(e) {
    handlePointerDown(localPos(e.clientX, e.clientY));
  }
  function onKeyDown(e) {
    const action = KEY_ACTIONS[e.code];
    if (action) {
      e.preventDefault();
      ACTIONS[action]();
    }
  }

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('keydown', onKeyDown);

  // ---------- 更新(update) ----------
  function averageStat() {
    return (stats.satiety + stats.mood + stats.cleanliness + stats.energy) / 4;
  }

  function lowStatMultiplier() {
    // 満腹度・機嫌・清潔度のいずれかがしきい値を下回っていたら、減少速度を早める
    const low =
      stats.satiety < CONFIG.lowStatThreshold ||
      stats.mood < CONFIG.lowStatThreshold ||
      stats.cleanliness < CONFIG.lowStatThreshold;
    return low ? CONFIG.chainPenaltyMult : 1;
  }

  function updateStats(dt) {
    const mult = lowStatMultiplier();
    const timeScale = state.sleeping ? CONFIG.sleepTimeScale : 1;
    const sdt = dt * timeScale;

    stats.satiety = clamp(stats.satiety - CONFIG.satietyDecayPerSec * mult * sdt, 0, 100);
    stats.mood = clamp(stats.mood - CONFIG.moodDecayPerSec * mult * sdt, 0, 100);
    stats.cleanliness = clamp(stats.cleanliness - CONFIG.cleanlinessDecayPerSec * mult * sdt, 0, 100);

    if (state.sleeping) {
      stats.energy = clamp(stats.energy + CONFIG.energyRecoverPerSecSleep * dt, 0, 100);
      if (stats.energy >= 100) state.sleeping = false; // 満タンになったら自然に起きる
    } else {
      stats.energy = clamp(stats.energy - CONFIG.energyDecayPerSecAwake * mult * dt, 0, 100);
    }
  }

  function updateGrowth(dt) {
    if (state.stage === EGG_STAGE) return; // 孵化は doWarm() が扱う
    if (state.stage >= STAGE_NAMES.length - 1) return;
    if (averageStat() >= CONFIG.careGrowthMinAvg) {
      state.goodCareSeconds += dt;
    }
    const need = CONFIG.growthStageSeconds[state.stage - 1];
    if (state.goodCareSeconds >= need) {
      state.stage += 1;
      state.goodCareSeconds = 0;
      state.bannerTimer = CONFIG.bannerDuration;
      if (state.stage === STAGE_NAMES.length - 1) {
        state.bannerText = `${STAGE_NAMES[state.stage]}になりました！`;
        state.reachedAdult = true;
      } else {
        state.bannerText = `${STAGE_NAMES[state.stage]}に成長しました`;
      }
    }
  }

  function update(dt) {
    state.elapsed += dt;
    for (const k of Object.keys(state.cooldown)) {
      state.cooldown[k] = Math.max(0, state.cooldown[k] - dt);
    }
    state.bounce = Math.max(0, state.bounce - dt / CONFIG.bounceDuration);
    state.tailPhase += dt * CONFIG.tailWagSpeed * (0.4 + stats.mood / 100);
    if (state.bannerTimer > 0) state.bannerTimer = Math.max(0, state.bannerTimer - dt);

    if (state.stage !== EGG_STAGE) updateStats(dt);
    updateGrowth(dt);
  }

  // ---------- 描画(draw) ----------
  function drawRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#bfe3ff');
    grad.addColorStop(0.6, '#eaf7e0');
    grad.addColorStop(1, '#cdeab0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 地面
    ctx.fillStyle = '#9fd47c';
    const groundY = H * 0.72;
    ctx.fillRect(0, groundY, W, H - groundY);
  }

  // たまごを図形合成で描く（あたため度に応じてひび割れが増え、演出でわずかに揺れる）
  function drawEgg(cx, cy) {
    const wobble = Math.sin(Math.min(1, state.bounce) * Math.PI * 3) * (state.bounce > 0 ? 8 : 0);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((wobble * Math.PI) / 180);

    ctx.fillStyle = '#fdf3d8';
    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 56, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d8c48f';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#f2934f';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(-14, -18, 8, 11, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, 14, 6, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // あたため度に応じてひびを増やす
    const progress = state.hatchProgress;
    ctx.strokeStyle = '#9c8558';
    ctx.lineWidth = 2.5;
    if (progress >= 30) {
      ctx.beginPath();
      ctx.moveTo(-6, -40);
      ctx.lineTo(2, -14);
      ctx.lineTo(-10, 2);
      ctx.stroke();
    }
    if (progress >= 65) {
      ctx.beginPath();
      ctx.moveTo(18, -30);
      ctx.lineTo(8, -6);
      ctx.lineTo(20, 20);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 成長段階と機嫌に応じて狐を図形合成で描く
  function drawFox(cx, cy) {
    const stage = state.stage - 1; // 0:子狐 1:若狐 2:成獣狐（たまごは別関数で描く）
    const scale = 0.62 + stage * 0.24;     // 成長するほど大きくなる
    const bounceY = Math.sin(Math.min(1, state.bounce) * Math.PI) * 18;
    const y = cy - bounceY;
    const happy = stats.mood >= 55;
    const sad = stats.mood < CONFIG.lowStatThreshold;

    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(scale, scale);

    // しっぽ（機嫌が良いほど大きく振れる）
    const tailSwing = Math.sin(state.tailPhase) * (sad ? 6 : 20);
    ctx.save();
    ctx.translate(-46, 10);
    ctx.rotate((tailSwing * Math.PI) / 180);
    ctx.fillStyle = '#e8793a';
    ctx.beginPath();
    ctx.ellipse(-24, 0, 34, 15, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-46, -4, 12, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 体
    ctx.fillStyle = '#f2934f';
    ctx.beginPath();
    ctx.ellipse(0, 30, 46, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 44, 26, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // 耳
    ctx.fillStyle = '#f2934f';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 26, -46);
      ctx.lineTo(side * 44, -80);
      ctx.lineTo(side * 10, -52);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3a2a22';
      ctx.beginPath();
      ctx.moveTo(side * 30, -50);
      ctx.lineTo(side * 39, -70);
      ctx.lineTo(side * 16, -53);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2934f';
    }

    // 頭
    ctx.beginPath();
    ctx.ellipse(0, -20, 38, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    // 顔の白い部分と鼻先
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-20, -14);
    ctx.quadraticCurveTo(0, 14, 20, -14);
    ctx.quadraticCurveTo(10, -30, 0, -30);
    ctx.quadraticCurveTo(-10, -30, -20, -14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a2a22';
    ctx.beginPath();
    ctx.ellipse(0, -6, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 目（機嫌で表情が変わる）
    ctx.fillStyle = '#2a1c14';
    for (const side of [-1, 1]) {
      if (sad) {
        ctx.beginPath();
        ctx.arc(side * 14, -22, 4, Math.PI * 0.15, Math.PI * 0.85);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#2a1c14';
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(side * 14, -24, 4.5, happy ? 3 : 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 口（にっこり/への字）
    ctx.strokeStyle = '#2a1c14';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (sad) {
      ctx.arc(0, 4, 8, Math.PI * 1.15, Math.PI * 1.85, true);
    } else {
      ctx.arc(0, -4, 8, Math.PI * 0.15, Math.PI * 0.85);
    }
    ctx.stroke();

    ctx.restore();
  }

  const STAT_BARS = [
    { key: 'satiety', label: 'まんぷく', color: '#ffb84d' },
    { key: 'mood', label: 'きげん', color: '#ff7ab8' },
    { key: 'cleanliness', label: 'せいけつ', color: '#5cc8ff' },
    { key: 'energy', label: 'たいりょく', color: '#8ce07a' }
  ];

  function drawStatusBars() {
    const pad = 16;
    const barW = Math.min(220, W - pad * 2);
    const barH = 16;
    const gap = 8;
    let y = pad + 30;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#2a1c14';
    ctx.fillText(`${STAGE_NAMES[state.stage]}${state.sleeping ? '（おやすみ中）' : ''}`, pad, pad);

    if (state.stage === EGG_STAGE) {
      ctx.font = '12px sans-serif';
      ctx.fillText('あたため度', pad, y);
      const bx = pad + 74;
      drawRoundRect(bx, y - barH / 2, barW - 74, barH, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();
      drawRoundRect(bx, y - barH / 2, (barW - 74) * (state.hatchProgress / 100), barH, 6);
      ctx.fillStyle = '#ffb84d';
      ctx.fill();
      return;
    }

    for (const bar of STAT_BARS) {
      const v = stats[bar.key];
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#2a1c14';
      ctx.fillText(bar.label, pad, y);

      const bx = pad + 74;
      drawRoundRect(bx, y - barH / 2, barW - 74, barH, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();

      drawRoundRect(bx, y - barH / 2, (barW - 74) * (v / 100), barH, 6);
      ctx.fillStyle = v < CONFIG.lowStatThreshold ? '#e0483f' : bar.color;
      ctx.fill();

      y += barH + gap;
    }
  }

  function drawButtons() {
    if (state.stage === EGG_STAGE) {
      const b = buttons.warm;
      drawRoundRect(b.x, b.y, b.w, b.h, 12);
      ctx.fillStyle = state.cooldown.warm > 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2a1c14';
      ctx.stroke();
      ctx.fillStyle = '#2a1c14';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
      return;
    }
    for (const key of ['feed', 'play', 'clean', 'sleep']) {
      const b = buttons[key];
      const cooling = state.cooldown[key] > 0;
      const locked = state.sleeping && key !== 'sleep';
      const active = key === 'sleep' && state.sleeping;

      drawRoundRect(b.x, b.y, b.w, b.h, 12);
      ctx.fillStyle = locked || cooling ? 'rgba(255,255,255,0.55)' : active ? '#f2934f' : 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2a1c14';
      ctx.stroke();

      ctx.fillStyle = active ? '#ffffff' : '#2a1c14';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    }
  }

  function drawGrowthBanner() {
    if (state.bannerTimer <= 0) return;
    const alpha = Math.min(1, state.bannerTimer / 0.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    const bw = Math.min(420, W - 40), bh = 64;
    const bx = (W - bw) / 2, by = H * 0.28 - bh / 2;
    drawRoundRect(bx, by, bw, bh, 14);
    ctx.fillStyle = 'rgba(42,28,20,0.85)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.bannerText, W / 2, by + bh / 2);
    ctx.restore();
  }

  function draw() {
    drawBackground();
    if (state.stage === EGG_STAGE) {
      drawEgg(W / 2, H * 0.46);
    } else {
      drawFox(W / 2, H * 0.46);
    }
    drawStatusBars();
    drawButtons();
    drawGrowthBanner();
  }

  // ---------- メインループ ----------
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  resize();
  requestAnimationFrame(loop);
})();
