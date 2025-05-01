import React from "react";
import { Card, Button, Space, message, theme } from "antd";
import {
  UpCircleOutlined,
  DownCircleOutlined,
  LeftCircleOutlined,
  RightCircleOutlined,
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";

const API = import.meta.env.VITE_CORE_BASE_URL;

function send(dir, amrId) {
  return fetch(`${API}/api/robots/${amrId}/rotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction: dir }),
  });
}

export default function MotionControl({ amrId }) {
  const { token } = theme.useToken();
  const mut = useMutation({
    mutationFn: ({ dir }) => send(dir, amrId),
    onSuccess: () => message.success("명령 전송"),
    onError: () => message.error("전송 실패"),
  });

  const click = (dir) => mut.mutate({ dir });

  return (
    <Card
      size="small"
      title="상·하·좌·우 회전"
      bodyStyle={{
        padding: token.padding,
        display: "flex",
        flexDirection: "column",
        gap: token.paddingSM,
      }}
    >
      <Space wrap>
        <Button
          icon={<UpCircleOutlined />}
          disabled={!amrId}
          onClick={() => click("up")}
        >
          ↑
        </Button>
        <Button
          icon={<DownCircleOutlined />}
          disabled={!amrId}
          onClick={() => click("down")}
        >
          ↓
        </Button>
        <Button
          icon={<LeftCircleOutlined />}
          disabled={!amrId}
          onClick={() => click("left")}
        >
          ←
        </Button>
        <Button
          icon={<RightCircleOutlined />}
          disabled={!amrId}
          onClick={() => click("right")}
        >
          →
        </Button>
      </Space>
    </Card>
  );
}
