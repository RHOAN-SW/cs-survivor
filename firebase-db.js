// ============================
// Firebase Realtime Database (REST API)
// ============================

const firebaseConfig = {
  apiKey: "AIzaSyA7KeLSXmwgnUinryupqu8elaNZA0PW0ZE",
  authDomain: "cs-survivor.firebaseapp.com",
  databaseURL: "https://cs-survivor-default-rtdb.firebaseio.com",
  projectId: "cs-survivor",
  storageBucket: "cs-survivor.firebasestorage.app",
  messagingSenderId: "350663522944",
  appId: "1:350663522944:web:4b250d81dc719e5d048465",
  measurementId: "G-MWXSK64CSV"
};

const FIREBASE_DB_URL = firebaseConfig.databaseURL;
const FIREBASE_API_KEY = firebaseConfig.apiKey;

// Firebase Realtime Database에서 리더보드 데이터 가져오기
async function getLocalScores() {
    try {
        const url = `${FIREBASE_DB_URL}/leaderboard.json?auth=${FIREBASE_API_KEY}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Firebase API 오류: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data) {
            return [];
        }
        
        // 객체 {id: record} 를 배열 [{id, ...record}] 로 변환
        let scores = [];
        if (Array.isArray(data)) {
            scores = data.filter(s => s !== null).map((s, index) => ({ id: index, ...s }));
        } else {
            scores = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            }));
        }
        
        // 🔒 보안 필터링: 쓰레기 데이터(채팅 장난 등) 제거
        scores = scores.filter(s => {
            // 1. 학교명이 CHAT_MSG인 경우 차단
            if (s.school && String(s.school).includes('CHAT_MSG')) return false;
            // 2. 레벨이나 시간이 숫자가 아닌 경우 차단 (XSS 방어 및 데이터 무결성)
            if (isNaN(Number(s.level)) || isNaN(Number(s.time))) return false;
            // 3. 비정상적인 값 필터링 (예: 레벨 1000 초과 등 - 필요시 조절)
            if (Number(s.level) > 2000) return false;
            return true;
        });

        const sorted = scores.sort((a, b) => b.time - a.time);
        
        return sorted;
    } catch (e) {
        // 폴백: localStorage
        const data = localStorage.getItem('cs_survivor_leaderboard');
        return data ? JSON.parse(data) : [];
    }
}

// 점수 등록 (개별 POST 방식)
async function submitScoreToStorage(school, nickname, time, level) {
    // 데이터 타입 강제 및 정화
    const finalLevel = Number(level);
    const finalTime = Number(time);

    const record = {
        school: school || '-',
        nickname: nickname,
        time: isNaN(finalTime) ? 0 : finalTime,
        level: isNaN(finalLevel) ? 1 : finalLevel,
        date: new Date().toISOString()
    };

    try {
        const url = `${FIREBASE_DB_URL}/leaderboard.json?auth=${FIREBASE_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(record)
        });
        
        if (!response.ok) {
            throw new Error(`Firebase API 오류: ${response.status}`);
        }
        
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// 리더보드 가져오기 (Firebase)
async function fetchLeaderboard() {
    return await getLocalScores();
}
