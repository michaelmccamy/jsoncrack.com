import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea, Group, TextInput } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setSelectedNode = useGraph(state => state.setSelectedNode);
  const json = useJson(state => state.json);
  const setJson = useJson(state => state.setJson);
  const setContents = useFile(state => state.setContents);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState("");
  const [isObjectValue, setIsObjectValue] = React.useState(false);
  const [nameField, setNameField] = React.useState("");
  const [colorField, setColorField] = React.useState("");

  React.useEffect(() => {
    // initialize editValue when node changes
    if (!nodeData) {
      setEditValue("");
      setIsEditing(false);
      return;
    }

    // If the node has a path, prefer the actual value from the full JSON so
    // nested object/array fields (e.g. details, nutrients) are preserved when
    // presenting the editable value. Falling back to normalizeNodeData for
    // nodes without a path.
    if (nodeData.path && nodeData.path.length >= 0) {
      try {
        const parsed = JSON.parse(json);
        let cur: any = parsed;
        const path = nodeData.path as Array<string | number>;
        for (let i = 0; i < path.length; i++) {
          const seg = path[i];
          cur = cur?.[seg as any];
        }

        // If the node value is an object (not an array), present structured editing
        if (typeof cur === "object" && cur !== null && !Array.isArray(cur)) {
          setIsObjectValue(true);
          setNameField(cur.name ?? "");
          setColorField(cur.color ?? "");
          setEditValue(JSON.stringify(cur, null, 2));
        } else {
          setIsObjectValue(false);
          setEditValue(typeof cur === "object" ? JSON.stringify(cur, null, 2) : String(cur ?? ""));
        }
      } catch (e) {
        // fallback to derived representation
        setIsObjectValue(false);
        setEditValue(normalizeNodeData(nodeData.text ?? []));
      }
    } else {
      setEditValue(normalizeNodeData(nodeData.text ?? []));
    }

    setIsEditing(false);
  }, [nodeData]);

  const parseEditedValue = (v: string) => {
    // try to parse as JSON first, if fails treat as string
    try {
      return JSON.parse(v);
    } catch (e) {
      // If user typed an unquoted string, treat it as string
      return v;
    }
  };

  const handleSave = () => {
    if (!nodeData || !nodeData.path) return;
    try {
      const obj = JSON.parse(json);
      const path = nodeData.path as Array<string | number>;

      // traverse to parent
      let cur: any = obj;
      for (let i = 0; i < path.length - 1; i++) {
        const seg = path[i];
        cur = cur[seg as any];
      }

      const lastSeg = path[path.length - 1];

      if (isObjectValue) {
        // Update only name and color fields on the object to preserve other nested data
        const target = cur[lastSeg as any];
        if (typeof target === "object" && target !== null) {
          target.name = nameField;
          target.color = colorField;
        } else {
          // if target isn't an object, replace with a minimal object
          cur[lastSeg as any] = { ...(typeof target === "object" ? target : {}), name: nameField, color: colorField } as any;
        }
      } else {
        const newVal = parseEditedValue(editValue);
        // set the new value
        cur[lastSeg as any] = newVal;
      }

      // write back
      const newJson = JSON.stringify(obj, null, 2);
      setJson(newJson);

      // keep editor in sync
      try {
        setContents({ contents: newJson, hasChanges: false, skipUpdate: true });
      } catch (e) {
        // best-effort; ignore errors
      }

      // try to re-select the same node after the graph is regenerated
      const nodes = useGraph.getState().nodes;
      const match = nodes.find(n => JSON.stringify(n.path) === JSON.stringify(nodeData.path));
      if (match) {
        setSelectedNode(match as any);
      }

      // update the edit view from the freshly-written JSON so nested values are preserved
      try {
        const parsedNew = JSON.parse(newJson);
        let cur: any = parsedNew;
        const path = nodeData.path as Array<string | number>;
        for (let i = 0; i < path.length; i++) {
          const seg = path[i];
          cur = cur?.[seg as any];
        }

        if (typeof cur === "object" && cur !== null && !Array.isArray(cur)) {
          setIsObjectValue(true);
          setNameField(cur.name ?? "");
          setColorField(cur.color ?? "");
          setEditValue(JSON.stringify(cur, null, 2));
        } else {
          setIsObjectValue(false);
          setEditValue(typeof cur === "object" ? JSON.stringify(cur, null, 2) : String(cur ?? ""));
        }
      } catch (e) {
        // ignore
      }

      setIsEditing(false);
    } catch (err) {
      // parsing or setting failed; keep editing
      // In a full implementation we'd show a user-facing error
      // For now, log to console
      // eslint-disable-next-line no-console
      console.error("Failed to save node edit", err);
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Group gap="xs">
              {!isEditing && (
                <Button size="xs" variant="outline" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
              )}
              {isEditing && (
                <>
                  <Button size="xs" color="green" onClick={handleSave}>
                    Save
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </>
              )}
              <CloseButton onClick={onClose} />
            </Group>
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {!isEditing ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : isObjectValue ? (
              <Stack gap="xs">
                <TextInput label="name" value={nameField} onChange={e => setNameField(e.currentTarget.value)} />
                <TextInput label="color" value={colorField} onChange={e => setColorField(e.currentTarget.value)} />
              </Stack>
            ) : (
              <Textarea
                minRows={4}
                value={editValue}
                onChange={e => setEditValue(e.currentTarget.value)}
                miw={350}
                maw={600}
              />
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
