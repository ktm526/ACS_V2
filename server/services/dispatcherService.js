// dispatcherService.js  (2025-05-01)
const net    = require('net');
const axios  = require('axios');
const MapDB  = require('../models/Map');
const Robot  = require('../models/Robot');
const Log    = require('../models/Log');
const ModbusRTU = require('modbus-serial');

 /* ═════ 0-B.  RIOs (Modbus-TCP) 설정 ═════ */
 const RIOS = {
   '192.168.0.6': { client: new ModbusRTU(),reg1:0, reg3: 0, prev: 0,
                    from: 'B4', to: 'A4', connected:false },
   '192.168.0.5': { client: new ModbusRTU(), reg1:0, reg3: 0, prev: 0,
                    from: 'A4', to: 'B4',connected:false },
 };
 const RIO_PORT = 502;
 const RIO_UNIT_ID = 1;


 /* open both sockets once on startup */
 (async () => {
   for (const [ip, dev] of Object.entries(RIOS)) {
     try {
       await dev.client.connectTCP(ip, { port: RIO_PORT });
       dev.client.setID(RIO_UNIT_ID);
       console.log(`[RIO] ${ip} connected`);
     } catch (e) {
       console.error(`[RIO] ${ip} connect error –`, e.message);
     }
   }
 })();

 async function connectRio(ip, dev){
    try{
      await dev.client.connectTCP(ip,{port:RIO_PORT});
      dev.client.setID(RIO_UNIT_ID);
      dev.connected = true;
      console.log(`[RIO] ${ip} connected`);
      /* 소켓 단절 이벤트 → 플래그 false */
      dev.client._client.on('close',()=>{dev.connected=false;});
      dev.client._client.on('error',()=>{dev.connected=false;});
    }catch(e){
      dev.connected = false;
      console.error(`[RIO] ${ip} connect error –`,e.message);
    }
  }
  

/* ═════ 0-A. IO 설정 ═════ */
const IO_HOST        = '10.29.176.171';
const IO_AUTH        = { username: 'root', password: '00000000' };   // DI/DO module on 10.29.* network
const DOOR_IPs        = ['192.168.0.7', '192.168.0.8','192.168.0.9','192.168.0.10',];                                // WISE-4000 for doors
const DOOR_USER      = 'root';
const DOOR_PASS      = '12345678';
const DOOR_COOLDOWN  = 3_000;          // ms
const doorState      = new Map();      // id → { open, timestamp }


 async function pollAllRios() {
       for (const [ip, dev] of Object.entries(RIOS)) {
         if (!dev.client.isOpen) continue;
         try {
           const { data } = await dev.client.readHoldingRegisters(0, 16);
           dev.prev = dev.reg3;
           dev.reg3 = data[3];
           console.log(ip, dev.reg3)
         } catch (e) {
           console.error(`[RIO] ${ip} read error –`, e.message);
         }
       }
     }
     async function clearRioFlag(dev) {
        try {
          // write 0 to holding-register 3  (function-code 0x06)
          await dev.client.writeRegister(3, 0);
          dev.reg3  = 0;
          dev.prev  = 0;                 // reset edge-latch too
        } catch (e) {
          console.error('[RIO] clear flag error –', e.message);
          await log('RIO_ERR', `clear flag: ${e.message}`);
        }
      }
      

/* =========================================================================
   1. 글로벌 재시도 큐 (A↔B 교차만 사용)
   ========================================================================= */
if (!global.pendingQ) global.pendingQ = new Map();
let _pq = global.pendingQ;
const pq = {
  set   : (k, v) => (_pq instanceof Map ? _pq.set(k, v)    : (_pq[k] = v)),
  del   :  k     => (_pq instanceof Map ? _pq.delete(k)    : delete _pq[k]),
  entries:        () => (_pq instanceof Map ? Array.from(_pq)
                                           : Object.entries(_pq)),
  size  :        () => (_pq instanceof Map ? _pq.size
                                           : Object.keys(_pq).length),
};

/* =========================================================================
   2. Log helper
   ========================================================================= */
