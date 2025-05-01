// dispatcherService.js  (2025-05-01)
const net = require('net');
const axios = require('axios');
const MapDB = require('../models/Map');
const Robot = require('../models/Robot');
const Log = require('../models/Log');
const ModbusRTU = require('modbus-serial');

/* ═══════════════════════════════════════════════════════════════════════
   0-B.  RIOs (Modbus-TCP) 설정
   - register-index → { from, to } 형태로 정의해 두면
     나중에 다른 비트(레지스터)만 추가해서 경로를 확장할 수 있음
   ═════════════════════════════════════════════════════════════════════ */
const RIOS = {
  '192.168.0.6': {                              // B4 ➜ A4
    client: new ModbusRTU(),
    routes: { 3: { from: 'B4', to: 'A4', prev: 0, curr: 0 } },
    connected: false,
  },
  '192.168.0.5': {                              // A4 ➜ B4
    client: new ModbusRTU(),
    routes: { 3: { from: 'A4', to: 'B4', prev: 0, curr: 0 } },
    connected: false,
  },
};
const RIO_PORT = 502;
const RIO_UNIT_ID = 1;

/* ── 초기 연결 ────────────────────────────────────────────────────────── */
(async () => {
  for (const [ip, dev] of Object.entries(RIOS)) {
    try {
      await dev.client.connectTCP(ip, { port: RIO_PORT });
      dev.client.setID(RIO_UNIT_ID);
      dev.connected = true;
      console.log(`[RIO] ${ip} connected`);
      dev.client._client.on('close', () => { dev.connected = false; });
      dev.client._client.on('error', () => { dev.connected = false; });
    } catch (e) {
      console.error(`[RIO] ${ip} connect error –`, e.message);
      dev.connected = false;
    }
  }
})();

/* ═════════════════════════════════════════════════════════════════════ */
/* 0-A. IO / Door 설정                                                       */
/* ═════════════════════════════════════════════════════════════════════ */
const IO_HOST = '10.29.176.171';
const IO_AUTH = { username: 'root', password: '00000000' };
/* ── 0-A. Door IP 설정 (A/B 분리) ─────────────────────────────── */
const DOOR_IPS = {
  A: ['192.168.0.7', '192.168.0.8'],   // A 쪽
  B: ['192.168.0.9', '192.168.0.10'],  // B 쪽
};
const DOOR_COOLDOWN = 3_000;
const doorState = new Map();                    // id → { open, timestamp }

/* ═════════════════════════════════════════════════════════════════════ */
/* 1. 글로벌 재시도 큐 (A↔B 교차 전용)                                          */
/* ═════════════════════════════════════════════════════════════════════ */
if (!global.pendingQ) global.pendingQ = new Map();
let _pq = global.pendingQ;
const pq = {
  set: (k, v) => (_pq instanceof Map ? _pq.set(k, v) : (_pq[k] = v)),
  del: k => (_pq instanceof Map ? _pq.delete(k) : delete _pq[k]),
  entries: () => (_pq instanceof Map ? Array.from(_pq) : Object.entries(_pq)),
  size: () => (_pq instanceof Map ? _pq.size : Object.keys(_pq).length),
};

/* ═════════════════════════════════════════════════════════════════════ */
/* 2. Log helper (연결 로그는 남기지 않고, 엣지-이벤트만 기록)                       */
/* ═════════════════════════════════════════════════════════════════════ */
async function log(type, message, meta = {}) {
  try {
    await Log.create({ type, message, ...meta });
  } catch (e) {
    console.error('[Log]', e.message);
  }
}

/* ═════════════════════════════════════════════════════════════════════ */
/* 3. 스테이션/로봇 유틸                                                      */
/* ═════════════════════════════════════════════════════════════════════ */
function getClasses(st) {
  const raw = Array.isArray(st.classes) ? st.classes
    : Array.isArray(st.classList) ? st.classList
      : st.class ? (Array.isArray(st.class) ? st.class : [st.class])
        : [];
  return raw.flat();
}
const hasClass = (st, c) => getClasses(st).includes(c);
const regionOf = st => hasClass(st, 'A') ? 'A' : hasClass(st, 'B') ? 'B' : null;
const amrAt = (robots, st) => robots.some(r => String(r.location) === String(st.id));

