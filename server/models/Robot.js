// models/Robot.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

module.exports = sequelize.define('Robot', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    ip: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: '대기',
    },
    battery: {                           // 배터리 레벨(%)
        type: DataTypes.FLOAT,
        defaultValue: 0,
    },
    voltage: {                           // 전압(V)
        type: DataTypes.FLOAT,
        defaultValue: 0,
    },
    current_map: {                       // 현재 맵 이름
        type: DataTypes.STRING,
        allowNull: true,
    },
    // ─── 새로 추가 ───────────────────────────────
    location: {                          // current_station
        type: DataTypes.STRING,
        allowNull: true,
    },
    next_location: {                     // 다음 위치 (optional)
        type: DataTypes.STRING,
        allowNull: true,
    },
    destination: {                       // 목적지
        type: DataTypes.STRING,
        allowNull: true,
    },
    task_step: {                         // 현재 작업 단계
        type: DataTypes.STRING,
        allowNull: true,
    },
    // ────────────────────────────────────────────────
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    position: {                          // JSON 문자열: { x, y, angle }
        type: DataTypes.TEXT,
        allowNull: true,
    },
    additional_info: {                   // 원본 Push 페이로드 전체
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, {
    tableName: 'Robots',
    timestamps: false,
});
