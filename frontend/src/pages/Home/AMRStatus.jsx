// src/pages/Home/AMRStatus.jsx
import React, { useState } from "react";
import {
  Card,
  Space,
  Divider,
  Button,
  Modal,
  Form,
  Input,
  Badge,
  Tag,
  Typography,
  Descriptions,
  Collapse,
  theme,
  message,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

const API = import.meta.env.VITE_CORE_BASE_URL;

// 상태 문자열에 대응하는 Badge.status 와 Tag 색상 매핑
const STATUS_BADGE = {
  이동: "processing",
  대기: "success", // ← default → success 로 변경
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

export default function AMRStatus() {
  const { token } = theme.useToken();
  const qc = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [addVisible, setAddVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedAmr, setSelectedAmr] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [form] = Form.useForm();

  // 상태별 테두리 색상 매핑
  const STATUS_BORDER_COLOR = {
    이동: token.colorInfo,
    대기: token.colorSuccess,
    오류: token.colorError,
    "연결 끊김": token.colorWarning,
    unknown: token.colorBorder,
  };

  // 1) AMR 리스트 조회 (1초마다)
  const amrQuery = useQuery({
    queryKey: ["amrs"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/robots`);
      if (!r.ok) throw new Error("Failed to fetch AMRs");
      return r.json();
    },
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
  });

  // 2) AMR 추가
  const addMut = useMutation({
    mutationFn: async (body) => {
      const r = await fetch(`${API}/api/robots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Add failed");
    },
    onSuccess: () => {
      messageApi.success("추가되었습니다");
      qc.invalidateQueries(["amrs"]);
      setAddVisible(false);
    },
    onError: () => messageApi.error("추가 실패"),
  });

  // 3) AMR 삭제
  const delMut = useMutation({
    mutationFn: async (id) => {
      const r = await fetch(`${API}/api/robots/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      messageApi.success("삭제되었습니다");
      qc.invalidateQueries(["amrs"]);
      setDetailVisible(false);
    },
    onError: () => messageApi.error("삭제 실패"),
  });

  const showAdd = () => {
    form.resetFields();
    setAddVisible(true);
  };
  const handleAdd = () =>
    form.validateFields().then((vals) =>
      addMut.mutate({
        name: vals.id,
        ip: vals.ip,
        battery: 100,
        status: "대기",
        additional_info: "",
      })
    );
  const showDetail = (amr) => {
    setSelectedAmr(amr);
    setDetailVisible(true);
  };

  return (
    <>
      {contextHolder}

      <Card
        size="small"
        bordered={false}
        bodyStyle={{ padding: token.padding, overflowX: "scroll" }}
      >
        {amrQuery.isLoading ? (
          <Text>로딩…</Text>
        ) : amrQuery.error ? (
          <Text type="danger">AMR 목록 조회 실패</Text>
        ) : (
          <Space
            wrap
            size={token.paddingSM}
            split={<Divider type="vertical" />}
          >
            {amrQuery.data.map((amr) => {
              const borderColor =
                STATUS_BORDER_COLOR[amr.status] || token.colorBorder;
              const isHovered = hoveredId === amr.id;

              return (
                <Button
                  ghost
                  key={amr.id}
                  type="text"
                  onClick={() => showDetail(amr)}
                  onMouseEnter={() => setHoveredId(amr.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    height: token.controlHeightSM,
                    borderRadius: token.borderRadius,
                    padding: `${token.padding}px ${token.paddingSM}px`,
                    border: `1px solid ${borderColor}`,
                    boxShadow: token.boxShadowSecondary,
                    transform: isHovered ? "scale(1.05)" : undefined,
                    transition: "transform 0.2s ease",
                  }}
                >
                  <Badge
                    status={STATUS_BADGE[amr.status] || "default"}
                    style={{ marginRight: token.marginXXS }}
                  />
                  <span
                    style={{
                      fontWeight: token.fontWeightStrong,
                      marginRight: token.marginXXS,
                    }}
                  >
                    {amr.name}
                  </span>
                  <Tag
                    size="small"
                    color={STATUS_TAG_COLOR[amr.status] || "default"}
                    style={{ marginRight: token.marginXXS }}
                  >
                    {amr.status}
                  </Tag>
                </Button>
              );
            })}

            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              onClick={showAdd}
              style={{
                height: token.controlHeightSM,
                borderRadius: token.borderRadius,
                padding: `${token.padding}px ${token.paddingSM}px`,
                boxShadow: token.boxShadowSecondary,
              }}
            />
          </Space>
        )}
      </Card>

      {/* 새 AMR 추가 모달 */}
      <Modal
        title="새 AMR 추가"
        open={addVisible}
        onOk={handleAdd}
        okButtonProps={{ loading: addMut.isLoading }}
        onCancel={() => setAddVisible(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="id"
            label="AMR ID"
            rules={[{ required: true, message: "ID를 입력하세요" }]}
          >
            <Input placeholder="예: AMR1" />
          </Form.Item>
          <Form.Item
            name="ip"
            label="IP 주소"
            rules={[{ required: true, message: "IP를 입력하세요" }]}
          >
            <Input placeholder="예: 192.168.0.10" />
          </Form.Item>
        </Form>
      </Modal>

      {/* AMR 상세 모달 */}
      <Modal
        title={`AMR 상세 – ${selectedAmr?.name}`}
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        width={600}
        footer={[
          <Button
            key="delete"
            danger
            icon={<DeleteOutlined />}
            loading={delMut.isLoading}
            onClick={() => delMut.mutate(selectedAmr.id)}
          >
            삭제
          </Button>,
          <Button key="close" onClick={() => setDetailVisible(false)}>
            닫기
          </Button>,
        ]}
        destroyOnClose
      >
        {selectedAmr && (
          <>
            <Descriptions
              bordered
              size="small"
              column={1}
              labelStyle={{ width: 120 }}
            >
              <Descriptions.Item label="ID">{selectedAmr.id}</Descriptions.Item>
              <Descriptions.Item label="이름">
                {selectedAmr.name}
              </Descriptions.Item>
              <Descriptions.Item label="IP">{selectedAmr.ip}</Descriptions.Item>
              <Descriptions.Item label="상태">
                <Tag color={STATUS_TAG_COLOR[selectedAmr.status] || "default"}>
                  {selectedAmr.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="모드">
                {selectedAmr.mode}
              </Descriptions.Item>
              <Descriptions.Item label="타임스탬프">
                {new Date(selectedAmr.timestamp).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="위치">
                {selectedAmr.location ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="다음 위치">
                {selectedAmr.next_location ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="목적지">
                {selectedAmr.destination ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="작업 단계">
                {selectedAmr.task_step ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="좌표">
                <Paragraph code copyable>
                  {selectedAmr.position}
                </Paragraph>
              </Descriptions.Item>
            </Descriptions>
            <Collapse style={{ marginTop: token.padding }}>
              <Panel header="추가 정보 (JSON)" key="1">
                <Paragraph
                  code
                  copyable
                  style={{
                    whiteSpace: "pre-wrap",
                    maxHeight: 200,
                    overflow: "auto",
                  }}
                >
                  {selectedAmr.additional_info || "없음"}
                </Paragraph>
              </Panel>
            </Collapse>
          </>
        )}
      </Modal>
    </>
  );
}