/* ── 버퍼 센서 DI ───────────────────────────────────────────────────── */
async function isBufferEmpty(ch) {
  const url = `http://${IO_HOST}/di_value/slot_0/ch_${ch}`;
  try {
    const { data } = await axios.get(url, { auth: IO_AUTH, timeout: 5_000 });
    return data && typeof data.Val !== 'undefined' ? data.Val === 1 : false;
  } catch (e) {
    console.error('[isBufferEmpty]', e.message);
    return false;
  }
}

/* ═════════════════════════════════════════════════════════════════════ */
/* 4. Door control helper                                                  */
/* ═════════════════════════════════════════════════════════════════════ */
/* ── Door control helper (region 인자 추가) ───────────────────── */
async function setDoor(slot, ch, open, region /* 'A' | 'B' */, id) {
  const last = doorState.get(id) || { open: !open, timestamp: 0 };
  if (last.open === open) return;
  if (Date.now() - last.timestamp < DOOR_COOLDOWN) return;

  const payload = {
    Ch: ch, Md: 0, Stat: open ? 1 : 0, Val: open ? 1 : 0,
    PsCtn: 0, PsStop: 0, PsIV: 0
  };
  const authHeader = 'Basic ' + Buffer.from('root:12345678').toString('base64');

  for (const DOOR_IP of DOOR_IPS[region]) {
    try {
      await axios.put(
        `http://${DOOR_IP}/do_value/slot_${slot}/ch_${ch}`,
        payload,
        { headers: { Authorization: authHeader, 'Content-Type': 'application/json' }, timeout: 5_000 }
      );
      doorState.set(id, { open, timestamp: Date.now() });
    } catch (e) {
      console.error('[setDoor]', e.response?.data ?? e.message);
    }
  }
}


/* ═════════════════════════════════════════════════════════════════════ */
/* 5. TCP Nav 패킷 전송                                                     */
/* ═════════════════════════════════════════════════════════════════════ */
let serial = 0;
function buildPacket(code, obj = {}) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(16);
  head.writeUInt8(0x5A, 0);       // 'Z'
  head.writeUInt8(0x01, 1);
  head.writeUInt16BE(++serial & 0xffff, 2);
  head.writeUInt32BE(body.length, 4);
  head.writeUInt16BE(code, 8);
  return Buffer.concat([head, body]);
}
function sendGotoNav(ip, dest, src, task) {
  return new Promise((ok, ng) => {
    const s = net.createConnection(19206, ip, () => {
      s.write(buildPacket(0x0BEB, { id: String(dest), source_id: String(src), task_id: task }));
      log('NAV_SEND', `${ip}→${dest} (${task})`);
      s.end(); ok();
    });
    s.once('error', e => { log('NAV_ERR', e.message); s.destroy(); ng(e); });
    s.setTimeout(5_000, () => { s.destroy(); ng(new Error('timeout')); });
  });
}

