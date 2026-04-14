/** @type {HTMLCanvasElement} */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 모바일 감지
const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || ('ontouchstart' in window && window.innerWidth < 840);

// 맵 배율: 값이 클수록 더 많은 영역이 보임 (더 작게 보임)
const MAP_SCALE = 1.8;        // PC에서 1.8배 축소
const MOBILE_SCALE = 2.2;     // 모바일에서 2.2배 축소

function resizeCanvas() {
    const viewport = document.getElementById('game-viewport');
    const scale = isMobile ? MOBILE_SCALE : MAP_SCALE;
    canvas.width = viewport.clientWidth * scale;
    canvas.height = viewport.clientHeight * scale;
}
resizeCanvas();

window.addEventListener('resize', resizeCanvas);

// ============================
// 리더보드 UI 렌더링
// ============================

window.loadLeaderboard = async function () {
    const tbody = document.getElementById('leaderboard-tbody');
    const emptyMsg = document.getElementById('leaderboard-empty');
    const scores = await fetchLeaderboard();

    tbody.innerHTML = '';

    if (scores.length === 0) {
        emptyMsg.classList.remove('hidden');
        return;
    }

    emptyMsg.classList.add('hidden');

    scores.forEach((s, i) => {
        const rank = i + 1;
        const tr = document.createElement('tr');
        if (rank <= 3) tr.classList.add('rank-' + rank);

        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

        const dateStr = s.date ? new Date(s.date).toLocaleDateString('ko-KR', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        }) : '-';

        tr.innerHTML = `
            <td>${medal}</td>
            <td>${escapeHtml(s.nickname)}</td>
            <td>${getFormattedTime(s.time)}</td>
            <td>Lv.${s.level}</td>
            <td>${dateStr}</td>
        `;
        tbody.appendChild(tr);
    });
};

// XSS 방지
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 점수 등록 버튼 핸들러
window.submitScore = async function () {
    const input = document.getElementById('nickname-input');
    const btn = document.getElementById('submit-score-btn');
    const status = document.getElementById('submit-status');
    const nickname = input.value.trim();

    if (!nickname) {
        status.textContent = '닉네임을 입력해주세요!';
        status.className = 'submit-status error';
        input.focus();
        return;
    }

    btn.disabled = true;
    status.textContent = '등록 중...';
    status.className = 'submit-status';

    const result = await submitScoreToStorage(nickname, gameTime, player.level);

    if (result.success) {
        status.textContent = '✅ 기록이 등록되었습니다!';
        status.className = 'submit-status success';
        btn.textContent = '등록 완료';
        input.disabled = true;
        loadLeaderboard();
    } else {
        status.textContent = '❌ 등록 실패: ' + (result.error || '알 수 없는 오류');
        status.className = 'submit-status error';
        btn.disabled = false;
    }
};

// 페이지 로드 시 리더보드 불러오기
window.addEventListener('DOMContentLoaded', () => {
    loadLeaderboard();
});

// Enter키로 닉네임 등록
window.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('nickname-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitScore();
            }
        });
    }
});

// === 게임 상태 및 데이터 ===
// 맵타일 이미지 2종 (랜덤 배치)
const mapTile1 = new Image();
mapTile1.src = 'maptile_1.png';
const mapTile2 = new Image();
mapTile2.src = 'maptile_2.png';

// 타일 위치별 랜덤 배치를 위한 해시 함수 (시드 기반 - 항상 같은 패턴)
function tileHash(ix, iy) {
    let h = (ix * 374761393 + iy * 668265263) ^ 0x5bd1e995;
    h = (h ^ (h >>> 13)) * 0x5bd1e995;
    return (h ^ (h >>> 15)) & 0x7fffffff;
}

// 스프라이트시트 기반 캐릭터
const spritesheetImg = new Image();
spritesheetImg.src = 'spritesheet.png';

// sprites.json 데이터 (하드코딩 — 빌드 시 로드 불필요)
// 방향별 프레임 매핑:
//   Row별 Y좌표 기준 정렬 후, X좌표 기준 컬럼 분류
//   Col1(x≈400): 정면(아래), Col2(x≈1370): 옆면, Col3(x≈2320): 뒷면(위)
const SPRITE_FRAMES = {
    // dir 0 = 아래(정면): col1 스프라이트들
    down: [
        { x: 402, y: 159, w: 147, h: 226 },   // sprite13 - frame 0
        { x: 401, y: 723, w: 148, h: 211 },    // sprite17 - frame 1
        { x: 401, y: 1248, w: 147, h: 233 },   // sprite19 - frame 2
    ],
    // dir 1,2 = 옆면: col2 스프라이트들 (왼쪽은 flip)
    side: [
        { x: 1381, y: 167, w: 140, h: 218 },   // sprite14 - frame 0
        { x: 1366, y: 706, w: 146, h: 211 },    // sprite16 - frame 1
        { x: 1363, y: 1247, w: 146, h: 218 },   // sprite18 - frame 2
    ],
    // dir 3 = 위(뒷면): col3 스프라이트들 + 추가 프레임
    up: [
        { x: 2330, y: 147, w: 147, h: 211 },   // sprite12 - frame 0
        { x: 2317, y: 682, w: 147, h: 226 },   // sprite15 - frame 1
        { x: 2330, y: 147, w: 147, h: 211 },   // sprite12 - frame 2 (반복)
    ]
};

const mon1Img = new Image(); mon1Img.src = 'mon1.png';
const mon2Img = new Image(); mon2Img.src = 'mon2.png';
const mon3Img = new Image(); mon3Img.src = 'mon3.png';
const mon4Img = new Image(); mon4Img.src = 'mon4.png';
const bossImg = new Image(); bossImg.src = 'boss_1.png';
const boss2Img = new Image(); boss2Img.src = 'boss2.png';

const ITEM_ICON_IMAGES = {
    energy_drink: new Image(),
    bomb: new Image(),
    magnet: new Image(),
    chest: new Image()
};
ITEM_ICON_IMAGES.energy_drink.src = 'energy.png';
ITEM_ICON_IMAGES.bomb.src = 'bomb.png';
ITEM_ICON_IMAGES.magnet.src = 'magnet.png';
ITEM_ICON_IMAGES.chest.src = 'giftbox.png';

const SKILL_ICON_IMAGES = {
    print: new Image(),
    git_push: new Image(),
    memory_leak: new Image(),
    round_robin: new Image(),
    c_pointer: new Image()
};
SKILL_ICON_IMAGES.print.src = 'sk_print.png';
SKILL_ICON_IMAGES.git_push.src = 'sk_commit.png';
SKILL_ICON_IMAGES.memory_leak.src = 'sk_code.png';
SKILL_ICON_IMAGES.round_robin.src = 'sk_round.png';
SKILL_ICON_IMAGES.c_pointer.src = 'sk_pointer.png';

const SKILL_SELECT_IMAGES = {
    print: new Image(),
    c_pointer: new Image(),
    git_push: new Image(),
    memory_leak: new Image(),
    round_robin: new Image(),
    stack_overflow: new Image(),
    keyboard: new Image(),
    caffeine: new Image(),
    auto_test: new Image(),
    context_switch: new Image()
};
SKILL_SELECT_IMAGES.print.src = 'asset/skill_print.png';
SKILL_SELECT_IMAGES.c_pointer.src = 'asset/skill_c_pointer.png';
SKILL_SELECT_IMAGES.git_push.src = 'asset/skill_git_push.png';
SKILL_SELECT_IMAGES.memory_leak.src = 'asset/skill_memory_leak.png';
SKILL_SELECT_IMAGES.round_robin.src = 'asset/skill_cooling_fen.png';
SKILL_SELECT_IMAGES.stack_overflow.src = 'asset/stack_overflow.png';
SKILL_SELECT_IMAGES.keyboard.src = 'asset/skill_Keyboard.png';
SKILL_SELECT_IMAGES.caffeine.src = 'asset/skill_caffeine.png';
SKILL_SELECT_IMAGES.auto_test.src = 'asset/skill_auto_test.png';
SKILL_SELECT_IMAGES.context_switch.src = 'asset/skill_context_switch.png';

function getSkillIconUrl(skillId) {
    return SKILL_SELECT_IMAGES[skillId]?.src || '';
}

let gameState = 'playing'; // playing, levelup, gameover, paused
let gameTime = 0;
let lastTime = Date.now();
let frameCount = 0;

const keys = {};

window.togglePause = function () {
    if (gameState === 'playing') {
        gameState = 'paused';
        document.getElementById('pause-modal').classList.remove('hidden');
    } else if (gameState === 'paused') {
        gameState = 'playing';
        document.getElementById('pause-modal').classList.add('hidden');
        lastTime = Date.now();
    }
};

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Escape') {
        togglePause();
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);

// 마우스 입력 상태
const mouse = {
    x: 0,        // 캔버스 내 마우스 X (화면 좌표)
    y: 0,        // 캔버스 내 마우스 Y (화면 좌표)
    pressed: false
};

canvas.addEventListener('mousedown', e => {
    if (e.button === 0 && gameState === 'playing') {
        mouse.pressed = true;
        const rect = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
        mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    }
});

canvas.addEventListener('mousemove', e => {
    if (mouse.pressed) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
        mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    }
});

window.addEventListener('mouseup', e => {
    if (e.button === 0) mouse.pressed = false;
});

// 터치: 동적 조이스틱 시스템 (터치한 곳에 생김)
const joystick = {
    active: false,
    startX: 0,
    startY: 0,
    dx: 0,
    dy: 0,
    touchId: null
};

const joystickBase = document.getElementById('joystick-base');
const joystickStick = document.getElementById('joystick-stick');
const JOYSTICK_MAX = 45;

function showJoystickAt(x, y) {
    if (joystickBase) {
        joystickBase.style.display = 'flex';
        joystickBase.style.left = (x - 60) + 'px';
        joystickBase.style.top = (y - 60) + 'px';
    }
    if (joystickStick) {
        joystickStick.style.transform = 'translate(0, 0)';
    }
}

function hideJoystick() {
    if (joystickBase) {
        joystickBase.style.display = 'none';
    }
}

