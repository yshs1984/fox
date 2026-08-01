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
    // 画面幅が変わった場合、おさんぽ中の狐が画面外に出ないようにする
    if (state.wander.initialized) {
      const margin = CONFIG.wanderMargin;
      state.wander.x = clamp(state.wander.x, margin, W - margin);
      state.wander.targetX = clamp(state.wander.targetX, margin, W - margin);
    }
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
    playEnergyCost: 14,     // 「あそぶ」ミニゲーム1回で減る体力（結果に関わらず一定）
    playSatietyCost: 6,     // 「あそぶ」ミニゲーム1回で減る満腹度（お腹がすく。結果に関わらず一定）
    cleanAmount: 35,        // 掃除1回で増える清潔度

    // --- あそぶ（どんぐりキャッチのミニゲーム） ---
    playMinigameDuration: 8,  // ミニゲームの時間（秒）
    acornSpawnInterval: 0.65, // どんぐりが降ってくる間隔（秒）
    acornFallSpeed: 150,      // どんぐりの落下速度（px/秒）
    acornRadius: 16,          // どんぐりの大きさ
    moodPerCatch: 6,          // どんぐり1個キャッチするごとに増える機嫌
    missedMoodPenalty: 2,     // どんぐりを取りこぼすと減る機嫌
    foxMoveEase: 9,           // ミニゲーム中、狐が指の位置へ寄っていく速さ（大きいほど機敏）
    foxCatchWidth: 46,        // 狐がどんぐりを受け止められる横幅（半径。狐の胴回りに合わせた目安）

    // --- 操作のクールダウン（連打防止・秒） ---
    feedCooldown: 1.2,
    playCooldown: 1.6,
    cleanCooldown: 1.4,

    // --- 睡眠中に時間経過を早める倍率（他ステータスの減少にも掛かる） ---
    sleepTimeScale: 1.6,

    // --- たまご ---
    hatchPerTap: 14,     // 「あたためる」1回で増える孵化度
    hatchCooldown: 0.15, // 連打防止（秒）

    // --- なでる（狐を直接タップ） ---
    petMoodAmount: 6,    // なでる1回で増える機嫌
    petCooldown: 0.5,    // 連打防止（秒）

    // --- 病気 ---
    // お世話不足（いずれかのステータスがしきい値未満）の間、1秒ごとにこの確率で病気になる
    sickChancePerSec: 0.03,
    sickMoodDecayMult: 2.2,   // 病気の間、機嫌の減りが何倍になるか
    sickEnergyDecayMult: 2.0, // 病気の間、体力の減りが何倍になるか

    // --- 朝夜のサイクル ---
    dayLengthSec: 70,    // 昼の長さ（秒）
    nightLengthSec: 35,  // 夜の長さ（秒）
    nightSleepBonus: 1.6, // 夜に寝ると体力回復が何倍になるか

    // --- 成長 ---
    // 平均ステータスがこの値以上を保てている時間だけ「良いお世話の時間」として積み上がる
    careGrowthMinAvg: 55,
    // 良いお世話の時間がこの秒数に達するたびステージが1つ進む（[子狐→若狐, 若狐→成獣狐]）
    growthStageSeconds: [45, 110],

    // --- 演出 ---
    bounceDuration: 0.4,     // お世話操作をしたときのジャンプ演出の長さ（秒）
    bannerDuration: 2.4,     // 成長バナーの表示時間（秒）
    tailWagSpeed: 3.2,       // しっぽを振る速さ（機嫌が良いほど速く振れる）

    // --- レイアウト ---
    groundRatio: 0.72,       // 地面の開始位置（画面の高さに対する割合）。キャラクターの足元をここに合わせる

    // --- 待機中のおさんぽ（選択肢を待っている間、狐が自分で歩き回る） ---
    wanderEase: 6,       // 目的地へ寄っていく速さ
    wanderPauseMin: 2,   // 立ち止まってから次に歩き出すまでの時間（最小・秒）
    wanderPauseMax: 5,   // 同（最大・秒）
    wanderMargin: 60,    // 歩き回れる範囲の左右の余白（px）

    // --- 倍速モード ---
    speedMultiplier: 2   // 倍速モードON時、時間の流れが何倍速くなるか（ミニゲーム中は対象外）
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
    sick: false,
    speedMode: false,     // 倍速モードのON/OFF
    goodCareSeconds: 0,   // 「良いお世話」が続いた累計秒数（この値で成長判定する）
    elapsed: 0,           // プレイ開始からの経過秒数（朝夜サイクルにも使う）
    bounce: 0,            // お世話演出のジャンプ量(0〜1、減衰していく)
    tailPhase: 0,
    bannerTimer: 0,
    bannerText: '',
    reachedAdult: false,
    hearts: [],           // なでたときのハート演出
    snacks: [],           // エサやりで出てくるあぶらあげの演出
    minigame: null,       // 「あそぶ」中のどんぐりキャッチの状態（非nullの間だけ進行中）
    // 選択肢を待っている間、狐が自分で歩き回るための状態
    wander: {
      initialized: false,
      x: 0, targetX: 0,
      walking: false, facing: 1, walkPhase: 0,
      pauseTimer: 1.5
    },
    cooldown: { feed: 0, play: 0, clean: 0, warm: 0, pet: 0 }
  };

  // 今が夜かどうか（昼→夜を dayLengthSec+nightLengthSec の周期で繰り返す）
  function isNight() {
    const cycle = CONFIG.dayLengthSec + CONFIG.nightLengthSec;
    return state.elapsed % cycle >= CONFIG.dayLengthSec;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---------- 入力（画面下部の操作ボタン） ----------
  const buttons = {
    feed: { x: 0, y: 0, w: 0, h: 0, label: 'あぶらあげ', key: 'feed' },
    play: { x: 0, y: 0, w: 0, h: 0, label: 'あそぶ', key: 'play' },
    clean: { x: 0, y: 0, w: 0, h: 0, label: 'そうじ', key: 'clean' },
    sleep: { x: 0, y: 0, w: 0, h: 0, label: 'ねる', key: 'sleep' },
    warm: { x: 0, y: 0, w: 0, h: 0, label: 'あたためる', key: 'warm' },
    medicine: { x: 0, y: 0, w: 0, h: 0, label: 'くすり', key: 'medicine' },
    speed: { x: 0, y: 0, w: 0, h: 0, label: '×2', key: 'speed' }
  };

  const KEY_ACTIONS = {
    Digit1: 'feed', KeyF: 'feed',
    Digit2: 'play', KeyP: 'play',
    Digit3: 'clean', KeyC: 'clean',
    Digit4: 'sleep', KeyS: 'sleep',
    Space: 'warm', KeyW: 'warm',
    Digit5: 'medicine', KeyM: 'medicine',
    Digit6: 'speed', KeyX: 'speed'
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

    // 病気のときだけ表示する「くすり」ボタン（お世話ボタン列の上の中央）
    const medW = Math.min(160, W - gap * 2);
    buttons.medicine.x = (W - medW) / 2;
    buttons.medicine.y = y - h - gap;
    buttons.medicine.w = medW;
    buttons.medicine.h = h;

    // 倍速モードの切り替えボタン（常に右上に固定表示）
    const speedSize = 44;
    buttons.speed.x = W - speedSize - 12;
    buttons.speed.y = 12;
    buttons.speed.w = speedSize;
    buttons.speed.h = speedSize;
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
    state.snacks.push({
      x: currentFoxX() + (Math.random() - 0.5) * 40,
      y: groundY() - 200,
      life: 1
    });
    triggerBounce();
  }

  // 「あそぶ」= どんぐりキャッチのミニゲームを開始する（病気の間は遊べない）
  // 狐を左右にドラッグして動かし、落ちてくるどんぐりの真下で受け止める
  function doPlay() {
    if (state.sleeping || state.sick || state.cooldown.play > 0 || state.minigame) return;
    state.cooldown.play = CONFIG.playCooldown;
    state.minigame = {
      timeLeft: CONFIG.playMinigameDuration,
      spawnTimer: 0,
      score: 0,
      missed: 0,
      acorns: [],
      foxX: W / 2,
      targetX: W / 2,
      walkPhase: 0,   // 歩きモーションの周期
      facing: 1,      // 直近の移動方向（1:右 -1:左）
      walking: false  // 今のフレームで動いているか
    };
  }

  // ミニゲーム中、狐を動かす目標位置を指の位置に合わせる
  function steerFox(pos) {
    const mg = state.minigame;
    if (!mg) return;
    const margin = 50;
    mg.targetX = clamp(pos.x, margin, W - margin);
  }

  function finishMinigame() {
    const mg = state.minigame;
    const moodDelta = mg.score * CONFIG.moodPerCatch - mg.missed * CONFIG.missedMoodPenalty;
    stats.mood = clamp(stats.mood + moodDelta, 0, 100);
    stats.energy = clamp(stats.energy - CONFIG.playEnergyCost, 0, 100);
    stats.satiety = clamp(stats.satiety - CONFIG.playSatietyCost, 0, 100);
    state.minigame = null;
    state.bannerTimer = CONFIG.bannerDuration;
    state.bannerText = `どんぐり${mg.score}こキャッチ！`;
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

  function doMedicine() {
    if (!state.sick) return;
    state.sick = false;
    stats.mood = clamp(stats.mood + 10, 0, 100); // 治ると少し機嫌が良くなる
    state.bannerTimer = CONFIG.bannerDuration;
    state.bannerText = 'びょうきがなおりました！';
    triggerBounce();
  }

  // 狐を直接なでる（寝ている間や病気のときもなでられる）
  function doPet() {
    if (state.stage === EGG_STAGE || state.cooldown.pet > 0) return;
    stats.mood = clamp(stats.mood + CONFIG.petMoodAmount, 0, 100);
    state.cooldown.pet = CONFIG.petCooldown;
    state.hearts.push({
      x: currentFoxX() + (Math.random() - 0.5) * 60,
      y: groundY() - 190,
      life: 1
    });
  }

  // 地面のy座標（キャラクターの足元をここに合わせる）
  function groundY() { return H * CONFIG.groundRatio; }

  // 狐の現在の横位置（ミニゲーム中はドラッグ位置、それ以外はおさんぽ中の位置）
  function currentFoxX() {
    if (state.stage === EGG_STAGE || state.sleeping) return W / 2;
    if (state.minigame) return state.minigame.foxX;
    return state.wander.x;
  }

  // 狐が描かれているあたりのタップ判定（ざっくり円で判定する）
  function inFoxArea(px, py) {
    const dx = px - currentFoxX();
    const dy = py - (groundY() - 90);
    return Math.hypot(dx, dy) < 110;
  }

  // 倍速モードを切り替える（ミニゲーム中は対象外なので押せない）
  function doToggleSpeed() {
    if (state.minigame) return;
    state.speedMode = !state.speedMode;
  }

  const ACTIONS = { feed: doFeed, play: doPlay, clean: doClean, sleep: toggleSleep, warm: doWarm, medicine: doMedicine, speed: doToggleSpeed };

  function handlePointerDown(pos) {
    // ミニゲーム中はドラッグで狐を操作するだけで、他の操作は行えない
    if (state.minigame) {
      steerFox(pos);
      return;
    }
    const keys = state.stage === EGG_STAGE ? ['warm'] : ['feed', 'play', 'clean', 'sleep'];
    if (state.sick) keys.push('medicine');
    keys.push('speed'); // 倍速ボタンは常に右上に表示される
    for (const key of keys) {
      if (inRect(pos.x, pos.y, buttons[key])) {
        ACTIONS[key]();
        return;
      }
    }
    // ボタン以外で狐に触れたら「なでる」
    if (state.stage !== EGG_STAGE && inFoxArea(pos.x, pos.y)) {
      doPet();
    }
  }

  function onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      handlePointerDown(localPos(t.clientX, t.clientY));
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      steerFox(localPos(t.clientX, t.clientY));
    }
  }
  let mouseDragging = false;
  function onMouseDown(e) {
    mouseDragging = true;
    handlePointerDown(localPos(e.clientX, e.clientY));
  }
  function onMouseMove(e) {
    if (!mouseDragging) return;
    steerFox(localPos(e.clientX, e.clientY));
  }
  function onMouseUp() {
    mouseDragging = false;
  }
  function onKeyDown(e) {
    if (state.minigame) return; // ミニゲーム中はドラッグでのみ操作できる
    const action = KEY_ACTIONS[e.code];
    if (action) {
      e.preventDefault();
      ACTIONS[action]();
    }
  }

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseUp);
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
    const moodMult = state.sick ? CONFIG.sickMoodDecayMult : 1;
    const energyMult = state.sick ? CONFIG.sickEnergyDecayMult : 1;

    stats.satiety = clamp(stats.satiety - CONFIG.satietyDecayPerSec * mult * sdt, 0, 100);
    stats.mood = clamp(stats.mood - CONFIG.moodDecayPerSec * mult * moodMult * sdt, 0, 100);
    stats.cleanliness = clamp(stats.cleanliness - CONFIG.cleanlinessDecayPerSec * mult * sdt, 0, 100);

    if (state.sleeping) {
      const bonus = isNight() ? CONFIG.nightSleepBonus : 1; // 夜に寝るとよく回復する
      stats.energy = clamp(stats.energy + CONFIG.energyRecoverPerSecSleep * bonus * dt, 0, 100);
      if (stats.energy >= 100) state.sleeping = false; // 満タンになったら自然に起きる
    } else {
      stats.energy = clamp(stats.energy - CONFIG.energyDecayPerSecAwake * mult * energyMult * dt, 0, 100);
    }
  }

  // お世話不足が続いていると、確率で病気になる
  function updateSickness(dt) {
    if (state.sick) return;
    if (lowStatMultiplier() === 1) return; // どのステータスも足りていれば病気にならない
    if (Math.random() < CONFIG.sickChancePerSec * dt) {
      state.sick = true;
      state.sleeping = false;
      state.bannerTimer = CONFIG.bannerDuration;
      state.bannerText = 'びょうきになってしまった…';
    }
  }

  // どんぐりキャッチのミニゲームの進行（出現・落下・取りこぼし判定）
  function updateMinigame(dt) {
    const mg = state.minigame;
    if (!mg) return;

    mg.timeLeft -= dt;
    if (mg.timeLeft <= 0) {
      finishMinigame();
      return;
    }

    // 狐を目標位置（指でドラッグした場所）へなめらかに寄せる
    const prevFoxX = mg.foxX;
    mg.foxX += (mg.targetX - mg.foxX) * Math.min(1, dt * CONFIG.foxMoveEase);
    const moveDelta = mg.foxX - prevFoxX;
    mg.walking = Math.abs(moveDelta) > 0.1;
    if (mg.walking) {
      mg.facing = moveDelta > 0 ? 1 : -1;
      mg.walkPhase += dt * (10 + Math.min(18, Math.abs(moveDelta) * 3)); // 動きが速いほど歩幅が早まる
    }

    mg.spawnTimer -= dt;
    if (mg.spawnTimer <= 0) {
      mg.spawnTimer = CONFIG.acornSpawnInterval;
      mg.acorns.push({ x: 34 + Math.random() * (W - 68), y: -20, caught: false });
    }

    const gy = groundY();
    const scale = foxScale();
    const catchY = gy - 70 * scale;               // 狐の胴のあたり。ここまで落ちてきたら受け止め判定を行う
    const catchRadius = CONFIG.foxCatchWidth * scale + CONFIG.acornRadius;
    for (const a of mg.acorns) {
      if (a.caught) {
        a.y -= 70 * dt;
        a.fade -= dt * 2;
      } else {
        a.y += CONFIG.acornFallSpeed * dt;
        if (a.y >= catchY && Math.abs(a.x - mg.foxX) < catchRadius) {
          a.caught = true;
          a.fade = 1;
          mg.score += 1;
        } else if (a.y - CONFIG.acornRadius > gy) {
          a.missed = true;
          mg.missed += 1;
        }
      }
    }
    mg.acorns = mg.acorns.filter(a => !a.missed && !(a.caught && a.fade <= 0));
  }

  // 選択肢を待っている間、狐が地面の上をのんびり歩き回る
  function updateWander(dt) {
    const w = state.wander;
    if (!w.initialized) {
      w.x = W / 2;
      w.targetX = W / 2;
      w.initialized = true;
    }
    // たまご・睡眠中・ミニゲーム中は歩き回らない
    if (state.stage === EGG_STAGE || state.sleeping || state.minigame) {
      w.walking = false;
      return;
    }

    if (Math.abs(w.x - w.targetX) < 1.5) {
      // 目的地に着いたら少し立ち止まってから、次の行き先を決める
      w.walking = false;
      w.pauseTimer -= dt;
      if (w.pauseTimer <= 0) {
        const margin = CONFIG.wanderMargin;
        w.targetX = margin + Math.random() * (W - margin * 2);
        w.pauseTimer = CONFIG.wanderPauseMin + Math.random() * (CONFIG.wanderPauseMax - CONFIG.wanderPauseMin);
      }
      return;
    }

    const prevX = w.x;
    w.x += (w.targetX - w.x) * Math.min(1, dt * CONFIG.wanderEase);
    const moveDelta = w.x - prevX;
    w.walking = Math.abs(moveDelta) > 0.1;
    if (w.walking) {
      w.facing = moveDelta > 0 ? 1 : -1;
      w.walkPhase += dt * (8 + Math.min(14, Math.abs(moveDelta) * 3));
    }
  }

  function updateGrowth(dt) {
    if (state.stage === EGG_STAGE) return; // 孵化は doWarm() が扱う
    if (state.stage >= STAGE_NAMES.length - 1) return;
    if (state.sick) return; // 病気の間は成長が止まる
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
    // 倍速モード中は時間の流れを速める（ミニゲーム中は公平を保つため対象外）
    const timeScale = state.speedMode && !state.minigame ? CONFIG.speedMultiplier : 1;
    const gdt = dt * timeScale;

    state.elapsed += gdt;
    for (const k of Object.keys(state.cooldown)) {
      state.cooldown[k] = Math.max(0, state.cooldown[k] - gdt);
    }
    state.bounce = Math.max(0, state.bounce - gdt / CONFIG.bounceDuration);
    state.tailPhase += gdt * CONFIG.tailWagSpeed * (0.4 + stats.mood / 100);
    if (state.bannerTimer > 0) state.bannerTimer = Math.max(0, state.bannerTimer - gdt);

    // なでたときのハートを浮かせながら消していく
    for (const hrt of state.hearts) {
      hrt.y -= 40 * gdt;
      hrt.life -= gdt / 1.2;
    }
    state.hearts = state.hearts.filter(hrt => hrt.life > 0);

    // エサやりのあぶらあげを、狐の口元まで落としてから消す
    for (const snack of state.snacks) {
      snack.y += 90 * gdt;
      snack.life -= gdt / 1.1;
    }
    state.snacks = state.snacks.filter(snack => snack.life > 0);

    if (state.stage !== EGG_STAGE) {
      updateStats(gdt);
      updateSickness(gdt);
    }
    updateMinigame(gdt);
    updateWander(gdt);
    updateGrowth(gdt);
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
    const night = isNight();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    if (night) {
      grad.addColorStop(0, '#1a2450');
      grad.addColorStop(0.6, '#2c3a66');
      grad.addColorStop(1, '#31504a');
    } else {
      grad.addColorStop(0, '#bfe3ff');
      grad.addColorStop(0.6, '#eaf7e0');
      grad.addColorStop(1, '#cdeab0');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    if (night) {
      // 月と星
      ctx.fillStyle = '#fdf3c8';
      ctx.beginPath();
      ctx.arc(W * 0.8, H * 0.13, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2c3a66';
      ctx.beginPath();
      ctx.arc(W * 0.8 + 12, H * 0.13 - 6, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff6d8';
      for (let i = 0; i < 18; i++) {
        // 位置は毎フレーム同じになるよう固定の擬似乱数で決める
        const sx = ((i * 137.5) % 360) / 360 * W;
        const sy = ((i * 89.3) % 200) / 360 * H + H * 0.03;
        ctx.globalAlpha = 0.5 + ((i * 53) % 50) / 100;
        ctx.fillRect(sx, sy, 2.5, 2.5);
      }
      ctx.globalAlpha = 1;
    } else {
      // 太陽
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.arc(W * 0.82, H * 0.12, 30, 0, Math.PI * 2);
      ctx.fill();
    }

    // 地面（少し立体感を出すため、手前ほど濃い色になる帯を重ねる）
    const gy = H * CONFIG.groundRatio;
    ctx.fillStyle = night ? '#4a6b4e' : '#9fd47c';
    ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = night ? '#3d5a41' : '#8ec96b';
    ctx.fillRect(0, gy, W, (H - gy) * 0.4);
  }

  // キャラクターの真下に落ちる影（地面に足がついているように見せる）
  function drawShadow(cx, gy, radiusX) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#132608';
    ctx.beginPath();
    ctx.ellipse(cx, gy, radiusX, radiusX * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // たまごを図形合成で描く（あたため度に応じてひび割れが増え、演出でわずかに揺れる）
  function drawEgg(cx, gy) {
    drawShadow(cx, gy, 40);
    const cy = gy - 58;
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

  // 横になって眠っている狐（丸くなった姿と Zzz を描く）
  function drawFoxSleeping(cx, gy, scale) {
    drawShadow(cx, gy, 74 * scale);
    const cy = gy - 54 * scale;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // 丸くなった体（横長の楕円）
    ctx.fillStyle = '#f2934f';
    ctx.beginPath();
    ctx.ellipse(0, 20, 62, 34, 0, 0, Math.PI * 2);
    ctx.fill();

    // 体に巻き付けたしっぽ
    ctx.fillStyle = '#e8793a';
    ctx.beginPath();
    ctx.ellipse(30, 34, 34, 14, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(56, 40, 11, 8, 0.25, 0, Math.PI * 2);
    ctx.fill();

    // 頭（横向きに体へ乗せる）
    ctx.fillStyle = '#f2934f';
    ctx.beginPath();
    ctx.ellipse(-34, 2, 30, 26, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // 耳
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#f2934f';
      ctx.beginPath();
      ctx.moveTo(-34 + side * 14, -18);
      ctx.lineTo(-34 + side * 26, -42);
      ctx.lineTo(-34 + side * 2, -24);
      ctx.closePath();
      ctx.fill();
    }

    // 閉じた目と口
    ctx.strokeStyle = '#2a1c14';
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(-34 + side * 11, -2, 5, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = '#3a2a22';
    ctx.beginPath();
    ctx.ellipse(-34, 10, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Zzz（ゆっくり浮かんで揺れる）
    const t = state.elapsed;
    ctx.fillStyle = 'rgba(42,28,20,0.7)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const phase = (t * 0.7 + i * 0.33) % 1;
      ctx.font = `bold ${14 + i * 6}px sans-serif`;
      ctx.globalAlpha = 1 - phase;
      ctx.fillText('Z', cx + 50 + i * 18 + Math.sin(t * 2 + i) * 4, cy - 40 - phase * 30 - i * 14);
    }
    ctx.globalAlpha = 1;
  }

  // 成長段階に応じた狐の描画スケール（たまごは対象外）
  function foxScale() {
    const stage = state.stage - 1; // 0:子狐 1:若狐 2:成獣狐
    return 0.62 + stage * 0.24;    // 成長するほど大きくなる
  }

  // 成長段階と機嫌に応じて狐を図形合成で描く
  function drawFox(cx, gy) {
    const scale = foxScale();

    if (state.sleeping) {
      drawFoxSleeping(cx, gy, scale);
      return;
    }

    drawShadow(cx, gy, 48 * scale);
    const footY = gy - 64 * scale; // 体の下端（足元）がここに来るよう合わせる
    const bounceY = Math.sin(Math.min(1, state.bounce) * Math.PI) * 18;

    // 歩いている間は体をぴょこぴょこ弾ませ、左右に少し揺らして歩いている感じを出す
    // （ミニゲーム中はドラッグでの移動、それ以外は待機中のおさんぽが対象）
    const walkSource = state.minigame || state.wander;
    const walking = !!(walkSource && walkSource.walking);
    const walkBob = walking ? Math.abs(Math.sin(walkSource.walkPhase)) * 6 : 0;
    const walkLean = walking ? Math.sin(walkSource.walkPhase) * 5 : 0; // 度

    const y = footY - bounceY - walkBob;
    const happy = !state.sick && stats.mood >= 55;
    const sad = state.sick || stats.mood < CONFIG.lowStatThreshold;

    ctx.save();
    ctx.translate(cx, y);
    ctx.rotate((walkLean * Math.PI) / 180);
    ctx.scale(scale, scale);

    // 足踏みするうしろ足（体より先に描き、体の下からのぞかせる）
    if (walking) {
      ctx.fillStyle = '#e8793a';
      const step = Math.sin(walkSource.walkPhase) * 10;
      ctx.beginPath();
      ctx.ellipse(-15, 56 - step * 0.4, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(15, 56 + step * 0.4, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

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

    // 病気のとき: 汗としんどそうな顔の赤み
    if (state.sick) {
      ctx.fillStyle = '#7db6e8';
      ctx.beginPath();
      ctx.ellipse(30, -40 + Math.sin(state.elapsed * 4) * 3, 5, 8, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(230,100,90,0.4)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 22, -10, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // どんぐりキャッチのミニゲームで降ってくるどんぐり
  function drawAcorns() {
    const mg = state.minigame;
    if (!mg) return;
    for (const a of mg.acorns) {
      ctx.save();
      ctx.globalAlpha = a.caught ? Math.max(0, a.fade) : 1;
      ctx.translate(a.x, a.y);
      // 実
      ctx.fillStyle = '#c9832f';
      ctx.beginPath();
      ctx.ellipse(0, 3, CONFIG.acornRadius * 0.8, CONFIG.acornRadius, 0, 0, Math.PI * 2);
      ctx.fill();
      // 帽子（ぎざぎざの殻斗）
      ctx.fillStyle = '#7a5230';
      ctx.beginPath();
      ctx.arc(0, -CONFIG.acornRadius * 0.35, CONFIG.acornRadius * 0.85, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // エサやりで落ちてくるあぶらあげ
  function drawSnacks() {
    ctx.fillStyle = '#f2c169';
    ctx.strokeStyle = '#c98f3a';
    ctx.lineWidth = 1.5;
    for (const snack of state.snacks) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, snack.life);
      ctx.translate(snack.x, snack.y);
      // 三角形の油揚げ
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(16, 12);
      ctx.lineTo(-16, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // なでたときのハート
  function drawHearts() {
    ctx.fillStyle = '#ff6f9c';
    for (const hrt of state.hearts) {
      ctx.globalAlpha = Math.max(0, hrt.life);
      const s = 8;
      ctx.save();
      ctx.translate(hrt.x, hrt.y);
      ctx.beginPath();
      ctx.arc(-s / 2, 0, s / 2, 0, Math.PI * 2);
      ctx.arc(s / 2, 0, s / 2, 0, Math.PI * 2);
      ctx.moveTo(-s, 2);
      ctx.lineTo(0, s * 1.3);
      ctx.lineTo(s, 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
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

    const textColor = isNight() ? '#f5ead8' : '#2a1c14';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = textColor;
    const suffix = state.minigame ? '（あそんでいる）' : state.sick ? '（びょうき）' : state.sleeping ? '（おやすみ中）' : '';
    ctx.fillText(`${STAGE_NAMES[state.stage]}${suffix}`, pad, pad);

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
      ctx.fillStyle = textColor;
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

  // ミニゲーム中はボタンの代わりに残り時間とスコアを表示する
  function drawMinigameHud() {
    const mg = state.minigame;
    const barH = Math.max(90, Math.min(130, Math.round(H * 0.16)));
    const y = H - barH / 2;
    const barW = Math.min(260, W - 40);
    const bx = (W - barW) / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const hudColor = isNight() ? '#f5ead8' : '#2a1c14';
    ctx.fillStyle = hudColor;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`どんぐりキャッチ！ スコア: ${mg.score}`, W / 2, y - 38);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = hudColor;
    ctx.fillText('ドラッグして狐を動かし、どんぐりを受け止めよう', W / 2, y - 18);

    drawRoundRect(bx, y, barW, 14, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
    drawRoundRect(bx, y, barW * Math.max(0, mg.timeLeft / CONFIG.playMinigameDuration), 14, 7);
    ctx.fillStyle = '#ffb84d';
    ctx.fill();
  }

  function drawButtons() {
    if (state.minigame) {
      drawMinigameHud();
      return;
    }
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
      const locked = (state.sleeping && key !== 'sleep') || (state.sick && key === 'play');
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

    // 病気のときだけ「くすり」ボタンを出す
    if (state.sick) {
      const b = buttons.medicine;
      drawRoundRect(b.x, b.y, b.w, b.h, 12);
      ctx.fillStyle = '#7db6e8';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2a1c14';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    }
  }

  // 倍速モードの切り替えボタン（右上に固定表示。ミニゲーム中は隠す）
  function drawSpeedToggle() {
    if (state.minigame) return;
    const b = buttons.speed;
    drawRoundRect(b.x, b.y, b.w, b.h, 10);
    ctx.fillStyle = state.speedMode ? '#f2934f' : 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2a1c14';
    ctx.stroke();
    ctx.fillStyle = state.speedMode ? '#ffffff' : '#2a1c14';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
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
      drawEgg(W / 2, groundY());
    } else {
      drawFox(currentFoxX(), groundY());
    }
    drawHearts();
    drawSnacks();
    drawAcorns();
    drawStatusBars();
    drawButtons();
    drawSpeedToggle();
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
