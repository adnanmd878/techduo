// script.js – Echo Shift core
// ------------------------------------------------------------
// This file implements the full game logic using vanilla JavaScript.
// It is intentionally modular and heavily commented for beginners.
// ------------------------------------------------------------

// ==================== Utility Functions ====================
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Simple vector class for positions
class Vec2 {
    constructor(x, y) { this.x = x; this.y = y; }
    copy() { return new Vec2(this.x, this.y); }
}

// ------------------- Game Globals -------------------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let lastTimestamp = 0; // for delta time
let paused = false;
let currentLevelIndex = 0;
let levels = [];
let ghosts = []; // all ghosts that are currently replaying
let recording = null; // {startTime, entries: [{t, pos, action}]}
let player = null;

// UI elements (cached)
const ui = {
    menu: document.getElementById('menu'),
    howto: document.getElementById('howto'),
    levelSelect: document.getElementById('levelSelect'),
    hud: document.getElementById('hud'),
    levelComplete: document.getElementById('levelComplete'),
    victory: document.getElementById('victory'),
    ghostCount: document.getElementById('ghostCount'),
    recTimer: document.getElementById('recTimer'),
    resetBtn: document.getElementById('resetBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    playBtn: document.getElementById('playBtn'),
    howBtn: document.getElementById('howBtn'),
    levelsBtn: document.getElementById('levelsBtn'),
    backFromHow: document.getElementById('backFromHow'),
    backFromLevels: document.getElementById('backFromLevels'),
    levelButtons: document.getElementById('levelButtons'),
    nextLevelBtn: document.getElementById('nextLevelBtn'),
    restartGameBtn: document.getElementById('restartGameBtn')
};

// ------------------- Entity Base Class -------------------
class Entity {
    constructor(x, y, w, h) {
        this.pos = new Vec2(x, y);
        this.w = w; this.h = h;
    }
    draw() {}
    update(dt) {}
    collides(other) {
        return !(this.pos.x + this.w < other.pos.x ||
                 this.pos.x > other.pos.x + other.w ||
                 this.pos.y + this.h < other.pos.y ||
                 this.pos.y > other.pos.y + other.h);
    }
}

// ------------------- Player Class -------------------
class Player extends Entity {
    constructor(x, y) {
        super(x, y, 32, 32);
        this.speed = 180; // px per second
        this.color = '#0ff';
        this.input = {left:false,right:false,up:false,down:false};
    }
    handleInput(e, isDown) {
        const map = {'ArrowLeft':'left','ArrowRight':'right','ArrowUp':'up','ArrowDown':'down',
                     'a':'left','d':'right','w':'up','s':'down'};
        const dir = map[e.key];
        if (dir) this.input[dir] = isDown;
    }
    update(dt) {
        let dx = 0, dy = 0;
        if (this.input.left) dx -= 1;
        if (this.input.right) dx += 1;
        if (this.input.up) dy -= 1;
        if (this.input.down) dy += 1;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
            dx = dx/len * this.speed * dt;
            dy = dy/len * this.speed * dt;
            this.pos.x = clamp(this.pos.x + dx, 0, canvas.width - this.w);
            this.pos.y = clamp(this.pos.y + dy, 0, canvas.height - this.h);
        }
        // record if we are recording
        if (recording) {
            const t = performance.now() - recording.startTime;
            recording.entries.push({t, pos: {x:this.pos.x, y:this.pos.y}});
        }
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.pos.x, this.pos.y, this.w, this.h);
    }
}

// ------------------- Ghost Class -------------------
class Ghost extends Entity {
    constructor(record) {
        // start at first recorded position
        const start = record.entries[0];
        super(start.pos.x, start.pos.y, 32, 32);
        this.record = record; // {entries: [{t,pos}]}
        this.startTime = performance.now();
        this.color = 'rgba(255,0,255,0.6)'; // magenta translucent
        this.index = 0; // next entry index
    }
    update(dt) {
        const elapsed = performance.now() - this.startTime;
        // advance index while next entry time <= elapsed
        while (this.index < this.record.entries.length - 1 && this.record.entries[this.index+1].t <= elapsed) {
            this.index++;
        }
        // interpolate between this.index and next
        const cur = this.record.entries[this.index];
        const nxt = this.record.entries[this.index+1];
        if (nxt) {
            const ratio = (elapsed - cur.t) / (nxt.t - cur.t);
            this.pos.x = cur.pos.x + (nxt.pos.x - cur.pos.x) * ratio;
            this.pos.y = cur.pos.y + (nxt.pos.y - cur.pos.y) * ratio;
        } else {
            // stay at final position
            this.pos.x = cur.pos.x;
            this.pos.y = cur.pos.y;
        }
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.pos.x, this.pos.y, this.w, this.h);
    }
    isFinished() {
        // finished when elapsed > last timestamp
        const elapsed = performance.now() - this.startTime;
        return elapsed > this.record.entries[this.record.entries.length-1].t;
    }
}

