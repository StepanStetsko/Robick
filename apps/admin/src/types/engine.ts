export type UnityCapabilityFieldKind = "text" | "number" | "boolean" | "target" | "select";

export type UnityCapabilityFieldOption = {
  id: string;
  label: string;
  path?: string;
};

export type UnityCapabilityField = {
  name: string;
  label: string;
  kind: UnityCapabilityFieldKind;
  required?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  options?: UnityCapabilityFieldOption[];
};

export type UnityCapabilityTarget = {
  id: string;
  name: string;
  path?: string;
};

export type UnityCapabilityAction = {
  eventName: string;
  label: string;
  description?: string;
  targets?: UnityCapabilityTarget[];
  fields: UnityCapabilityField[];
};

export type UnityCapabilities = {
  type: "capabilities";
  transport: "unity";
  timestamp: string;
  actions: UnityCapabilityAction[];
};

export type EngineCapabilities = {
  unity: UnityCapabilities | null;
};

