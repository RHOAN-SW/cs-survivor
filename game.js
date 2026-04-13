/** @type {HTMLCanvasElement} */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 게임 뷰포트 컨테이너에 맞춤 (창모드 크기)
function resizeCanvas() {
    const viewport = document.getElementById('game-viewport');
    canvas.width = viewport.clientWidth;
    canvas.height = viewport.clientHeight;
}
resizeCanvas();

window.addEventListener('resize', resizeCanvas);

// ============================
// 리더보드 / DB 연동 시스템
// ============================

// API 엔드포인트 설정 (DB 연동시 여기만 변경)
const API_CONFIG = {
    enabled: false,  // true로 변경하면 서버 API 사용
    baseUrl: 'http://localhost:3000/api',  // 서버 URL
    endpoints: {
        getScores: '/scores',
        postScore: '/scores'
    }
};

// localStorage 키
const STORAGE_KEY = 'cs_survivor_leaderboard';

// 로컬 리더보드에서 데이터 가져오기
function getLocalScores() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch(e) {
        return [];
    }
}

// 로컬 리더보드 저장
function saveLocalScores(scores) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
}

// 점수 등록 (API 또는 로컬)
async function submitScoreToStorage(nickname, time, level) {
    const record = {
        nickname: nickname,
        time: time,          // 초 단위
        level: level,
        date: new Date().toISOString()
    };

    if (API_CONFIG.enabled) {
        // === DB API 연동 ===
        try {
            const res = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.postScore, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(record)
            });
            if (!res.ok) throw new Error('서버 응답 오류');
            return { success: true };
        } catch(e) {
            console.error('API 저장 실패:', e);
            return { success: false, error: e.message };
        }
    } else {
        // === 로컬 스토리지 ===
        const scores = getLocalScores();
        scores.push(record);
        scores.sort((a, b) => b.time - a.time); // 오래 살아남은 순
        if (scores.length > 50) scores.length = 50; // 최대 50개 유지
        saveLocalScores(scores);
        return { success: true };
    }
}

// 리더보드 가져오기 (API 또는 로컬)
async function fetchLeaderboard() {
    if (API_CONFIG.enabled) {
        try {
            const res = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.getScores);
            if (!res.ok) throw new Error('서버 응답 오류');
            return await res.json();
        } catch(e) {
            console.error('API 조회 실패:', e);
            return getLocalScores(); // API 실패 시 로컬 fallback
        }
    } else {
        return getLocalScores();
    }
}

// 리더보드 UI 렌더링
window.loadLeaderboard = async function() {
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
window.submitScore = async function() {
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
const mapImg = new Image();
mapImg.src = 'map_tile.png';
const studentImg = new Image();
studentImg.src = 'student.png';

const mon1Img = new Image(); mon1Img.src = 'mon1.png';
const mon2Img = new Image(); mon2Img.src = 'mon2.png';
const mon3Img = new Image(); mon3Img.src = 'mon3.png';
const mon4Img = new Image(); mon4Img.src = 'mon4.png';
studentImg.src = 'student.png';

let gameState = 'playing'; // playing, levelup, gameover, paused
let gameTime = 0;
let lastTime = Date.now();
let frameCount = 0;

const keys = {};

window.togglePause = function() {
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
    frameTimer: 0
};

// 엔티티 관리
let enemies = [];
let expGems = [];
let projectiles = [];
let damageTexts = [];
let weaponsState = {
    printTimer: 0,
    stackTimer: 0,
    cpointerTimer: 0,
    gitpushTimer: 0,
    memoryleakTimer: 0
};

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
        id: 'memory_leak', name: '메모리 누수', type: 'weapon', max: 5,
        desc: "화면을 마구 튕겨다니며 관통하는 오브젝트를 방출합니다."
    },
    round_robin: {
        id: 'round_robin', name: '라운드 로빈', type: 'weapon', max: 5,
        desc: "주위를 도는 타격 판정 망치를 소환합니다. 닿은 적은 튕겨납니다."
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
        id: 'context_switch', name: '컨텍스트 스위칭 (진화)', type: 'evolution', max: 1,
        desc: "라운드로빈 + 카페인 최고레벨 달성! 망치가 폭주하며 개수와 속도가 증가합니다."
    }
};

