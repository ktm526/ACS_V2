import React, { useState } from "react";
import { Card, Form, Input, Button, message, theme } from "antd";
import { useMutation } from "@tanstack/react-query";

const { TextArea } = Input;
const API = import.meta.env.VITE_CORE_BASE_URL;

export default function GeneralSettings({ amrId }) {
  const { token } = theme.useToken();
  const [form] = Form.useForm();

  const mut = useMutation({
    mutationFn: async (vals) => {
      await fetch(`${API}/api/robots/${amrId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vals),
      });
    },
    onSuccess: () => message.success("저장 완료"),
    onError: () => message.error("저장 실패"),
  });

  return (
    <Card size="small" title="기타 설정" bodyStyle={{ padding: token.padding }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => mut.mutate(v)}
        disabled={!amrId}
      >
        <Form.Item name="config" label="설정값 (JSON)">
          <TextArea rows={4} placeholder='예) { "speed": 1.2 }' />
        </Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          loading={mut.isLoading}
          disabled={!amrId}
        >
          저장
        </Button>
      </Form>
    </Card>
  );
}