function updateJoystick(clientX, clientY) {
    let dx = clientX - joystick.startX;
    let dy = clientY - joystick.startY;
    let dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > JOYSTICK_MAX) {
        dx = (dx / dist) * JOYSTICK_MAX;
        dy = (dy / dist) * JOYSTICK_MAX;
    }

    joystick.dx = dx / JOYSTICK_MAX;
    joystick.dy = dy / JOYSTICK_MAX;

    if (joystickStick) {
        joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;
    }
}

function resetJoystick() {
    joystick.active = false;
    joystick.touchId = null;
    joystick.dx = 0;
    joystick.dy = 0;
    hideJoystick();
}

// 게임 뷰포트에서 터치 이벤트 처리
const gameViewport = document.getElementById('game-viewport');

gameViewport.addEventListener('touchstart', e => {
    // 모바일 일시정지 버튼 등은 터치 이벤트 기본 동작(클릭 발생)을 허용하도록 예외 처리
    if (e.target.closest('button')) return;

    if (gameState !== 'playing') return;
    e.preventDefault();

    const touch = e.changedTouches[0];
    const rect = gameViewport.getBoundingClientRect();
    const relX = touch.clientX - rect.left;
    const relY = touch.clientY - rect.top;

    if (!joystick.active) {
        // 첫 터치: 조이스틱 생성
        joystick.active = true;
        joystick.touchId = touch.identifier;
        joystick.startX = touch.clientX;
        joystick.startY = touch.clientY;
        showJoystickAt(relX, relY);
    } else {
        // 두 번째 터치: 꾹 눌러서 이동 (마우스 대체)
        mouse.pressed = true;
        mouse.x = relX * (canvas.width / rect.width);
        mouse.y = relY * (canvas.height / rect.height);
    }
}, { passive: false });

gameViewport.addEventListener('touchmove', e => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystick.touchId) {
            updateJoystick(touch.clientX, touch.clientY);
        } else if (mouse.pressed) {
            const rect = gameViewport.getBoundingClientRect();
            mouse.x = (touch.clientX - rect.left) * (canvas.width / rect.width);
            mouse.y = (touch.clientY - rect.top) * (canvas.height / rect.height);
        }
    }
}, { passive: false });

gameViewport.addEventListener('touchend', e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystick.touchId) {
            resetJoystick();
        } else {
            mouse.pressed = false;
        }
    }
});

gameViewport.addEventListener('touchcancel', e => {
    resetJoystick();
    mouse.pressed = false;
});

// 전체화면 토글
window.toggleFullscreen = function () {
    const container = document.getElementById('game-container');
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        document.body.classList.add('is-fullscreen');
        setTimeout(resizeCanvas, 100);
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        document.body.classList.remove('is-fullscreen');
        setTimeout(resizeCanvas, 100);
    }
};

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        document.body.classList.remove('is-fullscreen');
    }
    setTimeout(resizeCanvas, 100);
});

document.addEventListener('webkitfullscreenchange', () => {
    if (!document.webkitFullscreenElement) {
        document.body.classList.remove('is-fullscreen');
    }
    setTimeout(resizeCanvas, 100);
});

// 플레이어 객체
const player = {
    x: 0,
    y: 0,
    speed: 150, // 픽셀/초
    maxHp: 100,
    hp: 100,
    level: 1,
    exp: 0,
    expToNext: 10,
    skills: {}, // { 'skill_id': level }
    dir: 0,     // 0:하, 1:좌, 2:우, 3:상
    frame: 1,   // 0~2
    frameTimer: 0,
    magnetTimer: 0
};

// 엔티티 관리
let enemies = [];
// 시작 시 플레이어 근처에 보물상자 하나 스폰
let expGems = [
    { x: 200, y: -200, type: 'chest' }
];
let projectiles = [];
let damageTexts = [];
let weaponsState = {
    printTimer: 0,
    stackTimer: 0,
    cpointerTimer: 0,
    gitpushTimer: 0,
    memoryleakTimer: 0
};
let rareItemTimer = 5 + Math.random() * 10;

function spawnRareMapItem() {
    const types = ['energy_drink', 'bomb', 'magnet'];
    const type = types[Math.floor(Math.random() * types.length)];
    const margin = 50;
    const x = player.x - canvas.width / 2 + margin + Math.random() * (canvas.width - margin * 2);
    const y = player.y - canvas.height / 2 + margin + Math.random() * (canvas.height - margin * 2);
    expGems.push({ x, y, type });
    rareItemTimer = 10 + Math.random() * 5; // 약 10~15초 주기
}

// === 보스 시스템 ===
let boss = null;           // 현재 보스 (null이면 없음)
let bossWarning = null;    // 경고 연출 상태
let bossSpawned = false;   // 2분 보스가 이미 소환되었는지
let boss5mSpawned = false; // 5분 보스가 소환되었는지
let boss15mSpawned = false;// 15분 보스가 소환되었는지
const BOSS_SPAWN_TIME = 120; // 10초
const BOSS_5M_SPAWN_TIME = 300; // 5분
const BOSS_15M_SPAWN_TIME = 900; // 15분

// 스킬 DB
const SKILL_DB = {
    print: {
        id: 'print', name: '전공 서적', type: 'weapon', max: 5,
        desc: "제일 가까운 적에게 두꺼운 전공 서적을 투척합니다."
    },
    c_pointer: {
        id: 'c_pointer', name: 'C 포인터', type: 'weapon', max: 5,
        desc: "바라보는 방향으로 날카로운 화살표를 연속으로 던집니다."
    },
    git_push: {
        id: 'git_push', name: 'Git Push', type: 'weapon', max: 5,
        desc: "위로 무거운 커밋을 던져 치명적인 피해를 줍니다."
    },
    memory_leak: {
        id: 'memory_leak', name: '스파게티코드', type: 'weapon', max: 5,
        desc: "화면을 마구 튕겨 다니며 적들의 로직을 꼬아버리는 관통 투사체를 방출합니다."
    },
    round_robin: {
        id: 'round_robin', name: '쿨링팬', type: 'weapon', max: 5,
        desc: "주위를 도는 타격 판정 쿨링팬을 소환합니다. 닿은 적은 튕겨납니다."
    },
    stack_overflow: {
        id: 'stack_overflow', name: 'Stack Overflow', type: 'weapon', max: 5,
        desc: "일정 주기마다 주변에 스택이 폭발하여 광역 피해를 줍니다."
    },
    keyboard: {
        id: 'keyboard', name: '기계식 키보드', type: 'passive', max: 5,
        desc: "타건감이 좋아집니다. (발사 속도 및 쿨타임 10% 감소)"
    },
    caffeine: {
        id: 'caffeine', name: '카페인 도핑', type: 'passive', max: 5,
        desc: "이동 속도와 의욕이 상승합니다."
    },
    auto_test: {
        id: 'auto_test', name: '자동화 테스트 (진화)', type: 'evolution', max: 1,
        desc: "print + 키보드 최고레벨 달성! 사방으로 로그를 난사합니다."
    },
    context_switch: {
        id: 'context_switch', name: '오버클럭 (진화)', type: 'evolution', max: 1,
        desc: "쿨링팬 + 카페인 최고레벨 달성! 쿨링팬이 폭주하며 개수와 속도가 증가합니다."
    }
};

const ENEMY_TYPES = [
    { name: 'NullPntr', hp: 10, speed: 120, exp: 3, color: '#fca5a5', radius: 25, img: mon1Img },
    { name: 'SegFault', hp: 25, speed: 90, exp: 6, color: '#c084fc', radius: 30, img: mon2Img },
    { name: '404', hp: 40, speed: 70, exp: 9, color: '#fb923c', radius: 45, img: mon3Img }
];

// 초기 스킬 제공
player.skills['print'] = 1;

// === 헬퍼 함수 ===
function getDistance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

function spawnFloatingText(x, y, text, color) {
    damageTexts.push({ x, y, text, color, life: 1.0 });
}

function addExp(amount) {
    player.exp += amount * 1.1; // 경험치 획득량 상향
    if (player.exp >= player.expToNext) {
        player.exp -= player.expToNext;
        player.level++;
        player.expToNext = Math.floor(player.expToNext * 1.2);
        triggerLevelUp();
    }
    updateHudText();
}

// === 레벨업 로직 ===
function triggerLevelUp() {
    gameState = 'levelup';
    const modal = document.getElementById('levelup-modal');
    const optionsContainer = document.getElementById('skill-options');
    optionsContainer.innerHTML = '';

    // 가능한 스킬 풀 작성
    let pool = [];

    // 보유 스킬 칸 체크 (8칸 제한)
    let activeSkillCount = Object.keys(player.skills).filter(k => player.skills[k] > 0).length;
    let isFull = activeSkillCount >= 8;

    // 진화 조건 체크
    if (player.skills['print'] === 5 && player.skills['keyboard'] > 0 && !player.skills['auto_test']) {
        pool.push(SKILL_DB['auto_test']);
    }
    if (player.skills['round_robin'] === 5 && player.skills['caffeine'] > 0 && !player.skills['context_switch']) {
        pool.push(SKILL_DB['context_switch']);
    }

    // 일반 스킬 추가
    Object.values(SKILL_DB).forEach(s => {
        if (s.type === 'evolution') return; // 진화는 조건부로만

        // 진화 완료 시 하위 조합 스킬들이 풀에 다시 등장하지 않도록 예외 처리
        if ((player.skills['auto_test'] || 0) > 0 && (s.id === 'print' || s.id === 'keyboard')) return;
        if ((player.skills['context_switch'] || 0) > 0 && (s.id === 'round_robin' || s.id === 'caffeine')) return;

        let currentLvl = player.skills[s.id] || 0;
        if (currentLvl < s.max) {
            // 인벤토리가 꽉 찼다면, 이미 보유 중인 스킬만 풀에 포함
            if (!isFull || currentLvl > 0) {
                pool.push(s);
            }
        }
    });

    // 랜덤으로 3개(이하) 뽑기
    pool.sort(() => Math.random() - 0.5);
    let choices = pool.slice(0, 3);

    if (choices.length === 0) {
        // 더이상 올릴 스킬이 없으면 체력이나 돈 보상
        choices.push({ id: 'heal', name: '핫식스 (회복)', desc: '체력을 30 회복합니다.', max: 1 });
    }

    choices.forEach(c => {
        let btn = document.createElement('button');
        btn.className = 'skill-btn';
        let cur = player.skills[c.id] || 0;
        let isEvo = c.type === 'evolution';

        const iconUrl = getSkillIconUrl(c.id);
        btn.innerHTML = `
            <div class="skill-icon">
                ${c.id === 'heal' ? '<span style="font-size: 1.4rem; color: #f8fafc;">+</span>' : iconUrl ? `<img src="${iconUrl}" alt="${c.name}" />` : '<span style="font-size: 1.4rem; color: #94a3b8;">?</span>'}
            </div>
            <div class="skill-info">
                <div class="skill-name" style="color: ${isEvo ? '#f472b6' : 'var(--accent)'}">${c.name}</div>
                <div class="skill-desc">${c.desc}</div>
            </div>
            <div class="skill-level">${c.id === 'heal' ? '' : `Lv.${cur + 1}`}</div>
        `;

        btn.onclick = () => {
            if (c.id === 'heal') {
                player.hp = Math.min(player.maxHp, player.hp + 30);
            } else {
                player.skills[c.id] = (player.skills[c.id] || 0) + 1;
                // 진화 시 원본무기 숨기기 위함 처리
                if (c.id === 'auto_test') player.skills['print'] = 0;
                if (c.id === 'context_switch') player.skills['round_robin'] = 0;
            }
            modal.classList.add('hidden');
            gameState = 'playing';
            lastTime = Date.now(); // 시간 보상
            updateHudText();
            updateSkillHud(); // ⬅️ 스킬 선택 후 HUD 업데이트
        };
        optionsContainer.appendChild(btn);
    });

    modal.classList.remove('hidden');
}

