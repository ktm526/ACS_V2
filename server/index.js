// server/index.js

const express = require('express');
const sequelize = require('./config/db');
const path = require('path');


// ─── AMR 모니터링 서비스 실행 ───────────────────────
require('./services/amrMonitorService');

const cors = require('cors');

// ─── Express 앱 생성 ───────────────────────────────
const app = express();

// ─── 전체 요청 로깅 미들웨어 ───────────────────────
// 모든 HTTP 요청(Method + URL)을 콘솔에 출력합니다.
app.use((req, res, next) => {
    //console.log(`${new Date().toISOString()} → ${req.method} ${req.originalUrl}`);
    next();
});

// ─── 공통 미들웨어 ─────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── 라우트 등록 ───────────────────────────────────
const mapRoutes = require('./routes/mapRoutes');
const mapUpload = require('./routes/mapUploadRoutes');
const robotRoutes = require('./routes/robotRoutes');
const logRoutes = require('./routes/logRoutes');
const dispatchRoutes = require('./routes/dispatchRoutes');   // ★ 추가


app.use('/api/maps', mapRoutes);
app.use('/api/maps', mapUpload);
app.use('/api/robots', robotRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/dispatch', dispatchRoutes);                 // ★ 추가
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_, res) =>
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// ─── 데이터베이스 동기화 및 서버 시작 ───────────────
(async () => {
    try {
        await sequelize.sync({ alter: true });  // 테이블 자동 생성
        //await sequelize.sync();
        const PORT = process.env.PORT || 4000;
        app.listen(PORT, () => console.log(`API ready on :${PORT}`));
    } catch (e) {
        console.error('Failed to start server:', e);
    }
})();