/* ═════════════════════════════════════════════════════════════════════ */
/* 6. 목적지 선택 로직 (기존 유지)                                            */
/* ═════════════════════════════════════════════════════════════════════ */
async function chooseDestination({ fromSt, toSt, robot, robots, stations }) {
  const fr = regionOf(fromSt), tr = regionOf(toSt);
  if (fr && tr && fr !== tr) {
    if (!hasClass(fromSt, 'IC'))
      return stations.find(s => regionOf(s) === fr && hasClass(s, 'IC') && !amrAt(robots, s)) || null;
    const path = stations.find(s => hasClass(s, '경로'));
    if (path && amrAt(robots, path))
      return stations.find(s => regionOf(s) === fr && hasClass(s, '대기') && !amrAt(robots, s)) || null;
    return toSt;
  }
  const fc = getClasses(fromSt), tc = getClasses(toSt), busy = s => amrAt(robots, s);
  if (((fc.includes('A') && tc.includes('A')) || (fc.includes('B') && tc.includes('B'))) &&
    (fc.includes('버퍼') || fc.includes('충전')) && tc.includes('적하') && !busy(toSt))
    return toSt;
  if (fc.includes('B')) {
    const aUnload = stations.find(s => hasClass(s, 'A') && hasClass(s, '적하'));
    if (!aUnload) return null;
    if (busy(aUnload)) {
      const buf = stations.find(s => hasClass(s, 'A') && hasClass(s, '버퍼') && !busy(s));
      if (buf && await isBufferEmpty(buf.sensorId ?? buf.id)) return buf;
      return null;
    }
    return aUnload;
  }
  if (fc.includes('A')) {
    const bUnload = stations.find(s => hasClass(s, 'B') && hasClass(s, '적하'));
    if (robot.battery <= 40) {
      const chg = stations.find(s => hasClass(s, '충전') && !busy(s));
      if (chg) return chg;
      return null;
    }
    if (bUnload && !busy(bUnload)) return bUnload;
    const buf = stations.find(s => hasClass(s, 'B') && hasClass(s, '버퍼') && !busy(s));
    if (buf && await isBufferEmpty(buf.sensorId ?? buf.id)) return buf;
  }
  return null;
}

/* ═════════════════════════════════════════════════════════════════════ */
/* 7-A. RIO 폴링                                                            */
/* ═════════════════════════════════════════════════════════════════════ */
async function pollAllRios() {
  for (const [ip, dev] of Object.entries(RIOS)) {
    if (!dev.client.isOpen) continue;
    try {
      const { data } = await dev.client.readHoldingRegisters(0, 16);
      for (const [regIdx, route] of Object.entries(dev.routes)) {
        route.prev = route.curr;
        route.curr = data[regIdx];
      }
    } catch (e) {
      console.error(`[RIO] ${ip} read error –`, e.message);
    }
  }
}
async function clearRioFlag(dev, regIdx) {
  try {
    await dev.client.writeRegister(Number(regIdx), 0);
    dev.routes[regIdx].prev = 0;
    dev.routes[regIdx].curr = 0;
  } catch (e) {
    console.error('[RIO] clear flag error –', e.message);
  }
}

/* ═════════════════════════════════════════════════════════════════════ */
/* 7-B. Edge 이벤트 처리 (다단계 검사)                                         */
/* ═════════════════════════════════════════════════════════════════════ */
async function handleRioEdge(ip, dev, regIdx, route) {
  const { from: fromName, to: toName } = route;
  const mapRow = await MapDB.findOne({ where: { is_current: true } });
  if (!mapRow) return;

  const stations = (JSON.parse(mapRow.stations || '{}').stations || []);
  const fromSt = stations.find(s => s.name === fromName);
  const toSt = stations.find(s => s.name === toName);
  if (!(fromSt && toSt)) return;

  const robots = await Robot.findAll();
  const robotsAt = robots.filter(r => String(r.location) === String(fromSt.id));
  if (!robotsAt.length) return;

  const crossing = regionOf(fromSt) && regionOf(toSt) && regionOf(fromSt) !== regionOf(toSt);

  /* 같은 리전에서 이미 이동중 로봇 존재 → (교차면 큐, 아니면 무시) */
  if (robots.some(r =>
    r.status === '이동' &&
    regionOf(stations.find(s => String(s.id) === String(r.location))) === regionOf(fromSt))) {
    if (crossing) {
      robotsAt.forEach(r => pq.set(r.id, toSt.id));
      await log('RIO_QUEUE', `cross-hold ${robotsAt.map(r => r.name).join(',')}`, {
        robot_name: robotsAt.map(r => r.name).join(','),
        from: fromName, to: toName, status: 'queued', detail: `edge reg${regIdx}`,
      });
    }
    return;
  }

  /* 실제 디스패치 시도 */
  const robot = robotsAt[0];
  const next = await chooseDestination({ fromSt, toSt, robot, robots, stations });
  if (!next) {
    if (crossing) {
      pq.set(robot.id, toSt.id);
      await log('RIO_QUEUE', `cross-cond ${robot.name}`, {
        robot_name: robot.name, from: fromName, to: toName,
        status: 'queued', detail: `edge reg${regIdx}`,
      });
    }
    return;
  }

  const taskId = Date.now().toString();
  await sendGotoNav(robot.ip, next.id, 'SELF_POSITION', taskId);
  await Robot.update(
    { destination: next.name, status: '이동', timestamp: new Date() },
    { where: { id: robot.id } },
  );
  await log('RIO_DISPATCH',
    `RIO ${ip} ${robot.name} ${fromName}→${next.name} (${taskId})`,
    { robot_name: robot.name, from: fromName, to: next.name, status: '이동', detail: `edge reg${regIdx}` });

  if (crossing && String(next.id) !== String(toSt.id))
    pq.set(robot.id, toSt.id);
}

