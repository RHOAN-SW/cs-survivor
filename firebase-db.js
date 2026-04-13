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
        
        // 배열이 아니면 배열로 변환
        const scores = Array.isArray(data) ? data : Object.values(data || {});
        const sorted = scores.sort((a, b) => b.time - a.time);
        
        return sorted;
    } catch (e) {
        // 폴백: localStorage
        const data = localStorage.getItem('cs_survivor_leaderboard');
        return data ? JSON.parse(data) : [];
    }
}

// Firebase Realtime Database에 리더보드 저장
async function saveLocalScores(scores) {
    try {
        const topScores = scores.slice(0, 50);
        const url = `${FIREBASE_DB_URL}/leaderboard.json?auth=${FIREBASE_API_KEY}`;
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(topScores)
        });
        
        if (!response.ok) {
            throw new Error(`Firebase API 오류: ${response.status}`);
        }
        
        return true;
    } catch (e) {
        // 폴백: localStorage
        localStorage.setItem('cs_survivor_leaderboard', JSON.stringify(scores.slice(0, 50)));
        return false;
    }
}

// 점수 등록
async function submitScoreToStorage(nickname, time, level) {
    const record = {
        nickname: nickname,
        time: time,
        level: level,
        date: new Date().toISOString()
    };

    try {
        const scores = await getLocalScores();
        scores.push(record);
        scores.sort((a, b) => b.time - a.time);
        if (scores.length > 50) scores.length = 50;
        
        await saveLocalScores(scores);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// 리더보드 가져오기 (Firebase)
async function fetchLeaderboard() {
    return await getLocalScores();
}