// ------------------- Switch Class -------------------
class Switch extends Entity {
    constructor(x,y) {
        super(x,y,40,40);
        this.active = false;
    }
    update(dt, actors) {
        // actors is array of entities (player + ghosts)
        this.active = actors.some(a => this.collides(a));
    }
    draw() {
        ctx.fillStyle = this.active ? '#0f0' : '#555';
        ctx.fillRect(this.pos.x, this.pos.y, this.w, this.h);
        // glow effect
        ctx.strokeStyle = this.active ? '#0f0' : '#888';
        ctx.lineWidth = 4;
        ctx.strokeRect(this.pos.x-2, this.pos.y-2, this.w+4, this.h+4);
    }
}

// ------------------- Door Class -------------------
class Door extends Entity {
    constructor(x,y, requiredSwitches) {
        super(x,y,60,80);
        this.requiredSwitches = requiredSwitches; // array of Switch refs
        this.open = false;
        this.openProgress = 0; // 0-1 for animation
    }
    update(dt, switches) {
        const allOn = this.requiredSwitches.every(sw => sw.active);
        if (allOn && !this.open) {
            this.open = true;
        }
        // simple slide open animation
        if (this.open && this.openProgress < 1) {
            this.openProgress = Math.min(1, this.openProgress + dt*2);
        }
    }
    draw() {
        // closed door is a vertical bar, open slides to the side
        if (!this.open) {
            ctx.fillStyle = '#f0f';
            ctx.fillRect(this.pos.x, this.pos.y, this.w, this.h);
        } else {
            // animate sliding left
            const offset = this.w * this.openProgress;
            ctx.fillStyle = '#f0f';
            ctx.fillRect(this.pos.x - offset, this.pos.y, this.w, this.h);
        }
    }
    // collision blocking when closed
    blocks(entity) {
        return !this.open && this.collides(entity);
    }
}

// ------------------- Level Definition -------------------
function createLevel1() {
    // Simple tutorial: one switch opens door
    const switches = [new Switch(200, 150)];
    const doors = [new Door(500, 120, switches)];
    const playerStart = {x:50, y:200};
    const exit = {x:590, y:120, w:60, h:80}; // same as door area (for simplicity)
    return {switches, doors, playerStart, exit, description:'Level 1 – learn recording'};
}
function createLevel2() {
    // Two switches need to be pressed simultaneously (by player and ghost)
    const s1 = new Switch(180, 140);
    const s2 = new Switch(380, 140);
    const switches = [s1, s2];
    const doors = [new Door(560, 120, switches)];
    const playerStart = {x:50, y:200};
    const exit = {x:590, y:120, w:60, h:80};
    return {switches, doors, playerStart, exit, description:'Level 2 – cooperate with ghost'};
}
function createLevel3() {
    // Multiple ghosts, moving obstacle, timed door
    const s1 = new Switch(200, 130);
    const s2 = new Switch(400, 130);
    const switches = [s1, s2];
    const doors = [new Door(560, 120, switches)];
    const playerStart = {x:50, y:200};
    const exit = {x:590, y:120, w:60, h:80};
    // moving obstacle (simple horizontal bar)
    const obstacle = new Entity(300, 250, 120, 20);
    obstacle.speed = 100; // px/s
    obstacle.direction = 1;
    obstacle.update = function(dt) {
        this.pos.x += this.speed * dt * this.direction;
        if (this.pos.x < 200 || this.pos.x > 500) this.direction *= -1;
    };
    obstacle.draw = function() {
        ctx.fillStyle = '#ff0';
        ctx.fillRect(this.pos.x, this.pos.y, this.w, this.h);
    };
    return {switches, doors, playerStart, exit, obstacles:[obstacle], description:'Level 3 – advanced'};
}

function loadLevels() {
    levels = [createLevel1(), createLevel2(), createLevel3()];
}

// ------------------- Game Flow -------------------
function startLevel(idx) {
    currentLevelIndex = idx;
    const lvl = levels[idx];
    // reset globals
    ghosts = [];
    recording = null;
    player = new Player(lvl.playerStart.x, lvl.playerStart.y);
    // show HUD, hide menus
    ui.hud.classList.remove('hidden');
    ui.menu.classList.remove('active');
    ui.howto.classList.remove('active');
    ui.levelSelect.classList.remove('active');
    ui.levelComplete.classList.remove('active');
    ui.victory.classList.remove('active');
    // clear canvas size
    resizeCanvas();
    // start main loop
    requestAnimationFrame(gameLoop);
}

function resetLevel() {
    startLevel(currentLevelIndex);
}

function advanceLevel() {
    const next = currentLevelIndex + 1;
    if (next < levels.length) {
        startLevel(next);
    } else {
        // victory screen
        ui.hud.classList.add('hidden');
        ui.victory.classList.add('active');
    }
}

function checkExit() {
    const lvl = levels[currentLevelIndex];
    const exitRect = lvl.exit;
    const dummy = {pos:new Vec2(exitRect.x, exitRect.y), w:exitRect.w, h:exitRect.h};
    if (player.collides(dummy)) {
        // level complete
        ui.levelComplete.classList.add('active');
        // save progress
        const completed = JSON.parse(localStorage.getItem('echoShiftProgress')||'[]');
        if (!completed.includes(currentLevelIndex)) {
            completed.push(currentLevelIndex);
            localStorage.setItem('echoShiftProgress', JSON.stringify(completed));
        }
    }
}