/* ═════════════════════════════════════════════════════════════════════ */
/* 7-C. 주기 워커 (1 Hz)                                                     */
/* ═════════════════════════════════════════════════════════════════════ */
async function workerTick() {
  await pollAllRios();

  /* RIO edge handling */
  for (const [ip, dev] of Object.entries(RIOS)) {
    for (const [regIdx, route] of Object.entries(dev.routes)) {
      /* rising-edge 감지 */
      if (route.curr === 1 && route.prev === 0) {
        try { await handleRioEdge(ip, dev, regIdx, route); }
        catch (e) { console.error('[RIO_EDGE]', e.message); }
        await clearRioFlag(dev, regIdx);           // 반드시 리셋
      }
      /* 비트가 계속 1이라면 PLC 측이 멈춰 있지 않도록 리셋 */
      else if (route.curr === 1) {
        await clearRioFlag(dev, regIdx);
      }
    }
  }

  /* ── Door & 교차-재시도 큐 (기존 로직 유지) ───────────────────────── */
  const mapRow = await MapDB.findOne({ where: { is_current: true } });
  if (!mapRow) return;
  const stations = (JSON.parse(mapRow.stations || '{}').stations || []);
  const robots = await Robot.findAll();


  /* ── workerTick 내부: 도어 A/B 각각 제어 ───────────────────────── */
  const doorAOpen = stations.some(s =>
    hasClass(s, 'door') && hasClass(s, 'A') &&
    robots.find(r => String(r.location) === String(s.id))
  );
  const doorBOpen = stations.some(s =>
    hasClass(s, 'door') && hasClass(s, 'B') &&
    robots.find(r => String(r.location) === String(s.id))
  );

  await setDoor(0, 0, doorAOpen, 'A', 'doorA');
  await setDoor(0, 0, doorBOpen, 'B', 'doorB');


  if (!pq.size()) return;
  for (const [rid, destId] of pq.entries()) {
    const robot = robots.find(r => r.id == rid);
    if (!robot) { pq.del(rid); continue; }
    if (robot.status === '이동') continue;

    const hereSt = stations.find(s => String(s.id) === String(robot.location));
    const destSt = stations.find(s => String(s.id) === String(destId));
    if (!(hereSt && destSt)) { pq.del(rid); continue; }

    const next = await chooseDestination({ fromSt: hereSt, toSt: destSt, robot, robots, stations });
    if (!next) continue;

    const taskId = Date.now().toString();
    try {
      await sendGotoNav(robot.ip, next.id, 'SELF_POSITION', taskId);
      await Robot.update(
        { destination: next.name, status: '이동', timestamp: new Date() },
        { where: { id: robot.id } },
      );
      await log('AUTO_DISPATCH',
        `${robot.name}→${next.name}`, {
        robot_name: robot.name, from: hereSt.name, to: destSt.name,
        status: '이동', detail: 'auto-retry',
      });
    } catch (e) {
      await log('AUTO_ERR', e.message, { robot_name: robot.name });
    }
    if (String(next.id) === String(destSt.id)) pq.del(rid);
  }
}
setInterval(workerTick, 1_000);