// 스킬 인벤토리 HUD 업데이트 함수
function updateSkillHud() {
    const inv = document.getElementById('skill-inventory');
    if (!inv) return;
    inv.innerHTML = '';

    // 현재 보유 중인 스킬 리스트 (레벨 1 이상)
    let activeSkills = Object.keys(player.skills).filter(id => player.skills[id] > 0);

    // UI에 총 8칸 (4열 2행) 렌더링
    for (let i = 0; i < 8; i++) {
        let slot = document.createElement('div');
        slot.className = 'skill-slot';

        if (i < activeSkills.length) {
            let sId = activeSkills[i];
            let lvl = player.skills[sId];
            let iconUrl = getSkillIconUrl(sId);

            if (iconUrl) {
                slot.innerHTML = `<img src="${iconUrl}" alt="${sId}"><div class="lvl-badge">${lvl}</div>`;
            } else {
                slot.innerHTML = `<span style="font-size: 0.6rem; color: #fff;">${sId.substring(0, 3)}</span><div class="lvl-badge">${lvl}</div>`;
            }
        }
        inv.appendChild(slot);
    }
}

// 초기 로드 시 HUD 생성
window.addEventListener('DOMContentLoaded', () => {
    updateSkillHud();
});

// === 상자 스킬 슬롯머신 로직 ===
let pendingChestUpgrades = [];

function triggerChest() {
    gameState = 'chest';
    const modal = document.getElementById('chest-modal');
    const slotsContainer = document.getElementById('chest-slots');
    const claimBtn = document.getElementById('chest-claim-btn');
    const desc = document.getElementById('chest-desc');

    slotsContainer.innerHTML = '';
    claimBtn.style.display = 'none';
    desc.innerText = '슬롯을 돌려 보유 중인 아이템을 무작위로 업그레이드합니다!';

    // 보유 중인 스킬 중 만렙이 아닌 스킬들의 '남은 레벨 업 가능 횟수'만큼 풀에 추가
    let upgradePool = [];
    for (let key in player.skills) {
        if (player.skills[key] > 0) {
            let maxLvl = SKILL_DB[key]?.max || 5;
            let currentLvl = player.skills[key];
            let remaining = maxLvl - currentLvl;
            for (let i = 0; i < remaining; i++) {
                upgradePool.push(key);
            }
        }
    }
    // 풀 셔플
    upgradePool.sort(() => Math.random() - 0.5);

    let upgradeCount = 1;
    let rand = Math.random();
    if (rand < 0.2) upgradeCount = 3;         // 20%
    else if (rand < 0.5) upgradeCount = 2;    // 30%
    // 나머지 50%는 1개

    pendingChestUpgrades = [];
    for (let i = 0; i < upgradeCount; i++) {
        let pickedSkill = upgradePool.pop(); // 풀에서 하나씩 뽑기
        if (pickedSkill) {
            pendingChestUpgrades.push(pickedSkill);
        } else {
            // 풀이 비어서 더 이상 올릴 스킬이 없으면 핫식스(체력 회복)로 대체
            pendingChestUpgrades.push('heal');
        }
    }

    // 슬롯 UI 생성
    let slotElements = [];
    for (let i = 0; i < upgradeCount; i++) {
        let slot = document.createElement('div');
        slot.className = 'chest-slot';
        slot.innerHTML = `<img src="" alt="spinning" style="display:none;">`;
        let img = slot.querySelector('img');
        slotsContainer.appendChild(slot);
        slotElements.push({ slot: slot, img: img });
    }

    modal.classList.remove('hidden');

    // 슬롯머신 애니메이션
    let allIcons = Object.values(SKILL_DB).map(s => getSkillIconUrl(s.id)).filter(url => url);
    if (allIcons.length === 0) allIcons = ['asset/skill_print.png', 'asset/skill_keyboard.png'];

    let spinInterval = setInterval(() => {
        slotElements.forEach(item => {
            item.img.style.display = 'block';
            item.img.src = allIcons[Math.floor(Math.random() * allIcons.length)];
        });
    }, 100);

    // 1.5초 후 멈추고 보상 확정
    setTimeout(() => {
        clearInterval(spinInterval);

        slotElements.forEach((item, idx) => {
            let finalSkill = pendingChestUpgrades[idx];
            if (finalSkill === 'heal') {
                item.slot.innerHTML = '<span style="font-size: 2rem;">⚡</span>';
            } else {
                let iconUrl = getSkillIconUrl(finalSkill);
                if (iconUrl) {
                    item.img.src = iconUrl;
                } else {
                    item.slot.innerHTML = `<span style="font-weight: bold;">${SKILL_DB[finalSkill]?.name.substring(0, 3)}</span>`;
                }
            }
            item.slot.classList.add('level-up');
        });

        desc.innerHTML = `<strong>업그레이드 완료!</strong>`;
        claimBtn.style.display = 'block';
    }, 1500);
}

function claimChest() {
    pendingChestUpgrades.forEach(skillId => {
        if (skillId === 'heal') {
            player.hp = Math.min(player.maxHp, player.hp + 50);
        } else {
            player.skills[skillId] = (player.skills[skillId] || 0) + 1;
        }
    });

    document.getElementById('chest-modal').classList.add('hidden');
    gameState = 'playing';
    lastTime = Date.now();
    updateHudText();
    updateSkillHud();
}