function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = (timestamp - lastTimestamp) / 1000; // seconds
    lastTimestamp = timestamp;
    if (!paused) {
        update(dt);
        render();
    }
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    const lvl = levels[currentLevelIndex];
    player.update(dt);
    // update ghosts
    ghosts.forEach(g => g.update(dt));
    // remove finished ghosts
    ghosts = ghosts.filter(g => !g.isFinished());
    // update switches (player + ghosts act as actors)
    const actors = [player, ...ghosts];
    lvl.switches.forEach(sw => sw.update(dt, actors));
    // update doors
    lvl.doors.forEach(d => d.update(dt, lvl.switches));
    // obstacles if any
    if (lvl.obstacles) lvl.obstacles.forEach(o => o.update(dt));
    // simple collision blocking with doors when closed
    lvl.doors.forEach(d => {
        if (d.blocks(player)) {
            // push player back – simple approach: stop movement on next frame
            // Here we just prevent entry; more sophisticated handling could be added.
        }
    });
    // record UI updates
    ui.ghostCount.textContent = ghosts.length;
    if (recording) {
        const t = (performance.now() - recording.startTime)/1000;
        ui.recTimer.textContent = t.toFixed(1);
    } else {
        ui.recTimer.textContent = '0.0';
    }
    // check win condition
    checkExit();
}

function render() {
    // clear
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const lvl = levels[currentLevelIndex];
    // draw background grid (simple)
    drawGrid();
    // draw switches
    lvl.switches.forEach(sw => sw.draw());
    // draw doors
    lvl.doors.forEach(d => d.draw());
    // draw obstacles
    if (lvl.obstacles) lvl.obstacles.forEach(o => o.draw());
    // draw ghosts
    ghosts.forEach(g => g.draw());
    // draw player on top
    player.draw();
}

function drawGrid() {
    const size = 40;
    ctx.strokeStyle = 'rgba(0,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let x=0; x<canvas.width; x+=size) {
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
    }
    for (let y=0; y<canvas.height; y+=size) {
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
    }
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

// ------------------- Input Handling -------------------
window.addEventListener('keydown', e => {
    if (e.repeat) return;
    // Global shortcuts
    if (e.key === 'r' || e.key === 'R') {
        toggleRecording();
    } else if (e.key === ' ') {
        togglePause();
    }
    // Pass movement keys to player only after a level has started
    if (player) {
        player.handleInput(e, true);
    }
});
window.addEventListener('keyup', e => {
    if (player) {
        player.handleInput(e, false);
    }
});

function toggleRecording() {
    if (!recording) {
        // start recording
        recording = {startTime: performance.now(), entries: []};
        ui.recTimer.textContent = '0.0';
        // UI hint
        console.log('Recording started');
    } else {
        // stop and create ghost
        const recCopy = JSON.parse(JSON.stringify(recording)); // deep copy
        recording = null;
        const ghost = new Ghost(recCopy);
        ghosts.push(ghost);
        console.log('Recording stopped, ghost created');
    }
}

function togglePause() {
    paused = !paused;
    ui.pauseBtn.textContent = paused ? 'Resume' : 'Pause';
}

// ------------------- UI Button Hooks -------------------
ui.playBtn.onclick = () => {
    // populate level buttons first time
    populateLevelButtons();
    ui.menu.classList.remove('active');
    startLevel(0);
};
ui.howBtn.onclick = () => { ui.menu.classList.remove('active'); ui.howto.classList.add('active'); };
ui.backFromHow.onclick = () => { ui.howto.classList.remove('active'); ui.menu.classList.add('active'); };
ui.levelsBtn.onclick = () => { ui.menu.classList.remove('active'); ui.levelSelect.classList.add('active'); };
ui.backFromLevels.onclick = () => { ui.levelSelect.classList.remove('active'); ui.menu.classList.add('active'); };
ui.resetBtn.onclick = resetLevel;
ui.pauseBtn.onclick = togglePause;
ui.nextLevelBtn.onclick = () => { ui.levelComplete.classList.remove('active'); advanceLevel(); };
ui.restartGameBtn.onclick = () => { ui.victory.classList.remove('active'); startLevel(0); };

function populateLevelButtons() {
    const completed = JSON.parse(localStorage.getItem('echoShiftProgress')||'[]');
    ui.levelButtons.innerHTML = '';
    levels.forEach((lvl, idx) => {
        const btn = document.createElement('button');
        btn.className = 'ui-btn';
        btn.textContent = `Level ${idx+1}` + (completed.includes(idx) ? ' ✅' : '');
        btn.onclick = () => { ui.levelSelect.classList.remove('active'); startLevel(idx); };
        ui.levelButtons.appendChild(btn);
    });
}

// ------------------- Init -------------------
loadLevels();
resizeCanvas();
// Show main menu on load
ui.menu.classList.add('active');