async function log(type, message, meta = {}) {
  try {
    await Log.create({ type, message, ...meta });
  } catch (e) {
    console.error('[Log]', e.message);
  }
}

/* =========================================================================
   3. 스테이션/로봇 유틸
   ========================================================================= */
function getClasses(st) {
  const raw = Array.isArray(st.classes)  ? st.classes
           : Array.isArray(st.classList) ? st.classList
           : st.class                    ? (Array.isArray(st.class) ? st.class
                                                                    : [st.class])
           : [];
  return raw.flat();
}
const hasClass = (st, c) => getClasses(st).includes(c);
const regionOf = st => hasClass(st, 'A') ? 'A'
                   :  hasClass(st, 'B') ? 'B'
                   :  null;

/* ── 버퍼 센서 (DI) ─────────────────────────────────────────────── */
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

/* =========================================================================
   4. DO (문 열림/닫힘) 헬퍼
   ========================================================================= */
async function setDoor(slot, ch, open, desc, id) {
  /* 1. 쿨-타임 & 중복 체크 */
//console.log(open)
  const last = doorState.get(id) || { open: !open, timestamp: 0 };
  if (last.open === open) return;                          // 상태 변화 없음
  if (Date.now() - last.timestamp < DOOR_COOLDOWN) return; // 쿨-타임 미도래

  /* 2. 페이로드 (WISE-4000 §B-2.2) */
  const payload = {
    Ch   : ch,
    Md   : 0,               // 0 = DO (Static)
    Stat : open ? 1 : 0,    // Stat 과 Val 동일
    Val  : open ? 1 : 0,
    PsCtn: 0,
    PsStop:0,
    PsIV : 0,
  };

  /* 3. Basic-auth 헤더 */
  const authHeader = 'Basic ' +
    Buffer.from(`root:12345678`, 'utf8').toString('base64');

  /* 4. PUT 호출 */
  for(const DOOR_IP of DOOR_IPs){
    try {
        await axios.put(
          `http://${DOOR_IP}/do_value/slot_${slot}/ch_${ch}`,
          payload,
          {
            headers: {
              'Authorization': authHeader,
              'Content-Type' : 'application/json',
            },
            timeout: 5_000,
          },
        );
    
        /* 5. 상태 저장 & 로그 */
        doorState.set(id, { open, timestamp: Date.now() });
        await log(open ? 'DOOR_OPEN' : 'DOOR_CLOSE',
                  `${desc} ${open ? 'open' : 'close'}`);
      } catch (e) {
        await log('DOOR_ERR', `${desc} – ${e.message}`);
        console.error('[setDoor]', e.response?.data ?? e.message);
      }
  }
  
}

/* =========================================================================
   5. TCP Nav (로봇 이동 명령) 
   ========================================================================= */
let serial = 0;
function buildPacket(code, obj = {}) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(16);
  head.writeUInt8 (0x5A, 0);
  head.writeUInt8 (0x01, 1);
  head.writeUInt16BE(++serial & 0xffff, 2);
  head.writeUInt32BE(body.length, 4);
  head.writeUInt16BE(code, 8);
  return Buffer.concat([head, body]);
}

function sendGotoNav(ip, dest, src, task) {
  return new Promise((ok, ng) => {
    const s = net.createConnection(19206, ip, () => {
      s.write(buildPacket(0x0BEB,
        { id: String(dest), source_id: String(src), task_id: task }));
      log('NAV_SEND', `${ip}→${dest} (${task})`);
      s.end();
      ok();
    });

    s.once('error', e => {
      log('NAV_ERR', e.message);
      s.destroy(); ng(e);
    });

    s.setTimeout(5_000, () => {
      log('NAV_TIMEOUT', ip);
      s.destroy(); ng(new Error('timeout'));
    });
  });
}

