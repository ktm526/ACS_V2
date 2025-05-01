import React, { useMemo, useState } from "react";
import { Card, Table, DatePicker, Select, Button, Space, Spin } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useAtomValue } from "jotai";
import { robotsQueryAtom } from "@/state/atoms";
import { useLogs } from "@/hooks/useApiClient";

const { RangePicker } = DatePicker;

/* CSV (anchor download) */
function exportCSV(rows, fields, filename = "transport_logs.csv") {
  if (!rows.length) return;
  const header = Object.values(fields).join(",") + "\n";
  const body = rows
    .map((r) =>
      Object.keys(fields)
        .map((k) => JSON.stringify(r[k] ?? ""))
        .join(",")
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + header + body], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TransportLogs() {
  /* ── 필터 상태 ── */
  const [range, setRange] = useState([null, null]);
  const [amrName, setAmrName] = useState();

  /* ── AMR 목록 (Jotai atom) ── */
  const robotsQ = useAtomValue(robotsQueryAtom);
  const robots = robotsQ.data || [];

  /* ── 로그 데이터 ── */

  const { data: raw = [], isLoading } = useLogs();

  const data = useMemo(() => {
    return raw.filter((row) => {
      if (range[0] && range[1]) {
        const t = dayjs(row.timestamp);
        if (
          t.isBefore(range[0].startOf("day")) ||
          t.isAfter(range[1].endOf("day"))
        )
          return false;
      }
      if (amrName && row.robot_name !== amrName) return false;
      return true;
    });
  }, [raw, range, amrName]);
  console.log(data);

  /* ── AMR 옵션 ── */
  const amrOpts = useMemo(
    () => robots.map((r) => ({ label: r.name, value: r.name })),
    [robots]
  );

  /* ── 테이블 컬럼 ── */
  const columns = [
    { title: "ID", dataIndex: "id", width: 80, sorter: (a, b) => a.id - b.id },
    {
      title: "시간",
      dataIndex: "timestamp",
      render: (v) => dayjs(v).format("YYYY-MM-DD HH:mm:ss"),
      sorter: (a, b) => dayjs(a.timestamp).unix() - dayjs(b.timestamp).unix(),
    },
    {
      title: "AMR",
      dataIndex: "robot_name",
      filters: amrOpts.map((o) => ({ text: o.label, value: o.value })),
      onFilter: (v, r) => r.robot_name === v,
    },
    { title: "상태", dataIndex: "status" },
    { title: "출발지", dataIndex: "from" },
    { title: "목적지", dataIndex: "to" },
    { title: "세부", dataIndex: "detail" },
  ];

  return (
    <div
      style={{
        padding: 24,
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Card
        size="small"
        title="이송 지시 로그"
        bodyStyle={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
        style={{ flex: 1, minHeight: 0 }}
      >
        {/* 필터 바 */}
        <Space wrap style={{ marginBottom: 16 }}>
          <RangePicker value={range} onChange={setRange} allowClear />
          <Select
            allowClear
            placeholder="AMR 선택"
            options={amrOpts}
            style={{ minWidth: 120 }}
            value={amrName}
            onChange={setAmrName}
            loading={robotsQ.isLoading}
          />
          <Button
            icon={<DownloadOutlined />}
            disabled={!data.length}
            onClick={() =>
              exportCSV(data, {
                id: "ID",
                timestamp: "Timestamp",
                robot_name: "AMR",
                status: "Status",
                from: "From",
                to: "To",
                detail: "Detail",
              })
            }
          >
            CSV 다운로드
          </Button>
        </Space>

        {/* 테이블 */}
        {isLoading ? (
          <Spin style={{ marginTop: 32 }} />
        ) : (
          <Table
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={data}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            style={{ flex: 1 }}
            scroll={{ y: "100%" }}
          />
        )}
      </Card>
    </div>
  );
}
