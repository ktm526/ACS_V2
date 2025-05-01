// services/amrMonitorService.js
const net = require('net');
const { Op } = require('sequelize');
const Robot = require('../models/Robot');

const PUSH_PORT = 19301;
const sockets = new Map();
const lastRecTime = new Map();

function handlePush(sock, ip) {
    let buf = Buffer.alloc(0);

    sock.on('data', async chunk => {
        buf = Buffer.concat([buf, chunk]);

        while (buf.length >= 16) {
            if (buf.readUInt8(0) !== 0x5A) {
                buf = Buffer.alloc(0);
                break;
            }
            const len = buf.readUInt32BE(4);
            if (buf.length < 16 + len) break;

            const payload = buf.slice(16, 16 + len).toString();
            buf = buf.slice(16 + len);

            let json;
            try { json = JSON.parse(payload); }
            catch { continue; }

            const name = json.vehicle_id || json.robot_id || 'UnknownRobot';

            // task_status 에 따라 한글 상태 매핑
            const ts = typeof json.task_status === 'number'
                ? json.task_status
                : typeof json.taskStatus === 'number'
                    ? json.taskStatus
                    : null;
            let statusStr;
            if (ts === 2) statusStr = '이동';
            else if ([0, 1, 4].includes(ts)) statusStr = '대기';
            else if ([5, 6].includes(ts)) statusStr = '오류';
            else statusStr = 'unknown';

            // 새로 추가: current_station (location) 추출
            const location = json.current_station
                || json.currentStation || json.finished_path[json.finished_path.length-1]
                || null;

            const battery = (typeof json.battery_level === 'number')
                ? json.battery_level * 100
                : null;
            const voltage = (typeof json.voltage === 'number')
                ? json.voltage
                : null;
            const currentMap = json.current_map || null;
            const pos = {
                x: json.x ?? json.position?.x ?? 0,
                y: json.y ?? json.position?.y ?? 0,
                angle: json.angle ?? json.position?.yaw ?? 0,
            };

            // console.log(
            //     `[Push] ${name}@${ip}`,
            //     `task_status=${ts}→${statusStr}`,
            //     `loc=${location}`,
            //     `battery=${battery?.toFixed(1)}%`,
            //     `voltage=${voltage?.toFixed(1)}V`,
            //     `map=${currentMap}`,
            //     `pos=(${pos.x.toFixed(2)},${pos.y.toFixed(2)})`
            // );

            const payloadForDb = {
                name,
                status: statusStr,
                location,                // ← 여기에 current_station 을 저장
                battery,
                voltage,
                current_map: currentMap,
                position: JSON.stringify(pos),
                additional_info: JSON.stringify(json),
                timestamp: new Date(),
            };

            try {
                // 기존에 같은 IP 로 등록된 로봇이 있으면 업데이트, 없으면 생성
                const existing = await Robot.findOne({ where: { ip } });
                if (existing) {
                    await existing.update(payloadForDb);
                } else {
                    // await Robot.create({ ip, ...payloadForDb });
                }
                lastRecTime.set(name, Date.now());
            } catch (e) {
                console.error('[Push-DB] error saving robot:', e.message);
            }
        }
    });
}

async function connect(ip) {
    if (sockets.has(ip)) return;
    return new Promise(resolve => {
        const sock = net.createConnection(PUSH_PORT, ip).setTimeout(5000);

        sock.on('connect', () => {
            console.log(`[AMR] ✅ connected ${ip}`);
            sock.setTimeout(0);
            sockets.set(ip, sock);
            handlePush(sock, ip);
            resolve();
        });

        sock.on('error', err => {
            console.warn(`[AMR] error ${ip}: ${err.message}`);
            sock.destroy();
            sockets.delete(ip);
            resolve();
        });

        sock.on('timeout', () => {
            console.warn(`[AMR] timeout ${ip}`);
            sock.destroy();
            sockets.delete(ip);
            resolve();
        });

        sock.on('close', () => {
            console.warn(`[AMR] closed ${ip}`);
            sockets.delete(ip);
        });
    });
}

setInterval(async () => {
    const rows = await Robot.findAll({
        where: { ip: { [Op.not]: null } },
        attributes: ['ip'],
        raw: true,
    });
    for (const { ip } of rows) {
        await connect(ip);
    }
}, 5000);

setInterval(async () => {
    const now = Date.now();
    for (const [name, t] of lastRecTime.entries()) {
        if (now - t > 5000) {
            console.warn(`[AMR] ⚠️ disconnect ${name}`);
            lastRecTime.delete(name);
            await Robot.update(
                { status: '연결 끊김', timestamp: new Date() },
                { where: { name } }
            ).catch(() => { });
        }
    }
}, 1000);

console.log('🔧 AMR monitor service started');