/* =========================================================================
   6. 목적지 선택 로직 (place-holder)
   ========================================================================= */
   async function chooseDestination({fromSt,toSt,robot,robots,stations}){
    const fr=regionOf(fromSt),tr=regionOf(toSt);
    /* A↔B 교차 전용 로직 */
    if(fr&&tr&&fr!==tr){
      if(!hasClass(fromSt,'IC'))
        return stations.find(s=>regionOf(s)===fr&&hasClass(s,'IC')&&!amrAt(robots,s))||null;
      const path=stations.find(s=>hasClass(s,'경로'));
      if(path&&amrAt(robots,path))
        return stations.find(s=>regionOf(s)===fr&&hasClass(s,'대기')&&!amrAt(robots,s))||null;
      return toSt;
    }
    /* 동일 지역 로직 (버퍼·충전→적하, A→B, B→A) */
    const fc=getClasses(fromSt),tc=getClasses(toSt),busy=s=>amrAt(robots,s);
    if(((fc.includes('A')&&tc.includes('A'))||(fc.includes('B')&&tc.includes('B'))) &&
       (fc.includes('버퍼')||fc.includes('충전'))&&tc.includes('적하')&&!busy(toSt))
      return toSt;
    if(fc.includes('B')){
      const aUnload=stations.find(s=>hasClass(s,'A')&&hasClass(s,'적하'));
      if(!aUnload) return null;
      if(busy(aUnload)){
        const buf=stations.find(s=>hasClass(s,'A')&&hasClass(s,'버퍼')&&!busy(s));
        if(buf&&await isBufferEmpty(buf.sensorId??buf.id)) return buf;
        return null;
      }
      return aUnload;
    }
    if(fc.includes('A')){
      const bUnload=stations.find(s=>hasClass(s,'B')&&hasClass(s,'적하'));
      if(robot.battery<=40){const ModbusRTU = require('modbus-serial');
        const chg=stations.find(s=>hasClass(s,'충전')&&!busy(s)); if(chg) return chg; return null;}
      if(bUnload&&!busy(bUnload)) return bUnload;
      const buf=stations.find(s=>hasClass(s,'B')&&hasClass(s,'버퍼')&&!busy(s));
      if(buf&&await isBufferEmpty(buf.sensorId??buf.id)) return buf;
    }
    return null;
  }

/* =========================================================================
   7. 주기 워커 (1 Hz)
   ========================================================================= */
async function workerTick() {
    await pollAllRios();
    
  /* RIO “start” command -> move AMR from B4 to A4 (edge-triggered) */

    /* RIO commands (edge-trigger) */
    for (const [ip, dev] of Object.entries(RIOS)) {
      if (dev.reg3 === 1 && dev.prev === 0) {          // rising edge
        try {
          const mapRow   = await MapDB.findOne({ where: { is_current: true } });
          const stations = JSON.parse(mapRow.stations || '{}').stations || [];
          const fromSt   = stations.find(s => s.name === dev.from);
          const toSt     = stations.find(s => s.name === dev.to);
          if (!(fromSt && toSt)) continue;
  
          const robot = await Robot.findOne({ where: { location: fromSt.id } });
          if (!robot || robot.status === '이동') continue;
  
          const taskId = Date.now().toString();
          await sendGotoNav(robot.ip, toSt.id, 'SELF_POSITION', taskId);
          await Robot.update(
            { destination: toSt.name, status: '이동', timestamp: new Date() },
            { where: { id: robot.id } }
          );
          await log('RIO_DISPATCH',
            `RIO ${ip}: ${robot.name} ${dev.from}→${dev.to} (${taskId})`,
            { robot_name: robot.name, from: dev.from, to: dev.to,
              status: '이동', detail: `rio register-3 ip:${ip}` });
              await clearRioFlag(dev);
        } catch (err) {
          console.error('[RIO_DISPATCH]', err.message);
          await log('RIO_ERR', err.message);
        }
      }  /* If the bit is still high but we already saw it last tick
           (reg3 === 1 && prev === 1), clear it as well so the PLC
      +     won’t stay stuck at 1. */
        else if (dev.reg3 === 1) {
           await clearRioFlag(dev);
        }
    }

  const mapRow = await MapDB.findOne({ where: { is_current: true } });
  if (!mapRow) return;

  const stations = (JSON.parse(mapRow.stations || '{}').stations || []);
  const robots   = await Robot.findAll();

  /* A. 도어 제어 */
  let here = false;
  for (const d of stations.filter(s => hasClass(s, 'door'))) {
    if(!!(robots.find(r => String(r.location) === String(d.id)))==true){
        here = true
    }
    
  }
  await setDoor(0,0,
    here,
    0,
    0);
  /* B. 교차-재시도 큐 */
  if (!pq.size()) return;
  for (const [rid, destId] of pq.entries()) {
    const robot = robots.find(r => r.id == rid);
    if (!robot) { pq.del(rid); continue; }
    if (robot.status === '이동') continue;

    const here = stations.find(s => String(s.id) === String(robot.location));
    const dest = stations.find(s => String(s.id) === String(destId));
    if (!(here && dest)) { pq.del(rid); continue; }

    const next = await chooseDestination({ fromSt: here, toSt: dest,
                                           robot, robots, stations });
    if (!next) continue;

    const task = Date.now().toString();
    try {
      await sendGotoNav(robot.ip, next.id, 'SELF_POSITION', task);
      await Robot.update(
        { destination: next.name, status: '이동', timestamp: new Date() },
        { where: { id: robot.id } },
      );
      await log('AUTO_DISPATCH',
        `${robot.name}→${next.name}`,
        {
          robot_name: robot.name,
          from : here.name ?? here.id,
          to   : dest.name ?? dest.id,
          status: '이동',
          detail: 'auto-retry',
        });
    } catch (e) {
      await log('AUTO_ERR', e.message, { robot_name: robot.name });
    }

    if (String(next.id) === String(dest.id)) pq.del(rid);
  }
}
setInterval(workerTick, 1_000);

