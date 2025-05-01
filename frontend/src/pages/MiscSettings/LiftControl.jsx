import React, { useState } from "react";
import { Card, Button, InputNumber, Space, message, theme } from "antd";
import {
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
  PauseOutlined,
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";

const API = import.meta.env.VITE_CORE_BASE_URL;

export default function LiftControl({ amrId }) {
  const { token } = theme.useToken();
  const [height, setHeight] = useState(null);

  const mut = useMutation({
    mutationFn: (body) =>
      fetch(`${API}/api/robots/${amrId}/lift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => message.success("명령 전송"),
    onError: () => message.error("전송 실패"),
  });

  const cmd = (action) => mut.mutate({ action, height });

  return (
    <Card
      size="small"
      title="리프트 제어"
      bodyStyle={{
        padding: token.padding,
        display: "flex",
        flexDirection: "column",
        gap: token.paddingSM,
      }}
    >
      <Space wrap>
        <Button
          icon={<VerticalAlignTopOutlined />}
          disabled={!amrId}
          onClick={() => cmd("up")}
        >
          ↑
        </Button>
        <Button
          icon={<VerticalAlignBottomOutlined />}
          disabled={!amrId}
          onClick={() => cmd("down")}
        >
          ↓
        </Button>
        <Button
          icon={<PauseOutlined />}
          disabled={!amrId}
          onClick={() => cmd("stop")}
        >
          정지
        </Button>
      </Space>

      <Space wrap style={{ marginTop: token.paddingSM }}>
        <InputNumber
          placeholder="높이(mm)"
          value={height}
          onChange={setHeight}
          disabled={!amrId}
        />
        <Button
          type="primary"
          disabled={!amrId || height == null}
          onClick={() => cmd("set")}
        >
          전송
        </Button>
      </Space>
    </Card>
  );
}
