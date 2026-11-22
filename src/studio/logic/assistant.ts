export type AssistantTool = "continue" | "polish" | "tone" | "critique" | "outline" | "video" | "chat";

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tool?: AssistantTool;
  documentTitle?: string;
  contextScope?: string;
  projectId?: string;
  documentId?: string;
  parentChapterId?: string | null;
  hasSelection?: boolean;
  start?: number;
  end?: number;
};

export type AssistantConversation = {
  id: string;
  projectId: string;
  projectTitle: string;
  title: string;
  messages: AssistantMessage[];
};