// === 업데이트 로직 ===
function update(dt) {
    gameTime += dt;
    frameCount++;
    player.magnetTimer = Math.max(0, player.magnetTimer - dt);

    // 패시브 적용
    let speedMult = 1 + (player.skills['caffeine'] ? player.skills['caffeine'] * 0.15 : 0);
    let coolMult = 1 - (player.skills['keyboard'] ? player.skills['keyboard'] * 0.1 : 0);

    // 플레이어 이동
    let dx = 0; let dy = 0;

    // 키보드 입력
    if (keys['KeyW'] || keys['ArrowUp']) { dy -= 1; player.dir = 3; }
    if (keys['KeyS'] || keys['ArrowDown']) { dy += 1; player.dir = 0; }
    if (keys['KeyA'] || keys['ArrowLeft']) { dx -= 1; player.dir = 1; }
    if (keys['KeyD'] || keys['ArrowRight']) { dx += 1; player.dir = 2; }

    // 마우스 꾹 누르기 입력 (키보드 입력이 없을 때)
    if (dx === 0 && dy === 0 && mouse.pressed) {
        // 마우스 위치를 월드 좌표로 변환
        let worldMouseX = mouse.x + (player.x - canvas.width / 2);
        let worldMouseY = mouse.y + (player.y - canvas.height / 2);

        dx = worldMouseX - player.x;
        dy = worldMouseY - player.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        // 플레이어 근처(15px 이내)면 이동 안함 (떨림 방지)
        if (dist > 15) {
            dx /= dist;
            dy /= dist;

            // 방향 설정
            if (Math.abs(dx) > Math.abs(dy)) {
                player.dir = dx < 0 ? 1 : 2;
            } else {
                player.dir = dy < 0 ? 3 : 0;
            }
        } else {
            dx = 0;
            dy = 0;
        }
    }

    // 가상 조이스틱 입력 (키보드/마우스 입력이 없을 때)
    if (dx === 0 && dy === 0 && joystick.active) {
        let deadzone = 0.15;
        if (Math.abs(joystick.dx) > deadzone || Math.abs(joystick.dy) > deadzone) {
            dx = joystick.dx;
            dy = joystick.dy;

            // 방향 설정
            if (Math.abs(dx) > Math.abs(dy)) {
                player.dir = dx < 0 ? 1 : 2;
            } else {
                player.dir = dy < 0 ? 3 : 0;
            }
        }
    }

    if (dx !== 0 && dy !== 0) {
        let length = Math.sqrt(dx * dx + dy * dy);
        dx /= length; dy /= length;
    }
    player.x += dx * player.speed * speedMult * dt;
    player.y += dy * player.speed * speedMult * dt;

    // 애니메이션 프레임 처리
    if (dx !== 0 || dy !== 0) {
        player.frameTimer += dt * 8; // 발걸음 속도
        if (player.frameTimer >= 4) player.frameTimer -= 4;
    } else {
        player.frameTimer = 1; // 정지 상태 (중앙 프레임)
    }
    let fSeq = [0, 1, 2, 1]; // 애니메이션 시퀀스
    player.frame = fSeq[Math.floor(player.frameTimer)];

    // 무기 처리

    // 1. print("디버깅") & 진화(자동화 테스트)
    weaponsState.printTimer -= dt;
    if (weaponsState.printTimer <= 0) {
        let isEvo = player.skills['auto_test'] > 0;
        let pLvl = player.skills['print'];

        if (isEvo || pLvl > 0) {
            let count = isEvo ? 4 : (pLvl === 5 ? 3 : (pLvl >= 3 ? 2 : 1));
            weaponsState.printTimer = (isEvo ? 0.6 : 1.2 - (pLvl * 0.1)) * coolMult;

            if (isEvo) {
                // 사방으로 발사
                let evoCount = 6;
                weaponsState.printTimer = 0.4 * coolMult;
                for (let i = 0; i < evoCount; i++) {
                    let a = (Math.PI * 2 / evoCount) * i + (gameTime * 5); // 회전하며 난사
                    projectiles.push({
                        x: player.x, y: player.y,
                        vx: Math.cos(a) * 350, vy: Math.sin(a) * 350,
                        life: 1.5, type: 'print', damage: Math.round(25 * 1.5)
                    });
                }
            } else {
                // 가장 가까운 적 타겟팅
                if (enemies.length > 0) {
                    let target = enemies.reduce((closest, cur) => {
                        let dCur = getDistance(player.x, player.y, cur.x, cur.y);
                        let dClose = getDistance(player.x, player.y, closest.x, closest.y);
                        return dCur < dClose ? cur : closest;
                    });

                    for (let i = 0; i < count; i++) {
                        setTimeout(() => {
                            if (gameState !== 'playing') return;
                            let angle = Math.atan2(target.y - player.y, target.x - player.x);
                            angle += (Math.random() - 0.5) * 0.3; // 약간의 산탄
                            projectiles.push({
                                x: player.x, y: player.y,
                                vx: Math.cos(angle) * 400, vy: Math.sin(angle) * 400,
                                life: 1, type: 'print', damage: Math.round((10 + pLvl * 5) * 1.5)
                            });
                        }, i * 100);
                    }
                }
            }
        }
    }

    // 2. 라운드 로빈 (망치) 처리
    let rrLvl = player.skills['round_robin'] || 0;
    let isRREvo = player.skills['context_switch'] > 0;

    if (rrLvl > 0 || isRREvo) {
        let count = isRREvo ? 5 : (1 + rrLvl);
        let rrSpeed = isRREvo ? 3.5 : 2 + (rrLvl * 0.2);
        let radius = 80 + (rrLvl * 10);
        let damage = isRREvo ? Math.round(40 * 1.5) : Math.round((15 + (rrLvl * 5)) * 1.5);

        for (let i = 0; i < count; i++) {
            let angle = (gameTime * rrSpeed) + ((Math.PI * 2 / count) * i);
            let hx = player.x + Math.cos(angle) * radius;
            let hy = player.y + Math.sin(angle) * radius;

            // 시각화용 데이터는 draw에서 바로 계산하지만 타격 판정은 여기서
            // 무기로서의 히트 박스 (간이 계산)
            enemies.forEach(en => {
                let dist = getDistance(hx, hy, en.x, en.y);
                if (dist < en.radius + 15) {
                    if (!en.lastHitTime) en.lastHitTime = {};
                    let sourceId = 'hammer_' + i;
                    if (gameTime - (en.lastHitTime[sourceId] || 0) > 0.4) {
                        en.hp -= damage;
                        en.lastHitTime[sourceId] = gameTime;
                        spawnFloatingText(en.x, en.y, damage.toString(), '#fcd34d');

                        // 넉백
                        let kbAngle = Math.atan2(en.y - hy, en.x - hx);
                        en.x += Math.cos(kbAngle) * 20;
                        en.y += Math.sin(kbAngle) * 20;
                    }
                }
            });

            // 보스에게도 망치 히트 판정
            if (boss) {
                let bDist = getDistance(hx, hy, boss.x, boss.y);
                if (bDist < boss.radius + 15) {
                    if (!boss.lastHitTime) boss.lastHitTime = {};
                    let sourceId = 'hammer_' + i;
                    if (gameTime - (boss.lastHitTime[sourceId] || 0) > 0.4) {
                        boss.hp -= damage;
                        boss.lastHitTime[sourceId] = gameTime;
                        spawnFloatingText(boss.x, boss.y, damage.toString(), '#fbbf24');
                    }
                }
            }
        }
    }

    // 3. Stack Overflow (광역기)
    let soLvl = player.skills['stack_overflow'] || 0;
    if (soLvl > 0) {
        weaponsState.stackTimer -= dt;
        if (weaponsState.stackTimer <= 0) {
            weaponsState.stackTimer = 3.0 * coolMult;
            let radius = 100 + (soLvl * 40);
            let damage = Math.round((30 + (soLvl * 20)) * 1.5);

            // 시각 효과 발동용 
            projectiles.push({
                x: player.x, y: player.y, type: 'stack_aoe',
                maxRadius: radius, currentRadius: 0, life: 0.5, damage: damage
            });
        }
    }

    // 4. C 포인터 (단검 매커니즘)
    let cpLvl = player.skills['c_pointer'] || 0;
    if (cpLvl > 0) {
        weaponsState.cpointerTimer -= dt;
        if (weaponsState.cpointerTimer <= 0) {
            weaponsState.cpointerTimer = Math.max(0.3, 1.2 - (cpLvl * 0.1)) * coolMult;
            for (let i = 0; i < cpLvl; i++) {
                setTimeout(() => {
                    if (gameState !== 'playing') return;
                    let angle = 0;
                    if (player.dir === 0) angle = Math.PI / 2;
                    else if (player.dir === 1) angle = Math.PI;
                    else if (player.dir === 2) angle = 0;
                    else if (player.dir === 3) angle = -Math.PI / 2;
                    angle += (Math.random() - 0.5) * 0.1;
                    projectiles.push({
                        x: player.x, y: player.y,
                        vx: Math.cos(angle) * 600, vy: Math.sin(angle) * 600,
                        life: 2, type: 'c_pointer', damage: Math.round((15 + cpLvl * 5) * 1.5)
                    });
                }, i * 150);
            }
        }
    }

    // 5. Git Push (도끼 매커니즘)
    let gpLvl = player.skills['git_push'] || 0;
    if (gpLvl > 0) {
        weaponsState.gitpushTimer -= dt;
        if (weaponsState.gitpushTimer <= 0) {
            let count = Math.ceil(gpLvl / 2);
            weaponsState.gitpushTimer = Math.max(0.8, 2.5 - (gpLvl * 0.2)) * coolMult;
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    if (gameState !== 'playing') return;
                    let vx = (Math.random() - 0.5) * 200;
                    if (player.dir === 1) vx -= 100; else if (player.dir === 2) vx += 100;
                    projectiles.push({
                        x: player.x, y: player.y - 10,
                        vx: vx, vy: -500 - Math.random() * 200, gravity: 800,
                        life: 3, type: 'git_push', damage: Math.round((30 + gpLvl * 15) * 1.5)
                    });
                }, i * 200);
            }
        }
    }

    // 6. 메모리 누수 (룬트레이서 매커니즘)
    let mlLvl = player.skills['memory_leak'] || 0;
    if (mlLvl > 0) {
        weaponsState.memoryleakTimer -= dt;
        if (weaponsState.memoryleakTimer <= 0) {
            weaponsState.memoryleakTimer = 3.0 * coolMult;
            let count = Math.ceil(mlLvl / 1.5);
            for (let i = 0; i < count; i++) {
                let angle = Math.random() * Math.PI * 2;
                projectiles.push({
                    x: player.x, y: player.y,
                    vx: Math.cos(angle) * 400, vy: Math.sin(angle) * 400,
                    life: 5 + (mlLvl * 0.5), type: 'memory_leak', damage: Math.round((10 + mlLvl * 5) * 1.5),
                    lastHit: {}
                });
            }
        }
    }

    // 투사체 처리
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.life -= dt;

        if (p.type === 'print') {
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // 충돌 확인
            let hit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                let en = enemies[j];
                if (getDistance(p.x, p.y, en.x, en.y) < en.radius + 5) {
                    en.hp -= p.damage;
                    hit = true;
                    spawnFloatingText(en.x, en.y, p.damage.toString(), '#f8fafc');
                    break;
                }
            }
            // 보스 히트 판정
            if (!hit && boss && getDistance(p.x, p.y, boss.x, boss.y) < boss.radius + 10) {
                boss.hp -= p.damage;
                hit = true;
                spawnFloatingText(boss.x, boss.y, p.damage.toString(), '#fbbf24');
            }
            if (hit || p.life <= 0) projectiles.splice(i, 1);
        } else if (p.type === 'stack_aoe') {
            // 커지는 원 형태
            p.currentRadius = (1 - (p.life / 0.5)) * p.maxRadius;
            if (!p.hasHit) {
                if (p.life < 0.25) { // 타이밍상 중간쯤 폭발 판정
                    enemies.forEach(en => {
                        if (getDistance(p.x, p.y, en.x, en.y) < p.maxRadius) {
                            en.hp -= p.damage;
                            spawnFloatingText(en.x, en.y, p.damage.toString(), '#fb7185');
                        }
                    });
                    // 보스에게도 광역 피해
                    if (boss && getDistance(p.x, p.y, boss.x, boss.y) < p.maxRadius) {
                        boss.hp -= p.damage;
                        spawnFloatingText(boss.x, boss.y, p.damage.toString(), '#fbbf24');
                    }
                    p.hasHit = true;
                }
            }
            if (p.life <= 0) projectiles.splice(i, 1);
        } else if (p.type === 'c_pointer') {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            let hit = false;
            for (let j = enemies.length - 1; j >= 0; j--) {
                let en = enemies[j];
                if (getDistance(p.x, p.y, en.x, en.y) < en.radius + 5) {
                    en.hp -= p.damage;
                    hit = true;
                    spawnFloatingText(en.x, en.y, p.damage.toString(), '#34d399');
                    break;
                }
            }
            // 보스 히트
            if (!hit && boss && getDistance(p.x, p.y, boss.x, boss.y) < boss.radius + 10) {
                boss.hp -= p.damage;
                hit = true;
                spawnFloatingText(boss.x, boss.y, p.damage.toString(), '#fbbf24');
            }
            if (hit || p.life <= 0) projectiles.splice(i, 1);
        } else if (p.type === 'git_push') {
            p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            for (let j = enemies.length - 1; j >= 0; j--) {
                let en = enemies[j];
                if (getDistance(p.x, p.y, en.x, en.y) < en.radius + 15) {
                    if (!p.lastHit) p.lastHit = {};
                    if (gameTime - (p.lastHit[en.name + j] || 0) > 0.5) {
                        en.hp -= p.damage;
                        p.lastHit[en.name + j] = gameTime;
                        spawnFloatingText(en.x, en.y, p.damage.toString(), '#f43f5e');
                    }
                }
            }
            // 보스 히트
            if (boss && getDistance(p.x, p.y, boss.x, boss.y) < boss.radius + 15) {
                if (!p.lastHit) p.lastHit = {};
                if (gameTime - (p.lastHit['boss'] || 0) > 0.5) {
                    boss.hp -= p.damage;
                    p.lastHit['boss'] = gameTime;
                    spawnFloatingText(boss.x, boss.y, p.damage.toString(), '#fbbf24');
                }
            }
            if (p.life <= 0) projectiles.splice(i, 1);
        } else if (p.type === 'memory_leak') {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            // 화면 경계 반사
            let camX = player.x - canvas.width / 2;
            let camY = player.y - canvas.height / 2;
            if (p.x < camX) { p.x = camX; p.vx *= -1; }
            if (p.x > camX + canvas.width) { p.x = camX + canvas.width; p.vx *= -1; }
            if (p.y < camY) { p.y = camY; p.vy *= -1; }
            if (p.y > camY + canvas.height) { p.y = camY + canvas.height; p.vy *= -1; }

            for (let j = enemies.length - 1; j >= 0; j--) {
                let en = enemies[j];
                if (getDistance(p.x, p.y, en.x, en.y) < en.radius + 10) {
                    if (gameTime - (p.lastHit[en.name + j] || 0) > 0.5) {
                        en.hp -= p.damage;
                        p.lastHit[en.name + j] = gameTime;
                        spawnFloatingText(en.x, en.y, p.damage.toString(), '#a78bfa');
                    }
                }
            }
            // 보스 히트 (관통)
            if (boss && getDistance(p.x, p.y, boss.x, boss.y) < boss.radius + 10) {
                if (gameTime - (p.lastHit['boss'] || 0) > 0.5) {
                    boss.hp -= p.damage;
                    p.lastHit['boss'] = gameTime;
                    spawnFloatingText(boss.x, boss.y, p.damage.toString(), '#fbbf24');
                }
            }
            if (p.life <= 0) projectiles.splice(i, 1);
        } else if (p.type === 'boss_c' || p.type === 'boss_f') {
            // 보스의 C/F 투사체 — 플레이어에게 데미지
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.rotation !== undefined) p.rotation += 3 * dt;

            const hitRadius = p.radius || 18;
            let distToPlayer = getDistance(p.x, p.y, player.x, player.y);
            if (distToPlayer < hitRadius) {
                player.hp -= p.damage;
                spawnFloatingText(player.x, player.y - 20, p.damage.toString(), '#ef4444');
                p.life = 0;
                if (player.hp <= 0) {
                    gameState = 'gameover';
                    document.getElementById('final-time').innerText = getFormattedTime(gameTime);
                    document.getElementById('gameover-modal').classList.remove('hidden');
                    const ni = document.getElementById('nickname-input');
                    const sb = document.getElementById('submit-score-btn');
                    if (ni) { ni.disabled = false; ni.value = ''; }
                    if (sb) { sb.disabled = false; sb.textContent = '기록 등록'; }
                    const ss = document.getElementById('submit-status');
                    if (ss) { ss.textContent = ''; ss.className = 'submit-status'; }
                    setTimeout(() => { if (ni) ni.focus(); }, 300);
                }
            }
            if (p.life <= 0) projectiles.splice(i, 1);
        }
    }

    // 적 스폰 (밀도 상향)
    let spawnRate = Math.max(0.1, 1.0 - (gameTime / 60) * 0.5); 
    if (frameCount % Math.floor(80 * spawnRate) === 0) {
        let type = ENEMY_TYPES[Math.min(ENEMY_TYPES.length - 1, Math.floor(Math.random() * (gameTime / 30 + 1)))];
        let angle = Math.random() * Math.PI * 2;
        let dist = canvas.width / 2 + 100;

        let hpMult = 1;
        let speedMult = 1;

        // 0~3분: 분당 10%씩 기초 증가
        hpMult += Math.min(3, gameTime / 60) * 0.1;

        // 3분 ~ 10분: 매 분 5%씩 추가 증가 (요청 사항)
        if (gameTime >= 180) {
            let midTimeMinutes = Math.min(7, Math.floor((gameTime - 180) / 60) + 1);
            hpMult += midTimeMinutes * 0.05;
        }

        // 10분 이후: 매 분 10%씩 복리 증가 (기존 로직 유지)
        if (gameTime >= 600) {
            let over10m = Math.floor((gameTime - 600) / 60) + 1;
            hpMult *= Math.pow(1.1, over10m);
            speedMult *= Math.pow(1.05, over10m);
        }

        enemies.push({
            x: player.x + Math.cos(angle) * dist,
            y: player.y + Math.sin(angle) * dist,
            hp: type.hp * hpMult,
            maxHp: type.hp * hpMult,
            speed: type.speed * (0.8 + Math.random() * 0.4) * speedMult,
            radius: type.radius,
            color: type.color,
            name: type.name,
            exp: type.exp,
            img: type.img
        });
    }

    rareItemTimer -= dt;
    if (rareItemTimer <= 0) {
        let existingRare = expGems.some(g => g.type === 'energy_drink' || g.type === 'bomb' || g.type === 'magnet');
        if (!existingRare) {
            spawnRareMapItem();
        } else {
            rareItemTimer = 5;
        }
    }

    // === 보스 스폰 (2분 경과 시) ===
    if (!bossSpawned && gameTime >= BOSS_SPAWN_TIME && !bossWarning) {
        // 경고 연출 시작
        bossWarning = { timer: 3.0, phase: 'warning', type: 1 }; // 3초간 경고
        bossSpawned = true;
    }

    // === 강력한 보스 스폰 (5분 경과 시) ===
    if (!boss5mSpawned && gameTime >= BOSS_5M_SPAWN_TIME && !bossWarning && !boss) {
        bossWarning = { timer: 3.0, phase: 'warning', type: 2 };
        boss5mSpawned = true;
    }

    // === 최강 보스 스폰 (15분 경과 시) ===
    if (!boss15mSpawned && gameTime >= BOSS_15M_SPAWN_TIME && !bossWarning && !boss) {
        bossWarning = { timer: 3.0, phase: 'warning', type: 3 };
        boss15mSpawned = true;
    }

    // 경고 연출 처리
    if (bossWarning) {
        bossWarning.timer -= dt;
        if (bossWarning.timer <= 0) {
            let is5m = bossWarning.type === 2;
            let is15m = bossWarning.type === 3;
            // 경고 끝 → 보스 소환!
            let angle = Math.random() * Math.PI * 2;
            let dist = canvas.width / 2 + 200;
            boss = {
                x: player.x + Math.cos(angle) * dist,
                y: player.y + Math.sin(angle) * dist,
                hp: is15m ? 15000 : (is5m ? 5000 : 2000),
                maxHp: is15m ? 15000 : (is5m ? 5000 : 2000),
                speed: is15m ? 80 : (is5m ? 65 : 50),
                radius: is15m ? 70 : (is5m ? 60 : 50),
                name: is15m ? 'Ultimate Prof. F' : (is5m ? 'Empowered Prof. C' : 'Prof. C'),
                dir: 1,
                attackTimer: 0,
                attackCooldown: is15m ? 0.5 : (is5m ? (2.0 / 1.5) : 2.0),
                burstCount: is15m ? 1 : (is5m ? 16 : 12),
                cDamage: is15m ? 20 : (is5m ? 15 : 10),
                phase: 0,
                bossType: is15m ? 'boss2' : 'boss1'
            };
            bossWarning = null;
        }
    }


    // === 보스 업데이트 ===
    if (boss) {
        // 보스 사망 체크
        if (boss.hp <= 0) {
            // 보스 처치 보상: 대량 경험치 + 확정 상자 드랍
            for (let i = 0; i < 20; i++) {
                let ox = boss.x + (Math.random() - 0.5) * 80;
                let oy = boss.y + (Math.random() - 0.5) * 80;
                expGems.push({ x: ox, y: oy, val: 10, type: 'exp' });
            }
            expGems.push({ x: boss.x, y: boss.y, type: 'chest' });
            spawnFloatingText(boss.x, boss.y - 40, '🎓 교수님 격퇴!', '#fbbf24');
            boss = null;
        } else {
            // 보스 이동 (플레이어 방향으로 느리게 추적)
            let bx = player.x - boss.x;
            let by = player.y - boss.y;
            let bDist = Math.sqrt(bx * bx + by * by);
            if (bDist > 0) {
                boss.dir = bx > 0 ? 2 : 1;
                boss.x += (bx / bDist) * boss.speed * dt;
                boss.y += (by / bDist) * boss.speed * dt;
            }

            // 보스 공격
            boss.attackTimer -= dt;
            if (boss.attackTimer <= 0) {
                boss.attackTimer = boss.attackCooldown;
                boss.phase++;

                if (boss.bossType === 'boss2') {
                    let bx = player.x - boss.x;
                    let by = player.y - boss.y;
                    let bDist = Math.sqrt(bx * bx + by * by);
                    let vx = 0, vy = 0;
                    if (bDist > 0) {
                        vx = (bx / bDist) * 350; // 투사체 속도
                        vy = (by / bDist) * 350;
                    }
                    projectiles.push({
                        x: boss.x, y: boss.y,
                        vx: vx,
                        vy: vy,
                        life: 4.0,
                        type: 'boss_f',
                        damage: boss.cDamage || 20,
                        radius: 20,
                        rotation: Math.random() * Math.PI * 2
                    });
                    spawnFloatingText(boss.x, boss.y - 60, 'F!!!', '#ef4444');
                } else {
                    let count = boss.burstCount;
                    let offsetAngle = (boss.phase % 2) * (Math.PI / count); // 매번 약간 회전

                    for (let i = 0; i < count; i++) {
                        let a = (Math.PI * 2 / count) * i + offsetAngle;
                        projectiles.push({
                            x: boss.x, y: boss.y,
                            vx: Math.cos(a) * 180,
                            vy: Math.sin(a) * 180,
                            life: 3.0,
                            type: 'boss_c',
                            damage: boss.cDamage || 10,
                            radius: 22,
                            rotation: Math.random() * Math.PI * 2
                        });
                    }
                    spawnFloatingText(boss.x, boss.y - 60, 'C!  C!  C!', '#ef4444');
                }
            }

            // 보스 접촉 데미지 없음 (요청 반영)
            // if (bDist < boss.radius + 15) { ... }
        }
    }

    // 적 이동 및 충돌
    for (let i = enemies.length - 1; i >= 0; i--) {
        let en = enemies[i];

        if (en.hp <= 0) {
            // 사망 및 드랍 처리
            let rnd = Math.random();
            if (rnd < 0.005) { // 0.5% 확률로 상자 드랍 (기존 족보 확률 대체)
                expGems.push({ x: en.x, y: en.y, type: 'chest' });
            } else {
                expGems.push({ x: en.x, y: en.y, val: en.exp, type: 'exp' });
            }
            enemies.splice(i, 1);
            continue;
        }

        let ex = player.x - en.x;
        let ey = player.y - en.y;
        let dist = Math.hypot(ex, ey);
        let minOverlap = en.radius + 18;
        let hitReach = en.radius + 24;

        if (dist > 0) {
            en.x += (ex / dist) * en.speed * dt;
            en.y += (ey / dist) * en.speed * dt;

            let newDist = getDistance(player.x, player.y, en.x, en.y);
            if (newDist === 0) {
                let angle = Math.random() * Math.PI * 2;
                en.x = player.x + Math.cos(angle) * minOverlap;
                en.y = player.y + Math.sin(angle) * minOverlap;
            } else if (newDist < minOverlap) {
                let ux = (en.x - player.x) / newDist;
                let uy = (en.y - player.y) / newDist;
                en.x = player.x + ux * minOverlap;
                en.y = player.y + uy * minOverlap;
            }
        }

        let currentDist = getDistance(player.x, player.y, en.x, en.y);

        // 플레이어와 충돌 (피격)
        if (currentDist < hitReach) {
            player.hp -= 1 * dt;
            if (player.hp <= 0) {
                gameState = 'gameover';
                document.getElementById('final-time').innerText = getFormattedTime(gameTime);
                document.getElementById('gameover-modal').classList.remove('hidden');
                // 닉네임 입력 초기화
                const ni = document.getElementById('nickname-input');
                const sb = document.getElementById('submit-score-btn');
                if (ni) { ni.disabled = false; ni.value = ''; }
                if (sb) { sb.disabled = false; sb.textContent = '기록 등록'; }
                const ss = document.getElementById('submit-status');
                if (ss) { ss.textContent = ''; ss.className = 'submit-status'; }
                // 닉네임 입력에 포커스
                setTimeout(() => { if (ni) ni.focus(); }, 300);
            }
        }
    }

    updateHudText();

    // 경험치 구슬 먹기
    for (let i = expGems.length - 1; i >= 0; i--) {
        let g = expGems[i];
        let dist = getDistance(player.x, player.y, g.x, g.y);

        // 자석 기믹 (가까가면 천천히 빨려오고, 점점 빨라짐)
        if (g.type === 'exp') {
            g.vx = g.vx || 0;
            g.vy = g.vy || 0;
            g.pullDelay = g.pullDelay ?? (0.35 + Math.random() * 0.35);
            let magnetActive = player.magnetTimer > 0;
            let strength = 0;
            let shouldAttract = magnetActive || dist < 120;

            if (shouldAttract && dist > 0) {
                if (magnetActive) {
                    let maxRange = Math.max(canvas.width, canvas.height) * 1.6;
                    strength = Math.min(1, Math.max(0, 1 - dist / maxRange));
                } else {
                    strength = (120 - dist) / 120;
                }

                let basePower = magnetActive ? 420 : 1200;
                let pullPower = basePower + (magnetActive ? 1100 * strength : 0);

                if (g.pullDelay > 0) {
                    g.pullDelay -= dt * 1.0;
                    pullPower *= magnetActive ? 0.12 : 0.08;
                } else if (magnetActive) {
                    pullPower *= 0.6 + strength * 0.4;
                }

                if (magnetActive) {
                    pullPower *= 1.5;
                }

                if (dist < 50) {
                    let closeBoost = (50 - dist) / 50;
                    pullPower += 1400 * closeBoost;
                }

                g.vx += (player.x - g.x) / dist * pullPower * dt;
                g.vy += (player.y - g.y) / dist * pullPower * dt;
            }

            let damp = magnetActive ? 0.93 : 0.88 + Math.min(0.08, strength);
            g.vx *= damp;
            g.vy *= damp;
            g.x += g.vx * dt;
            g.y += g.vy * dt;
        } else if (dist < 100 && dist > 0) {
            g.x += (player.x - g.x) / dist * 400 * dt;
            g.y += (player.y - g.y) / dist * 400 * dt;
        }

        if (dist < 20) {
            if (g.type === 'energy_drink') {
                player.hp = Math.min(player.maxHp, player.hp + 30);
                spawnFloatingText(player.x, player.y - 30, "+30 HP", '#4ade80');
            } else if (g.type === 'chest') {
                triggerChest();
                spawnFloatingText(player.x, player.y - 30, "🎁 상자 획득!", '#f59e0b');
            } else if (g.type === 'bomb') {
                // 💣 폭탄: 화면 내 모든 적 처치 + 경험치 드랍
                spawnFloatingText(player.x, player.y - 40, "💣 BOOM!", '#fbbf24');

                // 폭발 이펙트
                projectiles.push({
                    x: player.x, y: player.y, type: 'bomb_explode',
                    maxRadius: Math.max(canvas.width, canvas.height),
                    currentRadius: 0, life: 0.8
                });

                // 모든 적 처치 & 경험치 드랍
                let killCount = enemies.length;
                for (let j = enemies.length - 1; j >= 0; j--) {
                    let en = enemies[j];
                    // 각 적이 경험치를 드랍
                    expGems.push({ x: en.x, y: en.y, val: en.exp, type: 'exp' });
                }
                enemies.length = 0; // 모든 적 제거

                spawnFloatingText(player.x, player.y - 60, killCount + " KILL!", '#ef4444');
            } else if (g.type === 'magnet') {
                player.magnetTimer = 12;
                spawnFloatingText(player.x, player.y - 40, "MAGNET ACTIVE", '#38bdf8');
                spawnFloatingText(player.x, player.y - 30, "EXP MAP PULL!", '#60a5fa');
            } else {
                addExp(g.val || 1);
            }
            expGems.splice(i, 1);
        }
    }

    // 데미지 텍스트
    for (let i = damageTexts.length - 1; i >= 0; i--) {
        damageTexts[i].life -= dt;
        damageTexts[i].y -= 20 * dt; // 위로 떠오름
        if (damageTexts[i].life <= 0) damageTexts.splice(i, 1);
    }
}

