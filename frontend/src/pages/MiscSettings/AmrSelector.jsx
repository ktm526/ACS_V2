import React from "react";
import { Card, Select, Spin, theme } from "antd";
import { useAtomValue } from "jotai";
import { robotsQueryAtom } from "@/state/atoms";

export default function AmrSelector({ value, onChange }) {
  const robotsQ = useAtomValue(robotsQueryAtom);
  const { token } = theme.useToken();

  return (
    <Card
      size="small"
      title="AMR 선택"
      style={{ height: "100%" }}
      bodyStyle={{ padding: token.padding }}
    >
      {robotsQ.isLoading ? (
        <Spin />
      ) : (
        <Select
          placeholder="AMR 선택"
          options={robotsQ.data.map((r) => ({
            label: r.name,
            value: r.id,
          }))}
          value={value}
          onChange={onChange}
          style={{ width: "100%" }}
          allowClear
        />
      )}
    </Card>
  );
}