const ENEMY_TYPES = [
    { name: 'NullPntr', hp: 10, speed: 120, exp: 1, color: '#fca5a5', radius: 15, img: mon1Img },
    { name: 'SegFault', hp: 25, speed: 90, exp: 2, color: '#c084fc', radius: 20, img: mon2Img },
    { name: '404', hp: 40, speed: 70, exp: 3, color: '#fb923c', radius: 25, img: mon3Img },
    { name: 'Deadlock', hp: 150, speed: 40, exp: 10, color: '#f87171', radius: 35, img: mon4Img }
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
    player.exp += amount;
    if (player.exp >= player.expToNext) {
        player.exp -= player.expToNext;
        player.level++;
        player.expToNext = Math.floor(player.expToNext * 1.5);
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
    
    // 진화 조건 체크
    if(player.skills['print'] === 5 && player.skills['keyboard'] > 0 && !player.skills['auto_test']) {
        pool.push(SKILL_DB['auto_test']);
    }
    if(player.skills['round_robin'] === 5 && player.skills['caffeine'] > 0 && !player.skills['context_switch']) {
        pool.push(SKILL_DB['context_switch']);
    }

    // 일반 스킬 추가
    Object.values(SKILL_DB).forEach(s => {
        if(s.type === 'evolution') return; // 진화는 조건부로만
        let currentLvl = player.skills[s.id] || 0;
        if(currentLvl < s.max) pool.push(s);
    });

    // 랜덤으로 4개(이하) 뽑기
    pool.sort(() => Math.random() - 0.5);
    let choices = pool.slice(0, 4);

    if(choices.length === 0) {
        // 더이상 올릴 스킬이 없으면 체력이나 돈 보상
        choices.push({ id: 'heal', name: '핫식스 (회복)', desc: '체력을 30 회복합니다.', max: 1 });
    }

    choices.forEach(c => {
        let btn = document.createElement('button');
        btn.className = 'skill-btn';
        let cur = player.skills[c.id] || 0;
        let isEvo = c.type === 'evolution';
        
        btn.innerHTML = `
            <div class="skill-info">
                <div class="skill-name" style="color: ${isEvo ? '#f472b6' : 'var(--accent)'}">${c.name}</div>
                <div class="skill-desc">${c.desc}</div>
            </div>
            <div class="skill-level">${c.id==='heal'?'':`Lv.${cur+1}`}</div>
        `;
        
        btn.onclick = () => {
            if(c.id === 'heal') {
                player.hp = Math.min(player.maxHp, player.hp + 30);
            } else {
                player.skills[c.id] = (player.skills[c.id] || 0) + 1;
                // 진화 시 원본무기 숨기기 위함 처리
                if(c.id === 'auto_test') player.skills['print'] = 0; 
                if(c.id === 'context_switch') player.skills['round_robin'] = 0;
            }
            modal.classList.add('hidden');
            gameState = 'playing';
            lastTime = Date.now(); // 시간 보상
            updateHudText();
        };
        optionsContainer.appendChild(btn);
    });

    modal.classList.remove('hidden');
}

// === 업데이트 로직 ===
function update(dt) {
    gameTime += dt;
    frameCount++;

    // 패시브 적용
    let speedMult = 1 + (player.skills['caffeine'] ? player.skills['caffeine'] * 0.15 : 0);
    let coolMult = 1 - (player.skills['keyboard'] ? player.skills['keyboard'] * 0.1 : 0);

    // 플레이어 이동
    let dx = 0; let dy = 0;
    if (keys['KeyW'] || keys['ArrowUp']) { dy -= 1; player.dir = 3; }
    if (keys['KeyS'] || keys['ArrowDown']) { dy += 1; player.dir = 0; }
    if (keys['KeyA'] || keys['ArrowLeft']) { dx -= 1; player.dir = 1; }
    if (keys['KeyD'] || keys['ArrowRight']) { dx += 1; player.dir = 2; }
    if (dx !== 0 && dy !== 0) {
        let length = Math.sqrt(dx*dx + dy*dy);
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
        
        if(isEvo || pLvl > 0) {
            let count = isEvo ? 8 : (pLvl === 5 ? 3 : (pLvl >= 3 ? 2 : 1));
            weaponsState.printTimer = (isEvo ? 0.3 : 1.2 - (pLvl*0.1)) * coolMult;
            
            if(isEvo) {
                // 사방으로 발사
                for(let i=0; i<count; i++) {
                    let a = (Math.PI*2 / count) * i + (gameTime*5); // 회전하며 난사
                    projectiles.push({
                        x: player.x, y: player.y,
                        vx: Math.cos(a)*300, vy: Math.sin(a)*300,
                        life: 1.5, type: 'print', damage: 15
                    });
                }
            } else {
                // 가장 가까운 적 타겟팅
                if(enemies.length > 0) {
                    let target = enemies.reduce((closest, cur) => {
                        let dCur = getDistance(player.x, player.y, cur.x, cur.y);
                        let dClose = getDistance(player.x, player.y, closest.x, closest.y);
                        return dCur < dClose ? cur : closest;
                    });
                    
                    for(let i=0; i<count; i++) {
                        setTimeout(() => {
                            if(gameState !== 'playing') return;
                            let angle = Math.atan2(target.y - player.y, target.x - player.x);
                            angle += (Math.random()-0.5)*0.3; // 약간의 산탄
                            projectiles.push({
                                x: player.x, y: player.y,
                                vx: Math.cos(angle)*400, vy: Math.sin(angle)*400,
                                life: 1, type: 'print', damage: 10 + pLvl*5
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
    
    if(rrLvl > 0 || isRREvo) {
        let count = isRREvo ? 5 : (rrLvl >= 4 ? 3 : (rrLvl >= 2 ? 2 : 1));
        let rrSpeed = isRREvo ? 4 : 2 + (rrLvl * 0.2);
        let radius = 80 + (rrLvl * 10);
        let damage = isRREvo ? 40 : 15 + (rrLvl * 5);
        
        for(let i=0; i<count; i++) {
            let angle = (gameTime * rrSpeed) + ((Math.PI * 2 / count) * i);
            let hx = player.x + Math.cos(angle) * radius;
            let hy = player.y + Math.sin(angle) * radius;
            
            // 시각화용 데이터는 draw에서 바로 계산하지만 타격 판정은 여기서
            // 무기로서의 히트 박스 (간이 계산)
            enemies.forEach(en => {
                let dist = getDistance(hx, hy, en.x, en.y);
                if(dist < en.radius + 15) {
                    if(!en.lastHitTime) en.lastHitTime = {};
                    let sourceId = 'hammer_'+i;
                    if(gameTime - (en.lastHitTime[sourceId] || 0) > 0.4) {
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
        }
    }

    // 3. Stack Overflow (광역기)
    let soLvl = player.skills['stack_overflow'] || 0;
    if(soLvl > 0) {
        weaponsState.stackTimer -= dt;
        if(weaponsState.stackTimer <= 0) {
            weaponsState.stackTimer = 3.0 * coolMult;
            let radius = 100 + (soLvl * 30);
            let damage = 30 + (soLvl * 20);
            
            // 시각 효과 발동용 
            projectiles.push({
                x: player.x, y: player.y, type: 'stack_aoe',
                maxRadius: radius, currentRadius: 0, life: 0.5, damage: damage
            });
        }
    }
    
    // 4. C 포인터 (단검 매커니즘)
    let cpLvl = player.skills['c_pointer'] || 0;
    if(cpLvl > 0) {
        weaponsState.cpointerTimer -= dt;
        if(weaponsState.cpointerTimer <= 0) {
            weaponsState.cpointerTimer = Math.max(0.3, 1.2 - (cpLvl * 0.1)) * coolMult;
            for(let i=0; i<cpLvl; i++) {
                setTimeout(() => {
                    if(gameState !== 'playing') return;
                    let angle = 0;
                    if(player.dir === 0) angle = Math.PI/2;
                    else if(player.dir === 1) angle = Math.PI;
                    else if(player.dir === 2) angle = 0;
                    else if(player.dir === 3) angle = -Math.PI/2;
                    angle += (Math.random()-0.5)*0.1;
                    projectiles.push({
                        x: player.x, y: player.y,
                        vx: Math.cos(angle)*600, vy: Math.sin(angle)*600,
                        life: 2, type: 'c_pointer', damage: 15 + cpLvl*5
                    });
                }, i * 150);
            }
        }
    }

    // 5. Git Push (도끼 매커니즘)
    let gpLvl = player.skills['git_push'] || 0;
    if(gpLvl > 0) {
        weaponsState.gitpushTimer -= dt;
        if(weaponsState.gitpushTimer <= 0) {
            let count = Math.ceil(gpLvl / 2);
            weaponsState.gitpushTimer = Math.max(0.8, 2.5 - (gpLvl * 0.2)) * coolMult;
            for(let i=0; i<count; i++) {
                setTimeout(() => {
                    if(gameState !== 'playing') return;
                    let vx = (Math.random()-0.5)*200;
                    if(player.dir===1) vx -= 100; else if(player.dir===2) vx += 100;
                    projectiles.push({
                        x: player.x, y: player.y - 10,
                        vx: vx, vy: -500 - Math.random()*200, gravity: 800,
                        life: 3, type: 'git_push', damage: 30 + gpLvl*15
                    });
                }, i * 200);
            }
        }
    }

    // 6. 메모리 누수 (룬트레이서 매커니즘)
    let mlLvl = player.skills['memory_leak'] || 0;
    if(mlLvl > 0) {
        weaponsState.memoryleakTimer -= dt;
        if(weaponsState.memoryleakTimer <= 0) {
            weaponsState.memoryleakTimer = 3.0 * coolMult;
            let count = Math.ceil(mlLvl / 1.5);
            for(let i=0; i<count; i++) {
                let angle = Math.random() * Math.PI * 2;
                projectiles.push({
                    x: player.x, y: player.y,
                    vx: Math.cos(angle)*400, vy: Math.sin(angle)*400,
                    life: 5 + (mlLvl*0.5), type: 'memory_leak', damage: 10 + mlLvl*5,
                    lastHit: {}
                });
            }
        }
    }

    // 투사체 업데이트
    for(let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.life -= dt;
        
        if(p.type === 'print') {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            
            // 충돌 확인
            let hit = false;
            for(let j = enemies.length - 1; j >= 0; j--) {
                let en = enemies[j];
                if(getDistance(p.x, p.y, en.x, en.y) < en.radius + 5) {
                    en.hp -= p.damage;
                    hit = true;
                    spawnFloatingText(en.x, en.y, p.damage.toString(), '#f8fafc');
                    break;
                }
            }
            if(hit || p.life <= 0) projectiles.splice(i, 1);
        } else if(p.type === 'stack_aoe') {
            // 커지는 원 형태
            p.currentRadius = (1 - (p.life/0.5)) * p.maxRadius;
            if(!p.hasHit) {
                if(p.life < 0.25) { // 타이밍상 중간쯤 폭발 판정
                    enemies.forEach(en => {
                        if(getDistance(p.x, p.y, en.x, en.y) < p.maxRadius) {
                            en.hp -= p.damage;
                            spawnFloatingText(en.x, en.y, p.damage.toString(), '#fb7185');
                        }
                    });
                    p.hasHit = true;
                }
            }
            if(p.life <= 0) projectiles.splice(i, 1);
        } else if(p.type === 'c_pointer') {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            let hit = false;
            for(let j = enemies.length - 1; j >= 0; j--) {
                let en = enemies[j];
                if(getDistance(p.x, p.y, en.x, en.y) < en.radius + 5) {
                    en.hp -= p.damage;
                    hit = true;
                    spawnFloatingText(en.x, en.y, p.damage.toString(), '#34d399');
                    break;
                }
            }
            if(hit || p.life <= 0) projectiles.splice(i, 1);
        } else if(p.type === 'git_push') {
            p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            for(let j = enemies.length - 1; j >= 0; j--) {
                let en = enemies[j];
                if(getDistance(p.x, p.y, en.x, en.y) < en.radius + 15) {
                    if(!p.lastHit) p.lastHit = {};
                    if(gameTime - (p.lastHit[en.name+j] || 0) > 0.5) {
                        en.hp -= p.damage;
                        p.lastHit[en.name+j] = gameTime;
                        spawnFloatingText(en.x, en.y, p.damage.toString(), '#f43f5e');
                    }
                }
            }
            if(p.life <= 0) projectiles.splice(i, 1);
        } else if(p.type === 'memory_leak') {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            // 화면 경계 반사
            let camX = player.x - canvas.width / 2;
            let camY = player.y - canvas.height / 2;
            if(p.x < camX) { p.x = camX; p.vx *= -1; }
            if(p.x > camX + canvas.width) { p.x = camX + canvas.width; p.vx *= -1; }
            if(p.y < camY) { p.y = camY; p.vy *= -1; }
            if(p.y > camY + canvas.height) { p.y = camY + canvas.height; p.vy *= -1; }
            
            for(let j = enemies.length - 1; j >= 0; j--) {
                let en = enemies[j];
                if(getDistance(p.x, p.y, en.x, en.y) < en.radius + 10) {
                    if(gameTime - (p.lastHit[en.name+j] || 0) > 0.5) {
                        en.hp -= p.damage;
                        p.lastHit[en.name+j] = gameTime;
                        spawnFloatingText(en.x, en.y, p.damage.toString(), '#a78bfa');
                    }
                }
            }
            if(p.life <= 0) projectiles.splice(i, 1);
        }
    }

    // 적 스폰
    let spawnRate = Math.max(0.1, 1.0 - (gameTime / 60) * 0.5); // 점점 빠르게
    if(frameCount % Math.floor(60 * spawnRate) === 0) {
        let type = ENEMY_TYPES[Math.min(ENEMY_TYPES.length-1, Math.floor(Math.random() * (gameTime / 30 + 1)))];
        let angle = Math.random() * Math.PI * 2;
        let dist = canvas.width/2 + 100;
        enemies.push({
            x: player.x + Math.cos(angle)*dist,
            y: player.y + Math.sin(angle)*dist,
            hp: type.hp * (1 + (gameTime/60)), // 시간이 갈수록 체력 증가
            maxHp: type.hp * (1 + (gameTime/60)),
            speed: type.speed * (0.8 + Math.random()*0.4),
            radius: type.radius,
            color: type.color,
            name: type.name,
            exp: type.exp,
            img: type.img
        });
    }

    // 적 이동 및 충돌
    for(let i = enemies.length - 1; i >= 0; i--) {
        let en = enemies[i];
        
        if (en.hp <= 0) {
            // 사망 및 드랍 처리
            let rnd = Math.random();
            if(rnd < 0.01) { // 1% 확률 족보
                expGems.push({ x: en.x, y: en.y, type: 'cheat_sheet' });
            } else if(rnd < 0.06) { // 5% 확률 에너지 드링크
                expGems.push({ x: en.x, y: en.y, type: 'energy_drink' });
            } else {
                expGems.push({ x: en.x, y: en.y, val: en.exp, type: 'exp' });
            }
            enemies.splice(i, 1);
            continue;
        }

        let ex = player.x - en.x;
        let ey = player.y - en.y;
        let dist = Math.sqrt(ex*ex + ey*ey);
        
        if (dist > 0) {
            en.x += (ex / dist) * en.speed * dt;
            en.y += (ey / dist) * en.speed * dt;
        }

        // 플레이어와 충돌 (피격)
        if (dist < en.radius + 10) {
            player.hp -= 10 * dt;
            if(player.hp <= 0) {
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
                setTimeout(() => { if(ni) ni.focus(); }, 300);
            }
        }
    }

    updateHudText();

    // 경험치 구슬 먹기
    for(let i = expGems.length - 1; i >= 0; i--) {
        let g = expGems[i];
        let dist = getDistance(player.x, player.y, g.x, g.y);
        
        // 자석 기믹 (가까가면 빨려옴)
        if (dist < 100) {
            g.x += (player.x - g.x) / dist * 400 * dt;
            g.y += (player.y - g.y) / dist * 400 * dt;
        }
        
        if (dist < 20) {
            if (g.type === 'energy_drink') {
                player.hp = Math.min(player.maxHp, player.hp + 30);
                spawnFloatingText(player.x, player.y - 30, "+30 HP", '#4ade80');
            } else if (g.type === 'cheat_sheet') {
                triggerLevelUp();
                spawnFloatingText(player.x, player.y - 30, "족보 Get!", '#f472b6');
            } else {
                addExp(g.val || 1);
            }
            expGems.splice(i, 1);
        }
    }

    // 데미지 텍스트
    for(let i = damageTexts.length - 1; i >= 0; i--) {
        damageTexts[i].life -= dt;
        damageTexts[i].y -= 20 * dt; // 위로 떠오름
        if(damageTexts[i].life <= 0) damageTexts.splice(i, 1);
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

    // 배경 이미지 타일링
    if (mapImg.complete && mapImg.naturalWidth !== 0) {
        let w = mapImg.width;
        let h = mapImg.height;
        let sX = Math.floor(camX / w) * w;
        let sY = Math.floor(camY / h) * h;
        
        for (let x = sX; x < camX + canvas.width; x += w) {
            for (let y = sY; y < camY + canvas.height; y += h) {
                ctx.drawImage(mapImg, x, y, w, h);
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
        for(let x=sX; x<camX+canvas.width; x+=grid) { ctx.moveTo(x, camY); ctx.lineTo(x, camY+canvas.height); }
        for(let y=sY; y<camY+canvas.height; y+=grid) { ctx.moveTo(camX, y); ctx.lineTo(camX+canvas.width, y); }
        ctx.stroke();
    }

    // 드랍 아이템 그리기
    expGems.forEach(g => {
        if(g.type === 'energy_drink') {
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(g.x - 6, g.y - 10, 12, 16); 
            ctx.fillStyle = '#fde047';
            ctx.font = '10px Fira Code';
            ctx.textAlign = 'center';
            ctx.fillText("⚡", g.x, g.y + 2);
        } else if (g.type === 'cheat_sheet') {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(g.x - 8, g.y - 12, 16, 20); 
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 12px Fira Code';
            ctx.textAlign = 'center';
            ctx.fillText("A+", g.x, g.y + 4);
        } else {
            ctx.fillStyle = '#10b981';
            ctx.beginPath();
            ctx.arc(g.x, g.y, 6 + (g.val || 1), 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = '#a7f3d0';
            ctx.font = '10px Fira Code';
            ctx.fillText(";", g.x-3, g.y+3); 
        }
    });

    // 지면 장판 효과 (Stack Overflow)
    projectiles.forEach(p => {
        if(p.type === 'stack_aoe') {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.currentRadius, 0, Math.PI*2);
            let alpha = p.life / 0.5;
            ctx.fillStyle = `rgba(225, 29, 72, ${alpha * 0.3})`;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = `rgba(225, 29, 72, ${alpha})`;
            ctx.stroke();
            
            // 글자 파티클 (Stack)
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.font = '20px Fira Code';
            ctx.fillText("StackOverflowError", p.x - 90, p.y);
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
            ctx.drawImage(en.img, -destW/2, -destH/2, destW, destH);
            ctx.restore();
            
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 12px Fira Code';
            ctx.textAlign = 'center';
            ctx.fillText(en.name, en.x, en.y + en.radius + 8);
        } else {
            ctx.fillStyle = en.color;
            ctx.beginPath();
            ctx.arc(en.x, en.y, en.radius, 0, Math.PI*2);
            ctx.fill();
            
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 12px Fira Code';
            ctx.textAlign = 'center';
            ctx.fillText(en.name, en.x, en.y + 4);
        }
        
        // HP 막대
        let hpRatio = en.hp / en.maxHp;
        ctx.fillStyle = 'red';
        ctx.fillRect(en.x - 15, en.y - en.radius - 10, 30, 4);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(en.x - 15, en.y - en.radius - 10, 30 * hpRatio, 4);
    });

    // 투사체 그리기
    projectiles.forEach(p => {
        if(p.type === 'print') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(gameTime * 7); // 회전하며 날아감
            
            // 책 표지
            ctx.fillStyle = '#1e3a8a';
            ctx.fillRect(-12, -14, 24, 28);
            
            // 텍스트 (C++)
            ctx.fillStyle = 'white';
            ctx.font = 'bold 10px Fira Code';
            ctx.textAlign = 'center';
            ctx.fillText("C++", 0, 4);
            
            ctx.restore();
        } else if (p.type === 'c_pointer') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.atan2(p.vy, p.vx));
            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 18px Fira Code';
            ctx.textAlign = 'center';
            ctx.fillText("->*", 0, 5);
            ctx.restore();
        } else if (p.type === 'git_push') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(gameTime * 7);
            ctx.fillStyle = '#f43f5e';
            ctx.beginPath();
            ctx.arc(0, 0, 15, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = '10px Fira Code';
            ctx.textAlign = 'center';
            ctx.fillText("Commit", 0, 3);
            ctx.restore();
        } else if (p.type === 'memory_leak') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(gameTime * -5);
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
            ctx.restore();
        }
    });

    // 궤도 무기 그리기 (라운드 로빈)
    let rrLvl = player.skills['round_robin'] || 0;
    let isRREvo = player.skills['context_switch'] > 0;
    if(rrLvl > 0 || isRREvo) {
        let count = isRREvo ? 5 : (rrLvl >= 4 ? 3 : (rrLvl >= 2 ? 2 : 1));
        let rrSpeed = isRREvo ? 4 : 2 + (rrLvl * 0.2);
        let radius = 80 + (rrLvl * 10);
        
        for(let i=0; i<count; i++) {
            let angle = (gameTime * rrSpeed) + ((Math.PI * 2 / count) * i);
            let hx = player.x + Math.cos(angle) * radius;
            let hy = player.y + Math.sin(angle) * radius;
            
            // 망치 그리기 (아이콘 또는 도형)
            ctx.save();
            ctx.translate(hx, hy);
            ctx.rotate(angle + Math.PI/2); // 회전 방향 맞춰서
            
            // 망치 자루
            ctx.fillStyle = '#78350f';
            ctx.fillRect(-2, -15, 4, 30);
            // 망치 머리
            ctx.fillStyle = isRREvo ? '#f43f5e' : '#cbd5e1'; // 진화시 붉은망치
            ctx.fillRect(-10, -20, 20, 15);
            ctx.fillStyle = '#0f172a';
            ctx.font = '10px Fira Code';
            ctx.fillText("RR", 0, -10);
            
            ctx.restore();
        }
    }

    // 플레이어 그리기 (단일 이미지)
    if (studentImg.complete && studentImg.naturalWidth !== 0) {
        let destW = 60; 
        // 원본 비율에 맞게 높이 계산
        let destH = 60 * (studentImg.naturalHeight / studentImg.naturalWidth);
        
        // 걷는 느낌을 주기 위한 통통 튀는 효과 (bobbing)
        let bobbingY = 0;
        let isMoving = (keys['KeyW'] || keys['ArrowUp'] || keys['KeyS'] || keys['ArrowDown'] || keys['KeyA'] || keys['ArrowLeft'] || keys['KeyD'] || keys['ArrowRight']);
        if (isMoving) {
            bobbingY = Math.abs(Math.sin(gameTime * 10)) * -8;
        }

        ctx.save();
        ctx.translate(player.x, player.y);
        
        // 왼쪽 방향일 경우 좌우 반전
        if (player.dir === 1) {
            ctx.scale(-1, 1);
        }

        // 이미지의 발끝(하단 중심)을 player.x, player.y에 맞춤
        ctx.drawImage(studentImg, -destW/2, -destH + bobbingY, destW, destH);
        ctx.restore();
        
        let hpRatio = player.hp / player.maxHp;
        let pWidth = 40;
        let barY = player.y - destH - 15;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(player.x - pWidth/2, barY, pWidth, 5);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(player.x - pWidth/2, barY, pWidth * Math.max(0, hpRatio), 5);
    } else {
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(player.x, player.y, 18, 0, Math.PI*2);
        ctx.fill();
        
        let hpRatio = player.hp / player.maxHp;
        let pWidth = 40;
        let barY = player.y - 18 - 15;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(player.x - pWidth/2, barY, pWidth, 5);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(player.x - pWidth/2, barY, pWidth * Math.max(0, hpRatio), 5);
    }

    // 데미지 텍스트
    damageTexts.forEach(t => {
        ctx.fillStyle = t.color;
        ctx.globalAlpha = t.life;
        ctx.font = 'bold 16px Fira Code';
        ctx.textAlign = 'center';
        ctx.fillText(t.text, t.x, t.y);
        ctx.globalAlpha = 1.0;
    });

    ctx.restore();
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
    if(dt > 0.1) dt = 0.1;

    if(gameState === 'playing') {
        update(dt);
    }
    
    // levelup 이나 gameover 여도 화면은 그린다 (배경 정지 상태용)
    draw();
}

// 시작!
requestAnimationFrame(loop);
