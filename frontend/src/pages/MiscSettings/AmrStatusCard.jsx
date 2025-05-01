import React from "react";
import { Card, Descriptions, Tag, Badge, Typography, Spin, theme } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { robotsQueryAtom } from "@/state/atoms";

const { Paragraph } = Typography;
const API = import.meta.env.VITE_CORE_BASE_URL;

const STATUS_BADGE = {
  이동: "processing",
  대기: "success",
  오류: "error",
  "연결 끊김": "warning",
  unknown: "default",
};
const TAG_COLOR = {
  이동: "blue",
  대기: "green",
  오류: "red",
  "연결 끊김": "orange",
  unknown: "default",
};

export default function AmrStatusCard({ amrId }) {
  const { token } = theme.useToken();
  const robotsQ = useAtomValue(robotsQueryAtom);
  const amr = robotsQ.data?.find((r) => r.id === amrId);

  /* 실시간 단일 AMR 조회 (2초마다) – 없으면 전체 목록 재사용 */
  const { data, isFetching } = useQuery({
    enabled: !!amrId,
    queryKey: ["amr", amrId],
    queryFn: async () => {
      const r = await fetch(`${API}/api/robots/${amrId}`);
      if (!r.ok) throw new Error();
      return await r.json();
    },
    refetchInterval: 2000,
  });

  const info = amrId ? data ?? amr : null;

  return (
    <Card
      size="small"
      title="AMR 상태"
      style={{ height: "100%" }}
      bodyStyle={{ padding: token.padding }}
      extra={isFetching && <Spin size="small" />}
    >
      {!info ? (
        <Typography.Text type="secondary">
          왼쪽에서 AMR을 선택하세요
        </Typography.Text>
      ) : (
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="이름">{info.name}</Descriptions.Item>
          <Descriptions.Item label="IP">{info.ip}</Descriptions.Item>
          <Descriptions.Item label="상태">
            <Badge status={STATUS_BADGE[info.status]} />
            <Tag
              style={{ marginLeft: 8 }}
              color={TAG_COLOR[info.status] || "default"}
            >
              {info.status}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="모드">{info.mode}</Descriptions.Item>
          <Descriptions.Item label="타임스탬프">
            {new Date(info.timestamp).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="좌표">
            <Paragraph code copyable>
              {info.position}
            </Paragraph>
          </Descriptions.Item>
        </Descriptions>
      )}
    </Card>
  );
}