/* =========================================================================
   8. POST /api/dispatch 핸들러
   ========================================================================= */
exports.handleRequest = async (req, res) => {
  try {
    const { from: fromName, to: toName } = req.body || {};
    if (!fromName || !toName) {
      return res.status(400).json({ message: 'from / to required' });
    }

    const mapRow = await MapDB.findOne({ where: { is_current: true } });
    if (!mapRow) return res.status(400).json({ message: 'no current map' });

    const stations = (JSON.parse(mapRow.stations || '{}').stations || []);
    const fromSt   = stations.find(s => (s.name ?? String(s.id)) === fromName);
    const toSt     = stations.find(s => (s.name ?? String(s.id)) === toName);
    if (!(fromSt && toSt)) {
      return res.status(404).json({ message: 'station not found' });
    }

    const robots        = await Robot.findAll();
    const robotsAtFrom  = robots.filter(r => String(r.location) === String(fromSt.id));
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
          { robot_name: robotsAtFrom.map(r => r.name).join(','),
            from: fromName, to: toName, status: 'queued',
            detail: 'cross-hold' });
        return res.status(202).json({
          holding: true,
          queued : robotsAtFrom.map(r => r.name),
        });
      }
      return res.json({ ignored: true, reason: 'moving amr in region' });
    }

    /* 실제 디스패치 */
    const robot = robotsAtFrom[0];
    const next  = await chooseDestination({ fromSt, toSt, robot,
                                            robots, stations });
    if (!next) {
      if (crossing) {
        pq.set(robot.id, toSt.id);
        await log('QUEUE',
          `cross-cond ${robot.name}`,
          { robot_name: robot.name,
            from: fromName, to: toName,
            status: 'queued', detail: 'cross-cond' });
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
      { robot_name: robot.name,
        from: fromName, to: toName,
        status: '이동', detail: `taskId:${taskId}` });

    if (crossing && String(next.id) !== String(toSt.id)) {
      pq.set(robot.id, toSt.id);
    }

    res.json({
      success     : true,
      dispatched  : robot.name,
      dest        : next.name,
      taskId,
      queued_next : pq.entries().some(([id]) => id == robot.id),
    });
  } catch (e) {
    console.error('[dispatcher]', e);
    await log('HTTP_ERR', e.message);
    res.status(500).json({ message: e.message });
  }
};

/* =========================================================================
   9. EXPORTS
   ========================================================================= */
exports.sendGotoNav     = sendGotoNav;
exports.chooseDestination = chooseDestination;
exports.isBufferEmpty   = isBufferEmpty;
exports.buildPacket     = buildPacket;
