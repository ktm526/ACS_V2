import React, { useState } from "react";
import {
  Card,
  Select,
  Skeleton,
  Descriptions,
  Divider,
  Button,
  InputNumber,
  Space,
  Badge,
  Modal,
  Tabs,
  Table,
  Progress,
  Tag,
  message,
  theme,
} from "antd";
import {
  UpCircleOutlined,
  DownCircleOutlined,
  LeftCircleOutlined,
  RightCircleOutlined,
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
  PauseCircleOutlined,
  SendOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import { useAtomValue } from "jotai";
import { robotsQueryAtom } from "@/state/atoms";
import { useQuery, useMutation } from "@tanstack/react-query";

/* ───────── 환경 상수 ───────── */
const API = import.meta.env.VITE_CORE_BASE_URL;

/* 상태 ➜ Badge/Tag 매핑 (메인 페이지와 동일) */
const STATUS_BADGE = {
  이동: "processing",
  대기: "success",
  오류: "error",
  "연결 끊김": "warning",
  unknown: "default",
};
const STATUS_TAG_COLOR = {
  이동: "blue",
  대기: "green",
  오류: "red",
  "연결 끊김": "orange",
  unknown: "default",
};

export default function AmrControlPanel({ style }) {
  const { token } = theme.useToken();

  /* 1️⃣ AMR 목록 & 선택 */
  const robotsQ = useAtomValue(robotsQueryAtom);
  const robots = robotsQ.data ?? [];
  const [amrId, setAmrId] = useState(null);

  /* 2️⃣ 단일 AMR 정보 */
  const {
    data: amrInfo,
    isFetching,
    refetch,
  } = useQuery({
    enabled: !!amrId,
    queryKey: ["amr", amrId],
    queryFn: async () => {
      const r = await fetch(`${API}/api/robots/${amrId}`);
      if (!r.ok) throw new Error();
      return r.json();
    },
    refetchInterval: 2000,
  });

  /* 3️⃣ 공통 명령 전송 */
  const sendMut = useMutation({
    mutationFn: ({ path, body }) =>
      fetch(`${API}/api/robots/${amrId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => message.success("명령 전송"),
    onError: () => message.error("전송 실패"),
  });
  const rotate = (dir) =>
    sendMut.mutate({ path: "rotate", body: { direction: dir } });
  const lift = (action, height) =>
    sendMut.mutate({ path: "lift", body: { action, height } });

  /* 4️⃣ 리프트 높이 입력 */
  const [height, setHeight] = useState(null);

  /* 5️⃣ 상세 모달 */
  const [detailOpen, setDetailOpen] = useState(false);

  /* 6️⃣ 버튼 효과 (hover ↔ 그림자, active ↔ 움푹) */
  const btnBase = {
    transition: "all .15s",
    boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
  };
  const elevate = (e) =>
    (e.currentTarget.style.boxShadow = token.boxShadowSecondary);
  const depress = (e) =>
    (e.currentTarget.style.boxShadow = "inset 0 2px 4px rgba(0,0,0,0.18)");

  /* 7️⃣ 상세 모달용 데이터 파싱 */
  const diList = amrInfo?.DI ?? [];
  const doList = amrInfo?.DO ?? [];

  const battery = {
    level: amrInfo?.battery_level ?? null,
    voltage: amrInfo?.voltage,
    current: amrInfo?.current,
    temp: amrInfo?.battery_temp,
  };

  const imu = {
    acc_x: amrInfo?.acc_x,
    acc_y: amrInfo?.acc_y,
    acc_z: amrInfo?.acc_z,
    roll: amrInfo?.roll,
    pitch: amrInfo?.pitch,
    yaw: amrInfo?.yaw,
  };

  const errRows = [
    ...(amrInfo?.errors ?? []).map((e) => ({ ...e, level: "ERROR" })),
    ...(amrInfo?.warnings ?? []).map((e) => ({ ...e, level: "WARNING" })),
    ...(amrInfo?.fatals ?? []).map((e) => ({ ...e, level: "FATAL" })),
  ];

  /* ──────────────────────────────── JSX ──────────────────────────────── */
  return (
    <>
      {/* ───────── 메인 카드 ───────── */}
      <Card
        size="small"
        title="AMR 제어"
        style={style}
        bodyStyle={{
          padding: token.padding,
          display: "flex",
          gap: token.paddingLG,
          alignItems: "stretch",
        }}
      >
        {/* ① 선택 + 상태표 */}
        <div
          style={{
            flex: 1,
            minWidth: 260,
            display: "flex",
            flexDirection: "column",
            gap: token.marginSM,
          }}
        >
          {/* AMR 선택기 */}
          <Select
            placeholder="AMR 선택"
            options={robots.map(({ id, name }) => ({ value: id, label: name }))}
            value={amrId}
            onChange={(v) => {
              setAmrId(v);
              refetch();
            }}
            allowClear
            loading={robotsQ.isLoading}
          />

          {/* 상태 & 인디케이터 */}
          <Descriptions
            size="small"
            bordered
            column={1}
            labelStyle={{ width: 90 }}
          >
            {["이름", "IP"].map((label) => (
              <Descriptions.Item label={label} key={label}>
                {amrId && !isFetching && amrInfo ? (
                  amrInfo[label === "이름" ? "name" : "ip"]
                ) : (
                  <Skeleton.Input active size="small" style={{ width: 120 }} />
                )}
              </Descriptions.Item>
            ))}
            <Descriptions.Item label="상태">
              {amrId && !isFetching && amrInfo ? (
                <>
                  <Badge
                    status={STATUS_BADGE[amrInfo.status] || "default"}
                    style={{ marginRight: 6 }}
                  />
                  <Tag color={STATUS_TAG_COLOR[amrInfo.status] || "default"}>
                    {amrInfo.status}
                  </Tag>
                  {amrInfo.blocked && (
                    <Tag color="red" style={{ marginInlineStart: 4 }}>
                      BLOCKED
                    </Tag>
                  )}
                </>
              ) : (
                <Skeleton.Input active size="small" style={{ width: 80 }} />
              )}
            </Descriptions.Item>
            <Descriptions.Item label="모드">
              {amrId && !isFetching && amrInfo ? (
                amrInfo.mode
              ) : (
                <Skeleton.Input active size="small" style={{ width: 80 }} />
              )}
            </Descriptions.Item>
          </Descriptions>

          {/* 상세 보기 버튼 */}
          <div style={{ textAlign: "right" }}>
            <Button
              type="link"
              icon={<FileSearchOutlined />}
              disabled={!amrInfo}
              onClick={() => setDetailOpen(true)}
            >
              상세 보기
            </Button>
          </div>
        </div>

        <Divider type="vertical" style={{ height: "auto" }} />

        {/* ② 움직임 */}
        <div
          style={{
            flex: 1,
            minWidth: 280,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 72px)",
              gridTemplateRows: "repeat(3, 72px)",
              gap: 12,
            }}
          >
            <span />
            <Button
              shape="circle"
              icon={<UpCircleOutlined />}
              disabled={!amrId}
              style={btnBase}
              onMouseEnter={elevate}
              onMouseLeave={(e) =>
                (e.currentTarget.style.boxShadow = btnBase.boxShadow)
              }
              onMouseDown={depress}
              onMouseUp={elevate}
              onClick={() => rotate("up")}
            />
            <span />
            <Button
              shape="circle"
              icon={<LeftCircleOutlined />}
              disabled={!amrId}
              style={btnBase}
              onMouseEnter={elevate}
              onMouseLeave={(e) =>
                (e.currentTarget.style.boxShadow = btnBase.boxShadow)
              }
              onMouseDown={depress}
              onMouseUp={elevate}
              onClick={() => rotate("left")}
            />
            <span />
            <Button
              shape="circle"
              icon={<RightCircleOutlined />}
              disabled={!amrId}
              style={btnBase}
              onMouseEnter={elevate}
              onMouseLeave={(e) =>
                (e.currentTarget.style.boxShadow = btnBase.boxShadow)
              }
              onMouseDown={depress}
              onMouseUp={elevate}
              onClick={() => rotate("right")}
            />
            <span />
            <Button
              shape="circle"
              icon={<DownCircleOutlined />}
              disabled={!amrId}
              style={btnBase}
              onMouseEnter={elevate}
              onMouseLeave={(e) =>
                (e.currentTarget.style.boxShadow = btnBase.boxShadow)
              }
              onMouseDown={depress}
              onMouseUp={elevate}
              onClick={() => rotate("down")}
            />
            <span />
          </div>
        </div>

        <Divider type="vertical" style={{ height: "auto" }} />

        {/* ③ 리프트 */}
        <div
          style={{
            flex: 1,
            minWidth: 260,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: token.marginLG,
          }}
        >
          {/* 위/정지/아래 버튼 */}
          <Space direction="vertical" size="small">
            {[
              { icon: <VerticalAlignTopOutlined />, act: "up" },
              { icon: <PauseCircleOutlined />, act: "stop" },
              { icon: <VerticalAlignBottomOutlined />, act: "down" },
            ].map(({ icon, act }) => (
              <Button
                key={act}
                shape="circle"
                icon={icon}
                disabled={!amrId}
                style={btnBase}
                onMouseEnter={elevate}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.boxShadow = btnBase.boxShadow)
                }
                onMouseDown={depress}
                onMouseUp={elevate}
                onClick={() => lift(act)}
              />
            ))}
          </Space>

          {/* 높이 입력 & 전송 */}
          <Space direction="vertical" size="small">
            <InputNumber
              placeholder="mm"
              value={height}
              onChange={setHeight}
              disabled={!amrId}
              style={{ width: 120 }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              disabled={!amrId || height == null}
              onClick={() => lift("set", height)}
            >
              전송
            </Button>
          </Space>
        </div>
      </Card>

      {/* ───────── 상세 모달 ───────── */}
      <Modal
        open={detailOpen}
        title="AMR 상세 정보"
        width="80%"
        onCancel={() => setDetailOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Tabs
          defaultActiveKey="io"
          items={[
            /* IO */
            {
              key: "io",
              label: `IO (${diList.length} DI / ${doList.length} DO)`,
              children: (
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={[
                    ...diList.map((x) => ({ ...x, type: "DI" })),
                    ...doList.map((x) => ({ ...x, type: "DO" })),
                  ]}
                  pagination={false}
                  columns={[
                    { title: "Type", dataIndex: "type", width: 70 },
                    { title: "ID", dataIndex: "id", width: 60 },
                    {
                      title: "State",
                      dataIndex: "status",
                      render: (v) => (
                        <Badge
                          color={v ? token.colorSuccess : token.colorError}
                          text={v ? "ON" : "OFF"}
                        />
                      ),
                      width: 90,
                    },
                    {
                      title: "Valid",
                      dataIndex: "valid",
                      render: (v) =>
                        v ? (
                          <Tag color="green">OK</Tag>
                        ) : (
                          <Tag color="red">ERR</Tag>
                        ),
                      width: 80,
                    },
                  ]}
                  scroll={{ y: 260 }}
                />
              ),
            },
            /* Battery & Power */
            {
              key: "battery",
              label: "Battery & Power",
              children: (
                <Descriptions size="small" bordered column={2}>
                  <Descriptions.Item label="SOC">
                    {battery.level != null ? (
                      <Progress
                        percent={Math.round(battery.level * 100)}
                        size="small"
                        format={(p) => `${p}%`}
                      />
                    ) : (
                      "—"
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="Temperature">
                    {battery.temp != null ? `${battery.temp} °C` : "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Voltage">
                    {battery.voltage != null ? `${battery.voltage} V` : "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Current">
                    {battery.current != null ? `${battery.current} A` : "—"}
                  </Descriptions.Item>
                </Descriptions>
              ),
            },
            /* IMU / Pose */
            {
              key: "imu",
              label: "IMU / Pose",
              children: (
                <Descriptions size="small" bordered column={3}>
                  {Object.entries(imu).map(([k, v]) => (
                    <Descriptions.Item label={k} key={k}>
                      {v != null ? v.toFixed(3) : "—"}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              ),
            },
            /* Errors */
            {
              key: "errors",
              label: `Errors (${errRows.length})`,
              children: (
                <Table
                  size="small"
                  rowKey={(r, i) => `${r.level}-${i}`}
                  dataSource={errRows}
                  pagination={false}
                  columns={[
                    {
                      title: "Level",
                      dataIndex: "level",
                      width: 90,
                      render: (v) => {
                        const color =
                          v === "FATAL"
                            ? "red"
                            : v === "ERROR"
                            ? "volcano"
                            : "orange";
                        return <Tag color={color}>{v}</Tag>;
                      },
                    },
                    { title: "Code", dataIndex: "code", width: 80 },
                    { title: "Desc", dataIndex: "desc", ellipsis: true },
                    {
                      title: "Time",
                      dataIndex: "dateTime",
                      width: 180,
                      render: (v) => v ?? "—",
                    },
                    { title: "Times", dataIndex: "times", width: 80 },
                  ]}
                  scroll={{ y: 260 }}
                />
              ),
            },
          ]}
        />
      </Modal>
    </>
  );
}