// === 렌더링 로직 ===
function draw() {
    // 카메라 좌표 (플레이어 중심)
    let camX = player.x - canvas.width / 2;
    let camY = player.y - canvas.height / 2;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-Math.floor(camX), -Math.floor(camY));

    // 배경 이미지 타일링 (maptile_1, maptile_2 랜덤 배치)
    const t1Ready = mapTile1.complete && mapTile1.naturalWidth !== 0;
    const t2Ready = mapTile2.complete && mapTile2.naturalWidth !== 0;

    if (t1Ready || t2Ready) {
        // 두 타일 중 로드된 것 기준으로 크기 설정
        let refTile = t1Ready ? mapTile1 : mapTile2;
        let w = refTile.width;
        let h = refTile.height;
        let sX = Math.floor(camX / w);
        let sY = Math.floor(camY / h);
        let eX = Math.ceil((camX + canvas.width) / w);
        let eY = Math.ceil((camY + canvas.height) / h);

        for (let ix = sX; ix <= eX; ix++) {
            for (let iy = sY; iy <= eY; iy++) {
                // 해시로 타일 종류 결정 (0 or 1)
                let tileType = tileHash(ix, iy) % 2;
                let tileImg;
                if (tileType === 0 && t1Ready) tileImg = mapTile1;
                else if (tileType === 1 && t2Ready) tileImg = mapTile2;
                else tileImg = refTile; // 하나만 로드된 경우 fallback

                ctx.drawImage(tileImg, ix * w, iy * h, w, h);
            }
        }
    } else {
        // 기존 그리드 바닥 (이미지 로드 전 또는 오류 시)
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        let grid = 100;
        let sX = Math.floor(camX / grid) * grid;
        let sY = Math.floor(camY / grid) * grid;
        ctx.beginPath();
        for (let x = sX; x < camX + canvas.width; x += grid) { ctx.moveTo(x, camY); ctx.lineTo(x, camY + canvas.height); }
        for (let y = sY; y < camY + canvas.height; y += grid) { ctx.moveTo(camX, y); ctx.lineTo(camX + canvas.width, y); }
        ctx.stroke();
    }

    // 드랍 아이템 그리기
    expGems.forEach(g => {
        if (g.type === 'exp') {
            let dist = getDistance(player.x, player.y, g.x, g.y);
            if (dist < 140) {
                let alpha = Math.min(0.24, (140 - dist) / 140 * 0.24);
                ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
                ctx.lineWidth = 1 + Math.min(2, (140 - dist) / 50);
                ctx.beginPath();
                ctx.moveTo(g.x, g.y);
                let midX = (g.x + player.x) / 2;
                let midY = (g.y + player.y) / 2 - 12;
                ctx.quadraticCurveTo(midX, midY, player.x, player.y);
                ctx.stroke();
            }
        }

        if (g.type === 'energy_drink') {
            const img = ITEM_ICON_IMAGES.energy_drink;
            const size = 60; // 1.5배 (기존 40)
            if (img.complete && img.naturalWidth !== 0) {
                ctx.drawImage(img, g.x - size / 2, g.y - size / 2, size, size);
            } else {
                ctx.fillStyle = '#3b82f6';
                ctx.fillRect(g.x - 15, g.y - 15, 30, 30);
                ctx.fillStyle = '#fde047';
                ctx.font = '15px Fira Code';
                ctx.textAlign = 'center';
                ctx.fillText("⚡", g.x, g.y + 5);
            }
        } else if (g.type === 'chest') {
            let pulse = 1 + Math.sin(gameTime * 4) * 0.1;
            ctx.save();
            ctx.translate(g.x, g.y);
            ctx.scale(pulse, pulse);
            if (ITEM_ICON_IMAGES.chest.complete && ITEM_ICON_IMAGES.chest.naturalWidth !== 0) {
                ctx.drawImage(ITEM_ICON_IMAGES.chest, -24, -24, 48, 48); // 1.5배 확대
            } else {
                ctx.font = '48px "Apple Color Emoji", "Segoe UI Emoji", Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
                ctx.shadowBlur = 10;
                ctx.fillText("🎁", 0, 0);
            }
            ctx.restore();
        } else if (g.type === 'bomb') {
            const img = ITEM_ICON_IMAGES.bomb;
            const size = 40;
            if (img.complete && img.naturalWidth !== 0) {
                ctx.drawImage(img, g.x - size / 2, g.y - size / 2, size, size);
            } else {
                // 폭탄 아이템 그리기 (빨간 원 + 💣)
                let pulse = 1 + Math.sin(gameTime * 6) * 0.15;
                ctx.save();
                ctx.translate(g.x, g.y);
                ctx.scale(pulse, pulse);

                // 외곽 글로우
                ctx.beginPath();
                ctx.arc(0, 0, 14, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
                ctx.fill();

                // 본체
                ctx.beginPath();
                ctx.arc(0, 0, 10, 0, Math.PI * 2);
                ctx.fillStyle = '#1a1a2e';
                ctx.fill();
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.stroke();

                // 심지
                ctx.beginPath();
                ctx.moveTo(4, -8);
                ctx.lineTo(8, -14);
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2;
                ctx.stroke();

                // 불꽃
                let sparkAlpha = 0.5 + Math.sin(gameTime * 15) * 0.5;
                ctx.beginPath();
                ctx.arc(8, -14, 3, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(251, 191, 36, ${sparkAlpha})`;
                ctx.fill();

                ctx.restore();
            }
        } else if (g.type === 'magnet') {
            const img = ITEM_ICON_IMAGES.magnet;
            const size = 40;
            if (img.complete && img.naturalWidth !== 0) {
                ctx.drawImage(img, g.x - size / 2, g.y - size / 2, size, size);
            } else {
                ctx.fillStyle = '#38bdf8';
                ctx.beginPath();
                ctx.arc(g.x, g.y, 20, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = '18px Fira Code';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🧲', g.x, g.y);
            }
        } else {
            let value = g.val || 1;
            let size = 6 + value;
            let color = '#10b981';
            if (value >= 5) {
                color = '#fb7185';
            } else if (value >= 3) {
                color = '#38bdf8';
            }
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(g.x, g.y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = `${10 + Math.min(6, value * 2)}px Fira Code`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(";", g.x, g.y);
        }
    });

    // 지면 장판 효과 (Stack Overflow & 폭탄 폭발)
    projectiles.forEach(p => {
        if (p.type === 'stack_aoe') {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.currentRadius, 0, Math.PI * 2);
            let alpha = p.life / 0.5;
            ctx.fillStyle = `rgba(225, 29, 72, ${alpha * 0.3})`;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = `rgba(225, 29, 72, ${alpha})`;
            ctx.stroke();

            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.font = '20px Fira Code';
            ctx.fillText("StackOverflowError", p.x - 90, p.y);
        } else if (p.type === 'bomb_explode') {
            // 폭탄 폭발 이펙트 (화면 전체 쇼크웨이브)
            let progress = 1 - (p.life / 0.8);
            p.currentRadius = progress * p.maxRadius;
            let alpha = p.life / 0.8;

            // 쇼크웨이브 링
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.currentRadius, 0, Math.PI * 2);
            ctx.lineWidth = 8 * alpha;
            ctx.strokeStyle = `rgba(251, 191, 36, ${alpha * 0.8})`;
            ctx.stroke();

            // 내부 글로우
            let grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.currentRadius * 0.5);
            grd.addColorStop(0, `rgba(239, 68, 68, ${alpha * 0.4})`);
            grd.addColorStop(1, `rgba(239, 68, 68, 0)`);
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.currentRadius * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // 💣 텍스트
            if (alpha > 0.5) {
                ctx.fillStyle = `rgba(255, 255, 255, ${(alpha - 0.5) * 2})`;
                ctx.font = 'bold 28px Fira Code';
                ctx.textAlign = 'center';
                ctx.fillText("SEGFAULT BOMB!", p.x, p.y);
            }

            if (p.life <= 0) {
                projectiles.splice(projectiles.indexOf(p), 1);
            }
        }
    });

    // 적 그리기
    enemies.forEach(en => {
        if (en.img && en.img.complete && en.img.naturalWidth !== 0) {
            let destW = en.radius * 2.5;
            let destH = destW * (en.img.naturalHeight / en.img.naturalWidth);
            let bobbingY = Math.abs(Math.sin(gameTime * 8 + en.x)) * -4;

            ctx.save();
            ctx.translate(en.x, en.y + bobbingY);
            if (player.x < en.x) {
                ctx.scale(-1, 1);
            }
            ctx.drawImage(en.img, -destW / 2, -destH / 2, destW, destH);
            ctx.restore();
        } else {
            ctx.fillStyle = en.color;
            ctx.beginPath();
            ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2);
            ctx.fill();

        }

        // HP 막대
        let hpRatio = en.hp / en.maxHp;
        ctx.fillStyle = 'red';
        ctx.fillRect(en.x - 15, en.y - en.radius - 10, 30, 4);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(en.x - 15, en.y - en.radius - 10, 30 * hpRatio, 4);
    });

    // 보스 그리기
    if (boss) {
        let bobY = Math.sin(gameTime * 3) * 5;

        ctx.save();
        ctx.translate(boss.x, boss.y + bobY);

        let currentBossImg = boss.bossType === 'boss2' ? boss2Img : bossImg;
        if (currentBossImg.complete && currentBossImg.naturalWidth !== 0) {
            let bossSize = Math.min(boss.bossType === 'boss2' ? 140 : 120, boss.radius * 2.5);
            try {
                let shouldFlip = (boss.dir === 2);
                if (boss.bossType === 'boss2') {
                    shouldFlip = !shouldFlip;
                }
                if (shouldFlip) {
                    ctx.scale(-1, 1);
                }
                ctx.drawImage(currentBossImg, -bossSize / 2, -bossSize / 2, bossSize, bossSize);
            } catch (err) {
                console.warn('Boss image draw failed, fallback to manual boss:', err);
                drawManualBoss();
            }
        } else {
            drawManualBoss();
        }

        function drawManualBoss() {
            // 보스 몸체 (교수님)
            ctx.fillStyle = boss.bossType === 'boss2' ? '#3b0764' : '#1e293b';
            ctx.fillRect(-30, -15, 60, 50);

            // 머리
            ctx.fillStyle = '#fde68a';
            ctx.beginPath();
            ctx.arc(0, -25, 22, 0, Math.PI * 2);
            ctx.fill();

            // 안경
            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(-9, -27, 7, 0, Math.PI * 2);
            ctx.arc(9, -27, 7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-2, -27);
            ctx.lineTo(2, -27);
            ctx.stroke();

            // 눈 (빨간색 — 화남)
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(-9, -27, 3, 0, Math.PI * 2);
            ctx.arc(9, -27, 3, 0, Math.PI * 2);
            ctx.fill();

            // 입 (미소? 웃음?)
            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, -18, 8, 0.2, Math.PI - 0.2);
            ctx.stroke();

            // 넥타이
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.moveTo(0, -15);
            ctx.lineTo(-6, 5);
            ctx.lineTo(0, 0);
            ctx.lineTo(6, 5);
            ctx.fill();

            // "C" or "F" 표시 (가운에)
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 24px Fira Code';
            ctx.textAlign = 'center';
            ctx.fillText(boss.bossType === 'boss2' ? 'F' : 'C', 0, 28);
        }

        ctx.restore();

        // 보스 HP 바 (화면 상단 고정은 draw 밖에서, 여기는 월드 좌표)
        let bHpRatio = boss.hp / boss.maxHp;
        let bBarW = 80;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(boss.x - bBarW / 2, boss.y - boss.radius - 20, bBarW, 6);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(boss.x - bBarW / 2, boss.y - boss.radius - 20, bBarW * bHpRatio, 6);
    }

    // 투사체 그리기
    projectiles.forEach(p => {
        if (p.type === 'print') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(gameTime * 7); // 회전하며 날아감

            if (SKILL_ICON_IMAGES.print.complete && SKILL_ICON_IMAGES.print.naturalWidth !== 0) {
                ctx.drawImage(SKILL_ICON_IMAGES.print, -20, -20, 40, 40);
            } else {
                ctx.fillStyle = '#1e3a8a';
                ctx.fillRect(-12, -14, 24, 28);
                ctx.fillStyle = 'white';
                ctx.font = 'bold 10px Fira Code';
                ctx.textAlign = 'center';
                ctx.fillText("C++", 0, 4);
            }

            ctx.restore();
        } else if (p.type === 'c_pointer') {
            ctx.save();
            ctx.translate(p.x, p.y);
            // 왼쪽 대각선(Top-Left) 방향이 기본인 이미지를 정방향으로 보충 회전 (+135도)
            ctx.rotate(Math.atan2(p.vy, p.vx) + Math.PI * 0.75);
            if (SKILL_ICON_IMAGES.c_pointer.complete && SKILL_ICON_IMAGES.c_pointer.naturalWidth !== 0) {
                ctx.drawImage(SKILL_ICON_IMAGES.c_pointer, -40, -40, 80, 80); // 1.5배 축소 (120 -> 80)
            } else {
                ctx.fillStyle = '#10b981';
                ctx.font = 'bold 18px Fira Code';
                ctx.textAlign = 'center';
                ctx.fillText("->*", 0, 5);
            }
            ctx.restore();
        } else if (p.type === 'git_push') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(gameTime * 7);
            if (SKILL_ICON_IMAGES.git_push.complete && SKILL_ICON_IMAGES.git_push.naturalWidth !== 0) {
                ctx.drawImage(SKILL_ICON_IMAGES.git_push, -20, -20, 40, 40);
            } else {
                ctx.fillStyle = '#f43f5e';
                ctx.beginPath();
                ctx.arc(0, 0, 15, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'white';
                ctx.font = '10px Fira Code';
                ctx.textAlign = 'center';
                ctx.fillText("Commit", 0, 3);
            }
            ctx.restore();
        } else if (p.type === 'memory_leak') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(gameTime * -5);
            // 스파게티 스킬 크기 조정 (기존 10배 → 절반)
            if (SKILL_ICON_IMAGES.memory_leak.complete && SKILL_ICON_IMAGES.memory_leak.naturalWidth !== 0) {
                ctx.drawImage(SKILL_ICON_IMAGES.memory_leak, -90, -90, 180, 180);
            } else {
                ctx.fillStyle = 'rgba(139, 92, 246, 0.8)';
                ctx.beginPath();
                ctx.moveTo(0, -15);
                ctx.lineTo(15, 0);
                ctx.lineTo(0, 15);
                ctx.lineTo(-15, 0);
                ctx.fill();
                ctx.fillStyle = 'white';
                ctx.font = 'bold 10px Fira Code';
                ctx.textAlign = 'center';
                ctx.fillText("Leak", 0, 3);
            }
            ctx.restore();
        } else if (p.type === 'boss_c' || p.type === 'boss_f') {
            // 보스의 투사체 그리기
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation || 0);

            const size = p.radius ? p.radius * 2 : 42;
            ctx.font = `bold ${size}px Fira Code`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 5;
            ctx.strokeStyle = '#0f172a';
            let charLabel = p.type === 'boss_f' ? 'F' : 'C';
            ctx.strokeText(charLabel, 0, 0);

            ctx.fillStyle = '#ef4444';
            ctx.fillText(charLabel, 0, 0);

            // 글로우 효과
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 10;
            ctx.fillText(charLabel, 0, 0);
            ctx.shadowBlur = 0;

            ctx.restore();
        }
    });

    // 궤도 무기 그리기 (라운드 로빈)
    let rrLvl = player.skills['round_robin'] || 0;
    let isRREvo = player.skills['context_switch'] > 0;
    if (rrLvl > 0 || isRREvo) {
        let count = isRREvo ? 5 : (rrLvl >= 4 ? 3 : (rrLvl >= 2 ? 2 : 1));
        let rrSpeed = isRREvo ? 4 : 2 + (rrLvl * 0.2);
        let radius = 80 + (rrLvl * 10);

        for (let i = 0; i < count; i++) {
            let angle = (gameTime * rrSpeed) + ((Math.PI * 2 / count) * i);
            let hx = player.x + Math.cos(angle) * radius;
            let hy = player.y + Math.sin(angle) * radius;

            ctx.save();
            ctx.translate(hx, hy);
            ctx.rotate(angle + Math.PI / 2); // 회전 방향 맞춰서

            if (SKILL_ICON_IMAGES.round_robin.complete && SKILL_ICON_IMAGES.round_robin.naturalWidth !== 0) {
                ctx.drawImage(SKILL_ICON_IMAGES.round_robin, -20, -20, 40, 40);
            } else {
                // 망치 그리기 (아이콘 또는 도형)
                ctx.fillStyle = '#78350f';
                ctx.fillRect(-2, -15, 4, 30);
                // 망치 머리
                ctx.fillStyle = isRREvo ? '#f43f5e' : '#cbd5e1'; // 진화시 붉은망치
                ctx.fillRect(-10, -20, 20, 15);
                ctx.fillStyle = '#0f172a';
                ctx.font = '10px Fira Code';
                ctx.fillText("RR", 0, -10);
            }

            ctx.restore();
        }
    }

    // 플레이어 그리기 (스프라이트시트 기반 애니메이션)
    if (spritesheetImg.complete && spritesheetImg.naturalWidth !== 0) {
        // 방향에 맞는 프레임 세트 선택
        let dirKey = 'down';
        if (player.dir === 1 || player.dir === 2) dirKey = 'side';
        else if (player.dir === 3) dirKey = 'up';

        let frames = SPRITE_FRAMES[dirKey];
        let frameIdx = player.frame % frames.length;
        let spr = frames[frameIdx];

        let destW = 60;
        // 원본 비율에 맞게 높이 계산
        let destH = 60 * (spr.h / spr.w);

        // 걷는 느낌을 주기 위한 통통 튀는 효과 (bobbing)
        let bobbingY = 0;
        let isMoving = (keys['KeyW'] || keys['ArrowUp'] || keys['KeyS'] || keys['ArrowDown'] || keys['KeyA'] || keys['ArrowLeft'] || keys['KeyD'] || keys['ArrowRight'])
            || joystick.active || mouse.pressed;
        if (isMoving) {
            bobbingY = Math.abs(Math.sin(gameTime * 10)) * -8;
        }

        ctx.save();
        ctx.translate(player.x, player.y);

        // 오른쪽 방향일 경우 좌우 반전 (스프라이트 원본이 왼쪽 향)
        if (player.dir === 2) {
            ctx.scale(-1, 1);
        }

        // 스프라이트시트에서 해당 프레임 영역을 잘라서 그리기
        ctx.drawImage(
            spritesheetImg,
            spr.x, spr.y, spr.w, spr.h,    // 소스 영역
            -destW / 2, -destH + bobbingY, destW, destH  // 대상 영역
        );
        ctx.restore();

        let hpRatio = player.hp / player.maxHp;
        let pWidth = 40;
        let barY = player.y - destH - 15;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(player.x - pWidth / 2, barY, pWidth, 5);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(player.x - pWidth / 2, barY, pWidth * Math.max(0, hpRatio), 5);
    } else {
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(player.x, player.y, 18, 0, Math.PI * 2);
        ctx.fill();

        let hpRatio = player.hp / player.maxHp;
        let pWidth = 40;
        let barY = player.y - 18 - 15;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(player.x - pWidth / 2, barY, pWidth, 5);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(player.x - pWidth / 2, barY, pWidth * Math.max(0, hpRatio), 5);
    }

    // 데미지 텍스트
    damageTexts.forEach(t => {
        ctx.globalAlpha = t.life;
        ctx.font = 'bold 16px Fira Code';
        ctx.textAlign = 'center';

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeText(t.text, t.x, t.y);

        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
        ctx.globalAlpha = 1.0;
    });

    ctx.restore();

    // === 보스 WARNING 오버레이 (화면 고정 좌표) ===
    if (bossWarning) {
        let t = 3.0 - bossWarning.timer; // 경과 시간
        let flashAlpha = Math.abs(Math.sin(t * 5)) * 0.3;

        // 화면 가장자리 빨간 깜빡임
        ctx.fillStyle = `rgba(239, 68, 68, ${flashAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // WARNING 텍스트
        let textAlpha = Math.abs(Math.sin(t * 4));
        ctx.fillStyle = `rgba(239, 68, 68, ${textAlpha})`;
        ctx.font = 'bold 48px Fira Code';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚠ WARNING ⚠', canvas.width / 2, canvas.height / 2 - 30);

        ctx.fillStyle = `rgba(255, 255, 255, ${textAlpha * 0.8})`;
        ctx.font = 'bold 20px Fira Code';
        let warnMsg = bossWarning.type === 3 ? '올에푸가 나옵니다...' : '교수님이 출현합니다...';
        ctx.fillText(warnMsg, canvas.width / 2, canvas.height / 2 + 20);
    }

    // === 보스 HP 바 (화면 상단 고정) ===
    if (boss) {
        let bHpRatio = boss.hp / boss.maxHp;
        let barW = canvas.width * 0.6;
        let barH = 12;
        let barX = (canvas.width - barW) / 2;
        let barY = 110; // 50 -> 110 으로 내려서 타이머/경험치 바와 안 겹치게

        // 배경
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

        // HP (더 진하고 강렬한 빨간색)
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(barX, barY, barW * Math.max(0, bHpRatio), barH);

        // 보스 이름
        ctx.font = 'bold 14px Fira Code';
        ctx.textAlign = 'center';

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        let bn = boss.bossType === 'boss2' ? '🎓 Prof. F — 무자비한 올에푸' : '🎓 Prof. C — C언어 교수';
        ctx.strokeText(bn, canvas.width / 2, barY - 8);

        ctx.fillStyle = '#fbbf24';
        ctx.fillText(bn, canvas.width / 2, barY - 8);
    }
}

function getFormattedTime(timeNum) {
    let m = Math.floor(timeNum / 60).toString().padStart(2, '0');
    let s = Math.floor(timeNum % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function updateHudText() {
    document.getElementById('val-level').innerText = player.level;
    document.getElementById('val-hp').innerText = Math.floor(Math.max(0, player.hp));
    document.getElementById('val-time').innerText = getFormattedTime(gameTime);
    document.getElementById('exp-bar').style.width = `${(player.exp / player.expToNext) * 100}%`;
}


// === 메인 루프 ===
function loop() {
    requestAnimationFrame(loop);

    let now = Date.now();
    let dt = (now - lastTime) / 1000;
    lastTime = now;

    // 최대 dt 보정 (창을 내렸다가 켰을 때 튕기는 현상 방지)
    if (dt > 0.1) dt = 0.1;

    if (gameState === 'playing' || bossWarning) {
        update(dt);
    }

    // levelup 이나 gameover 여도 화면은 그린다 (배경 정지 상태용)
    draw();
}

// 시작!
requestAnimationFrame(loop);