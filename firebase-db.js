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
    const record = {
        school: school || '-',
        nickname: nickname,
        time: time,
        level: level,
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

// 점수 삭제 (관리자용 - 개별 ID 기반)
async function deleteScoreFromStorage(id, password) {
    const ADMIN_PASSWORD = "admin123"; // 임시 비번
    
    if (password !== ADMIN_PASSWORD) {
        return { success: false, error: "비밀번호가 틀렸습니다." };
    }

    if (!id && id !== 0) {
        return { success: false, error: "삭제할 기록의 ID가 유효하지 않습니다." };
    }

    try {
        const url = `${FIREBASE_DB_URL}/leaderboard/${id}.json?auth=${FIREBASE_API_KEY}`;
        const response = await fetch(url, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Firebase API 오류: ${response.status}`);
        }
        
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}