/* ═════════════════════════════════════════════════════════════════════ */
/* 8. POST /api/dispatch 핸들러 (변경 없음)                                   */
/* ═════════════════════════════════════════════════════════════════════ */
exports.handleRequest = async (req, res) => {
  try {
    const { from: fromName, to: toName } = req.body || {};
    if (!fromName || !toName) {
      return res.status(400).json({ message: 'from / to required' });
    }

    const mapRow = await MapDB.findOne({ where: { is_current: true } });
    if (!mapRow) return res.status(400).json({ message: 'no current map' });

    const stations = (JSON.parse(mapRow.stations || '{}').stations || []);
    const fromSt = stations.find(s => (s.name ?? String(s.id)) === fromName);
    const toSt = stations.find(s => (s.name ?? String(s.id)) === toName);
    if (!(fromSt && toSt)) {
      return res.status(404).json({ message: 'station not found' });
    }

    const robots = await Robot.findAll();
    const robotsAtFrom = robots.filter(r => String(r.location) === String(fromSt.id));
    if (!robotsAtFrom.length) {
      return res.json({ ignored: true, reason: 'no amr at from' });
    }

    const crossing =
      regionOf(fromSt) && regionOf(toSt) && regionOf(fromSt) !== regionOf(toSt);

    /* 이미 해당 region 에 이동 중인 AMR 이 있는 경우 */
    if (robots.some(r =>
      r.status === '이동' &&
      regionOf(stations.find(s => String(s.id) === String(r.location)))
      === regionOf(fromSt))) {
      if (crossing) {
        robotsAtFrom.forEach(r => pq.set(r.id, toSt.id));
        await log('QUEUE',
          `cross-hold ${robotsAtFrom.map(r => r.name).join(',')}`,
          {
            robot_name: robotsAtFrom.map(r => r.name).join(','),
            from: fromName, to: toName, status: 'queued',
            detail: 'cross-hold'
          });
        return res.status(202).json({
          holding: true,
          queued: robotsAtFrom.map(r => r.name),
        });
      }
      return res.json({ ignored: true, reason: 'moving amr in region' });
    }

    /* 실제 디스패치 */
    const robot = robotsAtFrom[0];
    const next = await chooseDestination({
      fromSt, toSt, robot,
      robots, stations
    });
    if (!next) {
      if (crossing) {
        pq.set(robot.id, toSt.id);
        await log('QUEUE',
          `cross-cond ${robot.name}`,
          {
            robot_name: robot.name,
            from: fromName, to: toName,
            status: 'queued', detail: 'cross-cond'
          });
        return res.status(202).json({ holding: true, queued: [robot.name] });
      }
      return res.json({ ignored: true, reason: 'cond unmet' });
    }

    const taskId = Date.now().toString();
    await sendGotoNav(robot.ip, next.id, 'SELF_POSITION', taskId);
    await Robot.update(
      { destination: next.name, status: '이동', timestamp: new Date() },
      { where: { id: robot.id } },
    );

    await log('DISPATCH',
      `${robot.name}→${next.name} (${taskId})`,
      {
        robot_name: robot.name,
        from: fromName, to: toName,
        status: '이동', detail: `taskId:${taskId}`
      });

    if (crossing && String(next.id) !== String(toSt.id)) {
      pq.set(robot.id, toSt.id);
    }

    res.json({
      success: true,
      dispatched: robot.name,
      dest: next.name,
      taskId,
      queued_next: pq.entries().some(([id]) => id == robot.id),
    });
  } catch (e) {
    console.error('[dispatcher]', e);
    //await log('HTTP_ERR', e.message);
    res.status(500).json({ message: e.message });
  }
};

/* ═════════════════════════════════════════════════════════════════════ */
/* 9. EXPORTS                                                             */
/* ═════════════════════════════════════════════════════════════════════ */
exports.sendGotoNav = sendGotoNav;
exports.chooseDestination = chooseDestination;
exports.isBufferEmpty = isBufferEmpty;
exports.buildPacket = buildPacket;
